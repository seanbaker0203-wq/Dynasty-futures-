/**
 * Trade-market values from FantasyCalc (built from real dynasty trades), tuned to the league's
 * format: number of QBs, league size and PPR. Cached per format for 6 hours.
 * https://fantasycalc.com — no published API terms; confirm before commercial use.
 */
import { fetchJson } from '../http';

export interface MarketEntry {
  name: string;
  position: string;
  sleeper_id: string | null;
  mfl_id: string | null;
  value: number;
  trend30: number; // absolute change in value over 30 days
  redraft_value: number | null; // this-season-only value
  rank: number;
}

export interface MarketSnapshot {
  key: string;
  fetched_at: number;
  players: MarketEntry[];
  picks: MarketEntry[];
  bySleeper: Map<string, MarketEntry>;
  byMfl: Map<string, MarketEntry>;
}

const TTL = 6 * 60 * 60 * 1000;
const cache = new Map<string, MarketSnapshot>();
const inflight = new Map<string, Promise<MarketSnapshot | null>>();

export interface MarketFormat {
  superflex: boolean;
  teams: number;
  ppr: number; // 0, 0.5, 1
  /** false = redraft (this-season) values; default dynasty */
  dynasty?: boolean;
}

export const formatKey = (f: MarketFormat) => `${f.dynasty === false ? 'rd-' : ''}${f.superflex ? 2 : 1}qb-${f.teams}t-${f.ppr}ppr`;

export async function getMarket(f: MarketFormat): Promise<MarketSnapshot | null> {
  const teams = Math.min(16, Math.max(8, Math.round(f.teams || 12)));
  const ppr = f.ppr >= 1 ? 1 : f.ppr > 0 ? 0.5 : 0;
  const key = formatKey({ superflex: f.superflex, teams, ppr, dynasty: f.dynasty });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetched_at < TTL) return hit;
  if (inflight.has(key)) return inflight.get(key)!;

  const p = (async () => {
    try {
      const url = `https://api.fantasycalc.com/values/current?isDynasty=${f.dynasty === false ? 'false' : 'true'}&numQbs=${f.superflex ? 2 : 1}&numTeams=${teams}&ppr=${ppr}`;
      const rows = await fetchJson<any[]>(url, { timeoutMs: 20000 });
      const entries: MarketEntry[] = rows.map((r) => ({
        name: r.player?.name ?? '',
        position: r.player?.position ?? '',
        sleeper_id: r.player?.sleeperId ? String(r.player.sleeperId) : null,
        mfl_id: r.player?.mflId ? String(r.player.mflId) : null,
        value: Number(r.value) || 0,
        trend30: Number(r.trend30Day) || 0,
        redraft_value: r.redraftValue != null ? Number(r.redraftValue) : null,
        rank: Number(r.overallRank) || 0,
      }));
      const players = entries.filter((e) => e.position !== 'PICK');
      const snap: MarketSnapshot = {
        key,
        fetched_at: Date.now(),
        players,
        picks: entries.filter((e) => e.position === 'PICK'),
        bySleeper: new Map(players.filter((e) => e.sleeper_id).map((e) => [e.sleeper_id!, e])),
        byMfl: new Map(players.filter((e) => e.mfl_id).map((e) => [e.mfl_id!, e])),
      };
      cache.set(key, snap);
      return snap;
    } catch (err: any) {
      console.warn(`[market] FantasyCalc fetch failed for ${key}:`, err.message);
      return hit ?? null; // stale beats nothing
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
