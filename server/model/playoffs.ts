/**
 * Playoff run: who has the best fantasy-playoff schedule, and who to buy cheap for later.
 *
 * Matchups: for each NFL defense, the fantasy points it has allowed per game to each position this season (completed
 * weeks, scored for the league: std/half/PPR; K and DEF use Sleeper's standard scoring). A team's playoff grade at a
 * position is the average of its playoff-week opponents' allowed points ÷ the league average, shrunk 40% toward
 * neutral because a half-season is a small sample. DEF uses points defenses have scored against each offense.
 * A player's playoff estimate = his points per game this season × that grade.
 */
import { fetchJson } from '../http';
import { nflState, sleeperTeam } from '../sources/weekly';
import { valueStore } from '../values';
import { playerDirectory } from '../players';
import type { RosterEvaluationResult, MasterPlayer } from '../../src/types';

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type Pos = (typeof POS)[number];
const SHRINK = 0.6; // keep 60% of the measured matchup effect

interface StatRow {
  week: number;
  team: string;
  opp: string;
  pid: string;
  pos: Pos;
  name: string;
  pts: { std: number; half: number; ppr: number };
  injury: string | null;
}

const cache = new Map<string, { at: number; data: any }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function weekStats(season: number, week: number): Promise<StatRow[]> {
  return cached(`stats-${season}-${week}`, 6 * 3600_000, async () => {
    const qs = POS.map((p) => `position%5B%5D=${p}`).join('&');
    const rows = await fetchJson<any[]>(`https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=regular&${qs}`, { timeoutMs: 20000 });
    const out: StatRow[] = [];
    for (const r of rows || []) {
      const s = r?.stats || {};
      const pos = r?.player?.position as Pos;
      if (!s.gp || !r.team || !r.opponent || !POS.includes(pos)) continue;
      out.push({
        week,
        team: sleeperTeam(r.team)!,
        opp: sleeperTeam(r.opponent)!,
        pid: String(r.player_id),
        pos,
        name: r.player ? `${r.player.first_name ?? ''} ${r.player.last_name ?? ''}`.trim() : String(r.player_id),
        pts: { std: Number(s.pts_std) || 0, half: Number(s.pts_half_ppr) || 0, ppr: Number(s.pts_ppr) || 0 },
        injury: r.player?.injury_status ?? null,
      });
    }
    return out;
  });
}

async function schedule(season: number): Promise<Map<string, Map<number, string>>> {
  return cached(`sched-${season}`, 12 * 3600_000, async () => {
    const games = await fetchJson<any[]>(`https://api.sleeper.app/schedule/nfl/regular/${season}`);
    const opp = new Map<string, Map<number, string>>();
    for (const g of games || []) {
      const h = sleeperTeam(g.home)!;
      const a = sleeperTeam(g.away)!;
      (opp.get(h) ?? opp.set(h, new Map()).get(h)!).set(Number(g.week), a);
      (opp.get(a) ?? opp.set(a, new Map()).get(a)!).set(Number(g.week), h);
    }
    return opp;
  });
}

export interface PlayoffPlayer {
  key: string;
  name: string;
  position: string;
  nfl_team: string | null;
  age: number | null;
  owner_id: string | null; // null = free agent
  owner_name: string | null;
  owner_record: string | null;
  owner_out: boolean; // owner has a losing record (likely seller)
  value: number;
  games: number;
  ppg: number;
  playoff_ppg: number;
  grade: number; // matchup multiplier (1 = neutral)
  opponents: string[]; // one per playoff week ("BYE" if none)
  injury: string | null;
  designation: string | null;
}

export interface PlayoffRun {
  season: number;
  weeks: number[];
  through_week: number;
  scoring: 'std' | 'half' | 'ppr';
  mine: PlayoffPlayer[];
  targets: PlayoffPlayer[]; // other teams' players and free-agent K/DEF, best playoff estimate first
  build_later: (PlayoffPlayer & { why: string })[];
  schedules: Record<string, { team: string; grade: number; opponents: string[] }[]>; // by position, easiest first
}

const recordText = (r?: { wins: number; losses: number; ties: number }) => (r ? `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}` : null);

export async function buildPlayoffRun(ev: RosterEvaluationResult): Promise<PlayoffRun> {
  const state = await nflState();
  const season = state.season;
  const settings = ev.settings!;
  const start = settings.playoffs?.start_week ?? 15;
  const weeks = Array.from({ length: Math.max(1, settings.playoffs?.weeks ?? 3) }, (_, i) => start + i).filter((w) => w <= 18);
  const through = Math.max(1, Math.min(state.week - 1, start - 1)); // completed weeks only
  const scoring: PlayoffRun['scoring'] = settings.scoring_type === 'PPR' ? 'ppr' : settings.scoring_type === 'Standard' ? 'std' : 'half';
  const ptsOf = (r: StatRow) => (r.pos === 'K' || r.pos === 'DEF' ? r.pts.std : r.pts[scoring]);

  const [opp, ...weekRows] = await Promise.all([schedule(season), ...Array.from({ length: through }, (_, i) => weekStats(season, i + 1))]);
  const rows = weekRows.flat();

  // Points allowed per defense per position per game (DEF: points defenses scored against each offense).
  const allowed = new Map<string, Map<number, number>>(); // `${team}|${pos}` -> week -> pts
  for (const r of rows) {
    const k = r.pos === 'DEF' ? `${r.opp}|DEF` : `${r.opp}|${r.pos}`;
    const m = allowed.get(k) ?? allowed.set(k, new Map()).get(k)!;
    m.set(r.week, (m.get(r.week) ?? 0) + ptsOf(r));
  }
  const avgAllowed = new Map<string, number>();
  for (const [k, m] of allowed) avgAllowed.set(k, [...m.values()].reduce((a, b) => a + b, 0) / m.size);
  const leagueAvg = new Map<Pos, number>();
  for (const pos of POS) {
    const xs = [...avgAllowed.entries()].filter(([k]) => k.endsWith(`|${pos}`)).map(([, v]) => v);
    leagueAvg.set(pos, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  }
  const gradeOf = (team: string | null, pos: Pos): { grade: number; opponents: string[] } => {
    const sched = team ? opp.get(team) : undefined;
    const opponents = weeks.map((w) => sched?.get(w) ?? 'BYE');
    const mults = opponents.filter((o) => o !== 'BYE').map((o) => (avgAllowed.get(`${o}|${pos}`) ?? leagueAvg.get(pos)!) / leagueAvg.get(pos)!);
    const raw = mults.length ? mults.reduce((a, b) => a + b, 0) / mults.length : 1;
    // A bye week in the playoffs counts as zero for that week.
    const playable = mults.length / weeks.length;
    return { grade: Math.round((1 + SHRINK * (raw - 1)) * playable * 1000) / 1000, opponents };
  };

  // Season points per game by Sleeper id (and per defense team).
  const games = new Map<string, number[]>();
  const meta = new Map<string, StatRow>();
  for (const r of rows) {
    const k = r.pos === 'DEF' ? `DEF:${r.team}` : r.pid;
    (games.get(k) ?? games.set(k, []).get(k)!).push(ptsOf(r));
    meta.set(k, r);
  }

  const teamName = new Map((ev.league_teams || []).map((t) => [t.franchise_id, t]));
  const me = ev.roster.franchise_id;
  const seen = new Set<string>();
  const toPlayer = (p: MasterPlayer, ownerId: string | null): PlayoffPlayer => {
    const pos = p.position as Pos;
    const nfl = sleeperTeam(p.nfl_team);
    // Evaluation ids are Sleeper ids except on MFL (crosswalk, then name match).
    const sid =
      pos === 'DEF'
        ? `DEF:${nfl}`
        : ev.roster.platform === 'mfl'
          ? valueStore.crosswalkForMfl(p.id)?.sleeper_id ?? playerDirectory.findByName(p.full_name, pos, nfl) ?? null
          : /^\d+$/.test(p.id)
            ? p.id
            : null;
    const g: number[] = (sid && games.get(sid)) || [];
    const ppg = g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
    const { grade, opponents } = gradeOf(nfl, POS.includes(pos) ? pos : 'WR');
    const owner = ownerId ? teamName.get(ownerId) : undefined;
    const rec = owner?.record;
    if (sid) seen.add(sid);
    return {
      key: `${ownerId ?? 'fa'}:${p.id}`,
      name: p.full_name,
      position: pos,
      nfl_team: nfl,
      age: p.age ?? null,
      owner_id: ownerId,
      owner_name: owner?.franchise_name ?? null,
      owner_record: recordText(rec),
      owner_out: !!rec && rec.wins < rec.losses,
      value: p.market_value,
      games: g.length,
      ppg: Math.round(ppg * 10) / 10,
      playoff_ppg: Math.round(ppg * grade * 10) / 10,
      grade,
      opponents,
      injury: (sid && meta.get(sid)?.injury) || null,
      designation: p.roster_designation && p.roster_designation !== 'ACTIVE' ? p.roster_designation : null,
    };
  };

  const all: PlayoffPlayer[] = [];
  for (const t of ev.league_teams || []) {
    for (const p of [...(t.starters || []), ...(t.bench || []), ...(t.reserves || [])]) all.push(toPlayer(p, t.franchise_id));
  }
  // My team comes from the evaluation's own roster (full detail).
  const mine = ev.players.map((p) => toPlayer(p, me));

  // Free-agent kickers and defenses (streamable for the playoffs).
  const rostered = new Set(all.filter((p) => p.position === 'K' || p.position === 'DEF').map((p) => `${p.position}:${p.nfl_team}`));
  for (const [k, g] of games) {
    const r = meta.get(k)!;
    if ((r.pos !== 'K' && r.pos !== 'DEF') || rostered.has(`${r.pos}:${r.team}`) || g.length < 3) continue;
    const ppg = g.reduce((a, b) => a + b, 0) / g.length;
    const { grade, opponents } = gradeOf(r.team, r.pos);
    all.push({
      key: `fa:${k}`,
      name: r.pos === 'DEF' ? `${r.team} Defense` : r.name,
      position: r.pos,
      nfl_team: r.team,
      age: null,
      owner_id: null,
      owner_name: null,
      owner_record: null,
      owner_out: false,
      value: 0,
      games: g.length,
      ppg: Math.round(ppg * 10) / 10,
      playoff_ppg: Math.round(ppg * grade * 10) / 10,
      grade,
      opponents,
      injury: null,
      designation: null,
    });
  }

  const others = all.filter((p) => p.owner_id !== me);
  const healthy = (p: PlayoffPlayer) => !['IR', 'Out', 'PUP', 'Sus'].includes(p.injury ?? '') && p.designation !== 'IR';
  const targets = others.filter((p) => healthy(p) && p.games >= 3).sort((a, b) => b.playoff_ppg - a.playoff_ppg);

  // Build for later: valuable players who are hurt or producing well below their value, on any other team.
  const ranked = new Map<string, { byValue: Map<string, number>; byPpg: Map<string, number> }>();
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const xs = all.filter((p) => p.position === pos && p.value >= 1000);
    ranked.set(pos, {
      byValue: new Map([...xs].sort((a, b) => b.value - a.value).map((p, i) => [p.key, i])),
      byPpg: new Map([...xs].sort((a, b) => b.ppg - a.ppg).map((p, i) => [p.key, i])),
    });
  }
  const build_later: PlayoffRun['build_later'] = [];
  for (const p of others) {
    if (!['QB', 'RB', 'WR', 'TE'].includes(p.position) || p.value < 2000) continue;
    const r = ranked.get(p.position)!;
    const gap = (r.byPpg.get(p.key) ?? 0) - (r.byValue.get(p.key) ?? 0);
    const hurt = !healthy(p) || p.injury === 'Doubtful';
    if (hurt) build_later.push({ ...p, why: `${p.designation === 'IR' || p.injury === 'IR' ? 'On IR' : p.injury}, so a contender or frustrated owner may sell low.` });
    else if (gap >= 8 && p.games >= 4)
      build_later.push({ ...p, why: `${p.ppg} points a game: producing well below his long-term value (about ${gap} spots lower at ${p.position}).` });
  }
  build_later.sort((a, b) => Number(b.owner_out) - Number(a.owner_out) || b.value - a.value);

  const schedules: PlayoffRun['schedules'] = {};
  for (const pos of POS) {
    schedules[pos] = [...opp.keys()]
      .map((team) => ({ team, ...gradeOf(team, pos) }))
      .sort((a, b) => b.grade - a.grade);
  }

  return {
    season,
    weeks,
    through_week: through,
    scoring,
    mine: mine.sort((a, b) => b.playoff_ppg - a.playoff_ppg),
    targets: targets.slice(0, 200),
    build_later: build_later.slice(0, 40),
    schedules,
  };
}
