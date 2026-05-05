// Purple (vel=0) -> green (vel=64) -> red (vel=127), matching the piano roll note colors.
export function velocityToColor(v: number, alpha = 1): string {
  const clampedVelocity = Math.max(0, Math.min(127, v));
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

  let r: number;
  let g: number;
  let b: number;

  if (clampedVelocity <= 64) {
    const t = clampedVelocity / 64;
    r = lerp(123, 90, t);
    g = lerp(95, 176, t);
    b = lerp(160, 106, t);
  } else {
    const t = (clampedVelocity - 64) / 63;
    r = lerp(90, 255, t);
    g = lerp(176, 85, t);
    b = lerp(106, 85, t);
  }

  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
