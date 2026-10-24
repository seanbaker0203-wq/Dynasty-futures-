/**
 * Personal value adjustments: the signed-in user's own view of value (e.g. a premium on distant picks, a discount on
 * players who won't start for them). Applied only to that user's screens; market Futures Values are untouched.
 */
import { RosterDNAMathEngine } from './rosterMath';
import { SEASON } from './season';
import type { DraftPick, LeagueSettings, LeagueTeamSummary, MasterPlayer, ValueAdjustments } from '../types';
import type { FinderAsset } from './assets';

export const yearsOut = (p: { year: number }) => Math.max(0, p.year - SEASON.upcomingDraftYear);

/** Ids of your players who aren't in your best projected lineup in any of the next `seasons` seasons. */
export function benchIds(players: MasterPlayer[], settings: LeagueSettings | undefined, seasons: number): Set<string> {
  const starters = new Set<string>();
  for (let i = 0; i < Math.max(1, seasons); i++) {
    const asPoints = players.map((p) => ({ ...p, roster_designation: 'ACTIVE' as const, market_value: p.futures?.projection[i]?.ppg ?? 0 }));
    const { starters: s } = RosterDNAMathEngine.splitStartersAndBench(asPoints, [], settings);
    s.forEach((p) => starters.add(p.id));
  }
  return new Set(players.filter((p) => !starters.has(p.id)).map((p) => p.id));
}

/** Your value for a pick (anyone's pick: it's what *you* think it's worth). */
export const myPickValue = (p: DraftPick, adj: ValueAdjustments) =>
  adj.enabled ? p.market_value * (1 + (adj.pick_premium[Math.min(yearsOut(p), adj.pick_premium.length - 1)] || 0)) : p.market_value;

/** Your value for one of your own players. */
export const myPlayerValue = (p: MasterPlayer, bench: Set<string>, adj: ValueAdjustments) =>
  adj.enabled && bench.has(p.id) ? p.market_value * (1 - adj.bench_discount) : p.market_value;

/** Value of an asset in your eyes. `mine` = it's currently yours (the bench discount only applies to your players). */
export const myAssetValue = (a: FinderAsset, mine: boolean, bench: Set<string>, adj: ValueAdjustments) =>
  a.kind === 'pick' ? myPickValue(a.item, adj) : mine ? myPlayerValue(a.item, bench, adj) : a.item.market_value;

/** Median market value of a pick by draft year and round across the league (for the "how the market discounts time" table). */
export function pickCurve(teams: LeagueTeamSummary[], rounds = [1, 2]) {
  const all = teams.flatMap((t) => t.draft_picks);
  const years = [...new Set(all.map((p) => p.year))].sort();
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
  };
  return rounds.map((round) => {
    const byYear = years.map((year) => ({ year, value: Math.round(med(all.filter((p) => p.year === year && p.round === round).map((p) => p.market_value))) }));
    const next = byYear[0]?.value || 0;
    return { round, byYear: byYear.map((y) => ({ ...y, growth_to_next: y.value ? next / y.value - 1 : 0 })) };
  });
}

