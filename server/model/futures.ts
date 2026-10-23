/**
 * Futures Value: Dynasty Futures' own player value.
 *
 *   value = 0.40 × model + 0.30 × market + 0.30 × experts   (weights renormalised if one is missing)
 *
 * - market:  FantasyCalc trade market for this league format (the shared scale everything is mapped onto)
 * - experts: FantasyPros-based DynastyProcess values, mapped to the market scale by rank
 * - model:   our projection. Recent points per game under the league's scoring (blended 60/40 with
 *            what the market implies, so one hot or cold stretch doesn't swing it), carried forward five
 *            seasons with position age curves, counting only points above a replacement-level starter
 *            in this league, discounted 15% per year; then mapped to the market scale by rank.
 *
 * Also produces per-season tiers (Starter / Flex / Depth / Fading), the season a player falls off,
 * and buy / sell signals from the gap between Futures Value and the market plus recent momentum.
 */
import type { BoardPlayer, LeagueSettings, ProjectionTier, SeasonProjection, ValueSignal } from '../../src/types';
import { getSeasonContext } from '../../src/lib/season';
import { getMarket, type MarketSnapshot } from '../sources/fantasycalc';
import { getProduction, pointsFor, type SeasonLine } from '../sources/production';
import { expertChange, getExpertHistory } from '../sources/expertHistory';
import { playerDirectory } from '../players';
import { valueStore, type ValuedPlayer } from '../values';
import { curveAt } from './ageCurves';

export const WEIGHTS = { model: 0.4, market: 0.3, experts: 0.3 };
const HORIZON = 5;
const DISCOUNT = 0.85;
const GAMES = 17;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export interface Board {
  key: string;
  built_at: number;
  season: number;
  players: BoardPlayer[];
  bySleeper: Map<string, BoardPlayer>;
  byMfl: Map<string, BoardPlayer>;
  /** Pick value on the shared scale */
  pickValue: (year: number, round: number, tier?: 'Early' | 'Mid' | 'Late') => number;
  /** The same pick by source (trade market / experts), both on the shared scale. */
  pickSources: (year: number, round: number, tier?: 'Early' | 'Mid' | 'Late') => { market: number | null; experts: number | null };
  thresholds: Record<string, { starter: number; replacement: number }>;
  sources: { market: boolean; experts: boolean; production_season: number | null };
}

const cache = new Map<string, { board: Board; at: number }>();
const TTL = 60 * 60 * 1000;

export function boardKey(s: LeagueSettings) {
  const ppr = s.scoring_type === 'PPR' ? 1 : s.scoring_type === 'Half PPR' ? 0.5 : 0;
  const sl = s.slots;
  return [s.superflex ? 'sf' : '1qb', s.league_size, ppr, s.te_premium ? 'tep' : '', sl.QB, sl.RB, sl.WR, sl.TE, sl.FLEX, sl.SUPER_FLEX ?? 0].join('-');
}

/** Map a rank percentile (0 = best) onto a descending scale. */
function onScale(scale: number[], pct: number): number {
  if (!scale.length) return 0;
  const i = Math.min(scale.length - 1, Math.max(0, Math.round(pct * (scale.length - 1))));
  return scale[i];
}

/** Percentile (0 = best) of `v` within a descending list. */
function pctOf(desc: number[], v: number): number {
  if (desc.length < 2) return 0;
  let lo = 0, hi = desc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (desc[mid] > v) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(1, lo / (desc.length - 1));
}

const ktcUrl = (name: string, ktcId: string | null) =>
  ktcId
    ? `https://keeptradecut.com/dynasty-rankings/players/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${ktcId}`
    : null;

export async function getBoard(settings: LeagueSettings): Promise<Board> {
  const key = boardKey(settings);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.board;
  const board = await buildBoard(settings, key);
  cache.set(key, { board, at: Date.now() });
  return board;
}

async function buildBoard(settings: LeagueSettings, key: string): Promise<Board> {
  const sf = !!settings.superflex;
  const ppr = settings.scoring_type === 'PPR' ? 1 : settings.scoring_type === 'Half PPR' ? 0.5 : 0;
  const tep = settings.te_premium ? 0.5 : 0;
  const teams = settings.league_size || 12;
  const { seasonYear } = getSeasonContext();

  const [market, production, history] = await Promise.all([
    getMarket({ superflex: sf, teams, ppr }),
    getProduction(),
    getExpertHistory(),
    playerDirectory.refresh(),
    valueStore.refresh(),
  ]);

  // ---- 1. Universe: every player with an expert value or a market value -------------------------
  type Row = {
    key: string;
    sleeper_id: string | null;
    mfl_id: string | null;
    name: string;
    position: string;
    team: string | null;
    age: number | null;
    expertRaw: number | null;
    expertPlayer?: ValuedPlayer;
    market: MarketSnapshot['players'][number] | null;
  };
  const rows = new Map<string, Row>();
  for (const v of valueStore.allPlayers) {
    if (!POSITIONS.includes(v.position as any)) continue;
    const m = (v.sleeper_id && market?.bySleeper.get(v.sleeper_id)) || (v.mfl_id && market?.byMfl.get(v.mfl_id)) || null;
    const k = v.sleeper_id || m?.sleeper_id || (v.mfl_id ? `mfl:${v.mfl_id}` : v.id);
    rows.set(k, {
      key: k,
      sleeper_id: v.sleeper_id || m?.sleeper_id || null,
      mfl_id: v.mfl_id || m?.mfl_id || null,
      name: v.name,
      position: v.position,
      team: v.team,
      age: v.age,
      expertRaw: sf ? v.value_sf : v.value_1qb,
      expertPlayer: v,
      market: m,
    });
  }
  for (const m of market?.players ?? []) {
    if (!POSITIONS.includes(m.position as any)) continue;
    const k = m.sleeper_id || (m.mfl_id ? `mfl:${m.mfl_id}` : `fc:${m.name}`);
    if (rows.has(k) || (m.mfl_id && [...rows.values()].some((r) => r.mfl_id === m.mfl_id))) continue;
    rows.set(k, { key: k, sleeper_id: m.sleeper_id, mfl_id: m.mfl_id, name: m.name, position: m.position, team: null, age: null, expertRaw: null, market: m });
  }
  // Freshest bio data from the Sleeper directory.
  for (const r of rows.values()) {
    const info = r.sleeper_id ? playerDirectory.get(r.sleeper_id) : undefined;
    if (info) {
      r.age = info.age ?? r.age;
      r.team = info.team ?? r.team;
    }
  }
  const all = [...rows.values()];

  // ---- 2. Shared scale = the trade market (players + picks); experts mapped onto it by rank -----
  const marketScale = market ? [...market.players, ...market.picks].map((e) => e.value).sort((a, b) => b - a) : [];
  const expertAll = [...valueStore.allPlayers.map((v) => (sf ? v.value_sf : v.value_1qb))].sort((a, b) => b - a);
  const scale = marketScale.length ? marketScale : expertAll;
  const expertOnScale = (raw: number | null) => (raw == null ? null : onScale(scale, pctOf(expertAll, raw)));
  const tepAdj = (pos: string, v: number | null) => (v != null && pos === 'TE' && settings.te_premium ? Math.round(v * 1.15) : v);

  // ---- 3. Production: recent points per game under this league's scoring -------------------------
  const maxGp = Math.max(0, ...[...production.current.values()].map((l) => l.gp));
  const currentMature = maxGp >= 4;
  const ppgOf = (line: SeasonLine | undefined, pos: string) =>
    line && line.gp > 0 ? pointsFor(line, ppr, pos === 'TE' ? tep : 0) / line.gp : null;
  const recent = new Map<string, { ppg: number; games: number }>();
  for (const r of all) {
    if (!r.sleeper_id) continue;
    const cur = production.current.get(r.sleeper_id);
    const prev = production.previous.get(r.sleeper_id);
    const c = currentMature && cur && cur.gp >= 4 ? ppgOf(cur, r.position) : null;
    const p = prev && prev.gp >= 6 ? ppgOf(prev, r.position) : null;
    if (c != null && p != null) recent.set(r.key, { ppg: 0.65 * c + 0.35 * p, games: cur!.gp + prev!.gp });
    else if (c != null) recent.set(r.key, { ppg: c, games: cur!.gp });
    else if (p != null) recent.set(r.key, { ppg: p, games: prev!.gp });
  }

  // League-specific starter and replacement lines per position (points per game).
  const sl = settings.slots;
  const flexShare: Record<string, number> = { QB: 0, RB: 0.45, WR: 0.45, TE: 0.1 };
  const sfShare: Record<string, number> = { QB: 0.85, RB: 0.05, WR: 0.07, TE: 0.03 };
  const thresholds: Board['thresholds'] = {};
  const producersByPos: Record<string, number[]> = {};
  for (const pos of POSITIONS) {
    const list = all.filter((r) => r.position === pos && recent.has(r.key)).map((r) => recent.get(r.key)!.ppg).sort((a, b) => b - a);
    producersByPos[pos] = list;
    const slots = (sl[pos as 'QB'] || 0) + flexShare[pos] * (sl.FLEX || 0) + sfShare[pos] * (sl.SUPER_FLEX || 0);
    const starters = Math.max(1, Math.round(teams * slots));
    const at = (n: number) => list[Math.min(list.length - 1, Math.max(0, n - 1))] ?? 0;
    thresholds[pos] = { starter: at(starters), replacement: at(Math.round(starters * 1.5)) };
  }

  // What the market implies a player produces: same rank within position among producers.
  const impliedPpg = new Map<string, number>();
  for (const pos of POSITIONS) {
    const ranked = all
      .filter((r) => r.position === pos)
      .map((r) => ({ r, v: r.market?.value ?? expertOnScale(r.expertRaw) ?? 0 }))
      .sort((a, b) => b.v - a.v);
    const prod = producersByPos[pos];
    ranked.forEach(({ r }, i) => impliedPpg.set(r.key, prod.length ? prod[Math.min(prod.length - 1, Math.round((i / Math.max(1, ranked.length - 1)) * (prod.length - 1)))] : 0));
  }

  // ---- 4. Model: five-season projection --------------------------------------------------------------
  const tierFor = (pos: string, ppg: number): ProjectionTier => {
    const t = thresholds[pos];
    if (!t) return 'Depth';
    if (ppg >= t.starter) return 'Starter';
    if (ppg >= t.replacement) return 'Flex';
    if (ppg >= t.replacement * 0.75) return 'Depth';
    return 'Fading';
  };
  const projections = new Map<string, { proj: SeasonProjection[]; points: number; falloff: number | null }>();
  for (const r of all) {
    if (r.age == null || !thresholds[r.position]) continue;
    const implied = impliedPpg.get(r.key) ?? 0;
    const actual = recent.get(r.key)?.ppg;
    const base = actual != null ? 0.6 * actual + 0.4 * implied : implied;
    // Players already past the end of their curve keep a small floor so the ratio stays defined.
    const now = Math.max(0.05, curveAt(r.position, r.age));
    const proj: SeasonProjection[] = [];
    let points = 0;
    for (let t = 0; t < HORIZON; t++) {
      const ppg = (base * curveAt(r.position, r.age + t)) / now;
      proj.push({ season: seasonYear + t, ppg: Math.round(ppg * 10) / 10, tier: tierFor(r.position, ppg) });
      points += Math.max(0, ppg - thresholds[r.position].replacement) * GAMES * Math.pow(DISCOUNT, t);
    }
    const useful = (t: ProjectionTier) => t === 'Starter' || t === 'Flex';
    // A fall-off is an age-driven drop: stops being a starter/flex while past peak and at least 15%
    // below his best projected season. Borderline players hovering at the cutoff don't count.
    let falloff: number | null = null;
    const best = Math.max(...proj.map((x) => x.ppg));
    for (let t = 1; t < proj.length; t++) {
      const declining = curveAt(r.position, r.age + t) < curveAt(r.position, r.age + t - 1);
      if (useful(proj[t - 1].tier) && !useful(proj[t].tier) && declining && proj[t].ppg <= best * 0.85) {
        falloff = proj[t].season;
        break;
      }
    }
    projections.set(r.key, { proj, points, falloff });
  }
  const modelDesc = [...projections.values()].map((p) => p.points).sort((a, b) => b - a);
  const playerScale = market ? market.players.map((e) => e.value).sort((a, b) => b - a) : expertAll;

  // ---- 5. Blend, rank, signal ------------------------------------------------------------------------
  const out: BoardPlayer[] = all.map((r) => {
    const marketV = tepAdj(r.position, r.market?.value ?? null);
    const expertV = tepAdj(r.position, expertOnScale(r.expertRaw));
    const proj = projections.get(r.key);
    const modelV = proj ? tepAdj(r.position, onScale(playerScale, pctOf(modelDesc, proj.points))) : null;
    const parts: [number, number][] = [];
    if (modelV != null) parts.push([WEIGHTS.model, modelV]);
    if (marketV != null) parts.push([WEIGHTS.market, marketV]);
    if (expertV != null) parts.push([WEIGHTS.experts, expertV]);
    const wsum = parts.reduce((s, [w]) => s + w, 0) || 1;
    const value = Math.round(parts.reduce((s, [w, v]) => s + w * v, 0) / wsum);

    const rawEdge = marketV ? (value - marketV) / marketV : null;
    const mTrend = r.market && r.market.value ? r.market.trend30 / Math.max(1, r.market.value - r.market.trend30) : null;
    const fp = r.expertPlayer?.id.replace(/^fp_/, '');
    const hist = fp ? history?.byFp.get(fp) : undefined;
    const eTrend = expertChange(hist, sf, 4);

    const rec = recent.get(r.key);
    return {
      id: r.sleeper_id || r.key,
      sleeper_id: r.sleeper_id,
      mfl_id: r.mfl_id,
      name: r.name,
      position: r.position,
      team: r.team,
      age: r.age,
      value,
      market: marketV,
      experts: expertV,
      model: modelV,
      edge: rawEdge,
      signal: 'HOLD' as ValueSignal,
      market_trend_30d: mTrend != null ? Math.round(mTrend * 1000) / 1000 : null,
      expert_trend_4w: eTrend != null ? Math.round(eTrend * 1000) / 1000 : null,
      ppg: rec ? Math.round(rec.ppg * 10) / 10 : null,
      games: rec?.games ?? null,
      projection: proj?.proj ?? [],
      falloff_season: proj?.falloff ?? null,
      rank: 0,
      position_rank: 0,
      ktc_url: ktcUrl(r.name, r.expertPlayer?.ktc_id ?? null),
      expert_history: (hist || []).slice(-12).map((h) => ({ date: h.date, value: sf ? h.value_sf : h.value_1qb })),
    };
  });

  // Edge vs market, de-biased against players of similar market value (mapping several sources onto one
  // scale leaves a small systematic tilt by tier), then signals from edge + momentum.
  const byMarket = out.filter((p) => p.market != null && p.edge != null).sort((a, b) => b.market! - a.market!);
  const median = (xs: number[]) => {
    const s2 = [...xs].sort((a, b) => a - b);
    return s2.length ? s2[Math.floor(s2.length / 2)] : 0;
  };
  byMarket.forEach((p, i) => {
    const window = byMarket.slice(Math.max(0, i - 25), i + 26).map((q) => q.edge!);
    p.edge = Math.round((p.edge! - median(window)) * 1000) / 1000;
  });
  for (const p of out) {
    if (p.market == null) p.edge = null;
    if (p.edge == null || p.value < 1000) continue;
    const momentum = p.market_trend_30d ?? p.expert_trend_4w ?? 0;
    // A 35%+ monthly crash usually means injury or a lost role, which production data can't see yet:
    // no buy-low call on those (they still show up as market fallers).
    if (p.edge >= 0.12 && momentum <= -0.05 && momentum > -0.35) p.signal = 'BUY_LOW';
    else if (p.edge <= -0.12 && momentum >= 0.05) p.signal = 'SELL_HIGH';
    else if (p.edge >= 0.2 && momentum > -0.35) p.signal = 'BUY';
    else if (p.edge <= -0.2) p.signal = 'SELL';
  }

  out.sort((a, b) => b.value - a.value);
  const posCount: Record<string, number> = {};
  out.forEach((p, i) => {
    p.rank = i + 1;
    posCount[p.position] = (posCount[p.position] || 0) + 1;
    p.position_rank = posCount[p.position];
  });

  // ---- 6. Picks on the shared scale: average of market pick values and expert pick values ---------
  const ord = (n: number) => ({ 1: '1st', 2: '2nd', 3: '3rd' } as Record<number, string>)[n] ?? `${n}th`;
  const marketPick = (year: number, round: number, tier?: string) => {
    if (!market) return null;
    const exact = market.picks.find((p) => p.name === `${year} ${ord(round)}${tier ? ` (${tier})` : ''}`) || market.picks.find((p) => p.name === `${year} ${ord(round)}`);
    return exact ? exact.value : null;
  };
  const pickSources: Board['pickSources'] = (year, round, tier) => {
    const e = expertOnScale(valueStore.pickValue(year, round, sf, tier ?? 'Mid'));
    let m = marketPick(year, round, tier);
    if (m == null && market?.picks.length) {
      // Beyond the market's listed years: take its furthest year for that round, 10% off per year.
      const sameRound = market.picks
        .map((p) => ({ p, mm: p.name.match(/^(\d{4}) (\w+)$/) }))
        .filter((x) => x.mm && x.mm[2] === ord(round));
      if (sameRound.length) {
        const latest = sameRound.reduce((a, b) => (Number(a.mm![1]) > Number(b.mm![1]) ? a : b));
        m = Math.round(latest.p.value * Math.pow(0.9, Math.max(0, year - Number(latest.mm![1]))));
      }
    }
    return { market: m != null && m > 0 ? m : null, experts: e != null && e > 0 ? Math.round(e) : null };
  };
  const pickValue: Board['pickValue'] = (year, round, tier) => {
    const { market: m, experts: e } = pickSources(year, round, tier);
    const vals = [m, e].filter((v): v is number => v != null && v > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };

  return {
    key,
    built_at: Date.now(),
    season: seasonYear,
    players: out,
    bySleeper: new Map(out.filter((p) => p.sleeper_id).map((p) => [p.sleeper_id!, p])),
    byMfl: new Map(out.filter((p) => p.mfl_id).map((p) => [p.mfl_id!, p])),
    pickValue,
    pickSources,
    thresholds,
    sources: { market: !!market, experts: valueStore.allPlayers.length > 0, production_season: currentMature ? seasonYear : seasonYear - 1 },
  };
}
