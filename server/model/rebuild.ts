/**
 * Rebuild mode: sell veterans to contenders for picks and young players.
 *
 * A rebuilding team doesn't want a like-for-like swap (one prime starter for another): it wants assets that peak
 * when the team does. So for each veteran worth selling we look only at contenders (who gain points now), only at
 * returns made of draft picks and players 24 or younger, and we score each package on seasons two to five, not
 * this one. Fair means the contender gives 90-115% of the veteran's Futures Value.
 */
import { projectOutlook } from './outlook';
import { curveAt } from './ageCurves';
import { pickName } from '../../src/lib/leagueStats';
import type { DraftPick, LeagueSettings, MasterPlayer, RosterEvaluationResult } from '../../src/types';
import { finderAssetId, type FinderAsset } from '../../src/lib/assets';
import { LeagueSyncError } from '../leagues/types';

/** Rebuild weights: this season barely counts; the years you plan to contend count most. */
const REBUILD_WEIGHTS = [0.1, 0.6, 1, 1, 0.9];
/** Age at which each position is a sell for a rebuilding team (value falls from here). */
const SELL_AGE: Record<string, number> = { RB: 25.5, WR: 27.5, TE: 28, QB: 30 };
const YOUTH_AGE = 24.5;

export interface RebuildPackage {
  partner_id: string;
  partner_name: string;
  partner_record: string | null;
  give: FinderAsset[];
  get: FinderAsset[];
  value_give: number;
  value_get: number;
  picks: number;
  young_players: number;
  /** Your projected pts/wk change by season */
  my_change: number[];
  /** Their pts/wk change this season (why a contender says yes) */
  their_now: number;
  /** Rebuild-weighted gain for you (pts/wk, seasons 2-5 weighted most) */
  rebuild_gain: number;
  reasons: string[];
}
export interface SellCandidate {
  id: string;
  name: string;
  position: string;
  age: number;
  value: number;
  /** Rough value a year from now if the market follows his age curve */
  value_next_year: number;
  ppg_by_season: number[];
  why: string;
  packages: RebuildPackage[];
}
export interface KeepPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  value: number;
}
export interface RebuildPlan {
  seasons: number[];
  sell: SellCandidate[];
  keep: KeepPlayer[];
  picks: { label: string; value: number }[];
}

interface Side {
  players: MasterPlayer[];
  picks: DraftPick[];
}
const totals = (s: Side, settings: LeagueSettings | undefined, seasons: number[]) =>
  projectOutlook(s.players, s.picks, settings, seasons).map((o) => o.total);
const weigh = (xs: number[]) => xs.reduce((t, x, i) => t + x * (REBUILD_WEIGHTS[i] ?? 0.8), 0);
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
const val = (a: FinderAsset) => a.item.market_value;
const isYouthOrPick = (a: FinderAsset) => a.kind === 'pick' || (a.item.age ?? 99) <= YOUTH_AGE;
const recordOf = (r?: { wins: number; losses: number; ties: number }) => (r ? `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}` : null);

export function buildRebuildPlan(ev: RosterEvaluationResult): RebuildPlan {
  const settings = ev.settings as LeagueSettings | undefined;
  const seasons = (ev.season_outlook || []).map((o) => o.season);
  const me = ev.roster.franchise_id;
  const mine: Side = { players: ev.players, picks: ev.draft_picks || [] };
  const capOn = !!settings?.salary_cap?.cap;
  const cap = settings?.salary_cap?.cap ?? Infinity;
  const capHit = (id: string) => (id === me ? ev.cap?.hit : ev.league_teams?.find((t) => t.franchise_id === id)?.cap?.hit) ?? 0;
  const salary = (list: FinderAsset[]) => list.reduce((s, a) => s + (a.kind === 'player' ? a.item.contract?.salary ?? 0 : 0), 0);
  const sellAge = (p: MasterPlayer) => (p.position === 'QB' && settings?.superflex ? 31 : SELL_AGE[p.position] ?? 99);

  const keep: KeepPlayer[] = ev.players
    .filter((p) => (p.age ?? 99) <= YOUTH_AGE + 1 && p.market_value >= 1000)
    .sort((a, b) => b.market_value - a.market_value)
    .map((p) => ({ id: p.id, name: p.full_name, position: p.position, age: p.age ?? 0, value: p.market_value }));
  const picks = (ev.draft_picks || [])
    .slice()
    .sort((a, b) => a.year - b.year || a.round - b.round)
    .map((p) => ({ label: pickName(p, me), value: p.market_value }));
  if (!seasons.length) return { seasons, sell: [], keep, picks };

  const myBase = totals(mine, settings, seasons);
  const myBaseW = weigh(myBase);

  // Contenders: winning record, or a win-now roster when there are no records yet.
  const buyers = (ev.league_teams || [])
    .filter((t) => t.franchise_id !== me)
    .map((t) => {
      const r = t.record;
      const pct = r && r.wins + r.losses + r.ties > 0 ? (r.wins + r.ties / 2) / (r.wins + r.losses + r.ties) : null;
      const contending = pct != null ? pct >= 0.5 : t.trade_stance === 'WIN_NOW_BUYER' || t.trade_stance === 'BALANCED_CONTENDER';
      const side: Side = { players: [...t.starters, ...t.bench, ...(t.reserves || [])], picks: t.draft_picks };
      return { t, pct, contending, side, base: totals(side, settings, seasons) };
    })
    .filter((b) => b.contending);

  const vets = ev.players
    .filter((p) => p.market_value >= 800 && (p.age ?? 0) >= sellAge(p) && !['K', 'DEF'].includes(p.position))
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 10);

  const sell: SellCandidate[] = vets.map((p) => {
    const age = p.age ?? 0;
    const drop = curveAt(p.position, age + 1) / Math.max(curveAt(p.position, age), 0.01);
    const value_next_year = Math.round(p.market_value * Math.min(1, drop));
    const ppg_by_season = (p.futures?.projection || []).map((x) => Math.round((x.ppg ?? 0) * 10) / 10);
    const pctDrop = Math.round((1 - Math.min(1, drop)) * 100);
    const why =
      pctDrop >= 5
        ? `At ${Math.floor(age)}, ${p.position}s usually lose about ${pctDrop}% of their production by next season. Sell while contenders pay for this year.`
        : `Near the end of his peak for a ${p.position}. His value holds this year, then usually starts to fall.`;
    const vetAsset: FinderAsset = { kind: 'player', item: p };
    const v = p.market_value;
    const packages: RebuildPackage[] = [];

    for (const b of buyers) {
      const theirNowGain = totals(swap(b.side, [], [vetAsset]), settings, seasons)[0] - b.base[0];
      if (theirNowGain < 0.3) continue; // he doesn't start for them, so they won't pay
      const pool: FinderAsset[] = [
        ...b.side.picks.filter((pk) => pk.market_value >= 150).map((pk) => ({ kind: 'pick' as const, item: pk })),
        ...b.side.players.filter((x) => x.market_value >= 250 && (x.age ?? 99) <= YOUTH_AGE).map((x) => ({ kind: 'player' as const, item: x })),
      ]
        .filter((a) => val(a) <= v * 1.15)
        .sort((x, y) => val(y) - val(x))
        .slice(0, 18);
      const combos: FinderAsset[][] = [];
      for (let i = 0; i < pool.length; i++) {
        combos.push([pool[i]]);
        for (let j = i + 1; j < pool.length; j++) {
          combos.push([pool[i], pool[j]]);
          for (let k = j + 1; k < pool.length; k++) combos.push([pool[i], pool[j], pool[k]]);
        }
      }
      const fair = combos.filter((c) => {
        const t = c.reduce((s, a) => s + val(a), 0);
        if (t < v * 0.9 || t > v * 1.15) return false;
        if (capOn) {
          const net = salary(c) - salary([vetAsset]); // salary coming to me minus going out
          if (capHit(me) + net > cap || capHit(b.t.franchise_id) - net > cap) return false;
        }
        return true;
      });
      // Pre-rank by future value: picks and the youngest players first, then exact-score the best few.
      const approx = (c: FinderAsset[]) =>
        c.reduce((s, a) => s + val(a) * (a.kind === 'pick' ? 1.05 : 1 + Math.max(0, YOUTH_AGE - (a.item.age ?? YOUTH_AGE)) * 0.03), 0) + c.length * 120;
      for (const c of fair.sort((x, y) => approx(y) - approx(x)).slice(0, 12)) {
        if (!c.every(isYouthOrPick)) continue;
        const after = totals(swap(mine, [vetAsset], c), settings, seasons);
        const my_change = after.map((x, i) => Math.round((x - myBase[i]) * 10) / 10);
        const rebuild_gain = Math.round((weigh(after) - myBaseW) * 10) / 10;
        const nPicks = c.filter((a) => a.kind === 'pick').length;
        const nYoung = c.length - nPicks;
        const reasons: string[] = [];
        reasons.push(`Adds about ${Math.round(theirNowGain * 10) / 10} pts/wk to their lineup this season, so a contender has a reason to pay.`);
        const firsts = c.filter((a) => a.kind === 'pick' && a.item.round === 1).length;
        if (firsts) reasons.push(`Includes ${firsts === 1 ? 'a first-round pick' : `${firsts} first-round picks`}.`);
        if (c.length >= 2) reasons.push(`${c.length} pieces for one: more shots at hitting on a long-term starter.`);
        packages.push({
          partner_id: b.t.franchise_id,
          partner_name: b.t.franchise_name,
          partner_record: recordOf(b.t.record),
          give: [vetAsset],
          get: c,
          value_give: v,
          value_get: c.reduce((s, a) => s + val(a), 0),
          picks: nPicks,
          young_players: nYoung,
          my_change,
          their_now: Math.round(theirNowGain * 10) / 10,
          rebuild_gain,
          reasons,
        });
      }
    }
    // Best few, at most two per buyer, ranked on the rebuild horizon (more pieces and value break ties).
    const perBuyer = new Map<string, number>();
    // Two of a team's 2028 firsts are the same offer; keep one.
    const sig = (pk: RebuildPackage) =>
      pk.partner_id + '|' + pk.get.map((a) => (a.kind === 'pick' ? `${a.item.year}-${a.item.round}-${a.item.tier ?? ''}` : a.item.id)).sort().join(',');
    const seen = new Set<string>();
    const best = packages
      .filter((pk) => (seen.has(sig(pk)) ? false : (seen.add(sig(pk)), true)))
      .sort((a, b) => b.rebuild_gain + b.get.length * 0.3 + b.value_get / 4000 - (a.rebuild_gain + a.get.length * 0.3 + a.value_get / 4000))
      .filter((pk) => {
        const n = perBuyer.get(pk.partner_id) ?? 0;
        if (n >= 2) return false;
        perBuyer.set(pk.partner_id, n + 1);
        return true;
      })
      .slice(0, 6);
    return { id: p.id, name: p.full_name, position: p.position, age, value: v, value_next_year, ppg_by_season, why, packages: best };
  });

  return { seasons, sell, keep, picks };
}

export interface OfferCheck {
  value_give: number;
  value_get: number;
  my_change: number[];
  rebuild_gain: number;
  age_give: number | null;
  age_get: number | null;
  verdict: 'good' | 'sideways' | 'bad';
  summary: string;
}

/** Judge one offer on the rebuild horizon: does it make you better in seasons two to five, and younger? */
export function checkRebuildOffer(ev: RosterEvaluationResult, partnerId: string, giveIds: string[], getIds: string[]): OfferCheck {
  const settings = ev.settings as LeagueSettings | undefined;
  const seasons = (ev.season_outlook || []).map((o) => o.season);
  const mine: Side = { players: ev.players, picks: ev.draft_picks || [] };
  const team = ev.league_teams?.find((t) => t.franchise_id === partnerId);
  if (!team) throw new LeagueSyncError('That team isn’t in this league.');
  const theirs: Side = { players: [...team.starters, ...team.bench, ...(team.reserves || [])], picks: team.draft_picks };
  const pickFrom = (s: Side, ids: string[]): FinderAsset[] =>
    ids
      .map((id) => {
        const [kind, rest] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
        if (kind === 'player') {
          const p = s.players.find((x) => x.id === rest);
          return p ? ({ kind: 'player', item: p } as FinderAsset) : null;
        }
        const pk = s.picks.find((x) => x.id === rest);
        return pk ? ({ kind: 'pick', item: pk } as FinderAsset) : null;
      })
      .filter((a): a is FinderAsset => !!a);
  const give = pickFrom(mine, giveIds);
  const get = pickFrom(theirs, getIds);
  if (!give.length || !get.length) throw new LeagueSyncError('Choose at least one asset on each side.');
  const base = totals(mine, settings, seasons);
  const after = totals(swap(mine, give, get), settings, seasons);
  const my_change = after.map((x, i) => Math.round((x - base[i]) * 10) / 10);
  const rebuild_gain = Math.round((weigh(after) - weigh(base)) * 10) / 10;
  const avgAge = (l: FinderAsset[]) => {
    const ps = l.filter((a) => a.kind === 'player').map((a) => (a.item as MasterPlayer).age ?? 0).filter((x) => x > 0);
    return ps.length ? Math.round((ps.reduce((s, x) => s + x, 0) / ps.length) * 10) / 10 : null;
  };
  const value_give = give.reduce((s, a) => s + val(a), 0);
  const value_get = get.reduce((s, a) => s + val(a), 0);
  const age_give = avgAge(give);
  const age_get = avgAge(get);
  const picksIn = get.filter((a) => a.kind === 'pick').length;
  const youngIn = get.filter((a) => a.kind === 'player' && (a.item.age ?? 99) <= YOUTH_AGE).length;
  const yearsYounger = age_give != null && age_get != null ? age_give - age_get : picksIn ? 3 : 0;
  let verdict: OfferCheck['verdict'];
  let summary: string;
  if (rebuild_gain >= 0.5 && (picksIn + youngIn > 0 || yearsYounger >= 2)) {
    verdict = 'good';
    summary = `A rebuilding move: you get ${[picksIn && `${picksIn} pick${picksIn > 1 ? 's' : ''}`, youngIn && `${youngIn} player${youngIn > 1 ? 's' : ''} 24 or younger`].filter(Boolean).join(' and ') || 'younger talent'}, and your lineup in ${seasons[2] ?? 'two years'} and after gets better.`;
  } else if (rebuild_gain > -0.5 && Math.abs(yearsYounger) < 2 && !picksIn) {
    verdict = 'sideways';
    summary = 'A sideways swap: one prime starter for another of about the same age. It doesn’t move your rebuild forward; contenders should be paying you in picks and young players instead.';
  } else if (rebuild_gain >= 0.5) {
    verdict = 'good';
    summary = 'Helps your lineup in the seasons you plan to contend.';
  } else {
    verdict = 'bad';
    summary = 'Makes your team worse in the seasons you’re building for. Hold out for picks or younger players.';
  }
  return { value_give, value_get, my_change, rebuild_gain, age_give, age_get, verdict, summary };
}
