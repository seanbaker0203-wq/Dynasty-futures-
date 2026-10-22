/**
 * League trade history (last three seasons) from Sleeper or MFL, normalised to two-sided trades.
 */
import { fetchJson } from '../http';
import { getSeasonContext } from '../../src/lib/season';
import type { NormalizedLeague } from './types';

export type TradeAsset =
  | { kind: 'player'; id: string }
  | { kind: 'pick'; year: number; round: number; original_team_id: string | null };

export interface RawTrade {
  id: string;
  timestamp: number; // ms
  season: number;
  sides: { team_id: string; received: TradeAsset[] }[];
}

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** MFL: FP_<origFranchise>_<year>_<round> future picks, DP_<round>_<pick> current-draft picks, else player ids. */
function parseMflAssets(list: string, season: number): TradeAsset[] {
  return String(list || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((tok): TradeAsset => {
      const fp = tok.match(/^FP_(\d+)_(\d{4})_(\d+)$/);
      if (fp) return { kind: 'pick', original_team_id: fp[1], year: Number(fp[2]), round: Number(fp[3]) };
      const dp = tok.match(/^DP_(\d+)_(\d+)$/);
      if (dp) return { kind: 'pick', original_team_id: null, year: season, round: Number(dp[1]) + 1 };
      return { kind: 'player', id: tok };
    });
}

export async function fetchMflTrades(leagueId: string, apiKey?: string): Promise<RawTrade[]> {
  const { seasonYear } = getSeasonContext();
  const years = [seasonYear - 2, seasonYear - 1, seasonYear];
  const key = apiKey ? `&APIKEY=${encodeURIComponent(apiKey)}` : '';
  const results = await Promise.all(
    years.map((y) =>
      fetchJson<any>(`https://api.myfantasyleague.com/${y}/export?TYPE=transactions&L=${leagueId}&TRANS_TYPE=TRADE${key}&JSON=1`).catch(() => null)
    )
  );
  const trades: RawTrade[] = [];
  results.forEach((res, i) => {
    for (const t of asArray<any>(res?.transactions?.transaction)) {
      if (t?.type !== 'TRADE') continue;
      const ts = Number(t.timestamp) * 1000;
      // franchise gave up franchise1_gave_up, so franchise2 received it (and vice versa).
      trades.push({
        id: `mfl-${t.timestamp}-${t.franchise}-${t.franchise2}`,
        timestamp: ts,
        season: years[i],
        sides: [
          { team_id: String(t.franchise), received: parseMflAssets(t.franchise2_gave_up, years[i]) },
          { team_id: String(t.franchise2), received: parseMflAssets(t.franchise1_gave_up, years[i]) },
        ],
      });
    }
  });
  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

export async function fetchSleeperTrades(leagueId: string): Promise<RawTrade[]> {
  // This season plus up to two previous seasons via previous_league_id. Roster ids are stable across seasons.
  const leagues: { id: string; season: number }[] = [];
  let id: string | null = leagueId;
  for (let i = 0; i < 3 && id; i++) {
    const lg: any = await fetchJson<any>(`https://api.sleeper.app/v1/league/${id}`).catch(() => null);
    if (!lg) break;
    leagues.push({ id, season: Number(lg.season) });
    id = lg.previous_league_id && lg.previous_league_id !== '0' ? String(lg.previous_league_id) : null;
  }
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const trades: RawTrade[] = [];
  await Promise.all(
    leagues.flatMap((lg) =>
      weeks.map(async (w) => {
        const txs = await fetchJson<any[]>(`https://api.sleeper.app/v1/league/${lg.id}/transactions/${w}`).catch(() => []);
        for (const t of txs || []) {
          if (t?.type !== 'trade' || t.status !== 'complete') continue;
          const sides = new Map<string, TradeAsset[]>();
          for (const rid of t.roster_ids || []) sides.set(String(rid), []);
          for (const [pid, rid] of Object.entries<any>(t.adds || {})) sides.get(String(rid))?.push({ kind: 'player', id: pid });
          for (const pk of t.draft_picks || [])
            sides.get(String(pk.owner_id))?.push({ kind: 'pick', year: Number(pk.season), round: Number(pk.round), original_team_id: String(pk.roster_id) });
          if (sides.size !== 2) continue; // skip three-way trades for now
          trades.push({
            id: `slp-${t.transaction_id}`,
            timestamp: Number(t.status_updated || t.created),
            season: lg.season,
            sides: [...sides.entries()].map(([team_id, received]) => ({ team_id, received })),
          });
        }
      })
    )
  );
  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

export async function fetchTrades(league: NormalizedLeague, auth: { apiKey?: string } = {}): Promise<RawTrade[]> {
  return league.platform === 'mfl' ? fetchMflTrades(league.league_id, auth.apiKey) : fetchSleeperTrades(league.league_id);
}

/** Names for MFL player ids that are no longer in our value pool (retired, cut, etc.). */
export async function fetchMflNames(ids: string[]): Promise<Map<string, { name: string; position: string }>> {
  const out = new Map<string, { name: string; position: string }>();
  const { seasonYear } = getSeasonContext();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).join(',');
    const res = await fetchJson<any>(`https://api.myfantasyleague.com/${seasonYear}/export?TYPE=players&PLAYERS=${chunk}&JSON=1`).catch(() => null);
    for (const p of asArray<any>(res?.players?.player)) {
      const [last, first] = String(p.name || '').split(', ');
      out.set(String(p.id), { name: first ? `${first} ${last}` : last, position: String(p.position || '') });
    }
  }
  return out;
}
