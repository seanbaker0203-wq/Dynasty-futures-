/**
 * Dynasty Futures — Express server.
 * API routes live here; league adapters, values and evaluation live in ./server.
 * In development Vite is mounted as middleware; in production the built app is served from /dist.
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { valueStore } from './server/values';
import { playerDirectory } from './server/players';
import { fetchSleeperLeague } from './server/leagues/sleeper';
import { fetchMflLeague } from './server/leagues/mfl';
import { LeagueSyncError } from './server/leagues/types';
import { evaluateLeague } from './server/evaluate';
import { getBoard, WEIGHTS } from './server/model/futures';
import { aiTradeRouter } from './server/aiTrade';
import { fetchMflNames, fetchTrades } from './server/leagues/history';
import { buildHistory } from './server/model/managers';
import type { NormalizedLeague } from './server/leagues/types';
import { SEASON } from './src/lib/season';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '1mb' }));

valueStore.startAutoRefresh();
playerDirectory.startAutoRefresh();

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    season: SEASON,
    values: valueStore.meta,
    sleeper_directory_players: playerDirectory.size,
  });
});

/** Futures Value board for a league format: our rankings with market, experts, model, trends and projections. */
app.post(
  '/api/values/board',
  asyncRoute(async (req, res) => {
    const s = req.body?.settings;
    if (!s?.slots) throw new LeagueSyncError('League settings are required.');
    const board = await getBoard(s);
    res.json({
      built_at: board.built_at,
      season: board.season,
      weights: WEIGHTS,
      sources: board.sources,
      thresholds: board.thresholds,
      players: board.players,
    });
  })
);

/** Pick values on the league's scale, for the trade builder. */
app.get('/api/values/pick', (req, res) => {
  const year = Number(req.query.year) || SEASON.upcomingDraftYear;
  const round = Number(req.query.round) || 1;
  const tier = (['Early', 'Mid', 'Late'].includes(String(req.query.tier)) ? req.query.tier : 'Mid') as 'Early' | 'Mid' | 'Late';
  const superflex = req.query.superflex === 'true' || req.query.superflex === '1';
  res.json({ year, round, tier, superflex, value: valueStore.pickValue(year, round, superflex, tier) });
});

app.post(
  ['/api/sync/sleeper', '/sync/sleeper'],
  asyncRoute(async (req, res) => {
    const { league_id, username, franchise_id } = req.body || {};
    if (!league_id) throw new LeagueSyncError('Enter your Sleeper league ID.');
    const league = await fetchSleeperLeague(String(league_id), username);
    rememberLeague(league);
    res.json(await evaluateLeague(league, franchise_id));
  })
);

app.post(
  ['/api/sync/mfl', '/sync/mfl'],
  asyncRoute(async (req, res) => {
    const { league_id, franchise_id, mfl_api_key, username, password, year } = req.body || {};
    if (!league_id) throw new LeagueSyncError('Enter your MFL league ID.');
    const league = await fetchMflLeague(String(league_id), {
      franchiseId: franchise_id,
      apiKey: mfl_api_key,
      username,
      password,
      year: year ? Number(year) : undefined,
    });
    rememberLeague(league);
    res.json(await evaluateLeague(league, franchise_id));
  })
);

// Leagues synced recently, so the (slower) trade-history call doesn't have to log in again.
const recentLeagues = new Map<string, { league: NormalizedLeague; at: number }>();
function rememberLeague(league: NormalizedLeague) {
  recentLeagues.set(`${league.platform}:${league.league_id}`, { league, at: Date.now() });
  for (const [k, v] of recentLeagues) if (Date.now() - v.at > 2 * 3600_000) recentLeagues.delete(k);
}
const historyCache = new Map<string, { at: number; data: unknown }>();

app.post(
  '/api/league/history',
  asyncRoute(async (req, res) => {
    const { platform, league_id, mfl_api_key } = req.body || {};
    if (!league_id || !['sleeper', 'mfl'].includes(platform)) throw new LeagueSyncError('Sync your league first.');
    const key = `${platform}:${league_id}`;
    const hit = historyCache.get(key);
    if (hit && Date.now() - hit.at < 30 * 60_000) return void res.json(hit.data);
    let league = recentLeagues.get(key)?.league;
    if (!league) {
      league =
        platform === 'sleeper'
          ? await fetchSleeperLeague(String(league_id))
          : await fetchMflLeague(String(league_id), { apiKey: mfl_api_key });
      rememberLeague(league);
    }
    const [raw, board] = await Promise.all([fetchTrades(league, { apiKey: mfl_api_key }), getBoard(league.settings)]);
    let names = new Map<string, { name: string; position: string }>();
    if (league.platform === 'mfl') {
      const missing = new Set<string>();
      for (const t of raw) for (const s of t.sides) for (const a of s.received)
        if (a.kind === 'player' && !board.byMfl.has(a.id) && !league.players.get(a.id)?.name) missing.add(a.id);
      names = await fetchMflNames([...missing]);
    }
    const data = buildHistory(raw, league, board, names);
    historyCache.set(key, { at: Date.now(), data });
    res.json(data);
  })
);

app.use(aiTradeRouter);

// JSON errors for API routes; never leak stack traces.
app.use(['/api', '/sync'], (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof LeagueSyncError ? err.status : 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err instanceof LeagueSyncError ? err.message : 'Something went wrong. Please try again.' });
});

async function start() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(process.cwd(), 'dist');
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Dynasty Futures running on http://localhost:${PORT}`));
}

start();
