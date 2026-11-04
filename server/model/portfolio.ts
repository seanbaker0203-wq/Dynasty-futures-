/**
 * Portfolio: everything you own across all your leagues. Players are matched across platforms by Sleeper id
 * (MFL ids through the DynastyProcess crosswalk), each valued on that league's own board.
 */
import type { NormalizedLeague } from '../leagues/types';
import { getBoard } from './futures';
import { valueStore } from '../values';

export interface PortfolioLeague {
  platform: string;
  league_id: string;
  name: string;
  team_name: string | null;
  format: string;
  superflex: boolean;
  teams: number;
  ok: boolean;
  error?: string;
  value: number;
  players: number;
}
export interface PortfolioHolding {
  key: string;
  name: string;
  position: string;
  nfl_team: string | null;
  age: number | null;
  count: number; // leagues you own him in
  value: number; // total Futures Value across those leagues
  avg_value: number;
  in: { league: number; value: number; starter: boolean; designation: string | null }[]; // league = index into leagues[]
}
export interface Portfolio {
  leagues: PortfolioLeague[];
  holdings: PortfolioHolding[];
  total_value: number;
  by_position: Record<string, { value: number; share: number; players: number }>;
  value_weighted_age: number | null;
  value_age_28_plus: number; // share of value in players 28 or older
  top5_share: number; // share of value in the five most valuable holdings
}

export async function buildPortfolio(
  inputs: { league: NormalizedLeague | null; team_id: string | null; error?: string; platform: string; league_id: string }[]
): Promise<Portfolio> {
  const leagues: PortfolioLeague[] = [];
  const holdings = new Map<string, PortfolioHolding>();

  for (const inp of inputs) {
    const i = leagues.length;
    const lg = inp.league;
    const team = lg?.teams.find((t) => t.team_id === (inp.team_id ?? lg.user_team_id));
    if (!lg || !team) {
      leagues.push({
        platform: inp.platform,
        league_id: inp.league_id,
        name: lg?.name ?? inp.league_id,
        team_name: null,
        format: lg?.settings.format ?? 'dynasty',
        superflex: !!lg?.settings.superflex,
        teams: lg?.settings.league_size ?? 0,
        ok: false,
        error: inp.error ?? (lg ? "Couldn't tell which team is yours. Open this league once and pick your team." : "Couldn't load this league."),
        value: 0,
        players: 0,
      });
      continue;
    }
    const board = await getBoard(lg.settings);
    let total = 0;
    for (const pid of team.player_ids) {
      const p = lg.players.get(pid);
      if (!p || p.position === 'K' || p.position === 'DEF') continue;
      const sleeperId = lg.platform === 'mfl' ? valueStore.crosswalkForMfl(pid)?.sleeper_id ?? null : pid.includes(':') ? null : pid;
      const bp = (sleeperId && board.bySleeper.get(sleeperId)) || (lg.platform === 'mfl' ? board.byMfl.get(pid) : undefined);
      const value = bp?.value ?? 0;
      total += value;
      const key = sleeperId ?? `${lg.platform}:${pid}`;
      const h =
        holdings.get(key) ??
        ({ key, name: bp?.name ?? p.name, position: p.position, nfl_team: bp?.team ?? p.team ?? null, age: bp?.age ?? p.age ?? null, count: 0, value: 0, avg_value: 0, in: [] } as PortfolioHolding);
      h.count++;
      h.value += value;
      h.in.push({ league: i, value, starter: team.starters.includes(pid), designation: team.designations[pid] ?? null });
      holdings.set(key, h);
    }
    leagues.push({
      platform: lg.platform,
      league_id: lg.league_id,
      name: lg.name,
      team_name: team.name,
      format: lg.settings.format ?? 'dynasty',
      superflex: !!lg.settings.superflex,
      teams: lg.settings.league_size,
      ok: true,
      value: Math.round(total),
      players: team.player_ids.length,
    });
  }

  const list = [...holdings.values()].map((h) => ({ ...h, value: Math.round(h.value), avg_value: Math.round(h.value / Math.max(1, h.count)) }));
  list.sort((a, b) => b.value - a.value);
  const total_value = list.reduce((s, h) => s + h.value, 0);
  const by_position: Portfolio['by_position'] = {};
  for (const h of list) {
    const b = (by_position[h.position] ??= { value: 0, share: 0, players: 0 });
    b.value += h.value;
    b.players++;
  }
  for (const b of Object.values(by_position)) b.share = total_value ? Math.round((b.value / total_value) * 1000) / 1000 : 0;
  const aged = list.filter((h) => h.age != null);
  const agedValue = aged.reduce((s, h) => s + h.value, 0);
  return {
    leagues,
    holdings: list,
    total_value,
    by_position,
    value_weighted_age: agedValue ? Math.round((aged.reduce((s, h) => s + h.value * (h.age as number), 0) / agedValue) * 10) / 10 : null,
    value_age_28_plus: total_value ? Math.round((aged.filter((h) => (h.age as number) >= 28).reduce((s, h) => s + h.value, 0) / total_value) * 1000) / 1000 : 0,
    top5_share: total_value ? Math.round((list.slice(0, 5).reduce((s, h) => s + h.value, 0) / total_value) * 1000) / 1000 : 0,
  };
}
