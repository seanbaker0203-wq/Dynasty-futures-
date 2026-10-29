/**
 * ESPN fantasy football adapter (fantasy.espn.com). Public leagues need only the league ID. Private leagues need the
 * user's espn_s2 and SWID cookies, sent with this request only and never stored.
 * Player ids are mapped to Sleeper ids through the DynastyProcess crosswalk, so values and projections line up.
 */
import { fetchJson, HttpError } from '../http';
import { playerDirectory } from '../players';
import { valueStore } from '../values';
import { sleeperTeam } from '../sources/weekly';
import type { LeagueSettings } from '../../src/types';
import { LeagueSyncError, type LeaguePlayer, type LeagueTeam, type NormalizedLeague } from './types';

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';

// ESPN lineup slot ids.
const SLOT = { QB: 0, RB: 2, RBWR: 3, WR: 4, WRTE: 5, TE: 6, OP: 7, DST: 16, K: 17, BENCH: 20, IR: 21, FLEX: 23 } as const;
const POS: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
const PRO_TEAM: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV',
  14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF',
  26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

export function parseEspnSettings(s: any): LeagueSettings {
  const slots: Record<string, number> = s?.rosterSettings?.lineupSlotCounts || {};
  const n = (id: number) => Number(slots[id]) || 0;
  const rec = (s?.scoringSettings?.scoringItems || []).find((i: any) => i.statId === 53)?.points ?? 0; // points per reception
  const sched = s?.scheduleSettings || {};
  const playoffTeams = Number(sched.playoffTeamCount) || 4;
  const regWeeks = Number(sched.matchupPeriodCount) || 14;
  const perRound = Number(sched.playoffMatchupPeriodLength) || 1;
  const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, playoffTeams))));
  const starterCount = Object.entries(slots).reduce((t, [id, c]) => (Number(id) === SLOT.BENCH || Number(id) === SLOT.IR ? t : t + (Number(c) || 0)), 0);
  const acq = s?.acquisitionSettings || {};
  return {
    league_size: Number(s?.size) || 10,
    starter_count: starterCount,
    slots: {
      QB: n(SLOT.QB),
      RB: n(SLOT.RB),
      WR: n(SLOT.WR),
      TE: n(SLOT.TE),
      FLEX: n(SLOT.FLEX) + n(SLOT.RBWR) + n(SLOT.WRTE),
      SUPER_FLEX: n(SLOT.OP),
      K: n(SLOT.K),
      DEF: n(SLOT.DST),
    },
    scoring_type: rec >= 1 ? 'PPR' : rec > 0 ? 'Half PPR' : 'Standard',
    superflex: n(SLOT.QB) >= 2 || n(SLOT.OP) > 0,
    te_premium: false,
    // ESPN dynasty/keeper leagues set a keeper count; otherwise redraft.
    format: Number(s?.draftSettings?.keeperCount) > 3 ? 'dynasty' : Number(s?.draftSettings?.keeperCount) > 0 ? 'keeper' : 'redraft',
    format_source: 'platform',
    playoffs: { start_week: regWeeks + 1, teams: playoffTeams, weeks: rounds * perRound },
    faab_budget: acq.isUsingAcquisitionBudget ? Number(acq.acquisitionBudget) || 100 : null,
  };
}

export async function fetchEspnLeague(
  leagueId: string,
  opts: { season: number; espn_s2?: string; swid?: string; teamId?: string | null }
): Promise<NormalizedLeague> {
  const id = leagueId.trim();
  if (!/^\d+$/.test(id)) throw new LeagueSyncError('ESPN league IDs are numbers: the leagueId=… part of your league link.');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.espn_s2 && opts.swid) {
    const swid = opts.swid.trim().replace(/^\{?/, '{').replace(/\}?$/, '}');
    headers.Cookie = `espn_s2=${opts.espn_s2.trim()}; SWID=${swid}`;
  }
  const url = `${BASE}/${opts.season}/segments/0/leagues/${id}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mStatus`;
  let data: any;
  try {
    data = await fetchJson<any>(url, { headers, timeoutMs: 20000 });
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403))
      throw new LeagueSyncError('This ESPN league is private. Add your espn_s2 and SWID (see "How do I find these?").', 401);
    if (err instanceof HttpError && err.status === 404) throw new LeagueSyncError(`ESPN league ${id} wasn't found for ${opts.season}.`, 404);
    throw new LeagueSyncError(`ESPN couldn't be reached (${(err as Error).message}). Try again shortly.`, 502);
  }
  await Promise.all([playerDirectory.refresh(), valueStore.refresh()]);

  const settings = parseEspnSettings(data.settings);
  const players = new Map<string, LeaguePlayer>();
  const currentWeek = Number(data.status?.currentMatchupPeriod || data.scoringPeriodId) || undefined;

  const teams: LeagueTeam[] = (data.teams || []).map((t: any) => {
    const ids: string[] = [];
    const starters: string[] = [];
    const designations: LeagueTeam['designations'] = {};
    for (const e of t.roster?.entries || []) {
      const p = e.playerPoolEntry?.player || {};
      const pos = POS[p.defaultPositionId] || '';
      const team = PRO_TEAM[p.proTeamId] ?? null;
      // Defenses use the team abbreviation (Sleeper's id); everyone else maps through the crosswalk.
      const pid =
        pos === 'DEF' && team
          ? team
          : valueStore.sleeperIdFor('espn', String(e.playerId)) || playerDirectory.findByName(p.fullName, pos, team) || `espn:${e.playerId}`;
      ids.push(pid);
      if (e.lineupSlotId !== SLOT.BENCH && e.lineupSlotId !== SLOT.IR) starters.push(pid);
      if (e.lineupSlotId === SLOT.IR) designations[pid] = 'IR';
      if (!players.has(pid)) {
        const info = playerDirectory.get(pid);
        players.set(pid, {
          id: pid,
          name: pos === 'DEF' ? `${p.fullName || team} Defense`.replace('D/ST Defense', 'Defense') : info?.full_name || p.fullName || pid,
          position: pos || info?.position || '',
          team: info?.team ?? team,
          age: info?.age ?? null,
          value_key: valueStore.bySleeperId(pid)?.id ?? null,
        });
      }
    }
    const rec = t.record?.overall || {};
    const name = t.name || [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`;
    return {
      team_id: String(t.id),
      name,
      owner_name: undefined,
      player_ids: ids,
      starters,
      designations,
      picks: [],
      record: { wins: Number(rec.wins) || 0, losses: Number(rec.losses) || 0, ties: Number(rec.ties) || 0, points_for: Number(rec.pointsFor) || 0 },
      faab_remaining: settings.faab_budget != null ? settings.faab_budget - (Number(t.transactionCounter?.acquisitionBudgetSpent) || 0) : null,
    };
  });

  const schedule = (data.schedule || [])
    .filter((m: any) => m.home && m.away && (!currentWeek || m.matchupPeriodId >= currentWeek) && m.matchupPeriodId < (settings.playoffs?.start_week ?? 99))
    .map((m: any) => ({ week: Number(m.matchupPeriodId), a: String(m.home.teamId), b: String(m.away.teamId) }));

  return {
    platform: 'espn',
    league_id: id,
    name: data.settings?.name || `ESPN League ${id}`,
    season: opts.season,
    settings,
    teams,
    players,
    user_team_id: opts.teamId && teams.some((t) => t.team_id === opts.teamId) ? opts.teamId : null,
    schedule,
    current_week: currentWeek,
  };
}
