/**
 * Lineup report card: for every completed week, each team's actual score, what our start/sit tool would have scored
 * from the same roster (best lineup by that week's projections, points as actually scored), and the best possible
 * lineup in hindsight. Projections are Sleeper's (Rotowire) as they stand after the games, i.e. the final pre-game
 * numbers; weather adjustments aren't replayed (past forecasts aren't kept).
 *
 * MFL: weeklyResults (scores for every eligible player, starters). Sleeper: matchups per week.
 */
import { fetchJson } from '../http';
import { weeklyProjections, nflState, sleeperTeam } from '../sources/weekly';
import { valueStore } from '../values';
import { playerDirectory } from '../players';
import { mflName } from '../leagues/mfl';
import { LeagueSyncError } from '../leagues/types';
import type { LeagueSettings, RosterEvaluationResult } from '../../src/types';

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const cache = new Map<string, { at: number; p: Promise<unknown> }>();
function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>;
  const p = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), p });
  return p;
}

interface Pl {
  id: string;
  name: string;
  pos: string; // QB RB WR TE K DEF
  proj: number;
  pts: number;
}
interface TeamWeek {
  team: string;
  actual: number;
  starters: Set<string>;
  players: Pl[];
}

/** Slots filled most-restrictive first, which is optimal for nested flex sets. */
function slotList(s: LeagueSettings['slots']): { slot: string; ok: (p: string) => boolean }[] {
  const out: { slot: string; ok: (p: string) => boolean }[] = [];
  const add = (slot: string, n: number | undefined, ok: (p: string) => boolean) => {
    for (let i = 0; i < (n || 0); i++) out.push({ slot, ok });
  };
  add('QB', s.QB, (p) => p === 'QB');
  add('RB', s.RB, (p) => p === 'RB');
  add('WR', s.WR, (p) => p === 'WR');
  add('TE', s.TE, (p) => p === 'TE');
  add('K', s.K, (p) => p === 'K');
  add('DEF', s.DEF, (p) => p === 'DEF');
  add('FLEX', s.FLEX, (p) => p === 'RB' || p === 'WR' || p === 'TE');
  add('SF', s.SUPER_FLEX, (p) => p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE');
  return out;
}
/** Sleeper roster_positions -> offensive slots (IDP slots are left out: no IDP projections). */
const SLEEPER_SLOT: Record<string, string[]> = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['WR', 'RB'], REC_FLEX: ['WR', 'TE'], WRTE_FLEX: ['WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};
function sleeperSlots(positions: string[]): { slot: string; ok: (p: string) => boolean }[] {
  return positions
    .filter((p) => SLEEPER_SLOT[p])
    .map((p) => ({ slot: p, ok: (x: string) => SLEEPER_SLOT[p].includes(x), n: SLEEPER_SLOT[p].length }))
    .sort((a, b) => a.n - b.n)
    .map(({ slot, ok }) => ({ slot, ok }));
}

function bestLineup(players: Pl[], slots: ReturnType<typeof slotList>, key: (p: Pl) => number): Pl[] {
  const used = new Set<string>();
  const picks: Pl[] = [];
  for (const s of slots) {
    let best: Pl | null = null;
    for (const p of players) if (!used.has(p.id) && s.ok(p.pos) && (!best || key(p) > key(best))) best = p;
    if (best) {
      used.add(best.id);
      picks.push(best);
    }
  }
  return picks;
}

export interface ReportWeek {
  week: number;
  actual: number;
  ours: number;
  optimal: number;
  /** Where our lineup differed from yours: who we'd have started, and who you started in that spot */
  swaps: { ours: { name: string; pos: string; pts: number; proj: number }; yours: { name: string; pos: string; pts: number; proj: number } | null }[];
}
export interface LineupReport {
  season: number;
  weeks: number[];
  me: string;
  /** Your weeks, newest first */
  mine: ReportWeek[];
  teams: { team: string; name: string; actual: number; ours: number; optimal: number; weeks: number; ours_better: number; you_better: number }[];
  league: { actual_pct: number; ours_pct: number; ours_better: number; you_better: number; ties: number; team_weeks: number };
  notes: string[];
}

const projPoints = (scoringType: string | undefined, tePrem: boolean | undefined) => {
  const rec = /^ppr$/i.test(scoringType || '') ? 1 : /half/i.test(scoringType || '') ? 0.5 : 0;
  return (pos: string, pr: { pts_std: number; rec: number } | undefined) => (pr ? pr.pts_std + (pos === 'K' || pos === 'DEF' ? 0 : rec * pr.rec) + (tePrem && pos === 'TE' ? 0.5 * pr.rec : 0) : 0);
};

async function mflWeeks(leagueId: string, season: number): Promise<Map<number, TeamWeek[]>> {
  const [wr, players] = await Promise.all([
    cached(`lr-mfl-wr-${season}-${leagueId}`, 30 * 60_000, () => fetchJson<any>(`https://api.myfantasyleague.com/${season}/export?TYPE=weeklyResults&L=${leagueId}&W=YTD&JSON=1`)),
    cached(`lr-mfl-players-${season}`, 24 * 3600_000, () => fetchJson<any>(`https://api.myfantasyleague.com/${season}/export?TYPE=players&JSON=1`)),
  ]);
  const info = new Map<string, any>(asArray<any>(players?.players?.player).map((p) => [String(p.id), p]));
  const out = new Map<number, TeamWeek[]>();
  for (const w of asArray<any>(wr?.allWeeklyResults?.weeklyResults)) {
    const week = Number(w.week);
    const teams: TeamWeek[] = [];
    for (const m of asArray<any>(w.matchup))
      for (const f of asArray<any>(m.franchise)) {
        if (f.score == null) continue;
        teams.push({
          team: String(f.id),
          actual: Number(f.score) || 0,
          starters: new Set(String(f.starters || '').split(',').filter(Boolean)),
          players: asArray<any>(f.player).map((p) => {
            const i = info.get(String(p.id)) || {};
            const pos = ({ PK: 'K', Def: 'DEF' } as Record<string, string>)[i.position] ?? String(i.position || '');
            return { id: String(p.id), name: i.name ? mflName(i.name) : String(p.id), pos, proj: 0, pts: Number(p.score) || 0, _team: i.team } as Pl & { _team?: string };
          }),
        });
      }
    if (teams.length) out.set(week, teams);
  }
  return out;
}

async function sleeperWeeks(leagueId: string, lastWeek: number): Promise<{ weeks: Map<number, TeamWeek[]>; positions: string[] }> {
  const out = new Map<number, TeamWeek[]>();
  const league = await cached(`lr-sl-league-${leagueId}`, 3600_000, () => fetchJson<any>(`https://api.sleeper.app/v1/league/${leagueId}`));
  const positions: string[] = (league?.roster_positions || []).map(String);
  const starterSlots = positions.filter((p) => !['BN', 'TAXI', 'IR'].includes(p));
  const weeks = await Promise.all(
    Array.from({ length: lastWeek }, (_, i) =>
      cached(`lr-sl-${leagueId}-${i + 1}`, 30 * 60_000, () => fetchJson<any[]>(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${i + 1}`)).catch(() => [])
    )
  );
  weeks.forEach((rows, i) => {
    const teams: TeamWeek[] = [];
    for (const r of rows || []) {
      if (!(Number(r.points) > 0)) continue;
      const pts = r.players_points || {};
      // Score from offensive slots only, so IDP leagues compare like with like.
      const starters: string[] = (r.starters || []).map(String);
      const offense = starters.filter((id, k) => SLEEPER_SLOT[starterSlots[k]] && id !== '0');
      teams.push({
        team: String(r.roster_id),
        actual: offense.reduce((s, id) => s + (Number(pts[id]) || 0), 0),
        starters: new Set(offense),
        players: (r.players || []).map((id: string) => {
          const d = playerDirectory.get(String(id)) as any;
          const pos = /^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : String(d?.position || '');
          return { id: String(id), name: d?.full_name || String(id), pos, proj: 0, pts: Number(pts[id]) || 0 };
        }),
      });
    }
    if (teams.length) out.set(i + 1, teams);
  });
  return { weeks: out, positions };
}

export async function buildLineupReport(ev: RosterEvaluationResult, platform: string, leagueId: string): Promise<LineupReport> {
  const settings = ev.settings as LeagueSettings;
  const state = await nflState();
  const season = state.season;
  // Completed weeks only: before the current week (Sleeper's display week moves on Tuesday).
  const lastWeek = Math.max(0, (state.season_type === 'regular' ? state.week : 18) - 1);
  let weeks: Map<number, TeamWeek[]>;
  let slots = slotList(settings.slots);
  if (platform === 'mfl') weeks = await mflWeeks(leagueId, season);
  else if (platform === 'sleeper') {
    const s = await sleeperWeeks(leagueId, lastWeek);
    weeks = s.weeks;
    if (s.positions.length) slots = sleeperSlots(s.positions);
  } else throw new LeagueSyncError('The lineup report card is available for MFL and Sleeper leagues for now.');
  for (const w of [...weeks.keys()]) if (w > lastWeek) weeks.delete(w);
  const score = projPoints(settings.scoring_type, settings.te_premium);
  const names = new Map<string, string>([
    ...(ev.league_franchises || []).map((f) => [f.franchise_id, f.franchise_name] as [string, string]),
    ...(ev.league_teams || []).map((t) => [t.franchise_id, t.franchise_name] as [string, string]),
  ]);
  if (!names.has(ev.roster.franchise_id)) names.set(ev.roster.franchise_id, ev.roster.franchise_name || 'You');
  const me = ev.roster.franchise_id;
  const totals = new Map<string, LineupReport['teams'][number]>();
  const mine: ReportWeek[] = [];
  let ties = 0;

  for (const [week, teams] of [...weeks.entries()].sort((a, b) => a[0] - b[0])) {
    const proj = await weeklyProjections(season, week).catch(() => null);
    if (!proj) continue;
    for (const t of teams) {
      for (const p of t.players as (Pl & { _team?: string })[]) {
        const sid =
          p.pos === 'DEF'
            ? platform === 'mfl'
              ? sleeperTeam(p._team)
              : p.id
            : platform === 'mfl'
              ? valueStore.crosswalkForMfl(p.id)?.sleeper_id || null
              : p.id;
        p.proj = Math.round(score(p.pos, sid ? proj.get(sid) : undefined) * 10) / 10;
      }
      const ours = bestLineup(t.players, slots, (p) => p.proj + p.pts * 1e-6); // tie-break on nothing meaningful
      const opt = bestLineup(t.players, slots, (p) => p.pts);
      const oursPts = Math.round(ours.reduce((s, p) => s + p.pts, 0) * 100) / 100;
      const optPts = Math.round(opt.reduce((s, p) => s + p.pts, 0) * 100) / 100;
      if (t.actual > optPts * 1.02 + 0.5) throw new LeagueSyncError('This league’s lineup includes positions the report card can’t model yet (such as IDP).');
      const row = totals.get(t.team) ?? { team: t.team, name: names.get(t.team) ?? `Team ${t.team}`, actual: 0, ours: 0, optimal: 0, weeks: 0, ours_better: 0, you_better: 0 };
      row.actual += t.actual;
      row.ours += oursPts;
      row.optimal += optPts;
      row.weeks++;
      if (oursPts > t.actual + 0.01) row.ours_better++;
      else if (oursPts < t.actual - 0.01) row.you_better++;
      else ties++;
      totals.set(t.team, row);

      if (t.team === me) {
        const ourIds = new Set(ours.map((p) => p.id));
        const theirStarters = t.players.filter((p) => t.starters.has(p.id));
        const extraOurs = ours.filter((p) => !t.starters.has(p.id)).sort((a, b) => b.proj - a.proj);
        const extraYours = theirStarters.filter((p) => !ourIds.has(p.id)).sort((a, b) => b.proj - a.proj);
        const fmt = (p: Pl) => ({ name: p.name, pos: p.pos, pts: Math.round(p.pts * 10) / 10, proj: p.proj });
        // Pair each of our extra starters with one of yours at a compatible position.
        const left = [...extraYours];
        const swaps = extraOurs.map((p) => {
          const flexy = (x: string) => ['RB', 'WR', 'TE'].includes(x);
          const i = left.findIndex((y) => y.pos === p.pos);
          const j = i >= 0 ? i : left.findIndex((y) => flexy(y.pos) && flexy(p.pos));
          const y = j >= 0 ? left.splice(j, 1)[0] : null;
          return { ours: fmt(p), yours: y ? fmt(y) : null };
        });
        mine.push({ week, actual: Math.round(t.actual * 100) / 100, ours: oursPts, optimal: optPts, swaps });
      }
    }
  }

  const teams = [...totals.values()]
    .map((r) => ({ ...r, actual: Math.round(r.actual * 10) / 10, ours: Math.round(r.ours * 10) / 10, optimal: Math.round(r.optimal * 10) / 10 }))
    .sort((a, b) => b.actual / Math.max(1, b.optimal) - a.actual / Math.max(1, a.optimal));
  const sum = (k: 'actual' | 'ours' | 'optimal') => teams.reduce((s, t) => s + t[k], 0);
  const opt = Math.max(1, sum('optimal'));
  return {
    season,
    weeks: [...weeks.keys()].sort((a, b) => a - b),
    me,
    mine: mine.reverse(),
    teams,
    league: {
      actual_pct: Math.round((sum('actual') / opt) * 1000) / 10,
      ours_pct: Math.round((sum('ours') / opt) * 1000) / 10,
      ours_better: teams.reduce((s, t) => s + t.ours_better, 0),
      you_better: teams.reduce((s, t) => s + t.you_better, 0),
      ties,
      team_weeks: teams.reduce((s, t) => s + t.weeks, 0),
    },
    notes: [
      'Our lineup uses Sleeper (Rotowire) projections as they stood at kickoff, scored for your league. Weather adjustments aren’t replayed.',
      'Best possible = the highest-scoring legal lineup in hindsight.',
    ],
  };
}
