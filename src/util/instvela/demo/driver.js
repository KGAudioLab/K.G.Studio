// Adapted from InstVELA M01Preview ONNX by Xiaohan Tian @ KGAudioLab. See ../LICENSE and ../NOTICE.
// M01 synthesis driver: score features → F0 generator → acoustic generator → vocoder.
// Sampling settings come from the demo config. Graph dimensions and scaling come from the ONNX model bundle.
const fr = Math.fround;

/** Window bounds [a, b) as synthesize.py: WIN frames, each later window starting OVERLAP frames before the last end. */
export function windows(n, win, overlap) {
  const out = [];
  let a = 0;
  while (a < n) {
    const b = Math.min(a + win, n);
    out.push([a, b]);
    if (b === n) break;
    a = b - overlap;
  }
  return out;
}

/** Oscillator phase (cycles) at the start of every frame, float64, as evaluate.frame_phase. */
export function framePhase(f0Hz, voiced, sampleRate, hop) {
  const n = f0Hz.length, out = new Float64Array(n);
  let cum = 0;
  for (let k = 0; k < n; k++) {
    let per = (fr(f0Hz[k] * voiced[k]) / sampleRate) * hop;
    per -= Math.floor(per);
    cum += per;
    const s = cum - per;
    out[k] = s - Math.floor(s);
  }
  return out;
}

/** MIDI semitones → Hz as evaluate.md_hz (float64 maths, float32 result). */
export const mdHz = (s) => fr(440.0 * Math.pow(2.0, (s - 69.0) / 12.0));

/**
 * Synthesize. Arguments:
 * - ort: the onnxruntime-web module (for Tensor);
 * - run: async (graph, feeds) => outputs (graph: f0_cond, f0_step, ac_cond, ac_step, vocoder);
 * - C: m01_constants.json;
 * - feats: computeFeatures(...) result; x: standardize(feats.continuous) (Float32Array T·18);
 * - noise: { flow(n), vocoder(n) } → Float32Array (seededNoise(seed), or recorded noise for parity tests);
 * - s: render settings; onProgress reports the stage count and overall render percentage.
 * Returns { wave: Float32Array (48 kHz, not DC-corrected), f0, voiced, residual, latents, timing }.
 */
export async function synthesize({ ort, run, C, feats, x, noise, s, onProgress = () => {} }) {
  const n = feats.n_frames;
  const ref = feats.reference_pitch;
  const timing = {};
  const secToFrames = (seconds) => Math.round(seconds * C.frame_rate);
  const WIN = secToFrames(s.windowSeconds), OV = secToFrames(s.knownPrefixSeconds), D = C.latent_dim;
  const CH = secToFrames(s.vocoderChunkSeconds), CX = secToFrames(s.vocoderContextSeconds);
  const pad = (length, multiple) => Math.ceil(length / multiple) * multiple;
  if (!(OV >= 0 && OV < WIN)) throw new Error("the known prefix must be shorter than the window");
  if (!(CH > 0 && CX >= 0)) throw new Error("the vocoder chunk must be positive and the context non-negative");
  const T = (type, data, dims) => new ort.Tensor(type, data, dims);
  const cat32 = Int32Array.from(feats.categorical);
  const resStd = fr(C.residual_std);
  const latMean = Float32Array.from(C.latent_mean), latStd = Float32Array.from(C.latent_std);
  const wins = windows(n, WIN, OV);
  const vocoderChunks = Math.ceil(n / CH);
  // The label counts completed windows or chunks. The bar counts each inference call plus audio finalization.
  const renderTotal = 3 + wins.length * (s.stepsF0 + s.stepsAc) + vocoderChunks;
  let renderCompleted = 0;
  const startStage = (stage, total) => {
    let completed = 0;
    const report = () => onProgress({ stage, completed, total, percent: renderCompleted / renderTotal * 100 });
    report();
    return (unitCompleted = false) => {
      if (unitCompleted) completed++;
      renderCompleted++;
      report();
    };
  };

  // padded window slices (zero padding beyond L)
  const condWindow = (cond, a, L, Lp) => { const o = new Float32Array(Lp * 128); o.set(cond.subarray(a * 128, (a + L) * 128)); return o; };
  const rows = (arr, B) => { if (B === 1) return arr; const o = new arr.constructor(arr.length * B); for (let b = 0; b < B; b++) o.set(arr, b * arr.length); return o; };
  const mask = (L, Lp) => { const m = new Uint8Array(Lp); m.fill(1, 0, L); return m; };

  /** Euler integration of one window. feeds(x, tArr, dropArr, B) → feeds; returns { x, last } (last: cond-row outputs). */
  async function flow(graph, x0, steps, cfg, perRow, feeds, onStep) {
    let xcur = x0;
    const dt = fr(1.0 / steps), g = fr(cfg);
    let last = null;
    for (let i = 0; i < steps; i++) {
      const t = fr(i * (1.0 / steps));
      let v;
      if (cfg === 1.0) {
        const out = await run(graph, feeds(xcur, Float32Array.of(t), Uint8Array.of(0), 1));
        v = out[0];
        last = out;
      } else {
        const out = await run(graph, feeds(rows(xcur, 2), Float32Array.of(t, t), Uint8Array.of(0, 1), 2));
        const both = out[0];
        v = new Float32Array(perRow);
        for (let j = 0; j < perRow; j++) {
          const c = both[j], u = both[perRow + j];
          v[j] = fr(u + fr(g * fr(c - u)));
        }
        last = out.map((o) => o.subarray(0, o.length / 2));
      }
      const nx = new Float32Array(perRow);
      for (let j = 0; j < perRow; j++) nx[j] = fr(xcur[j] + fr(dt * v[j]));
      xcur = nx;
      onStep(i + 1 === steps);
    }
    return { x: xcur, last };
  }
  const outputsOf = async (graph, feeds) => (await run(graph, feeds)).map((t) => t);

  // ---- F0 generator ----
  let t0 = performance.now();
  const completeF0Step = startStage("F0 generator", wins.length);
  const condF0 = (await outputsOf("f0_cond", { continuous: T("float32", x, [1, n, 18]), categorical: T("int32", cat32, [1, n, 4]) }))[0];
  completeF0Step();
  const res = new Float32Array(n), voi = new Float32Array(n);
  for (const [a, b] of wins) {
    const L = b - a, Lp = pad(L, C.pad_multiple.f0_step);
    const ov = a === 0 ? 0 : Math.min(OV, L);
    const km = new Float32Array(Lp), kv = new Float32Array(L), kn = new Float32Array(Lp);
    km.fill(1, 0, ov);
    for (let j = 0; j < ov; j++) { kv[j] = res[a + j]; kn[j] = fr(kv[j] / resStd); }
    const nz = new Float32Array(Lp); nz.set(noise.flow(L));
    const cw = condWindow(condF0, a, L, Lp), mk = mask(L, Lp);
    const feeds = (xx, tt, drop, B) => ({
      x_t: T("float32", xx, [B, 1, Lp]), t: T("float32", tt, [B]), cond: T("float32", rows(cw, B), [B, Lp, 128]),
      mask: T("bool", rows(mk, B), [B, Lp]), drop: T("bool", drop, [B]), known: T("float32", rows(kn, B), [B, 1, Lp]),
      known_mask: T("float32", rows(km, B), [B, 1, Lp]) });
    const { x: xf, last } = await flow("f0_step", nz, s.stepsF0, s.cfgF0, Lp, feeds, completeF0Step);
    for (let j = ov; j < L; j++) {
      res[a + j] = km[j] > 0 ? kv[j] : fr(xf[j] * resStd);
      voi[a + j] = last[1][j] > 0 ? 1 : 0;
    }
  }
  const pe = fr(s.pitchExpression);
  const f0 = new Float32Array(n);
  for (let k = 0; k < n; k++) f0[k] = fr(ref[k] + fr(pe * res[k]));
  timing.f0_generator = (performance.now() - t0) / 1000;

  // ---- acoustic generator ----
  t0 = performance.now();
  const completeAcousticStep = startStage("acoustic generator", wins.length);
  const condAc = (await outputsOf("ac_cond", { continuous: T("float32", x, [1, n, 18]), categorical: T("int32", cat32, [1, n, 4]) }))[0];
  completeAcousticStep();
  const z = new Float32Array(D * n); // (48, n) row-major
  for (const [a, b] of wins) {
    const L = b - a, Lp = pad(L, C.pad_multiple.ac_step);
    const ov = a === 0 ? 0 : Math.min(OV, L);
    const km = new Float32Array(Lp); km.fill(1, 0, ov);
    const known = new Float32Array(D * L), kn = new Float32Array(D * Lp);
    for (let c = 0; c < D; c++) for (let j = 0; j < ov; j++) {
      known[c * L + j] = z[c * n + a + j];
      kn[c * Lp + j] = fr(fr(known[c * L + j] - latMean[c]) / latStd[c]);
    }
    const nzL = noise.flow(D * L), nz = new Float32Array(D * Lp);
    for (let c = 0; c < D; c++) nz.set(nzL.subarray(c * L, (c + 1) * L), c * Lp);
    const cw = condWindow(condAc, a, L, Lp), mk = mask(L, Lp);
    const f0w = new Float32Array(Lp), vw = new Float32Array(Lp);
    f0w.set(f0.subarray(a, b)); vw.set(voi.subarray(a, b));
    const feeds = (xx, tt, drop, B) => ({
      z_t: T("float32", xx, [B, D, Lp]), t: T("float32", tt, [B]), cond: T("float32", rows(cw, B), [B, Lp, 128]),
      f0: T("float32", rows(f0w, B), [B, 1, Lp]), voicing: T("float32", rows(vw, B), [B, 1, Lp]), mask: T("bool", rows(mk, B), [B, Lp]),
      drop: T("bool", drop, [B]), known: T("float32", rows(kn, B), [B, D, Lp]), known_mask: T("float32", rows(km, B), [B, 1, Lp]) });
    const { x: xf } = await flow("ac_step", nz, s.stepsAc, s.cfgAc, D * Lp, feeds, completeAcousticStep);
    for (let c = 0; c < D; c++) for (let j = ov; j < L; j++) {
      z[c * n + a + j] = km[j] > 0 ? known[c * L + j] : fr(fr(xf[c * Lp + j] * latStd[c]) + latMean[c]);
    }
  }
  timing.acoustic_generator = (performance.now() - t0) / 1000;

  // ---- vocoder (transpose acts on F0 at the vocoder only) ----
  t0 = performance.now();
  const completeVocoderStep = startStage("vocoder", vocoderChunks);
  const tr = fr(s.transpose);
  const f0Hz = new Float32Array(n);
  for (let k = 0; k < n; k++) f0Hz[k] = mdHz(fr(f0[k] + tr));
  const phase = framePhase(f0Hz, voi, C.sample_rate, C.hop);
  const HOP = C.hop, H = C.source_harmonics;
  const wave = new Float32Array(n * HOP);
  for (let a = 0; a < n; a += CH) {
    const lo = Math.max(a - CX, 0), hi = Math.min(a + CH + CX, n), m = Math.min(CH, n - a), F = hi - lo;
    const zc = new Float32Array(D * F);
    for (let c = 0; c < D; c++) zc.set(z.subarray(c * n + lo, c * n + hi), c * F);
    const nzv = noise.vocoder(H * F * HOP);
    const y = (await outputsOf("vocoder", {
      z: T("float32", zc, [1, D, F]), f0_hz: T("float32", f0Hz.slice(lo, hi), [1, 1, F]), voiced: T("float32", voi.slice(lo, hi), [1, 1, F]),
      phase0: T("float32", Float32Array.of(phase[lo]), [1]), noise: T("float32", nzv, [1, H, F * HOP]) }))[0];
    wave.set(y.subarray((a - lo) * HOP, (a - lo + m) * HOP), a * HOP);
    completeVocoderStep(true);
  }
  timing.vocoder = (performance.now() - t0) / 1000;
  startStage("done", 1);
  return { wave, f0, voiced: voi, residual: res, latents: z, timing };
}

/** Remove the mean (DC), as m01_infer.py does before writing. */
export function removeDc(wave) {
  let s = 0;
  for (let i = 0; i < wave.length; i++) s += wave[i];
  const m = s / wave.length, out = new Float32Array(wave.length);
  for (let i = 0; i < wave.length; i++) out[i] = wave[i] - m;
  return out;
}
