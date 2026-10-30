/**
 * Yahoo Fantasy adapter. Yahoo only shares league data after the user signs in with Yahoo (OAuth 2). We keep the
 * user's Yahoo refresh token in an encrypted, httpOnly cookie in their own browser: nothing is stored on the server.
 *
 * Setup: create an app at developer.yahoo.com/apps/create (Fantasy Sports: Read, redirect
 * https://<host>/api/auth/yahoo/callback) and set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET.
 */
import crypto from 'node:crypto';

import { playerDirectory } from '../players';
import { valueStore } from '../values';
import { sleeperTeam } from '../sources/weekly';
import type { LeagueSettings } from '../../src/types';
import { LeagueSyncError, type LeaguePlayer, type LeagueTeam, type NormalizedLeague } from './types';

const AUTH = 'https://api.login.yahoo.com/oauth2';
const API = 'https://fantasysports.yahooapis.com/fantasy/v2';

// Trim stray spaces, line breaks or quotes from copy-pasted values.
const clean = (v: string | undefined) => (v || '').trim().replace(/^['"]|['"]$/g, '').trim();
const clientId = () => clean(process.env.YAHOO_CLIENT_ID);
const clientSecret = () => clean(process.env.YAHOO_CLIENT_SECRET);
export const yahooEnabled = () => !!(clientId() && clientSecret());

// ---- OAuth ------------------------------------------------------------------------------------------------
export function yahooAuthUrl(redirectUri: string, state: string) {
  // fspt-r = Fantasy Sports read. Asking for it explicitly makes Yahoo show it on the consent page.
  const q = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri, response_type: 'code', state, language: 'en-us', scope: 'fspt-r' });
  return `${AUTH}/request_auth?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const r = await fetch(`${AUTH}/get_token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new LeagueSyncError(`Yahoo sign-in failed (${data.error_description || data.error || r.status}).`, 401);
  return data as { access_token: string; refresh_token: string; expires_in: number };
}

export const exchangeYahooCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
export const refreshYahooToken = (refreshToken: string) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

// Encrypted cookie holding the refresh token (AES-256-GCM, key derived from the client secret).
const key = () => crypto.createHash('sha256').update(`yahoo-cookie:${clientSecret()}`).digest();
export function sealToken(token: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}
export function openToken(sealed: string): string | null {
  try {
    const b = Buffer.from(sealed, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Short-lived access tokens per refresh token (memory only).
const access = new Map<string, { token: string; until: number }>();
export async function yahooAccessToken(refreshToken: string): Promise<string> {
  const hit = access.get(refreshToken);
  if (hit && Date.now() < hit.until) return hit.token;
  const t = await refreshYahooToken(refreshToken);
  access.set(refreshToken, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
  if (access.size > 2000) access.clear();
  return t.access_token;
}

const yget = async (path: string, token: string) => {
  let r: Response;
  try {
    r = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}format=json`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new LeagueSyncError(`Yahoo couldn't be reached (${(err as Error).message}).`, 502);
  }
  const text = await r.text();
  if (!r.ok) {
    // Yahoo explains refusals in the body (JSON or XML): pass that on.
    const why =
      text.match(/"description"\s*:\s*"([^"]+)"/)?.[1] || text.match(/<description>([^<]+)<\/description>/)?.[1] || text.match(/oauth_problem="?([\w_]+)/)?.[1] || '';
    console.warn(`[yahoo] ${r.status} on ${path}: ${text.slice(0, 300)}`);
    if (r.status === 401) throw new LeagueSyncError(`Your Yahoo sign-in expired or was refused${why ? ` (${why})` : ''}. Sign in with Yahoo again.`, 401);
    // Since July 2026 Yahoo gates the Fantasy API behind an approval program; unapproved apps sign in fine but get this 403.
    if (r.status === 403 && /not authorized to perform this action/i.test(why))
      throw new LeagueSyncError(
        `Yahoo league sync is waiting on Yahoo's approval of Dynasty Futures for fantasy data. Until then, connect with your league ID on another platform, or check back soon.`,
        403
      );
    if (r.status === 403)
      throw new LeagueSyncError(
        `Yahoo refused access to fantasy data${why ? ` (${why})` : ''}. Check the Yahoo app has "Fantasy Sports: Read" enabled, then sign in with Yahoo again.`,
        403
      );
    throw new LeagueSyncError(`Yahoo returned an error (${r.status}${why ? `: ${why}` : ''}).`, 502);
  }
  try {
    return JSON.parse(text)?.fantasy_content;
  } catch {
    throw new LeagueSyncError('Yahoo sent something unexpected. Try again.', 502);
  }
};

// Yahoo JSON: arrays of single-key objects, and objects keyed "0", "1", ... plus "count".
const merge = (arr: any): any => (Array.isArray(arr) ? arr.reduce((o, x) => (x && typeof x === 'object' && !Array.isArray(x) ? { ...o, ...x } : Array.isArray(x) ? { ...o, ...merge(x) } : o), {}) : arr || {});
const items = (obj: any): any[] => (obj ? Object.keys(obj).filter((k) => /^\d+$/.test(k)).map((k) => obj[k]) : []);

export async function listYahooLeagues(token: string) {
  const fc = await yget('users;use_login=1/games;game_keys=nfl/leagues', token);
  const games = items(fc?.users?.['0']?.user?.[1]?.games);
  const out: { league_key: string; name: string; season: number; num_teams: number }[] = [];
  for (const g of games) {
    const game = g.game;
    for (const l of items(game?.[1]?.leagues)) {
      const m = merge(l.league);
      out.push({ league_key: m.league_key, name: m.name, season: Number(m.season), num_teams: Number(m.num_teams) || 0 });
    }
  }
  return out.sort((a, b) => b.season - a.season);
}

const SLOT_MAP: Record<string, keyof LeagueSettings['slots']> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', 'W/R/T': 'FLEX', 'W/R': 'FLEX', 'W/T': 'FLEX', 'Q/W/R/T': 'SUPER_FLEX', K: 'K', DEF: 'DEF' };

export async function fetchYahooLeague(leagueKey: string, token: string, teamId?: string | null): Promise<NormalizedLeague> {
  const lk = leagueKey.trim();
  if (!/^\d+\.l\.\d+$/.test(lk)) throw new LeagueSyncError('Pick a Yahoo league from your list.');
  const [settingsFc, rostersFc, standingsFc] = await Promise.all([
    yget(`league/${lk}/settings`, token),
    yget(`league/${lk}/teams/roster`, token),
    yget(`league/${lk}/standings`, token),
  ]);
  await Promise.all([playerDirectory.refresh(), valueStore.refresh()]);

  const meta = merge(settingsFc?.league?.[0]);
  const st = merge(settingsFc?.league?.[1]?.settings);
  const slots: LeagueSettings['slots'] = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, K: 0, DEF: 0 };
  let starters = 0;
  for (const rp of st.roster_positions || []) {
    const p = rp.roster_position || {};
    const k = SLOT_MAP[p.position];
    if (!k) continue;
    slots[k] = (slots[k] || 0) + Number(p.count || 0);
    starters += Number(p.count || 0);
  }
  const recMod = (st.stat_modifiers?.stats || []).find((s: any) => String(s.stat?.stat_id) === '11')?.stat?.value;
  const rec = recMod != null ? Number(recMod) : 0;
  const numTeams = Number(meta.num_teams) || 10;
  const playoffTeams = Number(st.num_playoff_teams) || 4;
  const settings: LeagueSettings = {
    league_size: numTeams,
    starter_count: starters,
    slots,
    scoring_type: rec >= 1 ? 'PPR' : rec > 0 ? 'Half PPR' : 'Standard',
    superflex: slots.QB >= 2 || (slots.SUPER_FLEX || 0) > 0,
    te_premium: false,
    format: Number(st.uses_keepers || 0) === 1 || st.is_keeper ? 'keeper' : 'redraft',
    format_source: 'platform',
    playoffs: { start_week: Number(st.playoff_start_week) || 15, teams: playoffTeams, weeks: Math.max(1, Math.ceil(Math.log2(Math.max(2, playoffTeams)))) },
    faab_budget: String(st.uses_faab) === '1' ? 100 : null,
  };

  const records = new Map<string, { wins: number; losses: number; ties: number; points_for: number }>();
  for (const t of items(standingsFc?.league?.[1]?.standings?.[0]?.teams)) {
    const tm = merge(t.team?.[0]);
    const s2 = merge(t.team?.slice(1));
    const ot = s2.team_standings?.outcome_totals || {};
    records.set(String(tm.team_id), { wins: Number(ot.wins) || 0, losses: Number(ot.losses) || 0, ties: Number(ot.ties) || 0, points_for: Number(s2.team_standings?.points_for) || 0 });
  }

  const players = new Map<string, LeaguePlayer>();
  const teams: LeagueTeam[] = items(rostersFc?.league?.[1]?.teams).map((t: any) => {
    const tm = merge(t.team?.[0]);
    const roster = (t.team || []).find((x: any) => x && x.roster)?.roster;
    const ids: string[] = [];
    const startersIds: string[] = [];
    const designations: LeagueTeam['designations'] = {};
    for (const pl of items(roster?.['0']?.players)) {
      const pm = merge(pl.player?.[0]);
      const sel = merge(pl.player?.[1]?.selected_position);
      const pos = String(pm.display_position || '').split(',')[0].replace('DEF', 'DEF');
      const team = sleeperTeam(pm.editorial_team_abbr);
      const pid =
        pos === 'DEF' && team
          ? team
          : valueStore.sleeperIdFor('yahoo', String(pm.player_id)) || playerDirectory.findByName(pm.name?.full, pos, team) || `y:${pm.player_id}`;
      ids.push(pid);
      if (sel.position && !['BN', 'IR'].includes(sel.position)) startersIds.push(pid);
      if (sel.position === 'IR') designations[pid] = 'IR';
      if (!players.has(pid)) {
        const info = playerDirectory.get(pid);
        players.set(pid, {
          id: pid,
          name: info?.full_name || pm.name?.full || pid,
          position: pos || info?.position || '',
          team: info?.team ?? team,
          age: info?.age ?? null,
          value_key: valueStore.bySleeperId(pid)?.id ?? null,
        });
      }
    }
    const id = String(tm.team_id);
    const faab = tm.faab_balance != null ? Number(tm.faab_balance) : null;
    return {
      team_id: id,
      name: tm.name || `Team ${id}`,
      owner_name: merge(tm.managers?.[0]?.manager)?.nickname,
      player_ids: ids,
      starters: startersIds,
      designations,
      picks: [],
      record: records.get(id),
      faab_remaining: faab,
      // Yahoo marks the signed-in user's team.
      ...(tm.is_owned_by_current_login ? { _mine: true } : {}),
    } as LeagueTeam;
  });

  // Remaining regular-season matchups.
  const currentWeek = Number(meta.current_week) || undefined;
  const schedule: NormalizedLeague['schedule'] = [];
  if (currentWeek && settings.playoffs) {
    const weeks = Array.from({ length: Math.max(0, settings.playoffs.start_week - currentWeek) }, (_, i) => currentWeek + i);
    const boards = await Promise.all(weeks.map((w) => yget(`league/${lk}/scoreboard;week=${w}`, token).catch(() => null)));
    boards.forEach((fc, i) => {
      for (const m of items(fc?.league?.[1]?.scoreboard?.['0']?.matchups)) {
        const ts = items(m.matchup?.['0']?.teams).map((x: any) => String(merge(x.team?.[0]).team_id));
        if (ts.length === 2) schedule.push({ week: weeks[i], a: ts[0], b: ts[1] });
      }
    });
  }

  const mine = teams.find((t: any) => t._mine)?.team_id ?? null;
  return {
    platform: 'yahoo',
    league_id: lk,
    name: meta.name || `Yahoo League ${lk}`,
    season: Number(meta.season) || new Date().getFullYear(),
    settings,
    teams,
    players,
    user_team_id: teamId && teams.some((t) => t.team_id === teamId) ? teamId : mine,
    schedule,
    current_week: currentWeek,
  };
}
