/**
 * Backfill past seasons' trades for leagues we already know, by following each league's previous_league_id.
 * Used for the class-strength study (how the market priced each draft class over time). Same output format as
 * crawl-sleeper.ts; trades and league format only, no usernames.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/collect/backfill-history.ts <known leagues .ndjson(.gz)> <out.ndjson> [leagues=900] [hops=2]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fetchJson } from '../../server/http';
import { leagueFormat, parseTrades, type CollectedTrade } from '../../server/collect/sleeperCrawler';

const API = 'https://api.sleeper.app/v1';
const [src, out, nArg, hopsArg] = process.argv.slice(2);
const N = Number(nArg) || 900;
const HOPS = Number(hopsArg) || 2;
const raw = fs.readFileSync(src);
const lines = (src.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString().split('\n').filter(Boolean);
// Spread the sample across the file (leagues were found in snowball order).
const all = lines.map((l) => JSON.parse(l).league_id as string);
const step = Math.max(1, Math.floor(all.length / N));
const sample = all.filter((_, i) => i % step === 0).slice(0, N);

// ~12 requests/second keeps us well under Sleeper's 1,000/minute guidance.
let last = 0;
async function get<T>(path: string): Promise<T | null> {
  const wait = Math.max(0, last + 85 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  return fetchJson<T>(`${API}${path}`, { timeoutMs: 15000 }).catch(() => null);
}

const ws = fs.createWriteStream(out, { flags: 'a' });
let trades = 0;
let seasons = 0;
for (const [i, id0] of sample.entries()) {
  let lg = await get<any>(`/league/${id0}`);
  for (let h = 0; h < HOPS && lg?.previous_league_id && lg.previous_league_id !== '0'; h++) {
    const prev = await get<any>(`/league/${lg.previous_league_id}`);
    if (!prev || prev.settings?.type !== 2) break;
    const format = leagueFormat(prev);
    const found: CollectedTrade[] = [];
    for (let w = 0; w <= 18; w++) found.push(...parseTrades(await get<any[]>(`/league/${prev.league_id}/transactions/${w}`), prev.league_id, Number(prev.season), format));
    for (const t of found) ws.write(JSON.stringify(t) + '\n');
    trades += found.length;
    seasons++;
    lg = prev;
  }
  if (i % 50 === 0) console.log(`${i + 1}/${sample.length} leagues, ${seasons} past seasons, ${trades} trades`);
}
ws.end();
console.log(`done: ${seasons} past seasons, ${trades} trades`);
