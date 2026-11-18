// Adapted from InstVELA M01Preview ONNX by Xiaohan Tian @ KGAudioLab. See ../LICENSE and ../NOTICE.
// M01 request and score frame features, ported from Python to match its numerical conventions.
// Float rules: Python float64 arithmetic is IEEE double like JS numbers, in the same operation order; numpy's
// float32 steps (astype, NEP 50 weak-scalar arithmetic in standardize) use Math.fround. Exact Fraction steps use
// Frac. numpy's sin/cos may differ from Math.sin/cos by an ulp in float64 (rarely visible after float32).
import { Frac } from "./fraction.js";
const DEFAULT_ARTICULATION = "sustain";

export const CONTINUOUS_FEATURES = [
  "score_pitch", "note_duration", "since_onset", "until_offset", "until_next_onset",
  "since_previous_offset", "prev_interval", "next_interval", "onset_fraction", "offset_fraction",
  "note_phase", "beat_sin", "beat_cos", "bar_sin", "bar_cos", "tempo", "velocity", "use_velocity",
];
export const CATEGORICAL_FEATURES = {
  state: ["note", "rest", "tail"],
  articulation: ["unspecified", "sustain", "spiccato", "pizzicato", "tremolo"],
  connection: ["contiguous_next", "gap_next", "after_rest"],
  instrument: ["string_violin", "string_viola", "string_cello", "string_double_bass"], // string_viola: user decision 2026-11-04; string_cello 2026-11-05; string_double_bass 2026-11-07
};
const STATE_NOTE = 0, STATE_REST = 1, STATE_TAIL = 2;
const CI = Object.fromEntries(CONTINUOUS_FEATURES.map((f, i) => [f, i]));
const ART = Object.fromEntries(CATEGORICAL_FEATURES.articulation.map((a, i) => [a, i]));
// Preserve ONNX category IDs and map older requests to the supported articulation.
ART.unspecified = ART[DEFAULT_ARTICULATION];
ART.tremolo = ART[DEFAULT_ARTICULATION];
const NC = CONTINUOUS_FEATURES.length;

/** Spec §5 (AIRE rule): off if a velocity is missing; else controls.use_velocity if given; else on unless all equal. */
export function resolveUseVelocity(request) {
  const vels = request.notes.map((n) => n.velocity);
  if (vels.some((v) => v === undefined || v === null)) return false;
  for (const v of vels) if (!(Number.isInteger(v) && v >= 1 && v <= 127)) throw new Error(`velocity must be an integer 1-127, got ${v}`);
  const flag = request.controls?.use_velocity;
  return flag !== undefined && flag !== null ? Boolean(flag) : new Set(vels).size > 1;
}

/** Writing plan §4 rules 1–6: one voice, sorted by onset; returns { notes, edits } (input not modified). */
export function normalizeMonophony(notes, tempoBpm, minCroppedNoteSeconds) {
  const spb = 60.0 / tempoBpm;
  const edits = [];
  const ordered = notes.map((n) => ({ ...n })).sort((a, b) => a.start - b.start || b.pitch - a.pitch);
  const out = [];
  for (const n of ordered) {
    if (n.end <= n.start) {
      edits.push({ edit: "dropped_empty_note", start: n.start, end: n.end, pitch: n.pitch });
      continue;
    }
    const a = out[out.length - 1];
    if (a && n.start === a.start) {
      edits.push({ edit: "dropped_chord_note", start: n.start, end: n.end, pitch: n.pitch });
      continue;
    }
    if (a && n.start < a.end) {
      if ((n.start - a.start) * spb < minCroppedNoteSeconds) {
        edits.push({ edit: "dropped_fragment", start: a.start, end: a.end, pitch: a.pitch });
        out.pop();
      } else {
        edits.push({ edit: n.end <= a.end ? "trimmed_contained" : "trimmed_overlap",
          start: a.start, pitch: a.pitch, old_end: a.end, new_end: n.start });
        a.end = n.start;
      }
    }
    out.push(n);
  }
  return { notes: out, edits };
}

/** First frame whose centre is at or after this time: ceil(t·frameRate − ½), exact. */
export function beatToFrame(beats, tempoBpm, frameRate) {
  return Frac.fromDouble(beats).mul(new Frac(BigInt(60 * frameRate))).div(Frac.fromDouble(tempoBpm)).sub(new Frac(1n, 2n)).ceil();
}

export const noteFrames = (notes, tempoBpm, frameRate) => notes.map((n) =>
  [beatToFrame(n.start, tempoBpm, frameRate), beatToFrame(n.end, tempoBpm, frameRate)]);

/** Per-frame state (Uint8), reference pitch (Float32), note index (Int32), as m01_data.frame_tracks. */
export function frameTracks(notes, nFrames, ranges) {
  if (ranges[ranges.length - 1][1] > nFrames) throw new Error(`last note ends at frame ${ranges[ranges.length - 1][1]} beyond ${nFrames} frames`);
  const state = new Uint8Array(nFrames).fill(STATE_REST);
  const ref = new Float32Array(nFrames).fill(notes[0].pitch);
  const idx = new Int32Array(nFrames).fill(-1);
  ranges.forEach(([a, b], i) => {
    for (let k = Math.max(a, 0); k < Math.min(b, nFrames); k++) { state[k] = STATE_NOTE; idx[k] = i; }
    ref.fill(notes[i].pitch, Math.max(a, 0));
  });
  state.fill(STATE_TAIL, ranges[ranges.length - 1][1]);
  return { state, reference_pitch: ref, note_index: idx };
}

/** Count of sorted values <= k (numpy searchsorted side="right"). */
function searchRight(arr, k) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= k) lo = m + 1; else hi = m;
  }
  return lo;
}

/**
 * Frame features (spec §1–§3) as m01_features.compute_features:
 * { continuous: Float32Array (T·18, row-major, physical units), categorical: Uint8Array (T·4), edits, use_velocity,
 *   n_frames, notes (normalised), reference_pitch: Float32Array (T) }.
 */
export function computeFeatures(request, { nFrames = null, tailSeconds, frameRate, minCroppedNoteSeconds, timeCapSeconds }) {
  const tempo = request.tempo_bpm;
  const [num, den] = request.time_signature ?? [4, 4];
  const origin = request.bar_origin_beats ?? 0;
  const instrument = request.controls?.instrument;
  if (!CATEGORICAL_FEATURES.instrument.includes(instrument) || instrument.startsWith("reserved")) throw new Error(`unsupported instrument ${instrument}`);
  const { notes, edits } = normalizeMonophony(request.notes, tempo, minCroppedNoteSeconds);
  if (!notes.length) throw new Error("request has no notes");
  const useVelocity = resolveUseVelocity({ ...request, notes });
  for (const n of notes) if (n.articulation !== undefined && n.articulation !== null && !(n.articulation in ART)) throw new Error(`unknown articulation ${n.articulation}`);
  const spb = 60.0 / tempo;
  const T = nFrames ?? Math.ceil((notes[notes.length - 1].end * spb + tailSeconds) * frameRate);
  const ranges = noteFrames(notes, tempo, frameRate);
  const tr = frameTracks(notes, T, ranges);
  const N = notes.length;
  const start = notes.map((n) => n.start * spb), end = notes.map((n) => n.end * spb);
  const pitch = notes.map((n) => n.pitch), vel = notes.map((n) => n.velocity || 0);
  const r0 = ranges.map((r) => r[0]), r1 = ranges.map((r) => r[1]);
  const contiguous = notes.map((n, j) => j + 1 < N && notes[j + 1].start === n.end);
  const art = notes.map((n) => ART[n.articulation ?? DEFAULT_ARTICULATION]);
  const instIdx = CATEGORICAL_FEATURES.instrument.indexOf(instrument);
  const x = new Float64Array(T * NC);
  const cat = new Uint8Array(T * 4);
  const twoPi = 2 * Math.PI;
  const barLen = (num * 4) / den;
  for (let k = 0; k < T; k++) {
    const o = k * NC;
    const c = (k + 0.5) / frameRate;
    const inNote = tr.note_index[k] >= 0;
    const i = inNote ? tr.note_index[k] : 0;
    const started = searchRight(r0, k), ended = searchRight(r1, k);
    x[o + CI.score_pitch] = tr.reference_pitch[k];
    if (inNote) {
      x[o + CI.note_duration] = Math.min(end[i] - start[i], timeCapSeconds);
      x[o + CI.since_onset] = Math.min(c - start[i], timeCapSeconds);
      x[o + CI.until_offset] = Math.min(end[i] - c, timeCapSeconds);
      if (i > 0) x[o + CI.prev_interval] = pitch[i] - pitch[i - 1];
      if (i < N - 1) x[o + CI.next_interval] = pitch[i + 1] - pitch[i];
      x[o + CI.note_phase] = (c - start[i]) / (end[i] - start[i]);
    }
    const nxt = Math.min(started, N - 1);
    x[o + CI.until_next_onset] = started < N ? Math.min(start[nxt] - c, timeCapSeconds) : timeCapSeconds;
    const prv = Math.max(ended - 1, 0);
    x[o + CI.since_previous_offset] = ended > 0 ? Math.min(c - end[prv], timeCapSeconds) : timeCapSeconds;
    const beats = (c * tempo) / 60.0 - origin;
    const beatPhase = twoPi * (beats - Math.floor(beats));
    const bars = beats / barLen;
    const barPhase = twoPi * (bars - Math.floor(bars));
    x[o + CI.beat_sin] = Math.sin(beatPhase);
    x[o + CI.beat_cos] = Math.cos(beatPhase);
    x[o + CI.bar_sin] = Math.sin(barPhase);
    x[o + CI.bar_cos] = Math.cos(barPhase);
    x[o + CI.tempo] = tempo;
    x[o + CI.velocity] = useVelocity && inNote ? vel[i] / 127.0 : 0;
    x[o + CI.use_velocity] = useVelocity ? 1 : 0;
    const co = k * 4;
    cat[co] = tr.state[k];
    cat[co + 1] = art[Math.max(started - 1, 0)];
    cat[co + 2] = inNote ? (contiguous[i] ? 0 : 1) : 2;
    cat[co + 3] = instIdx;
  }
  // sub-frame onset/offset fractions, exact (spec §2)
  const scale = new Frac(BigInt(60 * frameRate)).div(Frac.fromDouble(tempo));
  const half = new Frac(1n, 2n);
  notes.forEach((n, j) => {
    const [a, b] = ranges[j];
    if (b <= a) return;
    x[a * NC + CI.onset_fraction] = Frac.fromDouble(n.start).mul(scale).sub(new Frac(BigInt(a))).add(half).toNumber();
    x[(b - 1) * NC + CI.offset_fraction] = Frac.fromDouble(n.end).mul(scale).sub(new Frac(BigInt(b))).add(half).toNumber();
  });
  return { continuous: Float32Array.from(x), categorical: cat, edits, use_velocity: useVelocity, n_frames: T, notes,
    reference_pitch: tr.reference_pitch };
}

/** Spec §4 with stats = stats.json.score_features, in float32 like numpy (NEP 50: the Python floats act as float32). */
export function standardize(continuous, stats) {
  const out = Float32Array.from(continuous);
  const T = out.length / NC;
  for (const [f, ms] of Object.entries(stats.standardized)) {
    const col = CI[f];
    const mean = Math.fround(ms.mean), std = Math.fround(ms.std || 1.0);
    for (let k = 0; k < T; k++) {
      const o = k * NC + col;
      out[o] = Math.fround(Math.fround(out[o] - mean) / std);
    }
  }
  return out;
}
