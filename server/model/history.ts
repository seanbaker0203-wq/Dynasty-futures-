/**
 * League History: every season a league has on its platform: champions, all-time records, head-to-head, and the
 * best (and worst) single-week scores. MFL follows the league's `history` list (league ids can change by year);
 * Sleeper follows `previous_league_id`. Past seasons never change, so they're cached for a day; the current one for
 * an hour.
 */
import { fetchJson } from '../http';
import { LeagueSyncError } from '../leagues/types';

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const cache = new Map<string, { at: number; ttl: number; p: Promise<unknown> }>();
function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.p as Promise<T>;
  const p = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), ttl, p });
  return p;
}

export interface WeekScore {
  season: number;
  week: number;
  playoff: boolean;
  franchise_id: string;
  team_name: string; // that season's name
  score: number;
  opponent_id: string | null;
  opponent_name: string | null;
  opponent_score: number | null;
  won: boolean | null;
}
export interface FranchiseRecord {
  franchise_id: string;
  name: string; // current name
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  avg_score: number;
  best_score: number;
  titles: number[];
  runner_up: number[];
}
export interface LeagueHistory {
  platform: string;
  /** Your franchise id in this history (Sleeper: owner id), when known */
  me: string | null;
  seasons: number[];
  /** Seasons we couldn't read (private league years, platform errors) */
  missing: number[];
  champions: { season: number; franchise_id: string; team_name: string; runner_up_id: string | null; runner_up_name: string | null; score: string | null }[];
  franchises: FranchiseRecord[];
  /** h2h[a][b] = a's record against b, regular season and playoffs */
  h2h: Record<string, Record<string, { w: number; l: number; t: number }>>;
  top_scores: WeekScore[];
  low_scores: WeekScore[];
  blowouts: WeekScore[];
  /** Season, lineup and scoring changes worth knowing before comparing scores across years */
  notes: string[];
}

interface Season {
  season: number;
  lastRegular: number;
  names: Map<string, string>; // franchise id -> that season's name
  games: { week: number; a: string; b: string | null; as: number; bs: number | null }[];
  champion?: { id: string; runnerUp: string | null; score: string | null };
  ppr?: number | null;
  starters?: number | null;
}

// ---------- MFL ----------
// MFL throttles bursts from one IP (it answers with an error body instead of data), so requests go one at a time
// with a short gap and are retried with backoff.
let mflLast = 0;
async function mflGet<T = any>(url: string, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    const wait = Math.max(0, mflLast + 250 - Date.now());
    mflLast = Date.now() + wait;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const d = await fetchJson<any>(url, { timeoutMs: 20000 });
      if (d && typeof d === 'object' && 'error' in d && Object.keys(d).length <= 2) throw new Error(`MFL: ${JSON.stringify(d.error).slice(0, 120)}`);
      return d as T;
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}
async function mflSeason(host: string, year: number, leagueId: string): Promise<Season> {
  const key = `hist-mfl-${year}-${leagueId}`;
  const ttl = year >= new Date().getFullYear() ? 3600_000 : 24 * 3600_000;
  const p = cached(key, ttl, async () => {
    const base = `${host}/${year}/export?L=${leagueId}&JSON=1`;
    const lg = await mflGet<any>(`${base}&TYPE=league`);
    const wr = await mflGet<any>(`${base}&TYPE=weeklyResults&W=YTD`);
    const br = await mflGet<any>(`${base}&TYPE=playoffBrackets`).catch(() => null);
    const rules = await mflGet<any>(`${base}&TYPE=rules`).catch(() => null);
    const L = lg?.league;
    if (!L) throw new Error(`MFL ${year}: no league`);
    const names = new Map<string, string>(asArray(L.franchises?.franchise).map((f: any) => [String(f.id), String(f.name)]));
    const lastRegular = Number(L.lastRegularSeasonWeek) || 13;
    const games: Season['games'] = [];
    for (const w of asArray(wr?.allWeeklyResults?.weeklyResults ?? wr?.weeklyResults)) {
      const week = Number(w.week);
      for (const m of asArray(w.matchup)) {
        const fs = asArray(m.franchise);
        const s = (f: any) => Number(f?.score);
        if (fs.length === 2 && s(fs[0]) > 0 && s(fs[1]) > 0)
          games.push({ week, a: String(fs[0].id), b: String(fs[1].id), as: s(fs[0]), bs: s(fs[1]) });
      }
    }
    // Champion: the last game of the biggest playoff bracket.
    let champion: Season['champion'];
    const brackets = asArray(br?.playoffBrackets?.playoffBracket).sort((x: any, y: any) => Number(y.teamsInvolved) - Number(x.teamsInvolved));
    if (brackets[0]) {
      const b = await mflGet<any>(`${base}&TYPE=playoffBracket&BRACKET_ID=${brackets[0].id}`).catch(() => null);
      const rounds = asArray(b?.playoffBracket?.playoffRound);
      const finals = asArray(rounds[rounds.length - 1]?.playoffGame);
      const g = finals.length === 1 ? finals[0] : null;
      const hp = Number(g?.home?.points);
      const ap = Number(g?.away?.points);
      if (g && hp > 0 && ap > 0 && hp !== ap) {
        const [win, lose, ws, ls] = hp > ap ? [g.home, g.away, hp, ap] : [g.away, g.home, ap, hp];
        champion = { id: String(win.franchise_id), runnerUp: String(lose.franchise_id), score: `${ws.toFixed(2)}–${ls.toFixed(2)}` };
      }
    }
    // Points per catch for RB/WR/TE ("CC" event), for the scoring-change note.
    let ppr: number | null = 0;
    for (const pr of asArray(rules?.rules?.positionRules)) {
      if (!/WR/.test(String(pr.positions))) continue;
      for (const r of asArray(pr.rule)) if (r?.event?.$t === 'CC') ppr = Number(String(r.points?.$t).replace(/^\*/, '')) || ppr;
    }
    if (!rules) ppr = null;
    return { season: year, lastRegular, names, games, champion, ppr, starters: Number(L.starters?.count) || null };
  });
  // A finished season without a champion means a bracket request failed: don't keep that for a day.
  p.then((s) => {
    if (!s.champion && year < new Date().getFullYear()) setTimeout(() => cache.delete(key), 5 * 60_000);
  }).catch(() => {});
  return p;
}

async function mflHistory(leagueId: string, year: number): Promise<{ seasons: Season[]; missing: number[]; current: Map<string, string> }> {
  const lg = await mflGet<any>(`https://api.myfantasyleague.com/${year}/export?TYPE=league&L=${leagueId}&JSON=1`);
  const hist = asArray(lg?.league?.history?.league);
  const list = (hist.length ? hist : [{ year: String(year), url: `https://api.myfantasyleague.com/${year}/home/${leagueId}` }])
    .map((h: any) => {
      const u = new URL(String(h.url).replace(/^http:/, 'https:'));
      return { year: Number(h.year), host: u.origin, id: u.pathname.split('/').pop() || leagueId };
    })
    .filter((h) => h.year <= year)
    .sort((a, b) => a.year - b.year);
  // One season at a time (see mflGet).
  const results: PromiseSettledResult<Season>[] = [];
  for (const h of list) results.push(await mflSeason(h.host, h.year, h.id).then((value) => ({ status: 'fulfilled' as const, value }), (reason) => ({ status: 'rejected' as const, reason })));
  const seasons: Season[] = [];
  const missing: number[] = [];
  results.forEach((r, i) => (r.status === 'fulfilled' && r.value.games.length ? seasons.push(r.value) : missing.push(list[i].year)));
  const current = new Map<string, string>(asArray(lg?.league?.franchises?.franchise).map((f: any) => [String(f.id), String(f.name)]));
  return { seasons, missing, current };
}

// ---------- Sleeper ----------
const SLEEPER = 'https://api.sleeper.app/v1';
async function sleeperSeason(leagueId: string): Promise<Season & { prev: string | null; owners: Map<string, string>; rosterOwner: Map<string, string> }> {
  return cached(`hist-sl-${leagueId}`, 3600_000, async () => {
    const [league, users, rosters, bracket] = await Promise.all([
      fetchJson<any>(`${SLEEPER}/league/${leagueId}`),
      fetchJson<any[]>(`${SLEEPER}/league/${leagueId}/users`),
      fetchJson<any[]>(`${SLEEPER}/league/${leagueId}/rosters`),
      fetchJson<any[]>(`${SLEEPER}/league/${leagueId}/winners_bracket`).catch(() => []),
    ]);
    const userName = new Map((users || []).map((u: any) => [String(u.user_id), String(u.metadata?.team_name || u.display_name || 'Team')]));
    // Franchise identity across seasons = owner id; roster ids can be reshuffled.
    const owner = new Map<string, string>((rosters || []).map((r: any) => [String(r.roster_id), String(r.owner_id ?? `roster-${r.roster_id}`)]));
    const names = new Map<string, string>([...owner.values()].map((o) => [o, userName.get(o) ?? 'Team']));
    const start = Number(league?.settings?.playoff_week_start) || 15;
    const lastRegular = start - 1;
    const games: Season['games'] = [];
    const weeks = await Promise.all(
      Array.from({ length: start + 2 }, (_, i) => fetchJson<any[]>(`${SLEEPER}/league/${leagueId}/matchups/${i + 1}`).catch(() => []))
    );
    weeks.forEach((ms, i) => {
      const byM = new Map<number, any[]>();
      for (const m of ms || []) if (m.matchup_id != null) byM.set(m.matchup_id, [...(byM.get(m.matchup_id) || []), m]);
      for (const pair of byM.values()) {
        if (pair.length !== 2 || !(pair[0].points > 0) || !(pair[1].points > 0)) continue;
        games.push({
          week: i + 1,
          a: owner.get(String(pair[0].roster_id)) ?? '',
          b: owner.get(String(pair[1].roster_id)) ?? '',
          as: pair[0].points,
          bs: pair[1].points,
        });
      }
    });
    const final = (bracket || []).find((g: any) => g.p === 1 && g.w != null);
    const champion = final ? { id: owner.get(String(final.w)) ?? '', runnerUp: owner.get(String(final.l)) ?? null, score: null } : undefined;
    return {
      season: Number(league?.season),
      lastRegular,
      names,
      games,
      champion,
      prev: league?.previous_league_id && league.previous_league_id !== '0' ? String(league.previous_league_id) : null,
      owners: names,
      rosterOwner: owner,
      ppr: league?.scoring_settings?.rec ?? null,
      starters: (league?.roster_positions || []).filter((p: string) => !['BN', 'IR', 'TAXI', 'RES'].includes(p)).length || null,
    };
  });
}

async function sleeperHistory(leagueId: string): Promise<{ seasons: Season[]; missing: number[]; current: Map<string, string>; rosterOwner: Map<string, string> }> {
  const seasons: Season[] = [];
  let id: string | null = leagueId;
  let current = new Map<string, string>();
  let rosterOwner = new Map<string, string>();
  for (let i = 0; id && i < 15; i++) {
    const s = await sleeperSeason(id);
    if (i === 0) {
      current = s.owners;
      rosterOwner = s.rosterOwner;
    }
    if (s.games.length) seasons.push(s);
    id = s.prev;
  }
  return { seasons: seasons.sort((a, b) => a.season - b.season), missing: [], current, rosterOwner };
}

// ---------- Build ----------
export async function buildRecordBook(platform: string, leagueId: string, myTeamId?: string, year = new Date().getFullYear()): Promise<LeagueHistory> {
  const src: { seasons: Season[]; missing: number[]; current: Map<string, string>; rosterOwner?: Map<string, string> } | null =
    platform === 'mfl' ? await mflHistory(leagueId, year) : platform === 'sleeper' ? await sleeperHistory(leagueId) : null;
  if (!src) throw new LeagueSyncError('League history is available for MFL and Sleeper leagues for now.');
  const { seasons, missing, current } = src;
  // Sleeper teams are tracked by owner across seasons; your current roster id maps to your owner id.
  const me = myTeamId ? (src.rosterOwner?.get(myTeamId) ?? myTeamId) : null;
  const nameNow = (id: string, s?: Season) => current.get(id) ?? s?.names.get(id) ?? 'Former team';

  const all: WeekScore[] = [];
  const rec = new Map<string, FranchiseRecord & { _seasons: Set<number>; _pts: number[] }>();
  const h2h: LeagueHistory['h2h'] = {};
  const fr = (id: string) => {
    let r = rec.get(id);
    if (!r) {
      r = { franchise_id: id, name: nameNow(id), seasons: 0, wins: 0, losses: 0, ties: 0, points_for: 0, avg_score: 0, best_score: 0, titles: [], runner_up: [], _seasons: new Set(), _pts: [] };
      rec.set(id, r);
    }
    return r;
  };
  for (const s of seasons) {
    for (const g of s.games) {
      const playoff = g.week > s.lastRegular;
      for (const [me, them, ms, ts] of [
        [g.a, g.b, g.as, g.bs],
        [g.b, g.a, g.bs, g.as],
      ] as const) {
        if (!me || ms == null) continue;
        const won = ts == null ? null : ms > ts ? true : ms < ts ? false : null;
        all.push({
          season: s.season,
          week: g.week,
          playoff,
          franchise_id: me,
          team_name: s.names.get(me) ?? 'Team',
          score: Math.round(ms * 100) / 100,
          opponent_id: them,
          opponent_name: them ? s.names.get(them) ?? 'Team' : null,
          opponent_score: ts == null ? null : Math.round(ts * 100) / 100,
          won,
        });
        const r = fr(me);
        r._seasons.add(s.season);
        r._pts.push(ms);
        r.best_score = Math.max(r.best_score, ms);
        if (!playoff && ts != null) {
          if (ms > ts) r.wins++;
          else if (ms < ts) r.losses++;
          else r.ties++;
          r.points_for += ms;
        }
        if (them && ts != null) {
          const row = (h2h[me] ||= {});
          const cell = (row[them] ||= { w: 0, l: 0, t: 0 });
          if (ms > ts) cell.w++;
          else if (ms < ts) cell.l++;
          else cell.t++;
        }
      }
    }
    if (s.champion?.id) {
      fr(s.champion.id).titles.push(s.season);
      if (s.champion.runnerUp) fr(s.champion.runnerUp).runner_up.push(s.season);
    }
  }
  const franchises = [...rec.values()]
    .map(({ _seasons, _pts, ...r }) => ({
      ...r,
      seasons: _seasons.size,
      points_for: Math.round(r.points_for),
      avg_score: Math.round((_pts.reduce((a, b) => a + b, 0) / Math.max(1, _pts.length)) * 10) / 10,
      best_score: Math.round(r.best_score * 100) / 100,
    }))
    .sort((a, b) => b.titles.length - a.titles.length || b.wins / Math.max(1, b.wins + b.losses) - a.wins / Math.max(1, a.wins + a.losses));

  const champions = seasons
    .filter((s) => s.champion?.id)
    .map((s) => ({
      season: s.season,
      franchise_id: s.champion!.id,
      team_name: s.names.get(s.champion!.id) ?? nameNow(s.champion!.id),
      runner_up_id: s.champion!.runnerUp,
      runner_up_name: s.champion!.runnerUp ? s.names.get(s.champion!.runnerUp) ?? null : null,
      score: s.champion!.score,
    }))
    .reverse();

  // Notes on lineup and scoring changes, since a 2015 score and a 2025 score aren't the same thing.
  const notes: string[] = [];
  for (let i = 1; i < seasons.length; i++) {
    const a = seasons[i - 1];
    const b = seasons[i];
    if (a.ppr != null && b.ppr != null && a.ppr !== b.ppr) notes.push(`${b.season}: points per catch changed from ${a.ppr} to ${b.ppr}.`);
    if (a.starters && b.starters && a.starters !== b.starters) notes.push(`${b.season}: starting lineup went from ${a.starters} to ${b.starters} players.`);
  }

  const sorted = all.slice().sort((x, y) => y.score - x.score);
  return {
    platform,
    me,
    seasons: seasons.map((s) => s.season),
    missing,
    champions,
    franchises,
    h2h,
    top_scores: sorted.slice(0, 25),
    low_scores: sorted.slice(-10).reverse(),
    blowouts: all
      .filter((x) => x.opponent_score != null && x.won)
      .sort((x, y) => y.score - y.opponent_score! - (x.score - x.opponent_score!))
      .slice(0, 10),
    notes,
  };
}

/** Current names for display: a franchise's name now, given the history (falls back to its last-season name). */
export const currentNameMap = (h: LeagueHistory) => new Map(h.franchises.map((f) => [f.franchise_id, f.name]));
