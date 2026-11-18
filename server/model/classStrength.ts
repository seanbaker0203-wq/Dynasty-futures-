/**
 * Draft-class strength as the trade market has priced it (data/class-strength.json, scripts/analysis/class_strength.py):
 * each class's 1st-round price relative to the class a year earlier, against the typical ratio for the same point in
 * the year. Pick values already come from the market, so this is shown, not applied again.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface ClassOutlook {
  year: number;
  /** Median of the class's price vs a typical class (1.10 = priced 10% above) */
  vs_typical: number;
  measures: number;
  label: 'strong' | 'typical' | 'weak';
}

let cached: { asof: string; classes: ClassOutlook[] } | null = null;
export function classOutlook(): { asof: string; classes: ClassOutlook[] } {
  if (cached) return cached;
  try {
    const file = path.resolve(process.cwd(), 'data', 'class-strength.json');
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const classes: ClassOutlook[] = Object.entries<any[]>(d.premium || {})
      .filter(([, v]) => v.length >= 2)
      .map(([y, v]) => {
        const xs = v.map((x) => x.vs_typical).sort((a: number, b: number) => a - b);
        const mid = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
        return { year: Number(y), vs_typical: Math.round(mid * 1000) / 1000, measures: xs.length, label: mid >= 1.05 ? 'strong' : mid <= 0.95 ? 'weak' : 'typical' } as ClassOutlook;
      })
      .sort((a, b) => a.year - b.year);
    cached = { asof: d.asof ?? fs.statSync(file).mtime.toISOString().slice(0, 10), classes };
  } catch {
    cached = { asof: '', classes: [] };
  }
  return cached;
}
