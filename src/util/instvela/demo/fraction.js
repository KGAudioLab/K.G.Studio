// Adapted from InstVELA M01Preview ONNX by Xiaohan Tian @ KGAudioLab. See ../LICENSE and ../NOTICE.
// Exact rational arithmetic on BigInt, mirroring Python's fractions.Fraction where the M01 preprocessing uses it
// (frame boundaries and sub-frame onset/offset fractions). fromDouble is exact; toNumber is correctly rounded
// (round half to even), like float(Fraction).

const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
const bitLength = (n) => (n === 0n ? 0 : (n < 0n ? -n : n).toString(2).length);

export class Frac {
  constructor(n, d = 1n) {
    if (d === 0n) throw new RangeError("zero denominator");
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  static from(x) {
    if (x instanceof Frac) return x;
    if (typeof x === "bigint") return new Frac(x);
    return Frac.fromDouble(x);
  }

  /** The exact value of an IEEE double. */
  static fromDouble(x) {
    if (!Number.isFinite(x)) throw new RangeError(`not finite: ${x}`);
    if (Number.isInteger(x) && Number.isSafeInteger(x)) return new Frac(BigInt(x));
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, x);
    const hi = dv.getUint32(0), lo = dv.getUint32(4);
    const sign = hi >>> 31 ? -1n : 1n;
    const exp = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let e;
    if (exp === 0) e = -1074;
    else { mant |= 1n << 52n; e = exp - 1075; }
    return e >= 0 ? new Frac(sign * (mant << BigInt(e))) : new Frac(sign * mant, 1n << BigInt(-e));
  }

  add(o) { o = Frac.from(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Frac.from(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Frac.from(o); return new Frac(this.n * o.n, this.d * o.d); }
  div(o) { o = Frac.from(o); return new Frac(this.n * o.d, this.d * o.n); }

  /** math.ceil of the exact value, as a Number (BigInt division truncates towards zero). */
  ceil() {
    const q = this.n / this.d;
    return Number(this.n > 0n && this.n % this.d !== 0n ? q + 1n : q);
  }

  floor() {
    const q = this.n / this.d;
    return Number(this.n < 0n && this.n % this.d !== 0n ? q - 1n : q);
  }

  /** Correctly rounded conversion to a double (round half to even), as Python's float(Fraction). */
  toNumber() {
    if (this.n === 0n) return 0;
    const neg = this.n < 0n;
    const n = neg ? -this.n : this.n;
    const d = this.d;
    // q = floor(n * 2^s / d) with 2^53 <= q < 2^54: 53 mantissa bits plus one rounding bit
    let s = 54 - (bitLength(n) - bitLength(d));
    let q, r;
    for (;;) {
      const nn = s >= 0 ? n << BigInt(s) : n;
      const dd = s >= 0 ? d : d << BigInt(-s);
      q = nn / dd;
      r = nn % dd;
      if (q >= 1n << 54n) s -= 1;
      else if (q < 1n << 53n) s += 1;
      else break;
    }
    let mant = q >> 1n;
    const half = (q & 1n) === 1n;
    const sticky = r !== 0n;
    if (half && (sticky || (mant & 1n) === 1n)) mant += 1n;
    const v = Number(mant) * 2 ** (1 - s); // exact: mant <= 2^53, power of two (normal range only)
    return neg ? -v : v;
  }
}
