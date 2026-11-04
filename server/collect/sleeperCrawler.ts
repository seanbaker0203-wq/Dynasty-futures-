/**
 * Collects real dynasty trades from public Sleeper leagues, to build our own trade-based market values.
 *
 * Sleeper's API is public and read-only ("free to use", no token; stay under 1000 calls a minute to avoid an IP block).
 * There is no league search, so we snowball: league → its members → their other leagues → … Only dynasty leagues
 * (settings.type 2) are kept. We store trades and league format only: no usernames, no display names, no rosters.
 */
import { fetchJson } from '../http';

const API = 'https://api.sleeper.app/v1';

export type TradeAsset = { kind: 'player'; id: string } | { kind: 'pick'; year: number; round: number };
export interface LeagueFormat {
  teams: number;
  superflex: boolean;
  ppr: number; // points per reception
  te_premium: number; // extra points per TE reception
  format_key: string; // e.g. "1qb-half-te0"
}
export interface CollectedTrade {
  platform: 'sleeper';
  league_id: string;
  trade_id: string;
  traded_at: string; // ISO
  season: number;
  format: LeagueFormat;
  sides: { roster_id: string; received: TradeAsset[] }[];
}

export function leagueFormat(lg: any): LeagueFormat {
  const pos: string[] = lg.roster_positions || [];
  const qbs = pos.filter((p) => p === 'QB').length;
  const superflex = qbs >= 2 || pos.includes('SUPER_FLEX');
  const ppr = Number(lg.scoring_settings?.rec ?? 0);
  const tep = Math.round(Number(lg.scoring_settings?.bonus_rec_te ?? 0) * 4) / 4; // nearest 0.25
  const pprKey = ppr >= 1 ? 'ppr' : ppr > 0 ? 'half' : 'std';
  return {
    teams: Number(lg.total_rosters) || 12,
    superflex,
    ppr,
    te_premium: tep,
    format_key: `${superflex ? 'sf' : '1qb'}-${pprKey}-te${tep}`,
  };
}

export interface KnownLeague {
  league_id: string;
  season: number;
  format: LeagueFormat;
}

/** Two-team completed trades from one week's transactions. */
export function parseTrades(txs: any[] | null, leagueId: string, season: number, format: LeagueFormat): CollectedTrade[] {
  const out: CollectedTrade[] = [];
  for (const t of txs || []) {
    if (t?.type !== 'trade' || t.status !== 'complete') continue;
    const sides = new Map<string, TradeAsset[]>();
    for (const rid of t.roster_ids || []) sides.set(String(rid), []);
    for (const [pid, rid] of Object.entries<any>(t.adds || {})) sides.get(String(rid))?.push({ kind: 'player', id: String(pid) });
    for (const pk of t.draft_picks || []) sides.get(String(pk.owner_id))?.push({ kind: 'pick', year: Number(pk.season), round: Number(pk.round) });
    if (sides.size !== 2 || [...sides.values()].some((x) => !x.length)) continue; // two-team trades with something each way
    out.push({
      platform: 'sleeper',
      league_id: leagueId,
      trade_id: String(t.transaction_id),
      traded_at: new Date(Number(t.status_updated || t.created)).toISOString(),
      season,
      format,
      sides: [...sides.entries()].map(([roster_id, received]) => ({ roster_id, received })),
    });
  }
  return out;
}

/** Re-read recent weeks of leagues we already know, for new trades. */
export async function refreshLeagues(
  leagues: KnownLeague[],
  weeks: number[],
  opts: { perMinute?: number; concurrency?: number; deadline?: number; onTrades: (t: CollectedTrade[]) => void | Promise<void> }
): Promise<{ calls: number; leagues: number; trades: number }> {
  const limiter = new Limiter(opts.perMinute ?? 400);
  const stats = { calls: 0, leagues: 0, trades: 0 };
  const queue = [...leagues];
  await Promise.all(
    Array.from({ length: opts.concurrency ?? 6 }, async () => {
      for (let lg = queue.shift(); lg; lg = queue.shift()) {
        if (opts.deadline && Date.now() > opts.deadline) return;
        const found: CollectedTrade[] = [];
        for (const w of weeks) {
          await limiter.wait();
          stats.calls++;
          const txs = await fetchJson<any[]>(`${API}/league/${lg.league_id}/transactions/${w}`, { timeoutMs: 15000 }).catch(() => null);
          found.push(...parseTrades(txs, lg.league_id, lg.season, lg.format));
        }
        stats.leagues++;
        stats.trades += found.length;
        if (found.length) await opts.onTrades(found);
      }
    })
  );
  return stats;
}

/** Simple rate limiter: at most `perMinute` calls, spread evenly. */
class Limiter {
  private next = 0;
  constructor(private perMinute: number) {}
  async wait() {
    const gap = 60_000 / this.perMinute;
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + gap;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

export interface CrawlOptions {
  season: number; // league season to collect, e.g. 2026
  maxWeek: number; // last transaction week to read (0 = offseason/preseason leg)
  perMinute?: number; // default 400, well under Sleeper's 1000
  concurrency?: number; // default 6
  maxLeagues?: number; // stop after this many dynasty leagues
  deadline?: number; // ms timestamp to stop
  seedLeagues?: string[];
  seenLeagues?: Set<string>; // leagues already collected (skip)
  onTrades?: (trades: CollectedTrade[], league_id: string) => void | Promise<void>;
  /** Called for every dynasty league found (even with no trades), so it can be re-checked later. */
  onLeague?: (league: KnownLeague) => void | Promise<void>;
  onProgress?: (s: CrawlStats) => void;
}
export interface CrawlStats {
  calls: number;
  users_seen: number;
  leagues_seen: number;
  dynasty_leagues: number;
  trades: number;
  started: number;
}

export async function crawlSleeper(opts: CrawlOptions): Promise<CrawlStats> {
  const limiter = new Limiter(opts.perMinute ?? 400);
  const stats: CrawlStats = { calls: 0, users_seen: 0, leagues_seen: 0, dynasty_leagues: 0, trades: 0, started: Date.now() };
  const get = async <T>(path: string): Promise<T | null> => {
    await limiter.wait();
    stats.calls++;
    return fetchJson<T>(`${API}${path}`, { timeoutMs: 15000 }).catch(() => null);
  };

  const seenUsers = new Set<string>();
  const seenLeagues = new Set<string>(opts.seenLeagues ?? []);
  const userQueue: string[] = [];
  const leagueQueue: any[] = [];

  // Seed: leagues' members.
  for (const id of opts.seedLeagues ?? []) {
    const users = await get<any[]>(`/league/${id}/users`);
    for (const u of users || []) if (u?.user_id && !seenUsers.has(u.user_id)) (seenUsers.add(u.user_id), userQueue.push(u.user_id));
  }

  const done = () =>
    (opts.maxLeagues != null && stats.dynasty_leagues >= opts.maxLeagues) || (opts.deadline != null && Date.now() > opts.deadline);

  const processLeague = async (lg: any) => {
    const id = String(lg.league_id);
    const format = leagueFormat(lg);
    stats.dynasty_leagues++;
    // Members → more users to explore.
    const users = await get<any[]>(`/league/${id}/users`);
    for (const u of users || []) if (u?.user_id && !seenUsers.has(u.user_id)) (seenUsers.add(u.user_id), userQueue.push(u.user_id));
    await opts.onLeague?.({ league_id: id, season: Number(lg.season), format });
    // Trades, week by week (offseason trades sit in week 1).
    const trades: CollectedTrade[] = [];
    for (let w = 1; w <= opts.maxWeek; w++) trades.push(...parseTrades(await get<any[]>(`/league/${id}/transactions/${w}`), id, Number(lg.season), format));
    stats.trades += trades.length;
    if (trades.length) await opts.onTrades?.(trades, id);
  };

  const workers = Array.from({ length: opts.concurrency ?? 6 }, async () => {
    while (!done()) {
      const lg = leagueQueue.shift();
      if (lg) {
        await processLeague(lg);
        opts.onProgress?.(stats);
        continue;
      }
      const uid = userQueue.shift();
      if (!uid) {
        if (!leagueQueue.length && !userQueue.length) {
          await new Promise((r) => setTimeout(r, 500));
          if (!leagueQueue.length && !userQueue.length) return;
        }
        continue;
      }
      stats.users_seen++;
      const leagues = await get<any[]>(`/user/${uid}/leagues/nfl/${opts.season}`);
      for (const l of leagues || []) {
        const id = String(l?.league_id || '');
        if (!id || seenLeagues.has(id)) continue;
        seenLeagues.add(id);
        stats.leagues_seen++;
        if (Number(l.settings?.type) === 2) leagueQueue.push(l);
      }
    }
  });
  await Promise.all(workers);
  return stats;
}
