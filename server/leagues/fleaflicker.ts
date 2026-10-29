/**
 * Fleaflicker adapter. Fleaflicker's API is public: league ID only, no login.
 * https://www.fleaflicker.com/api-docs/index.html
 */
import { fetchJson, HttpError } from '../http';
import { playerDirectory } from '../players';
import { valueStore } from '../values';
import { sleeperTeam } from '../sources/weekly';
import type { LeagueSettings } from '../../src/types';
import { LeagueSyncError, type LeaguePlayer, type LeagueTeam, type NormalizedLeague } from './types';

const API = 'https://www.fleaflicker.com/api';

function parseRules(rules: any, size: number): LeagueSettings {
  const slots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, K: 0, DEF: 0 };
  let starterCount = 0;
  for (const rp of rules?.rosterPositions || []) {
    const n = Number(rp.start ?? rp.min ?? 0);
    if (!n || /bench|ir|taxi|reserve/i.test(rp.label || '')) continue;
    starterCount += n;
    const elig: string[] = rp.eligibility || [rp.label];
    const set = new Set(elig.map((e) => e.toUpperCase().replace('D/ST', 'DEF').replace('DST', 'DEF')));
    if (set.size === 1) {
      const only = [...set][0] as keyof typeof slots;
      if (only in slots) slots[only] += n;
    } else if (set.has('QB')) slots.SUPER_FLEX += n;
    else slots.FLEX += n;
  }
  const recRule = JSON.stringify(rules?.groups || rules?.scoringRules || '').match(/"Catch(?:es)?"[^}]*?"points?":\{"value":([\d.]+)/i);
  const rec = recRule ? Number(recRule[1]) : 0.5;
  return {
    league_size: size,
    starter_count: starterCount,
    slots,
    scoring_type: rec >= 1 ? 'PPR' : rec > 0 ? 'Half PPR' : 'Standard',
    superflex: slots.QB >= 2 || slots.SUPER_FLEX > 0,
    te_premium: false,
    format: 'redraft',
    format_source: 'default',
    playoffs: null,
    faab_budget: null,
  };
}

export async function fetchFleaflickerLeague(leagueId: string, opts: { season: number; teamId?: string | null }): Promise<NormalizedLeague> {
  const id = leagueId.trim();
  if (!/^\d+$/.test(id)) throw new LeagueSyncError('Fleaflicker league IDs are numbers: the number after /leagues/ in your league link.');
  let rules: any, rosters: any, standings: any;
  try {
    [rules, rosters, standings] = await Promise.all([
      fetchJson<any>(`${API}/FetchLeagueRules?sport=NFL&league_id=${id}`),
      fetchJson<any>(`${API}/FetchLeagueRosters?sport=NFL&league_id=${id}&season=${opts.season}`),
      fetchJson<any>(`${API}/FetchLeagueStandings?sport=NFL&league_id=${id}&season=${opts.season}`),
    ]);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) throw new LeagueSyncError(`Fleaflicker league ${id} wasn't found.`, 404);
    throw new LeagueSyncError(`Fleaflicker couldn't be reached (${(err as Error).message}). Try again shortly.`, 502);
  }
  await Promise.all([playerDirectory.refresh(), valueStore.refresh()]);

  const records = new Map<string, any>();
  for (const d of standings?.divisions || []) for (const t of d.teams || []) records.set(String(t.id), t);
  const list = rosters?.rosters || [];
  const settings = parseRules(rules, list.length || records.size || 12);
  // FAAB: Fleaflicker reports each team's remaining budget; the starting budget is the largest common round number.
  const budgets = [...records.values()].map((t) => Number(t.waiverAcquisitionBudget?.value)).filter((v) => !Number.isNaN(v));
  if (budgets.length) settings.faab_budget = [100, 200, 500, 1000].find((b) => b >= Math.max(...budgets)) ?? Math.max(...budgets);
  const players = new Map<string, LeaguePlayer>();

  const teams: LeagueTeam[] = list.map((r: any) => {
    const ids: string[] = [];
    for (const slot of r.players || []) {
      const p = slot.proPlayer || slot;
      if (!p?.id) continue;
      const pos = String(p.position || '').replace('D/ST', 'DEF');
      const team = sleeperTeam(p.proTeamAbbreviation);
      const pid =
        pos === 'DEF' && team
          ? team
          : valueStore.sleeperIdFor('fleaflicker', String(p.id)) || playerDirectory.findByName(p.nameFull, pos, team) || `ff:${p.id}`;
      ids.push(pid);
      if (!players.has(pid)) {
        const info = playerDirectory.get(pid);
        players.set(pid, {
          id: pid,
          name: info?.full_name || p.nameFull || pid,
          position: pos || info?.position || '',
          team: info?.team ?? team,
          age: info?.age ?? null,
          value_key: valueStore.bySleeperId(pid)?.id ?? null,
        });
      }
    }
    const teamId = String(r.team?.id);
    const rec = records.get(teamId)?.recordOverall || {};
    return {
      team_id: teamId,
      name: r.team?.name || `Team ${teamId}`,
      player_ids: ids,
      starters: [],
      designations: {},
      picks: [],
      faab_remaining: records.get(teamId)?.waiverAcquisitionBudget?.value ?? null,
      record: {
        wins: Number(rec.wins) || 0,
        losses: Number(rec.losses) || 0,
        ties: Number(rec.ties) || 0,
        points_for: Number(records.get(teamId)?.pointsFor?.value) || 0,
      },
    };
  });

  // Remaining regular-season matchups.
  const schedule: NormalizedLeague['schedule'] = [];
  const firstBoard = await fetchJson<any>(`${API}/FetchLeagueScoreboard?sport=NFL&league_id=${id}&season=${opts.season}`).catch(() => null);
  const period = firstBoard?.schedulePeriod;
  const periodSeason = Number(period?.low?.season) || opts.season; // active seasons omit it
  const currentWeek = periodSeason === opts.season ? Number(period?.ordinal) || undefined : undefined;
  if (currentWeek) {
    const start = settings.playoffs?.start_week ?? 15;
    const weeks = Array.from({ length: Math.max(0, start - currentWeek) }, (_, i) => currentWeek + i);
    const boards = await Promise.all(
      weeks.map((w) => fetchJson<any>(`${API}/FetchLeagueScoreboard?sport=NFL&league_id=${id}&season=${opts.season}&scoring_period=${w}`).catch(() => null))
    );
    boards.forEach((b, i) => {
      for (const g of b?.games || []) if (g.home?.id && g.away?.id) schedule.push({ week: weeks[i], a: String(g.home.id), b: String(g.away.id) });
    });
  }

  return {
    platform: 'fleaflicker',
    league_id: id,
    name: rules?.league?.name || standings?.league?.name || `Fleaflicker League ${id}`,
    season: opts.season,
    settings,
    teams,
    players,
    user_team_id: opts.teamId && teams.some((t) => t.team_id === opts.teamId) ? opts.teamId : null,
    schedule,
    current_week: currentWeek,
  };
}
