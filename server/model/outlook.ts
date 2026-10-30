/**
 * Season outlook, shared by server and browser: best projected starting lineup (points per week) for each of the
 * next seasons, plus the expected contribution of draft picks. Used for the Plan page and for re-scoring trades.
 */
import { RosterDNAMathEngine } from '../../src/lib/rosterMath';
import type { DraftPick, LeagueSettings, MasterPlayer, SeasonOutlook } from '../../src/types';

const SKILL = ['QB', 'RB', 'WR', 'TE'];
/** Share of games a starting QB misses (bye + injuries), measured league-wide roughly 1 bye + 1.5 games of 17. */
const QB_MISS = 0.15;

export function projectOutlook(
  players: MasterPlayer[],
  picks: DraftPick[],
  settings: LeagueSettings | undefined,
  seasons: number[]
): SeasonOutlook[] {
  return seasons.map((season, i) => {
    // Everyone counts in future seasons: taxi and IR players are back.
    const asPoints = players.map((p) => ({ ...p, roster_designation: 'ACTIVE' as const, market_value: p.futures?.projection[i]?.ppg ?? 0 }));
    const { starters } = RosterDNAMathEngine.splitStartersAndBench(asPoints, [], settings);
    let points = starters.reduce((s, p) => s + p.market_value, 0);
    // A backup QB starts when the starter is on bye or hurt (about 15% of games). He's worth what he scores above
    // the best QB this league leaves on waivers; in leagues that hoard QBs that's very little.
    const norms = settings?.league_norms;
    if (norms) {
      const startIds = new Set(starters.map((p) => p.id));
      const backups = asPoints.filter((p) => p.position === 'QB' && !startIds.has(p.id)).map((p) => p.market_value).sort((a, b) => b - a);
      const waiver = norms.waiver_qb_ppg[i] ?? norms.waiver_qb_ppg[norms.waiver_qb_ppg.length - 1] ?? 0;
      starters.filter((p) => p.position === 'QB').forEach((_, j) => {
        if (backups[j] != null) points += QB_MISS * Math.max(0, backups[j] - waiver);
      });
    }
    const slotsPpg = starters.filter((p) => SKILL.includes(p.position)).map((p) => p.market_value).sort((a, b) => a - b);

    // Picks: chance of a starter-level season x gain over the next-weakest starter. Best picks first, one
    // lineup slot each, so stacking picks has diminishing returns.
    const live = picks
      .filter((pk) => pk.hit_rates?.length && pk.ppg_if_hit?.length)
      .map((pk) => ({ k: season - pk.year, pk }))
      .filter(({ k, pk }) => k >= 0 && k < pk.hit_rates!.length)
      .sort((a, b) => b.pk.hit_rates![b.k] * b.pk.ppg_if_hit![b.k] - a.pk.hit_rates![a.k] * a.pk.ppg_if_hit![a.k]);
    let pickPts = 0;
    live.forEach(({ k, pk }, j) => {
      if (j < slotsPpg.length) pickPts += pk.hit_rates![k] * Math.max(0, pk.ppg_if_hit![k] - slotsPpg[j]);
    });

    const p1 = Math.round(points * 10) / 10;
    const p2 = Math.round(pickPts * 10) / 10;
    return { season, points: p1, pick_points: p2, total: Math.round((p1 + p2) * 10) / 10, rank: 0, rank_roster: 0 };
  });
}

/** Fill in rank / rank_roster across a set of team outlooks (mutates). */
export function rankOutlooks(all: SeasonOutlook[][]) {
  const n = all[0]?.length ?? 0;
  for (let i = 0; i < n; i++) {
    [...all].sort((a, b) => b[i].total - a[i].total).forEach((o, r) => (o[i].rank = r + 1));
    [...all].sort((a, b) => b[i].points - a[i].points).forEach((o, r) => (o[i].rank_roster = r + 1));
  }
}
