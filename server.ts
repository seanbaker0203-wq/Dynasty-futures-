/**
 * Dynasty Futures — Express server.
 * API routes live here; league adapters, values and evaluation live in ./server.
 * In development Vite is mounted as middleware; in production the built app is served from /dist.
 */
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { valueStore } from './server/values';
import { playerDirectory } from './server/players';
import { fetchSleeperLeague } from './server/leagues/sleeper';
import { fetchMflLeague } from './server/leagues/mfl';
import { LeagueSyncError } from './server/leagues/types';
import { evaluateLeague } from './server/evaluate';
import { aiTradeRouter } from './server/aiTrade';
import { SEASON } from './src/lib/season';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    res.json(evaluateLeague(league, franchise_id));
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
    res.json(evaluateLeague(league, franchise_id));
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
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.resolve(__dirname, 'dist', 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Dynasty Futures running on http://localhost:${PORT}`));
}

start();
