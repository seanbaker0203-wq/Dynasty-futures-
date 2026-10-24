/** "From your rules" ideas: players who won't start for you, for distant picks (personal value adjustments). */
import { projectOutlook } from './outlook';
import { benchIds, myAssetValue, yearsOut } from '../../src/lib/personalValues';
import { finderAssetId, type FinderAsset, type PersonalIdea } from '../../src/lib/assets';
import type { DraftPick, LeagueSettings, LeagueTeamSummary, MasterPlayer, ValueAdjustments } from '../../src/types';

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
