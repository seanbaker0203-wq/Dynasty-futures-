/**
 * Redraft: rest-of-season (ROS) values. Same Board shape as Futures Value, so every screen and tool works unchanged.
 *
 *   ROS value = 0.5 × Model + 0.5 × Market
 *   Model  = projected points above a replacement starter in this league, week by week from now through the last
 *            fantasy playoff week (Sleeper/Rotowire weekly projections, league scoring), playoff weeks counted 1.5×.
 *            Bye weeks count as zero. Mapped onto the market's scale by rank.
 *   Market = FantasyCalc redraft values for the league format (QBs, teams, PPR).
 * Kickers and defenses get model-only values (no market), so they rank for waivers but rarely matter in trades.
 */
import type { BoardPlayer, LeagueSettings, ProjectionTier, ValueSignal } from '../../src/types';
import { getMarket } from '../sources/fantasycalc';
import { nflState, weeklyProjections, type WeeklyProjection } from '../sources/weekly';
import { playerDirectory } from '../players';
import { valueStore } from '../values';
import type { Board } from './futures';

const PLAYOFF_WEIGHT = 1.5;
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const cache = new Map<string, { at: number; board: Board }>();
const TTL = 30 * 60 * 1000;

export const playoffWeeks = (s: LeagueSettings) => {
  const p = s.playoffs;
  const start = p?.start_week ?? 15;
  const weeks = p?.weeks ?? Math.max(1, Math.ceil(Math.log2(Math.max(2, p?.teams ?? 6))));
  return { start, end: Math.min(18, start + weeks - 1) };
};

export function rosKey(s: LeagueSettings) {
  const ppr = s.scoring_type === 'PPR' ? 1 : s.scoring_type === 'Half PPR' ? 0.5 : 0;
  const sl = s.slots;
  const { start, end } = playoffWeeks(s);
  return ['ros', s.superflex ? 'sf' : '1qb', s.league_size, ppr, s.te_premium ? 'tep' : '', sl.QB, sl.RB, sl.WR, sl.TE, sl.FLEX, sl.SUPER_FLEX ?? 0, sl.K ?? 0, sl.DEF ?? 0, start, end].join('-');
}

const scorer = (s: LeagueSettings) => {
  const rec = s.scoring_type === 'PPR' ? 1 : s.scoring_type === 'Half PPR' ? 0.5 : 0;
  return (pr: WeeklyProjection, pos: string) => pr.pts_std + rec * pr.rec + (s.te_premium && pos === 'TE' ? 0.5 * pr.rec : 0);
};

/** Starters per position across the league (flex spots shared out by typical usage). */
function startersNeeded(s: LeagueSettings): Record<string, number> {
  const n = s.league_size || 12;
  const sl = s.slots;
  const flex = sl.FLEX || 0;
  const sf = sl.SUPER_FLEX || 0;
  return {
    QB: n * ((sl.QB || 0) + sf * 0.85),
    RB: n * ((sl.RB || 0) + flex * 0.4 + sf * 0.05),
    WR: n * ((sl.WR || 0) + flex * 0.5 + sf * 0.08),
    TE: n * ((sl.TE || 0) + flex * 0.1 + sf * 0.02),
    K: n * (sl.K || 0),
    DEF: n * (sl.DEF || 0),
  };
}

export async function getRosBoard(settings: LeagueSettings): Promise<Board> {
  const key = rosKey(settings);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.board;
  const board = await buildRos(settings, key);
  cache.set(key, { at: Date.now(), board });
  return board;
}

async function buildRos(settings: LeagueSettings, key: string): Promise<Board> {
  const state = await nflState();
  const { start: poStart, end: poEnd } = playoffWeeks(settings);
  const first = Math.min(state.week, poEnd);
  const weekList = Array.from({ length: poEnd - first + 1 }, (_, i) => first + i);
  const ppr = settings.scoring_type === 'PPR' ? 1 : settings.scoring_type === 'Half PPR' ? 0.5 : 0;
  const [projs, market] = await Promise.all([
    Promise.all(weekList.map((w) => weeklyProjections(state.season, w).catch(() => new Map<string, WeeklyProjection>()))),
    getMarket({ superflex: !!settings.superflex, teams: settings.league_size || 12, ppr, dynasty: false }),
    playerDirectory.refresh(),
    valueStore.refresh(),
  ]);
  const score = scorer(settings);

  // ---- per-player weekly points ---------------------------------------------------------------------
  type Row = { id: string; name: string; position: string; team: string | null; weeks: { week: number; points: number; opponent: string | null }[] };
  const rows = new Map<string, Row>();
  weekList.forEach((w, i) => {
    for (const [id, pr] of projs[i]) {
      const pos = pr.position === 'DST' ? 'DEF' : pr.position;
      if (!POS.includes(pos)) continue;
      let r = rows.get(id);
      if (!r) {
        r = { id, name: pr.name, position: pos, team: pr.team, weeks: weekList.map((wk) => ({ week: wk, points: 0, opponent: null })) };
        rows.set(id, r);
      }
      r.weeks[i] = { week: w, points: Math.round(score(pr, pos) * 10) / 10, opponent: pr.opponent };
    }
  });

  // ---- replacement level per position (average weekly points of the last starter) ------------------------
  const need = startersNeeded(settings);
  const weekly = (r: Row) => {
    const played = r.weeks.filter((w) => w.points > 0);
    return played.length ? played.reduce((s, w) => s + w.points, 0) / played.length : 0;
  };
  const repl: Record<string, number> = {};
  const starterLine: Record<string, number> = {};
  for (const pos of POS) {
    const list = [...rows.values()].filter((r) => r.position === pos).map(weekly).sort((a, b) => b - a);
    const k = Math.max(1, Math.round(need[pos] || 0));
    repl[pos] = list[Math.min(list.length - 1, k)] ?? 0;
    starterLine[pos] = list[Math.min(list.length - 1, Math.max(0, Math.round(k * 0.5)))] ?? 0;
  }

  // ---- model: weighted points above replacement --------------------------------------------------------
  const model = new Map<string, number>();
  for (const r of rows.values()) {
    if (!need[r.position]) continue;
    const v = r.weeks.reduce((s, w) => s + Math.max(0, w.points - repl[r.position]) * (w.week >= poStart ? PLAYOFF_WEIGHT : 1), 0);
    model.set(r.id, v);
  }
  // Kickers and defenses are streamed week to week in redraft: count a fraction of their edge.
  for (const [id, v] of model) {
    const pos = rows.get(id)!.position;
    if (pos === 'K' || pos === 'DEF') model.set(id, v * 0.3);
  }
  // Rank-to-rank onto the market scale: the Nth best projection gets the market's Nth highest value.
  const ranked = [...model.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const rankOf = new Map(ranked.map(([id], i) => [id, i]));
  const scale = market?.players.length ? market.players.map((e) => e.value).sort((a, b) => b - a) : ranked.map(([, v]) => Math.round(v * 20));
  const tail = scale[scale.length - 1] ?? 0;
  const onScale = (id: string) => {
    const i = rankOf.get(id);
    if (i == null) {
      // Below replacement: a small value by projection so deep waiver options still rank.
      const r = rows.get(id)!;
      const rp = repl[r.position] || 1;
      return Math.round(tail * 0.5 * Math.min(1, weekly(r) / rp) * (r.position === 'K' || r.position === 'DEF' ? 0.3 : 1));
    }
    return i < scale.length ? scale[i] : Math.round(tail * Math.pow(0.97, i - scale.length + 1));
  };

  // Reverse id map (Sleeper -> MFL) for MFL leagues.
  const mflOf = new Map<string, string>();
  for (const m of market?.players ?? []) if (m.sleeper_id && m.mfl_id) mflOf.set(m.sleeper_id, m.mfl_id);
  for (const v of valueStore.allCrosswalk()) if (v.sleeper_id && v.mfl_id && !mflOf.has(v.sleeper_id)) mflOf.set(v.sleeper_id, v.mfl_id);

  const tierFor = (pos: string, ppg: number): ProjectionTier =>
    ppg >= starterLine[pos] ? 'Starter' : ppg >= repl[pos] ? 'Flex' : ppg >= repl[pos] * 0.75 ? 'Depth' : 'Fading';

  const out: BoardPlayer[] = [];
  for (const r of rows.values()) {
    const mk = market?.bySleeper.get(r.id);
    const modelV = model.has(r.id) ? onScale(r.id) : null;
    const marketV = mk ? mk.value : null;
    const value = Math.round(marketV != null && modelV != null ? 0.5 * modelV + 0.5 * marketV : (modelV ?? marketV ?? 0));
    if (value <= 0 && weekly(r) < 1) continue;
    const dir = playerDirectory.get(r.id);
    const ppg = weekly(r);
    const po = r.weeks.filter((w) => w.week >= poStart);
    const edge = marketV ? (value - marketV) / marketV : null;
    const trend = mk && mk.value ? mk.trend30 / Math.max(1, mk.value - mk.trend30) : null;
    out.push({
      id: r.id,
      sleeper_id: r.id,
      mfl_id: mflOf.get(r.id) ?? null,
      name: dir?.full_name || r.name,
      position: r.position,
      team: r.team ?? dir?.team ?? null,
      age: dir?.age ?? null,
      value,
      market: marketV,
      experts: null,
      model: modelV,
      edge: edge != null ? Math.round(edge * 1000) / 1000 : null,
      signal: 'HOLD' as ValueSignal,
      market_trend_30d: trend != null ? Math.round(trend * 1000) / 1000 : null,
      expert_trend_4w: null,
      ppg: Math.round(ppg * 10) / 10,
      games: null,
      projection: [{ season: state.season, ppg: Math.round(ppg * 10) / 10, tier: tierFor(r.position, ppg) }],
      falloff_season: null,
      rank: 0,
      position_rank: 0,
      ktc_url: null,
      expert_history: [],
      nfl_contract: null,
      ext_ids: valueStore.externalIds(r.id),
      ros: {
        points: Math.round(r.weeks.reduce((s, w) => s + w.points, 0)),
        ppg: Math.round(ppg * 10) / 10,
        playoff_ppg: po.length ? Math.round((po.reduce((s, w) => s + w.points, 0) / po.length) * 10) / 10 : 0,
        weeks: r.weeks,
      },
    });
  }

  // Ranks and signals: the projection disagrees with the market by 20%+ (only for players worth having).
  out.sort((a, b) => b.value - a.value);
  const posCount: Record<string, number> = {};
  out.forEach((p, i) => {
    p.rank = i + 1;
    posCount[p.position] = (posCount[p.position] || 0) + 1;
    p.position_rank = posCount[p.position];
    if (p.market != null && p.model != null && p.value >= 800) {
      const gap = (p.model - p.market) / p.market;
      const mom = p.market_trend_30d ?? 0;
      if (gap >= 0.2) p.signal = mom <= -0.05 ? 'BUY_LOW' : 'BUY';
      else if (gap <= -0.2) p.signal = mom >= 0.05 ? 'SELL_HIGH' : 'SELL';
    }
  });

  return {
    key,
    built_at: Date.now(),
    season: state.season,
    players: out,
    bySleeper: new Map(out.map((p) => [p.sleeper_id!, p])),
    byMfl: new Map(out.filter((p) => p.mfl_id).map((p) => [p.mfl_id!, p])),
    pickValue: () => 0, // no future picks in redraft
    pickSources: () => ({ market: null, experts: null }),
    thresholds: Object.fromEntries(POS.map((p) => [p, { starter: starterLine[p], replacement: repl[p] }])),
    sources: { market: !!market, experts: false, production_season: null },
  };
}
