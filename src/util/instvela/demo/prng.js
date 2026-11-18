// Adapted from InstVELA M01Preview ONNX by Xiaohan Tian @ KGAudioLab. See ../LICENSE and ../NOTICE.
// Seeded Gaussian noise for the browser (documented, reproducible on every backend and machine).
// PyTorch's streams (CPU Mersenne Twister, CUDA Philox) are not reproduced: the same seed gives a different but
// equally valid take than the Python renders (study report §3). Generator: xoshiro128** seeded through splitmix32,
// standard normals by Box–Muller in float64, rounded to float32.
//
// Streams, as in synthesize.py: one "flow" stream for the F0 and acoustic generators (windows in order), and a
// separate "vocoder" stream (synthesize.py seeds a second generator with the same seed for the vocoder).

function splitmix32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class NormalStream {
  /** seed: integer; stream: a label mixed into the seed so the streams are independent. */
  constructor(seed, stream = 0) {
    const sm = splitmix32((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(stream + 1, 0x7f4a7c15)) >>> 0);
    this.s = Uint32Array.from([sm(), sm(), sm(), sm()]);
    if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[0] = 1;
    this.spare = null;
  }

  nextU32() {
    const s = this.s;
    const r = Math.imul(((Math.imul(s[1], 5) << 7) | (Math.imul(s[1], 5) >>> 25)) >>> 0, 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;
    return r;
  }

  /** Uniform in (0, 1) with 53 random bits. */
  uniform() {
    const a = this.nextU32() >>> 5, b = this.nextU32() >>> 6;
    return (a * 67108864 + b + 0.5) / 9007199254740992;
  }

  /** n standard normal float32 values. */
  normal(n) {
    const out = new Float32Array(n);
    let i = 0;
    if (this.spare !== null && n > 0) { out[i++] = this.spare; this.spare = null; }
    for (; i < n; i += 2) {
      const u = this.uniform(), v = this.uniform();
      const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
      out[i] = r * Math.cos(th);
      if (i + 1 < n) out[i + 1] = r * Math.sin(th);
      else this.spare = Math.fround(r * Math.sin(th));
    }
    return out;
  }
}

/** The noise provider the driver uses: { flow(shape), vocoder(shape) } returning Float32Arrays. */
export function seededNoise(seed) {
  const flow = new NormalStream(seed, 0), voc = new NormalStream(seed, 1);
  return { flow: (n) => flow.normal(n), vocoder: (n) => voc.normal(n), describe: `xoshiro128** + Box–Muller, seed ${seed}` };
}
