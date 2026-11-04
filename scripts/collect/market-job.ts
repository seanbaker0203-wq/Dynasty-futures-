/**
 * Daily market-data job (run by .github/workflows/market-data.yml; works locally too).
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/collect/market-job.ts <state dir> [discover minutes] [refresh minutes]
 *
 * State (kept between runs in the GitHub Actions cache, never committed):
 *   leagues.ndjson   dynasty leagues found so far, with format
 *   trades.ndjson    every trade collected, one per line (pruned to the last 400 days)
 * Steps: 1) re-read the last two weeks of every known league for new trades; 2) find more leagues for a while.
 * The workflow then runs scripts/analysis/build_market_data.py to refresh data/trade-values.json and
 * data/market-trades.json.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { crawlSleeper, refreshLeagues, type CollectedTrade, type KnownLeague } from '../../server/collect/sleeperCrawler';
import { fetchJson } from '../../server/http';

const dir = process.argv[2] || 'market-state';
const discoverMin = Number(process.argv[3] || 10);
const refreshMin = Number(process.argv[4] || 25);
const PER_MINUTE = Number(process.env.PER_MINUTE || 600); // Sleeper asks for under 1000 a minute
fs.mkdirSync(dir, { recursive: true });
const leaguesFile = path.join(dir, 'leagues.ndjson');
const tradesFile = path.join(dir, 'trades.ndjson');

// First run (empty Actions cache): start from the collection committed in data/market-seed.
for (const [name, file] of [['seed_trades.ndjson.gz', tradesFile], ['seed_leagues.ndjson.gz', leaguesFile]] as const) {
  const seed = path.resolve('data/market-seed', name);
  if (!fs.existsSync(file) && fs.existsSync(seed)) {
    fs.writeFileSync(file, zlib.gunzipSync(fs.readFileSync(seed)));
    console.log(`seeded ${path.basename(file)} from ${name}`);
  }
}

const readLines = <T>(f: string): T[] =>
  fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T) : [];

(async () => {
  const state = await fetchJson<any>('https://api.sleeper.app/v1/state/nfl');
  const season = Number(state.league_season || state.season);
  const week = Math.max(1, Number(state.leg || state.week) || 1);

  const leagues = new Map<string, KnownLeague>();
  for (const l of readLines<KnownLeague>(leaguesFile)) leagues.set(l.league_id, l);
  const tradeIds = new Set<string>();
  const cutoff = Date.now() - 400 * 86400_000;
  const kept = readLines<CollectedTrade>(tradesFile).filter((t) => Date.parse(t.traded_at) >= cutoff);
  for (const t of kept) tradeIds.add(`${t.league_id}:${t.trade_id}`);
  fs.writeFileSync(tradesFile, kept.map((t) => JSON.stringify(t)).join('\n') + (kept.length ? '\n' : ''));
  console.log(`season ${season} week ${week}: ${leagues.size} known leagues, ${kept.length} trades on file`);

  let added = 0;
  const save = (ts: CollectedTrade[]) => {
    const fresh = ts.filter((t) => !tradeIds.has(`${t.league_id}:${t.trade_id}`));
    for (const t of fresh) tradeIds.add(`${t.league_id}:${t.trade_id}`);
    if (fresh.length) fs.appendFileSync(tradesFile, fresh.map((t) => JSON.stringify(t)).join('\n') + '\n');
    added += fresh.length;
  };

  // 1) New trades in leagues we already know (this season's leagues only; last season's ids change at rollover).
  const current = [...leagues.values()].filter((l) => l.season === season);
  const weeks = [...new Set([Math.max(1, week - 1), week])];
  const r = await refreshLeagues(current, weeks, { perMinute: PER_MINUTE, deadline: Date.now() + refreshMin * 60_000, onTrades: save });
  console.log(`refresh: ${r.leagues}/${current.length} leagues, ${r.calls} calls, ${added} new trades`);

  // 2) Discover more leagues, starting from leagues we know (or Sleeper's documented example league).
  const before = added;
  const seeds = current.length ? current.sort(() => Math.random() - 0.5).slice(0, 20).map((l) => l.league_id) : ['289646328504385536'];
  const d = await crawlSleeper({
    season,
    maxWeek: week,
    perMinute: PER_MINUTE,
    deadline: Date.now() + discoverMin * 60_000,
    seedLeagues: seeds,
    seenLeagues: new Set(leagues.keys()),
    onLeague: (l) => {
      if (!leagues.has(l.league_id)) {
        leagues.set(l.league_id, l);
        fs.appendFileSync(leaguesFile, JSON.stringify(l) + '\n');
      }
    },
    onTrades: (ts) => save(ts),
  });
  console.log(`discover: ${d.dynasty_leagues} new dynasty leagues, ${d.calls} calls, ${added - before} new trades`);
  console.log(`total: ${leagues.size} leagues, ${tradeIds.size} trades`);
})();
