/**
 * NFL contract outlook (OverTheCap data via nflverse): when a player's deal ends, the first season his team can cut
 * him and save real cap space, and the measured production effect of leaving (free agency, release) vs staying.
 *
 * Built by scripts/analysis/nfl_contracts.py into data/nfl-contracts.json and data/contract-effects.json.
 * Applied to projections relative to the average move risk at that position and age (the age curves already include
 * the average), halved for caution and capped at +10% / −25% per season.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ContractEvent, NflContract } from '../../src/types';

interface Effects {
  move_effects: Record<string, Record<string, { ppg_vs_stayers: number; played_next_season: number; stayers_played_next_season: number; n: number }>>;
  free_agent_leave_rate: Record<string, { rate: number; n: number }>;
  veteran_deal_survival: Record<string, { cut_soon_after_guarantees: number; deals: number }>;
  annual_baseline: Record<string, { factor: number }>;
}
interface RawContract extends Omit<NflContract, 'events'> {}

const read = <T>(f: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data', f), 'utf8')) as T;
  } catch {
    return null;
  }
};
const contracts = read<{ players: Record<string, RawContract> }>('nfl-contracts.json')?.players ?? {};
const fx = read<Effects>('contract-effects.json');

const bucket = (age: number) => (age < 26 ? '≤25' : age < 29 ? '26-28' : '29+');
const BIG_APY: Record<string, number> = { QB: 25, RB: 8, WR: 15, TE: 10 };

/** Production factor for players who left (free agency or release): per-game change x chance of still playing. */
function leaveFactor(pos: string, kind: 'free_agent' | 'released'): number {
  const e = fx?.move_effects?.[pos]?.[kind];
  if (!e) return kind === 'released' ? 0.6 : 0.85;
  // Shrink small samples toward "no effect".
  const w = e.n / (e.n + 30);
  const ppg = w * e.ppg_vs_stayers + (1 - w);
  const play = w * (e.played_next_season / Math.max(0.01, e.stayers_played_next_season)) + (1 - w);
  return ppg * play;
}

export function nflContract(sleeperId: string | null | undefined, currentSeason: number): RawContract | null {
  if (!sleeperId) return null;
  const c = contracts[sleeperId];
  if (!c || c.through < currentSeason) return null; // stale (deal already over; new one not in the data yet)
  return c;
}

/**
 * Per projected season: the cumulative production factor from contract risk, and the events behind it.
 * `seasons[0]` is the current season (no change); later seasons carry free-agency / cut risk.
 */
export function contractOutlook(
  sleeperId: string | null | undefined,
  position: string,
  age: number,
  seasons: number[],
  isStarter: (t: number) => boolean
): { factors: number[]; contract: NflContract | null } {
  const c = nflContract(sleeperId, seasons[0]);
  const factors = seasons.map(() => 1);
  if (!c || !fx) return { factors, contract: null };
  const events: ContractEvent[] = [];
  let cum = 1;
  for (let t = 1; t < seasons.length; t++) {
    const y = seasons[t];
    const a = age + t - 1; // age when the decision is made
    const ab = bucket(a);
    let p = 0;
    let kind: 'free_agent' | 'released' | null = null;
    if (y === c.free_agent_year) {
      kind = 'free_agent';
      p = (fx.free_agent_leave_rate[`${position}|${ab}`]?.rate ?? 0.5) * (isStarter(t - 1) ? 0.7 : 1);
    } else if (c.out_year && y >= c.out_year && y < c.free_agent_year) {
      kind = 'released';
      const big = c.apy >= (BIG_APY[position] ?? 99);
      const s = fx.veteran_deal_survival[big ? `${position}|big` : position] ?? fx.veteran_deal_survival[position];
      p = (s?.cut_soon_after_guarantees ?? 0.3) * (isStarter(t - 1) ? 0.5 : 1);
    }
    const own = kind ? 1 - p + p * leaveFactor(position, kind) : 1;
    const base = fx.annual_baseline[`${position}|${ab}`]?.factor ?? 0.93;
    let rel = 1 + 0.5 * (own / base - 1);
    rel = Math.min(1.1, Math.max(0.75, rel));
    if (y > c.free_agent_year) rel = 1; // unknown future deal: no adjustment beyond the free-agency year
    cum *= rel;
    factors[t] = Math.round(cum * 1000) / 1000;
    if (kind) events.push({ season: y, kind, probability: Math.round(p * 100) / 100 });
  }
  return { factors, contract: { ...c, events } };
}
