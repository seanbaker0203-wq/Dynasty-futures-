/**
 * Sleeper league adapter. Sleeper's API is public and read-only; no login needed.
 * Docs: https://docs.sleeper.com
 */
import { fetchJson, HttpError } from '../http';
import { playerDirectory } from '../players';
import { valueStore } from '../values';
import { getSeasonContext } from '../../src/lib/season';
import type { LeagueSettings } from '../../src/types';
import { LeagueSyncError, type LeaguePickRef, type LeaguePlayer, type LeagueTeam, type NormalizedLeague } from './types';

const API = 'https://api.sleeper.app/v1';
const FUTURE_PICK_YEARS = 3;

export function parseSleeperSettings(league: any): LeagueSettings {
  const positions: string[] = Array.isArray(league?.roster_positions) ? league.roster_positions : [];
  const starters = positions.filter((p) => !['BN', 'IR', 'TAXI'].includes(p));
  const count = (...names: string[]) => starters.filter((p) => names.includes(p)).length;

  const qb = count('QB');
  const superFlex = count('SUPER_FLEX');
  const scoring = league?.scoring_settings || {};

  return {
    league_size: league?.total_rosters || 12,
    roster_size: positions.length || undefined,
    starter_count: starters.length,
    slots: {
      QB: qb,
      RB: count('RB'),
      WR: count('WR'),
      TE: count('TE'),
      FLEX: count('FLEX', 'WRRB_FLEX', 'REC_FLEX', 'WRTE_FLEX'),
      SUPER_FLEX: superFlex,
      K: count('K'),
      DEF: count('DEF'),
    },
    scoring_type: scoring.rec >= 1 ? 'PPR' : scoring.rec > 0 ? 'Half PPR' : 'Standard',
    superflex: qb >= 2 || superFlex > 0,
    te_premium: (scoring.bonus_rec_te || 0) > 0,
  };
}

export async function fetchSleeperLeague(leagueId: string, username?: string): Promise<NormalizedLeague> {
  const id = leagueId.trim();
  if (!/^\d+$/.test(id)) throw new LeagueSyncError('Sleeper league IDs are numbers, e.g. 1048276548331171840.');

  let league: any, rosters: any[], users: any[], traded: any[];
  try {
    [league, rosters, users, traded] = await Promise.all([
      fetchJson(`${API}/league/${id}`),
      fetchJson<any[]>(`${API}/league/${id}/rosters`),
      fetchJson<any[]>(`${API}/league/${id}/users`),
      fetchJson<any[]>(`${API}/league/${id}/traded_picks`).catch(() => []),
    ]);
  } catch (err) {
    if (err instanceof HttpError) throw new LeagueSyncError(`Sleeper couldn't be reached (${err.message}). Try again shortly.`, 502);
    throw err;
  }
  if (!league || !Array.isArray(rosters)) throw new LeagueSyncError(`Sleeper league ${id} wasn't found. Check the league ID.`, 404);

  await playerDirectory.refresh();

  const settings = parseSleeperSettings(league);
  const userById = new Map((users || []).map((u: any) => [u.user_id, u]));
  const teamName = (r: any) => {
    const u = userById.get(r.owner_id);
    return u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
  };

  // Picks: everyone owns their own for the next few drafts, then apply trades.
  const { upcomingDraftYear } = getSeasonContext();
  const rounds = Number(league.settings?.draft_rounds) || 4;
  const picksByTeam = new Map<string, LeaguePickRef[]>();
  for (const r of rosters) {
    const own: LeaguePickRef[] = [];
    for (let y = upcomingDraftYear; y < upcomingDraftYear + FUTURE_PICK_YEARS; y++) {
      for (let rd = 1; rd <= rounds; rd++) own.push({ year: y, round: rd, original_team_id: String(r.roster_id) });
    }
    picksByTeam.set(String(r.roster_id), own);
  }
  for (const tp of traded || []) {
    const year = Number(tp.season);
    if (year < upcomingDraftYear || year >= upcomingDraftYear + FUTURE_PICK_YEARS) continue;
    const orig = String(tp.roster_id);
    const owner = String(tp.owner_id);
    // Remove from whoever currently holds it, give to the new owner.
    for (const list of picksByTeam.values()) {
      const i = list.findIndex((p) => p.year === year && p.round === Number(tp.round) && p.original_team_id === orig);
      if (i !== -1) list.splice(i, 1);
    }
    picksByTeam.get(owner)?.push({ year, round: Number(tp.round), original_team_id: orig });
  }

  const players = new Map<string, LeaguePlayer>();
  const teams: LeagueTeam[] = rosters.map((r: any) => {
    const ids: string[] = (r.players || []).map(String);
    const designations: LeagueTeam['designations'] = {};
    for (const pid of r.taxi || []) designations[String(pid)] = 'TAXI';
    for (const pid of r.reserve || []) designations[String(pid)] = 'IR';
    for (const pid of ids) {
      if (players.has(pid)) continue;
      const info = playerDirectory.get(pid);
      const valued = valueStore.bySleeperId(pid);
      players.set(pid, {
        id: pid,
        // Team defenses use their team abbreviation as the Sleeper id.
        name: info?.full_name || valued?.name || (/^[A-Z]{2,3}$/.test(pid) ? `${pid} Defense` : `Player ${pid}`),
        position: info?.position || valued?.position || (/^[A-Z]{2,3}$/.test(pid) ? 'DEF' : ''),
        team: info?.team ?? valued?.team ?? null,
        age: info?.age ?? valued?.age ?? null,
        value_key: valued?.id ?? null,
      });
    }
    const u = userById.get(r.owner_id);
    return {
      team_id: String(r.roster_id),
      name: teamName(r),
      owner_name: u?.display_name,
      player_ids: ids,
      starters: (r.starters || []).map(String).filter((s: string) => s !== '0'),
      designations,
      picks: (picksByTeam.get(String(r.roster_id)) || []).sort((a, b) => a.year - b.year || a.round - b.round),
    };
  });

  // Identify the user's team by Sleeper username or display name.
  let userTeamId: string | null = null;
  if (username?.trim()) {
    const needle = username.trim().toLowerCase();
    let userId = (users || []).find(
      (u: any) => u.display_name?.toLowerCase() === needle || u.metadata?.team_name?.toLowerCase() === needle
    )?.user_id;
    if (!userId) {
      const u = await fetchJson<any>(`${API}/user/${encodeURIComponent(username.trim())}`).catch(() => null);
      userId = u?.user_id;
    }
    const roster = rosters.find((r: any) => r.owner_id === userId || (r.co_owners || []).includes(userId));
    if (roster) userTeamId = String(roster.roster_id);
  }

  return {
    platform: 'sleeper',
    league_id: id,
    name: league.name || `Sleeper League ${id}`,
    season: Number(league.season) || getSeasonContext().seasonYear,
    settings,
    teams,
    players,
    user_team_id: userTeamId,
  };
}
