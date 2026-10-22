/**
 * Position aging curves: expected production at each age relative to that position's peak (1.0).
 *
 * Loaded from data/age-curves.json, produced by scripts/analysis/age_curves.py: our measurement on Sleeper stats
 * since 2012 (delta method, prior-season selection, retirements counted as zero) blended 50/50 with published
 * research (4for4 production curves, PFF aging work). Re-run each off-season.
 */
import fs from 'node:fs';
import path from 'node:path';

const FALLBACK: Record<string, [number, number][]> = {
  RB: [[21, 0.93], [23, 1], [27, 0.97], [28, 0.91], [29, 0.77], [30, 0.57], [31, 0.42], [32, 0.32], [33, 0.24], [34, 0.15], [35, 0]],
  WR: [[21, 0.78], [23, 0.87], [25, 0.98], [26, 1], [28, 0.95], [29, 0.88], [30, 0.81], [31, 0.73], [32, 0.6], [33, 0.47], [34, 0.34], [35, 0.22], [36, 0.14], [37, 0]],
  TE: [[21, 0.74], [23, 0.88], [25, 0.99], [26, 1], [27, 0.95], [28, 0.89], [29, 0.83], [30, 0.78], [32, 0.74], [33, 0.67], [34, 0.57], [35, 0.43], [36, 0.33], [37, 0.25], [38, 0]],
  QB: [[21, 0.73], [24, 0.81], [26, 0.83], [27, 0.9], [28, 0.98], [29, 1], [32, 0.96], [33, 0.92], [34, 0.87], [35, 0.82], [36, 0.78], [37, 0.73], [38, 0.65], [39, 0.56], [40, 0.47], [41, 0.38], [42, 0.31], [43, 0]],
};

function load(): Record<string, [number, number][]> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data', 'age-curves.json'), 'utf8'));
    return raw.curves ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

const CURVES = load();

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
