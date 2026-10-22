/**
 * Expected production from rookie draft picks, measured from what past picks actually did
 * (data/rookie-picks.json, scripts/analysis/rookie_picks.py). For a pick, returns per season after the draft
 * the chance of a starter-level season and the points per game such a hit produces.
 */
import fs from 'node:fs';
import path from 'node:path';

interface Bin {
  slots: [number, number];
  years: { year: number; n: number; hit_rate: number | null; ppg_if_hit: number | null }[];
}

let data: { bins: Record<'1qb' | 'sf', Bin[]> } | null = null;
try {
  data = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data', 'rookie-picks.json'), 'utf8'));
} catch {
  data = null;
}

/** Overall rookie-draft slots a pick covers, e.g. an early 1st in a 12-team league is slots 1-4. */
export function slotRange(round: number, teams: number, tier?: 'Early' | 'Mid' | 'Late'): [number, number] {
  const start = (round - 1) * teams + 1;
  const third = Math.max(1, Math.round(teams / 3));
  if (tier === 'Early') return [start, start + third - 1];
  if (tier === 'Late') return [start + teams - third, start + teams - 1];
  if (tier === 'Mid') return [start + third, start + teams - third - 1];
  return [start, start + teams - 1];
}

export interface PickOutlook {
  year: number; // 1 = rookie season
  hit_rate: number;
  ppg_if_hit: number;
}

/** Expected outcome by season for a pick, from the measured bins its slots fall into. */
export function pickOutlook(round: number, teams: number, superflex: boolean, tier?: 'Early' | 'Mid' | 'Late'): PickOutlook[] {
  const bins = data?.bins[superflex ? 'sf' : '1qb'];
  if (!bins?.length) return [];
  const [a, b] = slotRange(round, teams, tier);
  const hit = bins.filter((x) => x.slots[1] >= a && x.slots[0] <= b);
  const use = hit.length ? hit : [bins[bins.length - 1]]; // beyond measured slots: use the last bin
  return use[0].years.map((_, k) => {
    const ys = use.map((x) => x.years[k]).filter((y) => y.hit_rate != null);
    const n = ys.reduce((s, y) => s + y.n, 0) || 1;
    const rate = ys.reduce((s, y) => s + (y.hit_rate ?? 0) * y.n, 0) / n;
    const withHits = ys.filter((y) => y.ppg_if_hit != null);
    const ppg = withHits.length ? withHits.reduce((s, y) => s + (y.ppg_if_hit ?? 0), 0) / withHits.length : 0;
    return { year: k + 1, hit_rate: Math.round(rate * 1000) / 1000, ppg_if_hit: Math.round(ppg * 10) / 10 };
  });
}
