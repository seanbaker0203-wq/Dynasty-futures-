/**
 * Position aging curves: expected production at each age relative to that position's peak (1.0).
 * v1 assumptions drawn from widely published fantasy aging research; tune as we collect data.
 *   RB: peaks 24-25, falls off quickly after 27.
 *   WR: peaks 25-27, steady decline from 29.
 *   TE: slow developers, peak 26-28, decline from 30.
 *   QB: long plateau 26-32, decline from mid-30s.
 */
const CURVES: Record<string, [number, number][]> = {
  RB: [[21, 0.8], [22, 0.9], [23, 0.97], [24, 1], [25, 1], [26, 0.97], [27, 0.9], [28, 0.8], [29, 0.68], [30, 0.55], [31, 0.42], [32, 0.3], [33, 0.18], [34, 0.08], [35, 0]],
  WR: [[21, 0.72], [22, 0.84], [23, 0.92], [24, 0.97], [25, 1], [26, 1], [27, 1], [28, 0.97], [29, 0.92], [30, 0.85], [31, 0.76], [32, 0.65], [33, 0.52], [34, 0.38], [35, 0.25], [36, 0.12], [37, 0]],
  TE: [[21, 0.58], [22, 0.7], [23, 0.8], [24, 0.89], [25, 0.95], [26, 1], [27, 1], [28, 1], [29, 0.97], [30, 0.92], [31, 0.85], [32, 0.76], [33, 0.65], [34, 0.52], [35, 0.38], [36, 0.24], [37, 0.1], [38, 0]],
  QB: [[21, 0.7], [22, 0.8], [23, 0.88], [24, 0.93], [25, 0.97], [26, 1], [32, 1], [33, 0.98], [34, 0.95], [35, 0.9], [36, 0.84], [37, 0.76], [38, 0.66], [39, 0.55], [40, 0.42], [41, 0.28], [42, 0.12], [43, 0]],
};

/** Production multiplier at a (fractional) age, linearly interpolated. Curves end at 0 (retirement). */
export function curveAt(position: string, age: number): number {
  const pts = CURVES[position];
  if (!pts) return 1;
  if (age <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [a1, v1] = pts[i];
    if (age <= a1) {
      const [a0, v0] = pts[i - 1];
      return v0 + ((v1 - v0) * (age - a0)) / (a1 - a0);
    }
  }
  return pts[pts.length - 1][1];
}
