/**
 * Collect Sleeper dynasty trades into an NDJSON file (one trade per line).
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/collect/crawl-sleeper.ts <out.ndjson> [minutes] [maxWeek]
 * Resumes: league ids already in the file are skipped.
 */
import fs from 'fs';
import { crawlSleeper } from '../../server/collect/sleeperCrawler';

const out = process.argv[2] || 'trades.ndjson';
const minutes = Number(process.argv[3] || 10);
const maxWeek = Number(process.argv[4] || 18);
const seen = new Set<string>();
if (fs.existsSync(out)) for (const line of fs.readFileSync(out, 'utf8').split('\n')) if (line) seen.add(JSON.parse(line).league_id);
const seeds = (process.env.SEED_LEAGUES || '289646328504385536').split(',');
const t0 = Date.now();
crawlSleeper({
  season: Number(process.env.SEASON || 2026),
  maxWeek,
  perMinute: Number(process.env.PER_MINUTE || 400),
  deadline: t0 + minutes * 60_000,
  seedLeagues: seeds,
  seenLeagues: seen,
  onTrades: (trades) => fs.appendFileSync(out, trades.map((t) => JSON.stringify(t)).join('\n') + '\n'),
  onProgress: (s) => {
    if (s.dynasty_leagues % 25 === 0)
      console.log(`${((Date.now() - t0) / 60000).toFixed(1)} min · calls ${s.calls} · users ${s.users_seen} · leagues ${s.leagues_seen} · dynasty ${s.dynasty_leagues} · trades ${s.trades}`);
  },
}).then((s) => console.log('done', JSON.stringify(s)));
