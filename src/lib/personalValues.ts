/**
 * Personal value adjustments: the signed-in user's own view of value (e.g. a premium on distant picks, a discount on
 * players who won't start for them). Applied only to that user's screens; market Futures Values are untouched.
 */
import { RosterDNAMathEngine } from './rosterMath';
import { projectOutlook } from './outlook';
import { SEASON } from './season';
import type { DraftPick, LeagueSettings, LeagueTeamSummary, MasterPlayer, ValueAdjustments } from '../types';
import { finderAssetId, type FinderAsset } from './tradeFinder';

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

export interface PersonalIdea {
  partner_id: string;
  partner_name: string;
  give: FinderAsset[];
  get: FinderAsset[];
  market_give: number;
  market_get: number;
  mine_give: number; // your value of what you give
  mine_get: number; // your value of what you get
  gain: number; // mine_get - mine_give
  lineup_change: number; // your projected pts/wk change next season
  /** Other teams holding the same pick (same year and round) who could do the same deal */
  also: { partner_id: string; partner_name: string; pick: DraftPick }[];
}

/** Players who won't start for you → picks at least `ideas_min_years_out` drafts away, fair on market value. */
export function findPersonalIdeas(opts: {
  me: string;
  players: MasterPlayer[];
  picks: DraftPick[];
  teams: LeagueTeamSummary[];
  settings: LeagueSettings | undefined;
  seasons: number[];
  adj: ValueAdjustments;
}): PersonalIdea[] {
  const { me, players, picks, teams, settings, seasons, adj } = opts;
  if (!adj.enabled || !seasons.length) return [];
  const bench = benchIds(players, settings, adj.bench_seasons);
  const sellable: FinderAsset[] = players
    // Depth players: not starting for you soon, and not projected to grow into a starter later either.
    .filter((p) => bench.has(p.id) && p.market_value >= 400 && !(p.futures?.projection || []).some((s) => s.tier === 'Starter'))
    .map((p) => ({ kind: 'player', item: p }));
  if (!sellable.length) return [];
  const base = projectOutlook(players, picks, settings, seasons)[0]?.total ?? 0;
  const ideas: PersonalIdea[] = [];

  for (const team of teams) {
    if (team.franchise_id === me) continue;
    const targets: FinderAsset[] = team.draft_picks
      .filter((p) => yearsOut(p) >= adj.ideas_min_years_out && p.market_value >= 300)
      .map((p) => ({ kind: 'pick', item: p }));
    const found: PersonalIdea[] = [];
    for (const t of targets) {
      const v = t.item.market_value;
      const combos: FinderAsset[][] = [];
      sellable.forEach((a, i) => {
        combos.push([a]);
        for (let j = i + 1; j < sellable.length; j++) combos.push([a, sellable[j]]);
      });
      for (const give of combos) {
        const mg = give.reduce((s, a) => s + a.item.market_value, 0);
        // They should see it as fair or a small win for them.
        if (mg < v * 0.97 || mg > v * 1.3) continue;
        const mineGive = give.reduce((s, a) => s + myAssetValue(a, true, bench, adj), 0);
        const mineGet = myAssetValue(t, false, bench, adj);
        if (mineGet - mineGive <= 0) continue;
        found.push({
          partner_id: team.franchise_id,
          partner_name: team.franchise_name,
          give,
          get: [t],
          market_give: mg,
          market_get: v,
          mine_give: mineGive,
          mine_get: mineGet,
          gain: mineGet - mineGive,
          lineup_change: 0,
          also: [],
        });
      }
    }
    // Best distinct deals per team (each of your players once).
    const usedGet = new Set<string>();
    const usedGive = new Set<string>();
    for (const idea of found.sort((a, b) => b.gain - a.gain)) {
      const g = finderAssetId(idea.get[0]);
      if (idea.give.some((a) => usedGive.has(finderAssetId(a)))) continue;
      const ids = new Set(idea.give.map((a) => a.item.id));
      idea.lineup_change =
        Math.round(((projectOutlook(players.filter((p) => !ids.has(p.id)), picks, settings, seasons)[0]?.total ?? 0) - base) * 10) / 10;
      usedGet.add(g);
      idea.give.forEach((a) => usedGive.add(finderAssetId(a)));
      ideas.push(idea);
      if (usedGive.size >= 6) break;
    }
  }
  // Same players for the same year/round pick from several teams = one idea with a list of teams to call.
  const groups = new Map<string, PersonalIdea>();
  for (const i of ideas.sort((a, b) => b.gain - a.gain)) {
    const pk = i.get[0].item as DraftPick;
    const key = `${i.give.map(finderAssetId).sort().join('+')}|${pk.year}-${pk.round}`;
    const g = groups.get(key);
    if (g) g.also.push({ partner_id: i.partner_id, partner_name: i.partner_name, pick: pk });
    else groups.set(key, i);
  }
  // Spread suggestions out: each of your players appears at most twice.
  const uses = new Map<string, number>();
  return [...groups.values()].filter((i) => {
    if (i.give.some((a) => (uses.get(finderAssetId(a)) || 0) >= 2)) return false;
    i.give.forEach((a) => uses.set(finderAssetId(a), (uses.get(finderAssetId(a)) || 0) + 1));
    return true;
  });
}
