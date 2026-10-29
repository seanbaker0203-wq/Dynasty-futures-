/**
 * Weekly projections from Sleeper (their projection feed, sourced from Rotowire), keyed by Sleeper player id.
 * Used for start/sit. Cached per week for 30 minutes.
 */
import { fetchJson } from '../http';
import { valueStore } from '../values';

export interface WeeklyProjection {
  pts_std: number;
  pts_half: number;
  pts_ppr: number;
  rec: number;
  opponent: string | null;
  team: string | null;
  injury_status: string | null;
  game_date: string | null;
  name: string;
  position: string;
}

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const cache = new Map<string, { at: number; data: Map<string, WeeklyProjection> }>();

export async function nflState(): Promise<{ season: number; week: number; season_type: string }> {
  const s = await fetchJson<any>('https://api.sleeper.app/v1/state/nfl');
  return { season: Number(s.season), week: Number(s.display_week || s.week) || 1, season_type: String(s.season_type || 'regular') };
}

export async function weeklyProjections(season: number, week: number): Promise<Map<string, WeeklyProjection>> {
  const key = `${season}-${week}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;
  const qs = POSITIONS.map((p) => `position%5B%5D=${p}`).join('&');
  const rows = await fetchJson<any[]>(`https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&${qs}`);
  const data = new Map<string, WeeklyProjection>();
  for (const r of rows || []) {
    const s = r?.stats || {};
    data.set(String(r.player_id), {
      pts_std: Number(s.pts_std) || 0,
      pts_half: Number(s.pts_half_ppr) || 0,
      pts_ppr: Number(s.pts_ppr) || 0,
      rec: Number(s.rec) || 0,
      opponent: r.opponent ?? null,
      team: r.team ?? null,
      injury_status: r.player?.injury_status ?? null,
      game_date: r.date ?? null,
      name: r.player ? `${r.player.first_name ?? ''} ${r.player.last_name ?? ''}`.trim() : String(r.player_id),
      position: r.player?.position ?? '',
    });
  }
  cache.set(key, { at: Date.now(), data });
  return data;
}

// MFL team codes → Sleeper's (defenses are keyed by team abbreviation on Sleeper).
const TEAM_FIX: Record<string, string> = { JAC: 'JAX', KCC: 'KC', GBP: 'GB', NEP: 'NE', NOS: 'NO', SFO: 'SF', TBB: 'TB', LVR: 'LV', OAK: 'LV', SDC: 'LAC', STL: 'LAR', WSH: 'WAS' };

/** Any platform's NFL team code -> Sleeper's (e.g. JAC -> JAX, WSH -> WAS). */
export const sleeperTeam = (code: string | null | undefined) => {
  const t = String(code || '').toUpperCase();
  return t ? TEAM_FIX[t] || t : null;
};

/** The Sleeper id for one of our players (MFL ids go through the DynastyProcess crosswalk). */
export function sleeperIdFor(platform: string, p: { id: string; position: string; team?: string | null }): string | null {
  if (p.position === 'DEF') {
    const t = String(p.team || '').toUpperCase();
    return t ? TEAM_FIX[t] || t : null;
  }
  if (platform === 'sleeper') return p.id;
  return valueStore.crosswalkForMfl(p.id)?.sleeper_id || null;
}
