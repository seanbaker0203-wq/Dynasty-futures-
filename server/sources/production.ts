/**
 * On-field production from Sleeper's public season stats: games played and fantasy points
 * per game at standard / half / full PPR. Current and previous season, refreshed every 12 hours.
 */
import { fetchJson } from '../http';
import { getSeasonContext } from '../../src/lib/season';

export interface SeasonLine {
  gp: number;
  pts_std: number;
  pts_half: number;
  pts_ppr: number;
  rec: number;
}

const TTL = 12 * 60 * 60 * 1000;
const seasons = new Map<number, { at: number; data: Map<string, SeasonLine> }>();

async function loadSeason(year: number): Promise<Map<string, SeasonLine>> {
  const hit = seasons.get(year);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    const raw = await fetchJson<Record<string, any>>(`https://api.sleeper.app/v1/stats/nfl/regular/${year}`, { timeoutMs: 30000 });
    const data = new Map<string, SeasonLine>();
    for (const [id, s] of Object.entries(raw || {})) {
      const gp = Number(s?.gp) || 0;
      if (!gp) continue;
      data.set(id, {
        gp,
        pts_std: Number(s.pts_std) || 0,
        pts_half: Number(s.pts_half_ppr) || 0,
        pts_ppr: Number(s.pts_ppr) || 0,
        rec: Number(s.rec) || 0,
      });
    }
    seasons.set(year, { at: Date.now(), data });
    return data;
  } catch (err: any) {
    console.warn(`[production] Sleeper stats ${year} failed:`, err.message);
    return hit?.data ?? new Map();
  }
}

export async function getProduction() {
  const { seasonYear } = getSeasonContext();
  const [current, previous] = await Promise.all([loadSeason(seasonYear), loadSeason(seasonYear - 1)]);
  return { seasonYear, current, previous };
}

/** Fantasy points for a season line under the league's scoring. */
export function pointsFor(line: SeasonLine, ppr: number, tePremium = 0): number {
  const base = ppr >= 1 ? line.pts_ppr : ppr > 0 ? line.pts_half : line.pts_std;
  return base + tePremium * line.rec;
}
