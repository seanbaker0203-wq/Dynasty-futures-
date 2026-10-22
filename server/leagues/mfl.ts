/**
 * MyFantasyLeague adapter.
 *
 * Access options (MFL has no OAuth):
 *  - public leagues: nothing needed
 *  - private leagues: the league's read-only API key (commissioner: League → Developer's API), or
 *  - the user's MFL username + password, exchanged once for a session cookie. Never stored.
 *
 * MFL serves each league from a numbered host (www48…); api.myfantasyleague.com redirects there.
 * We resolve that host first so the session cookie isn't dropped on a cross-host redirect.
 */
import { fetchJson, fetchResponse, fetchText, HttpError } from '../http';
import { playerDirectory } from '../players';
import { valueStore } from '../values';
import { getSeasonContext } from '../../src/lib/season';
import type { LeagueSettings } from '../../src/types';
import { LeagueSyncError, type LeaguePickRef, type LeaguePlayer, type LeagueTeam, type NormalizedLeague } from './types';

export interface MflAuth {
  apiKey?: string;
  username?: string;
  password?: string;
}

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** "Smith-Njigba, Jaxon" -> "Jaxon Smith-Njigba" */
export function mflName(raw: string): string {
  if (!raw?.includes(',')) return raw?.trim() || '';
  const [last, ...first] = raw.split(',');
  return `${first.join(',').trim()} ${last.trim()}`.trim();
}

async function resolveHost(year: number, leagueId: string): Promise<string> {
  const res = await fetchResponse(
    `https://api.myfantasyleague.com/${year}/export?TYPE=league&L=${leagueId}&JSON=1`,
    { redirect: 'manual' }
  );
  const loc = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && loc) return new URL(loc, 'https://api.myfantasyleague.com').origin;
  return 'https://api.myfantasyleague.com';
}

async function login(year: number, username: string, password: string): Promise<string> {
  const url =
    `https://api.myfantasyleague.com/${year}/login?USERNAME=${encodeURIComponent(username)}` +
    `&PASSWORD=${encodeURIComponent(password)}&XML=1`;
  const xml = await fetchText(url);
  const m = xml.match(/MFL_USER_ID="([^"]+)"/) || xml.match(/cookie_value="([^"]+)"/);
  if (!m) throw new LeagueSyncError('MFL login failed. Check your MFL username and password.', 401);
  return m[1];
}

export function parseMflSettings(league: any, rules: any): LeagueSettings {
  const starters = league?.starters || {};
  const slots: Record<string, { min: number; max: number }> = {};
  for (const p of asArray<any>(starters.position)) {
    const [min, max] = String(p.limit || '0').split('-').map(Number);
    slots[p.name] = { min: min || 0, max: max ?? min ?? 0 };
  }
  const total = Number(starters.count) || 0;
  const min = (n: string) => slots[n]?.min || 0;
  const flexible = Math.max(0, total - Object.values(slots).reduce((s, v) => s + v.min, 0));
  const qbMax = slots.QB?.max || 0;

  // Reception points by position group, to spot PPR level and TE premium.
  const recPoints: Record<string, number> = {};
  for (const g of asArray<any>(rules?.rules?.positionRules)) {
    for (const r of asArray<any>(g.rule)) {
      if (r?.event?.$t !== 'CC') continue;
      const pts = parseFloat(String(r?.points?.$t || '').replace('*', '')) || 0;
      for (const pos of String(g.positions || '').split('|')) recPoints[pos] = (recPoints[pos] || 0) + pts;
    }
  }
  const wrRec = recPoints.WR || 0;

  return {
    league_size: Number(league?.franchises?.count) || asArray(league?.franchises?.franchise).length || 12,
    roster_size: Number(league?.rosterSize) || undefined,
    starter_count: total,
    slots: {
      QB: min('QB'),
      RB: min('RB'),
      WR: min('WR'),
      TE: min('TE'),
      // A QB range like 1-2 means the extra slot can be a QB: treat it as superflex.
      SUPER_FLEX: qbMax > min('QB') ? Math.min(flexible, qbMax - min('QB')) : 0,
      FLEX: Math.max(0, flexible - (qbMax > min('QB') ? Math.min(flexible, qbMax - min('QB')) : 0)),
      K: min('PK') + min('K'),
      DEF: min('Def') + min('DEF'),
    },
    scoring_type: wrRec >= 1 ? 'PPR' : wrRec > 0 ? 'Half PPR' : 'Standard',
    superflex: qbMax >= 2,
    te_premium: (recPoints.TE || 0) > wrRec,
  };
}

export async function fetchMflLeague(
  leagueId: string,
  opts: MflAuth & { franchiseId?: string; year?: number } = {}
): Promise<NormalizedLeague> {
  const id = leagueId.trim();
  if (!/^\d+$/.test(id)) throw new LeagueSyncError('MFL league IDs are numbers, e.g. 37804.');
  const year = opts.year || getSeasonContext().seasonYear;

  const host = await resolveHost(year, id).catch(() => 'https://api.myfantasyleague.com');
  const headers: Record<string, string> = {};
  if (opts.username && opts.password) {
    headers.Cookie = `MFL_USER_ID=${await login(year, opts.username, opts.password)}`;
  }
  const keyParam = opts.apiKey ? `&APIKEY=${encodeURIComponent(opts.apiKey.trim())}` : '';
  const exp = (type: string, extra = '') =>
    fetchJson<any>(`${host}/${year}/export?TYPE=${type}&L=${id}${extra}${keyParam}&JSON=1`, { headers });

  let league: any, rosters: any, futurePicks: any, rules: any, myLeagues: any;
  try {
    [league, rosters, futurePicks, rules, myLeagues] = await Promise.all([
      exp('league'),
      exp('rosters'),
      exp('futureDraftPicks').catch(() => null),
      exp('rules').catch(() => null),
      headers.Cookie ? exp('myleagues').catch(() => null) : Promise.resolve(null),
    ]);
  } catch (err) {
    if (err instanceof HttpError) throw new LeagueSyncError(`MFL couldn't be reached (${err.message}). Try again shortly.`, 502);
    throw err;
  }

  const apiError = league?.error?.$t || rosters?.error?.$t;
  if (apiError || !league?.league) {
    const msg = String(apiError || '');
    if (/private|password|permission|login|denied|api key/i.test(msg) || rosters?.error) {
      throw new LeagueSyncError(
        `MFL league ${id} is private. Add the league's API key (commissioner: League → Developer's API) or log in with your MFL account.`,
        401
      );
    }
    throw new LeagueSyncError(msg ? `MFL said: ${msg}` : `MFL league ${id} wasn't found for ${year}. Check the league ID.`, 404);
  }

  const L = league.league;
  const settings = parseMflSettings(L, rules);
  if (L.usesSalaries === '1' && Number(L.salaryCapAmount) > 0) {
    settings.salary_cap = {
      cap: Number(L.salaryCapAmount),
      taxi_pct: L.includeTaxiWithSalary !== undefined && L.includeTaxiWithSalary !== '' ? Number(L.includeTaxiWithSalary) / 100 : 1,
      ir_pct: L.includeIRWithSalary !== undefined && L.includeIRWithSalary !== '' ? Number(L.includeIRWithSalary) / 100 : 1,
    };
  }
  const franchiseMeta = new Map(asArray<any>(L.franchises?.franchise).map((f) => [String(f.id), f]));

  // Picks. Some leagues draft offline and never run the draft on MFL, so MFL keeps listing
  // picks for drafts that already happened. Only count picks from the next real draft onward.
  const { upcomingDraftYear } = getSeasonContext();
  const picksByTeam = new Map<string, LeaguePickRef[]>();
  for (const f of asArray<any>(futurePicks?.futureDraftPicks?.franchise)) {
    picksByTeam.set(
      String(f.id),
      asArray<any>(f.futureDraftPick)
        .map((p) => ({ year: Number(p.year), round: Number(p.round), original_team_id: String(p.originalPickFor || f.id) }))
        .filter((p) => p.year >= upcomingDraftYear)
        .sort((a, b) => a.year - b.year || a.round - b.round)
    );
  }

  const teams: LeagueTeam[] = asArray<any>(rosters?.rosters?.franchise).map((f) => {
    const designations: LeagueTeam['designations'] = {};
    const contracts: NonNullable<LeagueTeam['contracts']> = {};
    const ids: string[] = [];
    for (const p of asArray<any>(f.player)) {
      const pid = String(p.id);
      ids.push(pid);
      if (p.salary !== undefined && p.salary !== '') {
        const yrs = parseInt(p.contractYear, 10);
        contracts[pid] = { salary: Number(p.salary) || 0, years: Number.isFinite(yrs) ? yrs : null };
      }
      if (p.status === 'TAXI_SQUAD') designations[pid] = 'TAXI';
      else if (p.status === 'INJURED_RESERVE') designations[pid] = 'IR';
    }
    const meta = franchiseMeta.get(String(f.id));
    return {
      team_id: String(f.id),
      name: meta?.name || `Franchise ${f.id}`,
      owner_name: meta?.owner_name,
      player_ids: ids,
      starters: [], // MFL rosters don't flag weekly starters; lineup is optimized by value.
      designations,
      contracts: Object.keys(contracts).length ? contracts : undefined,
      picks: picksByTeam.get(String(f.id)) || [],
    };
  });

  // Resolve players: valued (by MFL id) -> Sleeper directory via id crosswalk -> MFL's own player list.
  await Promise.all([playerDirectory.refresh(), valueStore.refresh()]);
  const players = new Map<string, LeaguePlayer>();
  const missing: string[] = [];
  for (const t of teams) {
    for (const pid of t.player_ids) {
      if (players.has(pid)) continue;
      const valued = valueStore.byMflId(pid);
      const xw = valueStore.crosswalkForMfl(pid);
      const sleeperId = valued?.sleeper_id || xw?.sleeper_id;
      const info = sleeperId ? playerDirectory.get(sleeperId) : undefined;
      if (!valued && !info) {
        missing.push(pid);
        continue;
      }
      players.set(pid, {
        id: pid,
        name: info?.full_name || valued?.name || xw?.name || `Player ${pid}`,
        position: info?.position || valued?.position || xw?.position || '',
        team: info?.team ?? valued?.team ?? xw?.team ?? null,
        age: info?.age ?? valued?.age ?? null,
        value_key: valued?.id ?? null,
      });
    }
  }
  if (missing.length) {
    const res = await exp('players', `&PLAYERS=${missing.join(',')}`).catch(() => null);
    const byId = new Map(asArray<any>(res?.players?.player).map((p) => [String(p.id), p]));
    for (const pid of missing) {
      const p = byId.get(pid);
      const pos = p?.position === 'PK' ? 'K' : p?.position === 'Def' ? 'DEF' : p?.position || '';
      players.set(pid, {
        id: pid,
        name: p ? (pos === 'DEF' ? `${mflName(p.name)} Defense` : mflName(p.name)) : `Player ${pid}`,
        position: pos,
        team: p?.team ?? null,
        age: null,
        value_key: null,
      });
    }
  }

  let userTeamId: string | null = null;
  const fid = opts.franchiseId?.trim();
  if (fid) {
    userTeamId = teams.find((t) => t.team_id === fid || t.team_id === fid.padStart(4, '0'))?.team_id ?? null;
  }
  if (!userTeamId && myLeagues) {
    const mine = asArray<any>(myLeagues?.leagues?.league).find((l) => String(l.league_id) === id);
    if (mine?.franchise_id) userTeamId = String(mine.franchise_id);
  }

  return {
    platform: 'mfl',
    league_id: id,
    name: L.name || `MFL League ${id}`,
    season: year,
    settings,
    teams,
    players,
    user_team_id: userTeamId,
  };
}
