/**
 * Trade finder: "who to call and with what". For every other team, look for one-for-one and two-for-one deals
 * that are fair on Futures Value (so they could plausibly say yes) but improve your next five seasons, scored
 * with the same season outlook the Plan page uses. Each partner's real trading history nudges the ranking.
 */
import { projectOutlook } from './outlook';
import { pickName } from './leagueStats';
import type { DraftPick, LeagueSettings, LeagueTeamSummary, ManagerProfile, MasterPlayer } from '../types';

export type FinderAsset = { kind: 'player'; item: MasterPlayer } | { kind: 'pick'; item: DraftPick };
export const finderAssetId = (a: FinderAsset) => `${a.kind}:${a.item.id}`;

export interface TradeIdea {
  partner_id: string;
  partner_name: string;
  give: FinderAsset[];
  get: FinderAsset[];
  value_give: number;
  value_get: number;
  /** Change in your projected points per week, per season */
  my_change: number[];
  their_change: number[];
  /** Weighted five-season gain for you (pts/wk) */
  my_gain: number;
  their_gain: number;
  score: number;
  reasons: string[];
}

interface Side {
  players: MasterPlayer[];
  picks: DraftPick[];
}

// Near seasons matter more; a title next year beats a maybe in year five.
const WEIGHTS = [1, 0.85, 0.72, 0.61, 0.52];

function totals(side: Side, settings: LeagueSettings | undefined, seasons: number[]) {
  return projectOutlook(side.players, side.picks, settings, seasons).map((o) => o.total);
}
const weighted = (xs: number[]) => xs.reduce((s, x, i) => s + x * (WEIGHTS[i] ?? 0.5), 0);

function swap(side: Side, out: FinderAsset[], incoming: FinderAsset[]): Side {
  const ids = new Set(out.map(finderAssetId));
  return {
    players: [
      ...side.players.filter((p) => !ids.has(`player:${p.id}`)),
      ...incoming.filter((a) => a.kind === 'player').map((a) => ({ ...(a.item as MasterPlayer), roster_designation: 'ACTIVE' as const })),
    ],
    picks: [...side.picks.filter((p) => !ids.has(`pick:${p.id}`)), ...incoming.filter((a) => a.kind === 'pick').map((a) => a.item as DraftPick)],
  };
}

const value = (a: FinderAsset) => a.item.market_value;
const label = (a: FinderAsset, ownerId: string) => (a.kind === 'player' ? a.item.full_name : pickName(a.item, ownerId));
export const describeAssets = (list: FinderAsset[], ownerId: string) => list.map((a) => label(a, ownerId)).join(' + ');

export function findTrades(opts: {
  me: string;
  mine: Side;
  teams: LeagueTeamSummary[];
  settings: LeagueSettings | undefined;
  seasons: number[];
  profiles?: ManagerProfile[];
  perPartner?: number;
  /** Current cap hit by team id (salary-cap leagues): ideas that push either team over the cap are dropped. */
  capHits?: Record<string, number>;
  /** Only deals that include this asset of yours (e.g. "player:123"). */
  sellId?: string | null;
  /** Only deals where the main piece you get plays one of these positions. */
  wantPositions?: string[];
}): TradeIdea[] {
  const { me, mine, teams, settings, seasons, profiles = [], capHits, sellId = null, wantPositions = [] } = opts;
  const filtered = !!sellId || wantPositions.length > 0;
  const perPartner = opts.perPartner ?? (filtered ? 4 : 3);
  const cap = settings?.salary_cap?.cap;
  const salary = (list: FinderAsset[]) => list.reduce((s, a) => s + (a.kind === 'player' ? a.item.contract?.salary ?? 0 : 0), 0);
  if (!seasons.length) return [];
  const myBase = totals(mine, settings, seasons);
  const myBaseW = weighted(myBase);

  // What each of my assets is worth to *me* (five-season loss if it left). Cheap-to-me assets are the ones to sell.
  const myAssets: FinderAsset[] = [
    ...mine.players.filter((p) => p.market_value >= 300).map((p) => ({ kind: 'player' as const, item: p })),
    ...mine.picks.filter((p) => p.market_value >= 300).map((p) => ({ kind: 'pick' as const, item: p })),
  ];
  const costToMe = new Map<string, number>();
  for (const a of myAssets) costToMe.set(finderAssetId(a), myBaseW - weighted(totals(swap(mine, [a], []), settings, seasons)));

  const ideas: TradeIdea[] = [];
  for (const team of teams) {
    if (team.franchise_id === me) continue;
    const theirs: Side = { players: [...team.starters, ...team.bench, ...(team.reserves || [])], picks: team.draft_picks };
    const theirBase = totals(theirs, settings, seasons);
    const theirBaseW = weighted(theirBase);
    const profile = profiles.find((p) => p.team_id === team.franchise_id);
    const tags = new Set(profile?.tags || []);

    // Their players that would most improve my outlook (only real assets).
    const sellAsset = sellId ? myAssets.find((a) => finderAssetId(a) === sellId) ?? null : null;
    if (sellId && !sellAsset) return [];
    const sellValue = sellAsset ? value(sellAsset) : 0;
    const targets = theirs.players
      .filter((p) =>
        wantPositions.length
          ? wantPositions.includes(p.position) && p.market_value >= 300 && (!sellAsset || (p.market_value >= sellValue * 0.4 && p.market_value <= sellValue * 1.6))
          : sellAsset
            ? p.market_value >= sellValue * 0.4 && p.market_value <= sellValue * 1.6
            : p.market_value >= 1000
      )
      .map((p) => {
        const a: FinderAsset = { kind: 'player', item: p };
        return { a, gain: weighted(totals(swap(mine, [], [a]), settings, seasons)) - myBaseW };
      })
      .filter((t) => (filtered ? true : t.gain > 0.3))
      .sort((x, y) => y.gain - x.gain)
      .slice(0, filtered ? 10 : 6);

    const candidates: { give: FinderAsset[]; get: FinderAsset[]; approx: number }[] = [];
    if (filtered) {
      // Fair for them: they receive 97-125% of what they give (more when they give two pieces for one).
      const fair = (giveV: number, getV: number, getN: number, giveN: number) => {
        const r = giveV / Math.max(getV, 1);
        if (giveN > getN) return r >= 1.1 && r <= 1.35; // I consolidate: I pay a premium
        if (getN > giveN) return r >= 0.97 && r <= 1.15; // they consolidate: I give the best piece
        return r >= 0.97 && r <= 1.2;
      };
      const cost = (list: FinderAsset[]) => list.reduce((t, a) => t + (costToMe.get(finderAssetId(a)) ?? 0), 0);
      const theirExtras: FinderAsset[] = [
        ...theirs.picks.filter((p) => p.market_value >= 150).map((p) => ({ kind: 'pick' as const, item: p })),
        ...theirs.players.filter((p) => p.market_value >= 150).map((p) => ({ kind: 'player' as const, item: p })),
      ];
      const myGiveSets: FinderAsset[][] = sellAsset
        ? [[sellAsset], ...myAssets.filter((a) => a !== sellAsset).map((b) => [sellAsset, b])]
        : [...myAssets.map((a) => [a]), ...myAssets.flatMap((a, i) => myAssets.slice(i + 1).map((b) => [a, b]))];
      for (const t of targets) {
        for (const give of myGiveSets) {
          const gv = give.reduce((x, a) => x + value(a), 0);
          if (fair(gv, value(t.a), 1, give.length)) candidates.push({ give, get: [t.a], approx: t.gain - cost(give) });
          // My side is worth more: ask for something extra back (one-for-two).
          if (give.length === 1 && gv > value(t.a) * 1.15) {
            for (const x of theirExtras) {
              if (finderAssetId(x) === finderAssetId(t.a)) continue;
              if (value(x) > value(t.a)) continue; // the player you asked for stays the main piece
              if (fair(gv, value(t.a) + value(x), 2, 1)) candidates.push({ give, get: [t.a, x], approx: t.gain - cost(give) + value(x) / 2000 });
            }
          }
        }
      }
    }
    for (const t of filtered ? [] : targets) {
      const v = value(t.a);
      // They should get at least as much value back, but not wildly more.
      // In a 2-for-1 the side getting the best player pays a premium, so ask for ~10%+ more value back.
      const fits = (total: number, n: number) => (n === 1 ? total >= v * 0.97 && total <= v * 1.2 : total >= v * 1.1 && total <= v * 1.35);
      const pool = myAssets.filter((a) => value(a) <= v * 1.35);
      for (let i = 0; i < pool.length; i++) {
        const a = pool[i];
        if (fits(value(a), 1)) candidates.push({ give: [a], get: [t.a], approx: t.gain - (costToMe.get(finderAssetId(a)) ?? 0) });
        for (let j = i + 1; j < pool.length; j++) {
          const b = pool[j];
          if (!fits(value(a) + value(b), 2)) continue;
          candidates.push({
            give: [a, b],
            get: [t.a],
            approx: t.gain - (costToMe.get(finderAssetId(a)) ?? 0) - (costToMe.get(finderAssetId(b)) ?? 0),
          });
        }
      }
    }

    // Score the most promising ones exactly, for both teams.
    const scored: TradeIdea[] = [];
    for (const c of candidates.sort((x, y) => y.approx - x.approx).slice(0, filtered ? 60 : 40)) {
      if (cap && capHits) {
        const net = salary(c.get) - salary(c.give);
        if ((capHits[me] ?? 0) + net > cap || (capHits[team.franchise_id] ?? 0) - net > cap) continue;
      }
      const myAfter = totals(swap(mine, c.give, c.get), settings, seasons);
      const theirAfter = totals(swap(theirs, c.get, c.give), settings, seasons);
      const my_change = myAfter.map((x, i) => Math.round((x - myBase[i]) * 10) / 10);
      const their_change = theirAfter.map((x, i) => Math.round((x - theirBase[i]) * 10) / 10);
      const my_gain = weighted(myAfter) - myBaseW;
      const their_gain = weighted(theirAfter) - theirBaseW;
      if (my_gain <= (filtered ? -1.5 : 0.5)) continue;

      const reasons: string[] = [];
      // Filtered searches can include small lineup losses (you chose to move that player); keep the score positive.
      // ...and prefer deals that don't give away more value than needed (about 1 pt/wk per 300 of overpay).
      const overpay = c.give.reduce((x, a) => x + value(a), 0) - c.get.reduce((x, a) => x + value(a), 0);
      let score = filtered ? my_gain + 20 - Math.max(0, overpay) / 300 : my_gain;
      if (filtered && my_gain < 0) reasons.push(`Costs you about ${Math.abs(Math.round(my_gain * 10) / 10)} pts/wk (weighted), but it’s the move you asked for.`);
      if (their_gain > 0) {
        score *= 1.25;
        reasons.push('Improves their lineup too, so it’s an easier yes.');
      }
      const givesPicks = c.give.some((a) => a.kind === 'pick');
      const givesVets = c.give.some((a) => a.kind === 'player' && (a.item.age ?? 0) >= 27);
      const givesYouth = c.give.some((a) => a.kind === 'player' && (a.item.age ?? 99) <= 24);
      if (tags.has('Collects picks') && givesPicks) { score *= 1.2; reasons.push('They like collecting picks.'); }
      if (tags.has('Buys veterans') && givesVets) { score *= 1.15; reasons.push('They tend to buy proven veterans.'); }
      if (tags.has('Buys youth') && givesYouth) { score *= 1.15; reasons.push('They tend to buy young players.'); }
      if (tags.has('Trades a lot')) { score *= 1.1; reasons.push('One of the league’s most active traders.'); }
      if (tags.has('Hasn’t traded in a year')) { score *= 0.7; reasons.push('Hasn’t made a trade in over a year.'); }
      if (tags.has('Usually wins trades')) { score *= 0.9; reasons.push('Usually wins their trades, so expect a counter.'); }
      const stance = team.trade_stance;
      if ((stance === 'REBUILD_SELLER' || stance === 'YOUTH_ACCUMULATOR') && (givesPicks || givesYouth) && !givesVets) {
        score *= 1.2;
        reasons.push('They’re building for later, and this gives them youth or picks.');
      }
      if (stance === 'WIN_NOW_BUYER' && their_change[0] >= 0) {
        score *= 1.15;
        reasons.push('They’re trying to win now and this doesn’t hurt this year’s lineup.');
      }
      if (their_gain < -2 && !reasons.length) reasons.push('Costs them lineup points, so lead with the value edge.');
      if (c.give.length === 2) reasons.push('2-for-1: they get depth, you get the best player.');

      scored.push({
        partner_id: team.franchise_id,
        partner_name: team.franchise_name,
        give: c.give,
        get: c.get,
        value_give: c.give.reduce((s, a) => s + value(a), 0),
        value_get: c.get.reduce((s, a) => s + value(a), 0),
        my_change,
        their_change,
        my_gain: Math.round(my_gain * 10) / 10,
        their_gain: Math.round(their_gain * 10) / 10,
        score,
        reasons,
      });
    }

    // Keep a few distinct ideas per partner (don't repeat the same target or the same main piece).
    const usedGet = new Set<string>();
    const usedGive = new Set<string>();
    let kept = 0;
    for (const idea of scored.sort((a, b) => b.score - a.score)) {
      if (kept >= perPartner) break;
      const g = finderAssetId(idea.get[0]);
      const main = finderAssetId([...idea.give].sort((a, b) => value(b) - value(a))[0]);
      if (usedGet.has(g) || (!sellId && usedGive.has(main))) continue;
      usedGet.add(g);
      usedGive.add(main);
      ideas.push(idea);
      kept++;
    }
  }
  return ideas.sort((a, b) => b.score - a.score);
}
