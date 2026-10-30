/**
 * Dynasty Futures — Express server.
 * API routes live here; league adapters, values and evaluation live in ./server.
 * In development Vite is mounted as middleware; in production the built app is served from /dist.
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'node:crypto';
import { valueStore } from './server/values';
import { playerDirectory } from './server/players';
import { fetchSleeperLeague } from './server/leagues/sleeper';
import { fetchMflLeague } from './server/leagues/mfl';
import { fetchEspnLeague } from './server/leagues/espn';
import { fetchFleaflickerLeague } from './server/leagues/fleaflicker';
import { exchangeYahooCode, fetchYahooLeague, listYahooLeagues, openToken, sealToken, yahooAccessToken, yahooAuthUrl, yahooEnabled } from './server/leagues/yahoo';
import { LeagueSyncError } from './server/leagues/types';
import { evaluateLeague } from './server/evaluate';
import { getBoard, WEIGHTS } from './server/model/futures';
import { aiTradeRouter } from './server/aiTrade';
import { fetchMflNames, fetchTrades } from './server/leagues/history';
import { buildHistory } from './server/model/managers';
import { nflState, sleeperIdFor, weeklyProjections } from './server/sources/weekly';
import type { NormalizedLeague } from './server/leagues/types';
import { SEASON } from './src/lib/season';
import { accountsEnabled, identify, rateLimit } from './server/security';
import { findTrades } from './server/model/tradeFinder';
import { findPersonalIdeas } from './server/model/personalIdeas';
import { projectOutlook } from './server/model/outlook';
import { makeReference, type ImportedValues, type ReferenceSource } from './src/lib/referenceValues';
import type { FinderAsset } from './src/lib/assets';
import type { DraftPick, LeagueSettings, MasterPlayer, RosterEvaluationResult, ValueAdjustments } from './src/types';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1); // Render sits behind one proxy: use the real client IP for limits
app.use(express.json({ limit: '1mb' }));
app.use('/api', identify);
// Backstop for every API call, then tighter limits per route below.
app.use('/api', rateLimit('all', { anon: 600, user: 2000 }));

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

/** Public client config (Supabase URL + publishable key are safe to expose; the secret key never leaves the server). */
app.get('/api/config', (_req, res) => {
  res.json({
    supabase_url: process.env.SUPABASE_URL || null,
    supabase_anon_key: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || null,
  });
});

/** Futures Value board for a league format: our rankings with market, experts, model, trends and projections. */
app.post(
  '/api/values/board',
  rateLimit('board', { anon: 30, user: 150 }),
  asyncRoute(async (req, res) => {
    const s = req.body?.settings;
    if (!s?.slots) throw new LeagueSyncError('League settings are required.');
    const board = await getBoard(s);
    // Signed out (when accounts are on): the top of the board plus players in the league you synced, not the full list.
    let players = board.players;
    let limited = false;
    if (accountsEnabled() && !req.caller?.userId) {
      const lg = req.body?.league ? recentLeagues.get(`${req.body.league.platform}:${req.body.league.league_id}`)?.league : undefined;
      const inLeague = new Set(lg ? [...lg.players.keys()] : []);
      const idOf = (p: (typeof players)[number]) => (lg?.platform === 'mfl' ? p.mfl_id : p.sleeper_id);
      players = players.filter((p, i) => i < 150 || (lg && inLeague.has(String(idOf(p)))));
      limited = players.length < board.players.length;
    }
    res.json({
      limited,
      built_at: board.built_at,
      season: board.season,
      weights: WEIGHTS,
      sources: board.sources,
      thresholds: board.thresholds,
      players,
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
  rateLimit('sync', { anon: 20, user: 80 }),
  asyncRoute(async (req, res) => {
    const { league_id, username, franchise_id, format } = req.body || {};
    if (!league_id) throw new LeagueSyncError('Enter your Sleeper league ID.');
    const league = applyFormat(await fetchSleeperLeague(String(league_id), username), format);
    rememberLeague(league);
    warmHistory(league);
    res.json(rememberEval(league, await evaluateLeague(league, franchise_id)));
  })
);

app.post(
  ['/api/sync/mfl', '/sync/mfl'],
  rateLimit('sync', { anon: 20, user: 80 }),
  asyncRoute(async (req, res) => {
    const { league_id, franchise_id, mfl_api_key, username, password, year, format } = req.body || {};
    if (!league_id) throw new LeagueSyncError('Enter your MFL league ID.');
    const league = await fetchMflLeague(String(league_id), {
      franchiseId: franchise_id,
      apiKey: mfl_api_key,
      username,
      password,
      year: year ? Number(year) : undefined,
    });
    applyFormat(league, format);
    rememberLeague(league);
    warmHistory(league, mfl_api_key);
    res.json(rememberEval(league, await evaluateLeague(league, franchise_id)));
  })
);

const cookieOf = (req: Request, name: string) =>
  (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1] ?? null;
const YAHOO_COOKIE = 'df_yahoo';

/** Yahoo access token from the user's encrypted cookie (they signed in with Yahoo). */
async function yahooTokenFor(req: Request) {
  if (!yahooEnabled()) throw new LeagueSyncError('Yahoo isn’t set up on this server yet.', 503);
  const sealed = cookieOf(req, YAHOO_COOKIE);
  const refresh = sealed ? openToken(decodeURIComponent(sealed)) : null;
  if (!refresh) throw new LeagueSyncError('Sign in with Yahoo first.', 401);
  return yahooAccessToken(refresh);
}

/** Load a league from any supported platform. */
async function loadLeague(req: Request): Promise<NormalizedLeague> {
  const b = req.body || {};
  const platform = String(b.platform || req.params?.platform || '');
  const id = String(b.league_id || '');
  if (!id) throw new LeagueSyncError('Enter your league ID.');
  const season = Number(b.year) || SEASON.seasonYear;
  let league: NormalizedLeague;
  if (platform === 'sleeper') league = await fetchSleeperLeague(id, b.username);
  else if (platform === 'mfl')
    league = await fetchMflLeague(id, { franchiseId: b.franchise_id, apiKey: b.mfl_api_key, username: b.username, password: b.password, year: b.year ? Number(b.year) : undefined });
  else if (platform === 'espn') league = await fetchEspnLeague(id, { season, espn_s2: b.espn_s2, swid: b.swid, teamId: b.franchise_id });
  else if (platform === 'fleaflicker') league = await fetchFleaflickerLeague(id, { season, teamId: b.franchise_id });
  else if (platform === 'yahoo') league = await fetchYahooLeague(id, await yahooTokenFor(req), b.franchise_id);
  else throw new LeagueSyncError('Unknown platform.');
  return applyFormat(league, b.format);
}

/** Three seasons of league trades: report cards, manager profiles and how QBs trade (cached 30 min). */
async function buildLeagueHistory(league: NormalizedLeague, apiKey?: string) {
  const key = `${league.platform}:${league.league_id}`;
  const [raw, board] = await Promise.all([fetchTrades(league, { apiKey }), getBoard(league.settings)]);
  let names = new Map<string, { name: string; position: string }>();
  if (league.platform === 'mfl') {
    const missing = new Set<string>();
    for (const t of raw) for (const s of t.sides) for (const a of s.received)
      if (a.kind === 'player' && !board.byMfl.has(a.id) && !league.players.get(a.id)?.name) missing.add(a.id);
    names = await fetchMflNames([...missing]);
  }
  const data = buildHistory(raw, league, board, names);
  historyCache.set(key, { at: Date.now(), data });
  return data;
}

/** Build trade history in the background after a sync, so league-norm advice has it next time. */
function warmHistory(league: NormalizedLeague, apiKey?: string) {
  if (!['sleeper', 'mfl'].includes(league.platform)) return;
  const hit = historyCache.get(`${league.platform}:${league.league_id}`);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return;
  buildLeagueHistory(league, apiKey).catch((e) => console.warn('[history] warm failed:', e.message));
}

/** The user's choice of league type wins over what the platform says. */
function applyFormat(league: NormalizedLeague, format: unknown) {
  if (format === 'dynasty' || format === 'keeper' || format === 'redraft') {
    league.settings.format = format;
    league.settings.format_source = 'user';
    if (format === 'redraft') for (const t of league.teams) t.picks = [];
  }
  return league;
}

// Leagues synced recently, so the (slower) trade-history call doesn't have to log in again.
const recentLeagues = new Map<string, { league: NormalizedLeague; at: number }>();
function rememberLeague(league: NormalizedLeague) {
  recentLeagues.set(`${league.platform}:${league.league_id}`, { league, at: Date.now() });
  for (const [k, v] of recentLeagues) if (Date.now() - v.at > 2 * 3600_000) recentLeagues.delete(k);
}
import { historyCache } from './server/leagues/historyStore';

/** ESPN, Fleaflicker and Yahoo leagues. */
app.post(
  '/api/sync/:platform(espn|fleaflicker|yahoo)',
  rateLimit('sync', { anon: 20, user: 80 }),
  asyncRoute(async (req, res) => {
    const league = await loadLeague(req);
    rememberLeague(league);
    res.json(rememberEval(league, await evaluateLeague(league, req.body?.franchise_id)));
  })
);

// ---- Yahoo sign-in ---------------------------------------------------------------------------------------
const yahooRedirect = (req: Request) => `${req.protocol}://${req.get('host')}/api/auth/yahoo/callback`;
app.get('/api/auth/yahoo/start', (req, res) => {
  if (!yahooEnabled()) return void res.status(503).send('Yahoo isn’t set up on this server yet.');
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `df_yahoo_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  res.redirect(yahooAuthUrl(yahooRedirect(req), state));
});
app.get(
  '/api/auth/yahoo/callback',
  asyncRoute(async (req, res) => {
    const { code, state } = req.query as Record<string, string>;
    if (!code || !state || state !== cookieOf(req, 'df_yahoo_state')) return void res.redirect('/?yahoo=failed');
    const tok = await exchangeYahooCode(code, yahooRedirect(req));
    res.setHeader('Set-Cookie', [
      `${YAHOO_COOKIE}=${encodeURIComponent(sealToken(tok.refresh_token))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`,
      'df_yahoo_state=; Path=/; Max-Age=0',
    ]);
    res.redirect('/?yahoo=connected');
  })
);
app.get(
  '/api/yahoo/leagues',
  rateLimit('sync', { anon: 20, user: 80 }),
  asyncRoute(async (req, res) => {
    const leagues = await listYahooLeagues(await yahooTokenFor(req));
    res.json({ leagues });
  })
);
app.post('/api/auth/yahoo/disconnect', (_req, res) => {
  res.setHeader('Set-Cookie', `${YAHOO_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});
app.get('/api/yahoo/status', (req, res) => res.json({ enabled: yahooEnabled(), signed_in: !!cookieOf(req, YAHOO_COOKIE) }));

// Evaluations by league + team, so trade tools run on the server without the browser re-sending rosters.
const evalCache = new Map<string, { at: number; result: RosterEvaluationResult }>();
function rememberEval(league: NormalizedLeague, result: RosterEvaluationResult) {
  evalCache.set(`${league.platform}:${league.league_id}:${result.roster.franchise_id}`, { at: Date.now(), result });
  for (const [k, v] of evalCache) if (Date.now() - v.at > 3 * 3600_000) evalCache.delete(k);
  return result;
}
async function evaluationFor(req: Request): Promise<RosterEvaluationResult> {
  const { platform, league_id, franchise_id } = req.body || {};
  if (!league_id || !platform || !franchise_id) throw new LeagueSyncError('Sync your league first.');
  const hit = evalCache.get(`${platform}:${league_id}:${franchise_id}`);
  if (hit && Date.now() - hit.at < 3 * 3600_000) return hit.result;
  let league = recentLeagues.get(`${platform}:${league_id}`)?.league;
  if (!league) {
    league = await loadLeague(req);
    rememberLeague(league);
  }
  return rememberEval(league, await evaluateLeague(league, String(franchise_id)));
}

/** Assets by id ("player:123" / "pick:pick-2027-1-0004") for one team in an evaluation. */
function assetsOf(ev: RosterEvaluationResult, teamId: string): { players: MasterPlayer[]; picks: DraftPick[] } {
  if (teamId === ev.roster.franchise_id) return { players: ev.players, picks: ev.draft_picks || [] };
  const t = ev.league_teams?.find((x) => x.franchise_id === teamId);
  if (!t) throw new LeagueSyncError('That team isn’t in this league.');
  return { players: [...t.starters, ...t.bench, ...(t.reserves || [])], picks: t.draft_picks };
}
const pickAssets = (side: { players: MasterPlayer[]; picks: DraftPick[] }, ids: unknown): FinderAsset[] => {
  const want = new Set(Array.isArray(ids) ? ids.map(String) : []);
  return [
    ...side.players.filter((p) => want.has(`player:${p.id}`)).map((p) => ({ kind: 'player' as const, item: p })),
    ...side.picks.filter((p) => want.has(`pick:${p.id}`)).map((p) => ({ kind: 'pick' as const, item: p })),
  ];
};
function referenceFor(ev: RosterEvaluationResult, fair: any) {
  const source = fair?.source as ReferenceSource | undefined;
  if (!source || !['market', 'experts', 'imported'].includes(source)) return null;
  const players = new Map<string, MasterPlayer>();
  const picks: DraftPick[] = [...(ev.draft_picks || [])];
  for (const p of ev.players) players.set(p.id, p);
  for (const t of ev.league_teams || []) {
    for (const p of [...t.starters, ...t.bench, ...(t.reserves || [])]) players.set(p.id, p);
    picks.push(...t.draft_picks);
  }
  for (const p of ev.free_agents || []) if (!players.has(p.id)) players.set(p.id, p);
  return makeReference(source, (fair?.imported as ImportedValues) ?? null, { players: [...players.values()], picks });
}

app.post(
  '/api/league/history',
  rateLimit('history', { anon: 10, user: 40 }),
  asyncRoute(async (req, res) => {
    const { platform, league_id, mfl_api_key } = req.body || {};
    if (!league_id) throw new LeagueSyncError('Sync your league first.');
    // Trade history is available for Sleeper and MFL leagues so far.
    if (!['sleeper', 'mfl'].includes(platform)) return void res.json({ trades: [], profiles: [], seasons: [], unsupported: true });
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
    res.json(await buildLeagueHistory(league, mfl_api_key));
  })
);

/** This week's projected points for a roster, scored for the league (start/sit). */
app.post(
  '/api/projections/week',
  rateLimit('projections', { anon: 60, user: 240 }),
  asyncRoute(async (req, res) => {
    const { platform, players, week: reqWeek, scoring_type, te_premium } = req.body || {};
    if (!Array.isArray(players)) throw new LeagueSyncError('Players are required.');
    const state = await nflState();
    const week = Math.min(18, Math.max(1, Number(reqWeek) || state.week));
    const proj = await weeklyProjections(state.season, week);
    const recPts = /^ppr$/i.test(scoring_type || '') ? 1 : /half/i.test(scoring_type || '') ? 0.5 : 0;
    const out: Record<string, unknown> = {};
    for (const p of players.slice(0, 80)) {
      const sid = sleeperIdFor(String(platform), { id: String(p.id), position: String(p.position), team: p.team });
      const pr = sid ? proj.get(sid) : undefined;
      if (!pr) {
        out[p.id] = { points: null, opponent: null, injury_status: null, matched: !!sid };
        continue;
      }
      const tePts = te_premium && p.position === 'TE' ? 0.5 * pr.rec : 0;
      out[p.id] = {
        points: Math.round((pr.pts_std + recPts * pr.rec + tePts) * 10) / 10,
        opponent: pr.opponent,
        injury_status: pr.injury_status,
        game_date: pr.game_date,
        matched: true,
      };
    }
    res.json({ season: state.season, week, current_week: state.week, source: 'Sleeper (Rotowire projections)', projections: out });
  })
);

/** Trade ideas: best fits, or a targeted search (assets to move, positions wanted, whose values define "fair"). */
app.post(
  '/api/trade/ideas',
  rateLimit('ideas', { anon: 40, user: 300 }),
  asyncRoute(async (req, res) => {
    const ev = await evaluationFor(req);
    const me = ev.roster.franchise_id;
    const ref = referenceFor(ev, req.body?.fair);
    const s = ev.settings as LeagueSettings | undefined;
    const sellIds: string[] = Array.isArray(req.body?.sell_ids) ? req.body.sell_ids.map(String).slice(0, 12) : [];
    const wantPositions: string[] = Array.isArray(req.body?.want_positions) ? req.body.want_positions.map(String).slice(0, 4) : [];
    const history = historyCache.get(`${req.body.platform}:${req.body.league_id}`)?.data;
    const capHits = s?.salary_cap
      ? Object.fromEntries([[me, ev.cap?.hit ?? 0], ...(ev.league_teams || []).filter((t) => t.cap).map((t) => [t.franchise_id, t.cap!.hit])])
      : undefined;
    const ideas = findTrades({
      me,
      mine: { players: ev.players, picks: ev.draft_picks || [] },
      teams: ev.league_teams || [],
      settings: s,
      seasons: (ev.season_outlook || []).map((o) => o.season),
      profiles: history?.profiles,
      capHits,
      sellIds,
      wantPositions,
      fairValue: ref ? ref.asset : undefined,
    });
    res.json({ ideas: ideas.slice(0, 40), fair_label: ref?.label ?? null, profiles_used: !!history });
  })
);

/** "From your rules" ideas, from the caller's own value adjustments. */
app.post(
  '/api/trade/personal-ideas',
  rateLimit('ideas', { anon: 40, user: 300 }),
  asyncRoute(async (req, res) => {
    const ev = await evaluationFor(req);
    const adj = req.body?.adjustments as ValueAdjustments | undefined;
    if (!adj?.enabled) return void res.json({ ideas: [] });
    const ideas = findPersonalIdeas({
      me: ev.roster.franchise_id,
      players: ev.players,
      picks: ev.draft_picks || [],
      teams: ev.league_teams || [],
      settings: ev.settings,
      seasons: (ev.season_outlook || []).map((o) => o.season),
      adj,
    });
    res.json({ ideas: ideas.slice(0, 12) });
  })
);

/** Five-season effect of a trade on both teams' projected lineups and league ranks. */
app.post(
  '/api/trade/impact',
  rateLimit('impact', { anon: 200, user: 1200 }),
  asyncRoute(async (req, res) => {
    const ev = await evaluationFor(req);
    const me = ev.roster.franchise_id;
    const partnerId = String(req.body?.partner_id || '');
    const mine = assetsOf(ev, me);
    const theirs = assetsOf(ev, partnerId);
    const give = pickAssets(mine, req.body?.give);
    const get = pickAssets(theirs, req.body?.get);
    const swap = (side: typeof mine, out: FinderAsset[], incoming: FinderAsset[]) => {
      const ids = new Set(out.map((a) => `${a.kind}:${a.item.id}`));
      return {
        players: [
          ...side.players.filter((p) => !ids.has(`player:${p.id}`)),
          ...incoming.filter((a) => a.kind === 'player').map((a) => ({ ...(a.item as MasterPlayer), roster_designation: 'ACTIVE' as const })),
        ],
        picks: [...side.picks.filter((p) => !ids.has(`pick:${p.id}`)), ...incoming.filter((a) => a.kind === 'pick').map((a) => a.item as DraftPick)],
      };
    };
    const seasons = (ev.season_outlook || []).map((o) => o.season);
    const out = (side: typeof mine) => projectOutlook(side.players, side.picks, ev.settings, seasons).map((o) => o.total);
    const [mb, ma, tb, ta] = [out(mine), out(swap(mine, give, get)), out(theirs), out(swap(theirs, get, give))];
    const rest = (ev.league_teams || []).filter((t) => t.franchise_id !== me && t.franchise_id !== partnerId);
    const rankAmong = (i: number, total: number, other: number) =>
      1 + rest.filter((t) => (t.season_outlook?.[i]?.total ?? 0) > total).length + (other > total ? 1 : 0);
    res.json({
      rows: seasons.map((season, i) => ({
        season,
        me: { before: mb[i], after: ma[i] },
        them: { before: tb[i], after: ta[i] },
        meRank: { before: rankAmong(i, mb[i], tb[i]), after: rankAmong(i, ma[i], ta[i]) },
        themRank: { before: rankAmong(i, tb[i], mb[i]), after: rankAmong(i, ta[i], ma[i]) },
      })),
    });
  })
);

app.use('/api/trade/ai-suggest', rateLimit('ai', { anon: 5, user: 30 }));
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
