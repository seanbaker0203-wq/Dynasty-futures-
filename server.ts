/**
 * Dynasty AI Evaluator - Full-Stack Express Server (Slice 4)
 * Serves API endpoints (/sync/sleeper, /sync/mfl, /api/evaluate) wiring Adapters to Math Engine,
 * and mounts Vite middleware in development on Port 3000.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { SEED_PLAYERS } from './src/data/seedPlayers';
import { RosterDNAMathEngine } from './src/lib/rosterMath';
import { NormalizationEngine } from './src/lib/normalization';
import { MasterPlayer, Platform, RosterRecord, LeagueSettings, DraftPick, LeagueTeamSummary, TradeStance } from './src/types';
import { DraftPickEngine } from './src/lib/draftPicks';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// In-memory master players database initialized from benchmark seed
const masterPlayersCache: MasterPlayer[] = [...SEED_PLAYERS];

// Minimized Sleeper player cache on boot to prevent timeouts
const sleeperCache = new Map<string, { full_name: string; position: string; team: string; age: number }>();
for (const p of SEED_PLAYERS) {
  const rawId = p.id.replace('sleeper_', '');
  sleeperCache.set(rawId, {
    full_name: p.full_name,
    position: p.position,
    team: p.nfl_team,
    age: p.age,
  });
}

// Comprehensive real-time 2026 NFL player ages & metadata cache
const nflPlayerMetadataCache = new Map<string, { full_name: string; position: string; team: string; age: number; birth_date?: string }>();

async function ensureNflPlayerCache() {
  if (nflPlayerMetadataCache.size > 0) return;
  try {
    const res = await fetch('https://api.sleeper.app/v1/players/nfl');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        for (const id in data) {
          const p = data[id];
          if (p && p.full_name) {
            const norm = NormalizationEngine.normalizeString(p.full_name);
            nflPlayerMetadataCache.set(norm, {
              full_name: p.full_name,
              position: p.position || 'WR',
              team: p.team || 'FA',
              age: typeof p.age === 'number' ? p.age : 24,
              birth_date: p.birth_date,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Asynchronous NFL player metadata cache fetch failed:', err);
  }
}
// Trigger background population on server boot
ensureNflPlayerCache().catch(() => {});

// MFL Players metadata cache per season year
const mflPlayerCache = new Map<string, { id: string; name: string; position: string; team: string }>();

function convertMflName(rawName: string): string {
  if (!rawName) return '';
  if (rawName.includes(',')) {
    const parts = rawName.split(',');
    const last = parts[0].trim();
    const first = parts.slice(1).join(' ').trim();
    return `${first} ${last}`;
  }
  return rawName.trim();
}

// Helper: Custom fetch with optional SSL ignore and automatic redirect following (301/302/307)
async function fetchWithSslControl(
  url: string,
  rejectUnauthorized = true,
  customHeaders: Record<string, string> = {},
  maxRedirects = 5
): Promise<{ data: any; raw: string; setCookieHeaders?: string[] }> {
  if (maxRedirects <= 0) {
    throw new Error('Too many HTTP redirects from MFL');
  }

  const mergedHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 DynastyAI-Evaluator/1.0',
    ...customHeaders,
  };

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'http:' ? http : https;
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      rejectUnauthorized: false,
      headers: mergedHeaders,
    };

    const req = client.request(options, (res) => {
      // Automatic 301/302/307 redirect follow
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
        }
        const setCookies = res.headers['set-cookie'];
        const nextHeaders = { ...customHeaders };
        if (setCookies) {
          const cookieStr = setCookies.map((c) => c.split(';')[0]).join('; ');
          nextHeaders['Cookie'] = nextHeaders['Cookie'] ? `${nextHeaders['Cookie']}; ${cookieStr}` : cookieStr;
        }
        return resolve(fetchWithSslControl(redirectUrl, rejectUnauthorized, nextHeaders, maxRedirects - 1));
      }

      let data = '';
      const setCookieHeaders = res.headers['set-cookie'];
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ data: parsed, raw: data, setCookieHeaders });
        } catch {
          resolve({ data: null, raw: data, setCookieHeaders });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timed out connecting to MFL server'));
    });
    req.end();
  });
}

// Helper: Resolve player IDs against Master Database or cached Sleeper entries with 2026 real ages
function resolvePlayersForRoster(playerIds: string[]): MasterPlayer[] {
  const idMap = new Map<string, MasterPlayer>();
  for (const p of masterPlayersCache) {
    idMap.set(p.id, p);
    idMap.set(p.id.replace('sleeper_', '').replace('mfl_', ''), p);
  }

  const resolved: MasterPlayer[] = [];
  for (const pid of playerIds) {
    if (idMap.has(pid)) {
      const p = idMap.get(pid)!;
      const norm = NormalizationEngine.normalizeString(p.full_name);
      const nflMatch = nflPlayerMetadataCache.get(norm);
      resolved.push({
        ...p,
        age: nflMatch?.age || p.age,
      });
    } else {
      const cached = sleeperCache.get(pid);
      if (cached) {
        const { player } = NormalizationEngine.matchPlayer(cached.full_name, masterPlayersCache);
        const norm = NormalizationEngine.normalizeString(cached.full_name);
        const nflMatch = nflPlayerMetadataCache.get(norm);
        const realAge = nflMatch?.age || cached.age || 24.5;
        if (player) {
          resolved.push({
            ...player,
            age: realAge,
          });
        } else {
          resolved.push({
            id: `dynasty_${pid}`,
            full_name: cached.full_name,
            position: (cached.position as any) || 'WR',
            nfl_team: cached.team || 'FA',
            age: realAge,
            consensus_rank: 999,
            market_value: 350,
          });
        }
      }
    }
  }

  return resolved;
}

// ---------------- API ENDPOINTS (Slice 4) ----------------

// 1. Health & Players
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'Dynasty AI Evaluator Server',
    cached_master_players: masterPlayersCache.length,
  });
});

app.get('/api/players', (_req: Request, res: Response) => {
  res.json(masterPlayersCache);
});

// 2. Sleeper Sync Handler
async function handleSleeperSync(leagueId: string, identifier: string, valuationMode = 'auction_desc') {
  const cleanLeagueId = leagueId.trim();
  const [rostersRes, usersRes, leagueRes, tradedPicksRes] = await Promise.all([
    fetchWithSslControl(`https://api.sleeper.app/v1/league/${cleanLeagueId}/rosters`),
    fetchWithSslControl(`https://api.sleeper.app/v1/league/${cleanLeagueId}/users`),
    fetchWithSslControl(`https://api.sleeper.app/v1/league/${cleanLeagueId}`),
    fetchWithSslControl(`https://api.sleeper.app/v1/league/${cleanLeagueId}/traded_picks`).catch(() => ({ data: [] })),
  ]);

  const rostersData = rostersRes.data;
  const usersData = usersRes.data;
  const leagueData = leagueRes.data;
  const tradedPicksData = Array.isArray(tradedPicksRes?.data) ? tradedPicksRes.data : [];

  const userMap = new Map<string, any>();
  if (Array.isArray(usersData)) {
    for (const u of usersData) {
      if (u?.user_id) userMap.set(u.user_id, u);
    }
  }

  const leagueName = leagueData?.name || `Sleeper League ${cleanLeagueId}`;

  // Find target roster
  let targetRoster: any = null;
  const normTarget = NormalizationEngine.normalizeString(identifier);

  if (Array.isArray(rostersData)) {
    // Check direct ID or roster_id
    targetRoster = rostersData.find((r: any) =>
      String(r.owner_id) === identifier || String(r.roster_id) === identifier
    );

    // Check display name or team moniker
    if (!targetRoster && normTarget) {
      targetRoster = rostersData.find((r: any) => {
        const user = userMap.get(r.owner_id);
        const name = user?.metadata?.team_name || user?.display_name || '';
        return NormalizationEngine.normalizeString(name) === normTarget;
      });
    }

    // Check Sleeper username
    if (!targetRoster && identifier) {
      try {
        const userRes = await fetchWithSslControl(`https://api.sleeper.app/v1/user/${encodeURIComponent(identifier)}`);
        const userData = userRes.data;
        if (userData?.user_id) {
          targetRoster = rostersData.find((r: any) => r.owner_id === userData.user_id);
        }
      } catch {
        // Fallback
      }
    }

    // Default to first roster if not specified
    if (!targetRoster && rostersData.length > 0) {
      targetRoster = rostersData[0];
    }
  }

  if (!targetRoster) {
    throw new Error(`No roster found in Sleeper League ${cleanLeagueId}`);
  }

  const user = userMap.get(targetRoster.owner_id);
  const franchiseName = user?.metadata?.team_name || user?.display_name || `Team ${targetRoster.roster_id}`;

  const rosterPositions: string[] = Array.isArray(leagueData?.roster_positions) ? leagueData.roster_positions : [];
  const starterPositions = rosterPositions.filter((p) => p !== 'BN' && p !== 'IR' && p !== 'TAXI');

  const sleeperSettings: LeagueSettings = {
    league_size: leagueData?.total_rosters || 12,
    roster_size: rosterPositions.length || 28,
    starter_count: starterPositions.length || 10,
    slots: {
      QB: starterPositions.filter((p) => p === 'QB').length || 1,
      RB: starterPositions.filter((p) => p === 'RB').length || 2,
      WR: starterPositions.filter((p) => p === 'WR').length || 3,
      TE: starterPositions.filter((p) => p === 'TE').length || 1,
      FLEX: starterPositions.filter((p) => p === 'FLEX' || p === 'WRRB_FLEX' || p === 'REC_FLEX').length || 2,
      SUPER_FLEX: starterPositions.filter((p) => p === 'SUPER_FLEX').length || 0,
      K: starterPositions.filter((p) => p === 'K').length || 0,
      DEF: starterPositions.filter((p) => p === 'DEF').length || 0,
    },
    scoring_type: leagueData?.scoring_settings?.rec ? 'PPR' : 'Standard',
  };

  // Generate draft picks for all rosters
  const draftRounds = leagueData?.settings?.draft_rounds || 4;
  const picksByRoster = new Map<string, DraftPick[]>();

  // Map each roster's owner name
  const rosterNameMap = new Map<string, string>();
  for (const r of rostersData) {
    const rId = String(r.roster_id);
    const u = userMap.get(r.owner_id);
    const fName = u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
    rosterNameMap.set(rId, fName);
    if (r.owner_id) rosterNameMap.set(String(r.owner_id), fName);

    const initialPicks: DraftPick[] = [];
    for (let y = 2027; y <= 2029; y++) {
      for (let rnd = 1; rnd <= draftRounds; rnd++) {
        const val = DraftPickEngine.calculatePickValue(y, rnd, 'Mid');
        initialPicks.push({
          id: `pick-${y}-${rnd}-${rId}`,
          year: y,
          round: rnd,
          original_owner_id: rId,
          original_owner_name: fName,
          current_owner_id: rId,
          description: `${y} Round ${rnd} (Own)`,
          market_value: val,
          is_priority_class: y === 2027,
          years_out: y - 2027,
        });
      }
    }
    picksByRoster.set(rId, initialPicks);
  }

  // Apply traded picks in Sleeper (filter for upcoming classes >= 2027 since 2026 draft concluded)
  for (const tp of tradedPicksData) {
    const origRosterId = String(tp.roster_id || '');
    const newOwnerId = String(tp.owner_id || '');
    const pSeason = parseInt(tp.season) || 2027;
    const pRound = parseInt(tp.round) || 1;

    // Skip past rookie drafts (2026 and earlier have already completed)
    if (pSeason < 2027) continue;

    const origList = picksByRoster.get(origRosterId);
    if (origList) {
      const idx = origList.findIndex((p) => p.year === pSeason && p.round === pRound && p.original_owner_id === origRosterId);
      if (idx !== -1) {
        const [movedPick] = origList.splice(idx, 1);
        const origTeamName = rosterNameMap.get(origRosterId) || `Team ${origRosterId}`;
        const newTeamName = rosterNameMap.get(newOwnerId) || `Team ${newOwnerId}`;

        movedPick.current_owner_id = newOwnerId;
        movedPick.description = `${pSeason} Round ${pRound} (via ${origTeamName})`;

        // Add to new owner
        let destList = picksByRoster.get(newOwnerId);
        if (!destList) {
          // Check if newOwnerId is user_id matching a roster_id
          const matchedRoster = rostersData.find((r: any) => String(r.owner_id) === newOwnerId || String(r.roster_id) === newOwnerId);
          if (matchedRoster) {
            const destRosterId = String(matchedRoster.roster_id);
            destList = picksByRoster.get(destRosterId);
          }
        }
        if (destList) {
          destList.push(movedPick);
        }
      }
    }
  }

  // Collect all player IDs across all rosters in the league
  const allRosteredIds = new Set<string>();
  const allLeaguePlayerIds: string[] = [];
  for (const r of rostersData) {
    const pList = r.players || [];
    for (const pid of pList) {
      allRosteredIds.add(String(pid));
      allLeaguePlayerIds.push(String(pid));
    }
  }

  const allResolvedPlayers = resolvePlayersForRoster(allLeaguePlayerIds);
  const candidatePool = [...masterPlayersCache, ...allResolvedPlayers];

  // Target team evaluation
  const targetRosterId = String(targetRoster.roster_id);
  const targetPicks = picksByRoster.get(targetRosterId) || [];

  const rosterRecord: RosterRecord = {
    roster_id: targetRosterId,
    platform: 'sleeper',
    external_league_id: cleanLeagueId,
    franchise_id: String(targetRoster.owner_id || targetRoster.roster_id),
    player_ids: (targetRoster.players || []).map(String),
    valuation_mode: valuationMode as any,
    league_name: leagueName,
    franchise_name: franchiseName,
    starters: (targetRoster.starters || []).map(String),
    taxi_ids: (targetRoster.taxi || []).map(String),
    reserve_ids: (targetRoster.reserve || []).map(String),
    draft_picks: targetPicks,
    settings: sleeperSettings,
  };

  const userEvaluation = RosterDNAMathEngine.evaluateRoster(rosterRecord, candidatePool);

  const userStance = DraftPickEngine.determineTradeStance(
    userEvaluation.metrics.classification as any,
    userEvaluation.metrics.gross_liquidity,
    userEvaluation.metrics.asset_half_life,
    userEvaluation.metrics.structural_integrity
  );

  // Evaluate all teams in the league
  const allFranchisesList: LeagueTeamSummary[] = [];

  for (const r of rostersData) {
    const curRId = String(r.roster_id);
    const u = userMap.get(r.owner_id);
    const curName = u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
    const curOwner = u?.display_name || u?.username || `Owner ${r.roster_id}`;
    const curPicks = picksByRoster.get(curRId) || [];
    const draftCapitalVal = curPicks.reduce((acc, p) => acc + p.market_value, 0);

    let teamEval = userEvaluation;
    if (curRId !== targetRosterId) {
      const curRecord: RosterRecord = {
        roster_id: curRId,
        platform: 'sleeper',
        external_league_id: cleanLeagueId,
        franchise_id: String(r.owner_id || r.roster_id),
        player_ids: (r.players || []).map(String),
        valuation_mode: valuationMode as any,
        league_name: leagueName,
        franchise_name: curName,
        starters: (r.starters || []).map(String),
        taxi_ids: (r.taxi || []).map(String),
        reserve_ids: (r.reserve || []).map(String),
        draft_picks: curPicks,
        settings: sleeperSettings,
      };
      teamEval = RosterDNAMathEngine.evaluateRoster(curRecord, candidatePool);
    }

    const teamStance = DraftPickEngine.determineTradeStance(
      teamEval.metrics.classification as any,
      teamEval.metrics.gross_liquidity,
      teamEval.metrics.asset_half_life,
      teamEval.metrics.structural_integrity
    );

    const targetAssets = DraftPickEngine.generateTargetAssetsForUser(
      userStance.stance,
      teamStance.stance,
      teamEval.players,
      curPicks
    );

    allFranchisesList.push({
      franchise_id: curRId,
      franchise_name: curName,
      owner_name: curOwner,
      power_rank: 1,
      classification: teamEval.metrics.classification as any,
      championship_window_status: teamEval.championship_window?.status || 'Contender',
      total_value: (teamEval.metrics.total_roster_value || 0) + draftCapitalVal,
      starter_value: teamEval.metrics.starter_value || 0,
      bench_value: teamEval.metrics.bench_value || 0,
      draft_capital_value: draftCapitalVal,
      gross_liquidity: teamEval.metrics.gross_liquidity,
      asset_half_life: teamEval.metrics.asset_half_life,
      structural_integrity: teamEval.metrics.structural_integrity,
      player_count: teamEval.players.length,
      trade_stance: teamStance.stance,
      stance_label: teamStance.label,
      stance_description: teamStance.description,
      top_players: teamEval.starters.slice(0, 4),
      starters: teamEval.starters,
      bench: teamEval.bench,
      draft_picks: curPicks,
      target_assets_for_user: targetAssets,
    });
  }

  // Sort by composite power score: Starter value * 0.55 + Bench value * 0.3 + Draft capital * 0.15
  allFranchisesList.sort((a, b) => {
    const scoreA = a.starter_value * 0.55 + a.bench_value * 0.3 + a.draft_capital_value * 0.15;
    const scoreB = b.starter_value * 0.55 + b.bench_value * 0.3 + b.draft_capital_value * 0.15;
    return scoreB - scoreA;
  });

  allFranchisesList.forEach((t, idx) => {
    t.power_rank = idx + 1;
  });

  // Calculate unrostered free agents
  const freeAgents = masterPlayersCache
    .filter((p) => !allRosteredIds.has(p.id) && p.market_value >= 400)
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 50);

  return {
    ...userEvaluation,
    draft_picks: targetPicks,
    league_teams: allFranchisesList,
    free_agents: freeAgents,
  };
}

// Sleeper endpoints (support both /sync/sleeper and /api/sync/sleeper, GET & POST)
const sleeperRoutes = ['/sync/sleeper', '/api/sync/sleeper'];
sleeperRoutes.forEach((route) => {
  app.post(route, async (req: Request, res: Response) => {
    try {
      const { league_id, username, franchise_id, valuation_mode } = req.body || {};
      if (!league_id) {
        return res.status(400).json({ error: 'league_id is required' });
      }
      const identifier = username || franchise_id || '';
      const result = await handleSleeperSync(league_id, identifier, valuation_mode);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to sync Sleeper roster' });
    }
  });

  app.get(route, async (req: Request, res: Response) => {
    try {
      const league_id = (req.query.league_id as string) || '';
      const username = (req.query.username as string) || '';
      const franchise_id = (req.query.franchise_id as string) || '';
      const valuation_mode = (req.query.valuation_mode as string) || 'auction_desc';

      if (!league_id) {
        return res.status(400).json({ error: 'league_id is required' });
      }
      const identifier = username || franchise_id || '';
      const result = await handleSleeperSync(league_id, identifier, valuation_mode);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to sync Sleeper roster' });
    }
  });
});

// Helper: MFL API Login for private league authentication
async function loginMFL(username: string, password: string, year = '2026'): Promise<{ sessionId: string; myLeagues?: any }> {
  const cleanUser = username.trim();
  const cleanPass = password.trim();
  if (!cleanUser || !cleanPass) return { sessionId: '' };

  const loginUrl = `https://api.myfantasyleague.com/${year}/login?USERNAME=${encodeURIComponent(cleanUser)}&PASSWORD=${encodeURIComponent(cleanPass)}&XML=1`;
  const { raw, setCookieHeaders } = await fetchWithSslControl(loginUrl, false);

  if (raw && (raw.includes('<error>') || raw.toLowerCase().includes('invalid username') || raw.toLowerCase().includes('invalid password'))) {
    throw new Error('MFL Login failed: Invalid username or password');
  }

  let mflUserId = '';
  if (raw) {
    const match = raw.match(/MFL_USER_ID="([^"]+)"/i);
    if (match) mflUserId = match[1];
  }

  if (!mflUserId && setCookieHeaders) {
    for (const cookie of setCookieHeaders) {
      const match = cookie.match(/MFL_USER_ID=([^;]+)/i);
      if (match) {
        mflUserId = match[1];
        break;
      }
    }
  }

  if (!mflUserId) {
    throw new Error('MFL login did not return a valid session token. Please verify username and password.');
  }

  // Fetch myleagues with session token to discover franchise IDs
  let myLeagues = null;
  try {
    const leaguesRes = await fetchWithSslControl(
      `https://api.myfantasyleague.com/${year}/export?TYPE=myleagues&JSON=1`,
      false,
      { 'Cookie': `MFL_USER_ID=${mflUserId}` }
    );
    myLeagues = leaguesRes.data;
  } catch {
    // Non-fatal
  }

  return { sessionId: mflUserId, myLeagues };
}

// 3. MFL Sync Handler (with SSL bypass, &JSON=1, redirect following, and private league login support)
async function handleMFLSync(
  leagueId: string,
  identifier: string,
  year = '2026',
  valuationMode = 'auction_desc',
  username?: string,
  password?: string,
  token?: string
) {
  const cleanLeagueId = leagueId.trim();

  // Attempt login if credentials are supplied or use existing token
  let mflSessionId = token || '';
  let autoFranchiseId = '';

  if (!mflSessionId && username && password) {
    try {
      const loginResult = await loginMFL(username, password, year);
      mflSessionId = loginResult.sessionId;
      // If myleagues found this league, extract franchise_id
      const rawLeagues = loginResult.myLeagues?.leagues?.league;
      const leagueList = Array.isArray(rawLeagues) ? rawLeagues : rawLeagues ? [rawLeagues] : [];
      const matchedLeague = leagueList.find((l: any) => String(l.league_id) === cleanLeagueId);
      if (matchedLeague?.franchise_id) {
        autoFranchiseId = String(matchedLeague.franchise_id);
      }
    } catch (authErr: any) {
      throw new Error(`MFL Authentication Failed: ${authErr.message}`);
    }
  } else if (mflSessionId) {
    // With existing session token, query myleagues to check franchise_id if needed
    try {
      const leaguesRes = await fetchWithSslControl(
        `https://api.myfantasyleague.com/${year}/export?TYPE=myleagues&JSON=1`,
        false,
        { 'Cookie': `MFL_USER_ID=${mflSessionId}` }
      );
      const rawLeagues = leaguesRes.data?.leagues?.league;
      const leagueList = Array.isArray(rawLeagues) ? rawLeagues : rawLeagues ? [rawLeagues] : [];
      const matchedLeague = leagueList.find((l: any) => String(l.league_id) === cleanLeagueId);
      if (matchedLeague?.franchise_id) {
        autoFranchiseId = String(matchedLeague.franchise_id);
      }
    } catch {
      // Non-fatal
    }
  }

  const mflHeaders: Record<string, string> = {};
  if (mflSessionId) {
    mflHeaders['Cookie'] = `MFL_USER_ID=${mflSessionId}`;
  }

  const rostersUrl = `https://api.myfantasyleague.com/${year}/export?TYPE=rosters&L=${cleanLeagueId}&JSON=1`;
  const leagueUrl = `https://api.myfantasyleague.com/${year}/export?TYPE=league&L=${cleanLeagueId}&JSON=1`;
  const picksUrl = `https://api.myfantasyleague.com/${year}/export?TYPE=futureDraftPicks&L=${cleanLeagueId}&JSON=1`;

  // Fetch with rejectUnauthorized: false and automatic redirect following
  const [rostersRes, leagueRes, picksRes] = await Promise.all([
    fetchWithSslControl(rostersUrl, false, mflHeaders),
    fetchWithSslControl(leagueUrl, false, mflHeaders),
    fetchWithSslControl(picksUrl, false, mflHeaders).catch(() => ({ data: null })),
  ]);

  const rostersData = rostersRes.data;
  const leagueData = leagueRes.data;
  const picksData = picksRes?.data;

  // Detect private league restriction or access error
  if (rostersData?.error || leagueData?.error) {
    const errText = rostersData?.error?.$t || leagueData?.error?.$t || rostersData?.error || leagueData?.error || '';
    if (typeof errText === 'string' && /private|login|password|permission|denied|authenticate/i.test(errText)) {
      throw new Error(
        `MFL League ${cleanLeagueId} is a private league. Please enter your MFL Username and Password to authenticate access.`
      );
    }
    if (errText) {
      throw new Error(`MFL API Error: ${errText}`);
    }
  }

  const leagueName = leagueData?.league?.name || `MFL League ${cleanLeagueId}`;

  const franchiseMap = new Map<string, string>();
  let mflFranchises = leagueData?.league?.franchises?.franchise || [];
  if (!Array.isArray(mflFranchises)) mflFranchises = [mflFranchises];
  for (const f of mflFranchises) {
    if (f?.id) franchiseMap.set(String(f.id), f.name || `Franchise ${f.id}`);
  }

  // Parse draft picks across all franchises
  const draftPicksByFranchise = new Map<string, DraftPick[]>();
  const rawPicksFranchises = picksData?.futureDraftPicks?.franchise || [];
  const pickFranchiseList = Array.isArray(rawPicksFranchises) ? rawPicksFranchises : rawPicksFranchises ? [rawPicksFranchises] : [];

  for (const pf of pickFranchiseList) {
    const curFid = String(pf.id || '');
    let pickList = pf.futureDraftPick || [];
    if (!Array.isArray(pickList)) pickList = [pickList];

    const teamPicks: DraftPick[] = [];
    for (const p of pickList) {
      const pYear = parseInt(p.year) || 2027;
      const pRound = parseInt(p.round) || 1;

      // 2026 rookie draft has already concluded; skip past picks
      if (pYear < 2027) continue;

      const origFid = String(p.originalPickFor || curFid);
      const origName = franchiseMap.get(origFid) || `Team ${origFid}`;
      const pickVal = DraftPickEngine.calculatePickValue(pYear, pRound);

      teamPicks.push({
        id: `pick-${pYear}-${pRound}-${origFid}-${curFid}`,
        year: pYear,
        round: pRound,
        original_owner_id: origFid,
        original_owner_name: origName,
        current_owner_id: curFid,
        description: `${pYear} Round ${pRound} (${origFid === curFid ? 'Own' : `via ${origName}`})`,
        market_value: pickVal,
        is_priority_class: pYear === 2027,
        years_out: pYear - 2027,
      });
    }

    // Fallback: If MFL league returned no future draft picks, generate standard 2027-2029 baseline picks
    if (teamPicks.length === 0) {
      const fName = franchiseMap.get(curFid) || `Franchise ${curFid}`;
      teamPicks.push(...DraftPickEngine.generateStandardPicks(curFid, fName, 2027, 3, 4));
    }

    teamPicks.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.round - b.round));
    draftPicksByFranchise.set(curFid, teamPicks);
  }

  let rawList = rostersData?.rosters?.franchise || [];
  if (!Array.isArray(rawList)) rawList = [rawList];

  let targetEntry: any = null;
  const normId = (identifier || autoFranchiseId).trim();

  // 1. If autoFranchiseId was discovered from myleagues login, match it
  if (autoFranchiseId) {
    targetEntry = rawList.find((entry: any) => {
      const fid = String(entry.id || '');
      return fid === autoFranchiseId || fid.replace(/^0+/, '') === autoFranchiseId.replace(/^0+/, '');
    });
  }

  // 2. Find franchise by identifier (e.g. 0010 or 10)
  if (!targetEntry && normId) {
    targetEntry = rawList.find((entry: any) => {
      const fid = String(entry.id || '');
      return fid === normId || fid.replace(/^0+/, '') === normId.replace(/^0+/, '');
    });
  }

  // 3. Try finding franchise by authenticated MFL username or email
  if (!targetEntry && username) {
    const cleanUser = username.trim().toLowerCase();
    targetEntry = rawList.find((entry: any) => {
      const fid = String(entry.id || '');
      const meta = mflFranchises.find((f: any) => String(f.id) === fid);
      if (!meta) return false;
      const fUser = String(meta.username || '').toLowerCase();
      const fOwner = String(meta.owner_name || '').toLowerCase();
      const fEmail = String(meta.email || '').toLowerCase();
      const fName = String(meta.name || '').toLowerCase();
      return fUser === cleanUser || fEmail === cleanUser || fOwner.includes(cleanUser) || fName.includes(cleanUser);
    });
  }

  // 4. Find franchise by name
  if (!targetEntry && identifier) {
    const normName = NormalizationEngine.normalizeString(identifier);
    targetEntry = rawList.find((entry: any) => {
      const fid = String(entry.id || '');
      const fname = franchiseMap.get(fid) || '';
      return NormalizationEngine.normalizeString(fname) === normName;
    });
  }

  // 5. Fallback to first franchise
  if (!targetEntry && rawList.length > 0) {
    targetEntry = rawList[0];
  }

  if (!targetEntry) {
    throw new Error(`No franchise found for MFL League ${cleanLeagueId}. Check League ID, Username, or Franchise ID.`);
  }

  const fid = String(targetEntry.id || '');
  const fname = franchiseMap.get(fid) || `Franchise ${fid}`;

  let players = targetEntry.player || [];
  if (!Array.isArray(players)) players = [players];

  const playerIds: string[] = [];
  const starters: string[] = [];
  const taxiIds: string[] = [];
  const reserveIds: string[] = [];
  const playerMetaMap = new Map<string, { status?: string; salary?: string; contractYear?: string }>();

  for (const p of players) {
    if (typeof p === 'object' && p !== null) {
      const pid = String(p.id || '');
      playerIds.push(pid);
      const status = String(p.status || '').toUpperCase();
      playerMetaMap.set(pid, {
        status: p.status,
        salary: p.salary,
        contractYear: p.contractYear,
      });

      if (status === 'TAXI_SQUAD' || p.taxi === '1') {
        taxiIds.push(pid);
      } else if (status === 'INJURED_RESERVE' || p.ir === '1') {
        reserveIds.push(pid);
      } else if (status === 'STARTER' || status === 'START') {
        starters.push(pid);
      }
    } else if (p) {
      playerIds.push(String(p));
    }
  }

  // Collect all unique player IDs across the entire league
  const allUniquePlayerIds = new Set<string>();
  const playerMetaGlobal = new Map<string, { status?: string; salary?: string; contractYear?: string }>();

  for (const entry of rawList) {
    let pList = entry.player || [];
    if (!Array.isArray(pList)) pList = [pList];
    for (const p of pList) {
      if (typeof p === 'object' && p?.id) {
        const pid = String(p.id);
        allUniquePlayerIds.add(pid);
        playerMetaGlobal.set(pid, {
          status: p.status,
          salary: p.salary,
          contractYear: p.contractYear,
        });
      } else if (p) {
        allUniquePlayerIds.add(String(p));
      }
    }
  }

  // Fetch MFL players metadata database for name and position resolution if needed
  if (mflPlayerCache.size === 0) {
    try {
      const playersRes = await fetchWithSslControl(
        `https://api.myfantasyleague.com/${year}/export?TYPE=players&L=${cleanLeagueId}&JSON=1`,
        false,
        mflHeaders
      );
      const rawPlayers = playersRes.data?.players?.player || [];
      if (Array.isArray(rawPlayers)) {
        for (const p of rawPlayers) {
          if (p?.id) {
            mflPlayerCache.set(String(p.id), {
              id: String(p.id),
              name: p.name || '',
              position: p.position || '',
              team: p.team || '',
            });
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Ensure real-time NFL player database with 2026 accurate ages is available
  await ensureNflPlayerCache();

  // Resolve every player on this roster and in the entire league
  const allResolvedPlayers: MasterPlayer[] = [];
  for (const pid of allUniquePlayerIds) {
    const meta = mflPlayerCache.get(pid);
    const metaObj = playerMetaGlobal.get(pid);
    const rawStatus = (metaObj?.status || '').toUpperCase();
    let desig: 'ACTIVE' | 'IR' | 'TAXI' = 'ACTIVE';
    if (rawStatus === 'INJURED_RESERVE') desig = 'IR';
    else if (rawStatus === 'TAXI_SQUAD') desig = 'TAXI';

    if (meta) {
      const convertedName = convertMflName(meta.name);
      const norm = NormalizationEngine.normalizeString(convertedName);
      const nflMatch = nflPlayerMetadataCache.get(norm);
      const { player } = NormalizationEngine.matchPlayer(convertedName, masterPlayersCache);

      const isDef = meta.position === 'Def' || norm.includes('defense') || norm.includes('steelers') || norm.includes('bills') || norm.includes('vikings') || norm.includes('cardinals') || norm.includes('jets');
      const realAge = isDef ? 25.0 : (nflMatch?.age ?? (player?.age ?? 24.0));
      const realPos = isDef ? 'Def' : (nflMatch?.position || (meta.position as any) || player?.position || 'WR');
      const realTeam = nflMatch?.team || meta.team || player?.nfl_team || 'FA';

      if (player) {
        allResolvedPlayers.push({
          ...player,
          id: pid, // Preserve MFL ID for roster correlation
          age: realAge,
          position: realPos,
          nfl_team: realTeam,
          roster_designation: desig,
          salary: metaObj?.salary,
          contract_year: metaObj?.contractYear,
        });
      } else {
        // Construct MasterPlayer with real 2026 age and realistic market value
        let baseVal = 550;
        if (realPos === 'QB') baseVal = 2100;
        else if (realPos === 'WR') baseVal = 1350;
        else if (realPos === 'RB') baseVal = 1200;
        else if (realPos === 'TE') baseVal = 850;
        else if (realPos === 'PK' || realPos === 'K') baseVal = 450;
        else if (isDef) baseVal = 500;

        allResolvedPlayers.push({
          id: pid,
          full_name: convertedName,
          position: realPos,
          nfl_team: realTeam,
          age: realAge,
          consensus_rank: 250,
          market_value: baseVal,
          roster_designation: desig,
          salary: metaObj?.salary,
          contract_year: metaObj?.contractYear,
        });
      }
    } else {
      const fallback = resolvePlayersForRoster([pid]);
      if (fallback.length > 0) {
        allResolvedPlayers.push({
          ...fallback[0],
          id: pid,
          roster_designation: desig,
          salary: metaObj?.salary,
          contract_year: metaObj?.contractYear,
        });
      }
    }
  }

  const candidatePool = [...masterPlayersCache, ...allResolvedPlayers];

  // Parse MFL league lineup requirements and starter slots
  const rawStarters = leagueData?.league?.starters;
  const rawPositions = Array.isArray(rawStarters?.position)
    ? rawStarters.position
    : rawStarters?.position
    ? [rawStarters.position]
    : [];

  let qbMin = 1, rbMin = 2, wrMin = 3, teMin = 1, kMin = 1, defMin = 1;
  for (const p of rawPositions) {
    const name = String(p?.name || '');
    const lim = String(p?.limit || '1');
    const minVal = parseInt(lim.split('-')[0]) || 1;
    if (name === 'QB') qbMin = minVal;
    else if (name === 'RB') rbMin = minVal;
    else if (name === 'WR') wrMin = minVal;
    else if (name === 'TE') teMin = minVal;
    else if (name === 'PK' || name === 'K') kMin = minVal;
    else if (name === 'Def' || name === 'DEF') defMin = minVal;
  }
  const totalStarterCount = parseInt(rawStarters?.count) || 11;
  const sumMin = qbMin + rbMin + wrMin + teMin + kMin + defMin;
  const flexCount = Math.max(0, totalStarterCount - sumMin);

  const mflSettings: LeagueSettings = {
    league_size: parseInt(leagueData?.league?.franchises?.count) || 10,
    roster_size: parseInt(leagueData?.league?.rosterSize) || 28,
    starter_count: totalStarterCount,
    slots: {
      QB: qbMin,
      RB: rbMin,
      WR: wrMin,
      TE: teMin,
      FLEX: flexCount,
      SUPER_FLEX: 0,
      K: kMin,
      DEF: defMin,
    },
    scoring_type: 'PPR',
  };

  const targetPicks = draftPicksByFranchise.get(fid) || [];

  const rosterRecord: RosterRecord = {
    roster_id: fid,
    platform: 'mfl',
    external_league_id: cleanLeagueId,
    franchise_id: fid,
    player_ids: playerIds,
    valuation_mode: valuationMode as any,
    league_name: leagueName,
    franchise_name: fname,
    starters,
    taxi_ids: taxiIds,
    reserve_ids: reserveIds,
    draft_picks: targetPicks,
    settings: mflSettings,
  };

  const userEvaluation = RosterDNAMathEngine.evaluateRoster(rosterRecord, candidatePool);

  const userStance = DraftPickEngine.determineTradeStance(
    userEvaluation.metrics.classification as any,
    userEvaluation.metrics.gross_liquidity,
    userEvaluation.metrics.asset_half_life,
    userEvaluation.metrics.structural_integrity
  );

  // Evaluate all franchises in the league for complete rankings & trade matchmaking
  const allFranchisesList: LeagueTeamSummary[] = [];
  const allRosteredIds = new Set<string>();

  for (const entry of rawList) {
    const curFid = String(entry.id || '');
    const curName = franchiseMap.get(curFid) || `Franchise ${curFid}`;
    let pItems = entry.player || [];
    if (!Array.isArray(pItems)) pItems = [pItems];

    const curPlayerIds: string[] = [];
    const curStarters: string[] = [];
    const curTaxi: string[] = [];
    const curIR: string[] = [];

    for (const pi of pItems) {
      if (typeof pi === 'object' && pi !== null) {
        const pid = String(pi.id || '');
        curPlayerIds.push(pid);
        allRosteredIds.add(pid);
        const status = String(pi.status || '').toUpperCase();
        if (status === 'TAXI_SQUAD' || pi.taxi === '1') curTaxi.push(pid);
        else if (status === 'INJURED_RESERVE' || pi.ir === '1') curIR.push(pid);
        else if (status === 'STARTER' || status === 'START') curStarters.push(pid);
      } else if (pi) {
        const pid = String(pi);
        curPlayerIds.push(pid);
        allRosteredIds.add(pid);
      }
    }

    const curPicks = draftPicksByFranchise.get(curFid) || [];
    const draftCapitalVal = curPicks.reduce((acc, p) => acc + p.market_value, 0);

    // If this is the current target franchise, use the full resolved evaluation
    let teamEval = userEvaluation;
    if (curFid !== fid) {
      const curTeamRecord: RosterRecord = {
        roster_id: curFid,
        platform: 'mfl',
        external_league_id: cleanLeagueId,
        franchise_id: curFid,
        player_ids: curPlayerIds,
        valuation_mode: valuationMode as any,
        franchise_name: curName,
        league_name: leagueName,
        starters: curStarters,
        taxi_ids: curTaxi,
        reserve_ids: curIR,
        draft_picks: curPicks,
        settings: mflSettings,
      };
      teamEval = RosterDNAMathEngine.evaluateRoster(curTeamRecord, candidatePool);
    }

    const teamStance = DraftPickEngine.determineTradeStance(
      teamEval.metrics.classification as any,
      teamEval.metrics.gross_liquidity,
      teamEval.metrics.asset_half_life,
      teamEval.metrics.structural_integrity
    );

    const targetAssets = DraftPickEngine.generateTargetAssetsForUser(
      userStance.stance,
      teamStance.stance,
      teamEval.players,
      curPicks
    );

    allFranchisesList.push({
      franchise_id: curFid,
      franchise_name: curName,
      power_rank: 1, // Will be set after sorting
      classification: teamEval.metrics.classification as any,
      championship_window_status: teamEval.championship_window?.status || 'Contender',
      total_value: (teamEval.metrics.total_roster_value || 0) + draftCapitalVal,
      starter_value: teamEval.metrics.starter_value || 0,
      bench_value: teamEval.metrics.bench_value || 0,
      draft_capital_value: draftCapitalVal,
      gross_liquidity: teamEval.metrics.gross_liquidity,
      asset_half_life: teamEval.metrics.asset_half_life,
      structural_integrity: teamEval.metrics.structural_integrity,
      player_count: teamEval.players.length,
      trade_stance: teamStance.stance,
      stance_label: teamStance.label,
      stance_description: teamStance.description,
      top_players: teamEval.starters.slice(0, 4),
      starters: teamEval.starters,
      bench: teamEval.bench,
      draft_picks: curPicks,
      target_assets_for_user: targetAssets,
    });
  }

  // Sort by composite power score: Starter value * 0.55 + Bench value * 0.3 + Draft capital * 0.15
  allFranchisesList.sort((a, b) => {
    const scoreA = a.starter_value * 0.55 + a.bench_value * 0.3 + a.draft_capital_value * 0.15;
    const scoreB = b.starter_value * 0.55 + b.bench_value * 0.3 + b.draft_capital_value * 0.15;
    return scoreB - scoreA;
  });

  allFranchisesList.forEach((t, idx) => {
    t.power_rank = idx + 1;
  });

  // Calculate top available Free Agents (players not on any team's roster)
  const freeAgents = masterPlayersCache
    .filter((p) => !allRosteredIds.has(p.id) && p.market_value >= 400)
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 50);

  return {
    ...userEvaluation,
    draft_picks: targetPicks,
    league_teams: allFranchisesList,
    free_agents: freeAgents,
  };
}

// MFL endpoints (support both /sync/mfl and /api/sync/mfl, GET & POST)
const mflRoutes = ['/sync/mfl', '/api/sync/mfl'];
mflRoutes.forEach((route) => {
  app.post(route, async (req: Request, res: Response) => {
    try {
      const { league_id, franchise_id, username, password, token, mfl_token, valuation_mode, year } = req.body || {};
      if (!league_id) {
        return res.status(400).json({ error: 'league_id is required' });
      }
      const identifier = franchise_id || username || '0001';
      const result = await handleMFLSync(
        league_id,
        identifier,
        year || '2026',
        valuation_mode,
        username,
        password,
        mfl_token || token
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to sync MFL roster' });
    }
  });

  app.get(route, async (req: Request, res: Response) => {
    try {
      const league_id = (req.query.league_id as string) || '';
      const franchise_id = (req.query.franchise_id as string) || '';
      const username = (req.query.username as string) || '';
      const password = (req.query.password as string) || '';
      const token = (req.query.token as string) || (req.query.mfl_token as string) || '';
      const valuation_mode = (req.query.valuation_mode as string) || 'auction_desc';
      const year = (req.query.year as string) || '2026';

      if (!league_id) {
        return res.status(400).json({ error: 'league_id is required' });
      }
      const identifier = franchise_id || username || '0001';
      const result = await handleMFLSync(
        league_id,
        identifier,
        year,
        valuation_mode,
        username,
        password,
        token
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to sync MFL roster' });
    }
  });
});

// ---------------- MFL OAuth2 & Account Linking Endpoints ----------------
const appUrl = process.env.APP_URL || 'https://ais-dev-4xoy73mixkbjdzrxabwpit-131497397430.us-east1.run.app';

// 1. Get OAuth Provider Authorization URL
app.get(['/api/auth/mfl/url', '/auth/mfl/url'], (_req: Request, res: Response) => {
  const redirectUri = `${appUrl}/auth/mfl/callback`;
  const clientId = process.env.MFL_CLIENT_ID || 'dynasty_ai_evaluator';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });

  const authUrl = `https://www.myfantasyleague.com/oauth?${params.toString()}`;

  res.json({
    url: authUrl,
    client_id: clientId,
    redirect_uri: redirectUri,
  });
});

// 2. OAuth Callback Handler with postMessage (handles trailing slashes)
app.get(['/auth/mfl/callback', '/auth/mfl/callback/'], (req: Request, res: Response) => {
  const { code, state, token } = req.query;

  // Send success message to opener window and close popup
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>MFL Authentication</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #18181b; border: 1px solid #27272a; padding: 28px; border-radius: 12px; text-align: center; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
          .success { color: #10b981; font-weight: 700; margin-bottom: 8px; font-size: 16px; }
          .sub { color: #a1a1aa; font-size: 13px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="success">✓ MFL Authentication Complete</div>
          <div class="sub">Transmitting authorization handshake to Dynasty AI Evaluator...</div>
        </div>
        <script>
          const authPayload = {
            type: 'OAUTH_AUTH_SUCCESS',
            provider: 'mfl',
            code: ${JSON.stringify(code || '')},
            token: ${JSON.stringify(token || '')},
            timestamp: Date.now()
          };

          if (window.opener) {
            window.opener.postMessage(authPayload, '*');
            setTimeout(() => window.close(), 700);
          } else {
            window.location.href = '/';
          }
        </script>
      </body>
    </html>
  `);
});

// 3. Formal Credential & Token Exchange: /api/auth/mfl/link
app.post(['/api/auth/mfl/link', '/auth/mfl/link'], async (req: Request, res: Response) => {
  try {
    const { username, password, year = '2026', token, api_key } = req.body || {};

    let sessionToken = token;
    let authUser = username || 'MFL User';
    let myLeaguesData: any = null;

    if (!sessionToken) {
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password or token is required' });
      }
      const loginResult = await loginMFL(username, password, year);
      sessionToken = loginResult.sessionId;
      myLeaguesData = loginResult.myLeagues;
    } else {
      // Validate provided token
      const checkRes = await fetchWithSslControl(
        `https://api.myfantasyleague.com/${year}/export?TYPE=myleagues&JSON=1`,
        false,
        { 'Cookie': `MFL_USER_ID=${sessionToken}` }
      );
      myLeaguesData = checkRes.data;
    }

    // Parse user leagues
    const leaguesList: any[] = [];
    const rawLeagues = myLeaguesData?.leagues?.league;
    const arrayLeagues = Array.isArray(rawLeagues) ? rawLeagues : rawLeagues ? [rawLeagues] : [];

    for (const l of arrayLeagues) {
      if (l?.league_id) {
        leaguesList.push({
          league_id: String(l.league_id),
          name: l.name || `League ${l.league_id}`,
          franchise_id: l.franchise_id ? String(l.franchise_id) : undefined,
          url: l.url || `https://www.myfantasyleague.com/${year}/home/${l.league_id}`,
        });
      }
    }

    res.json({
      status: 'authenticated',
      username: authUser,
      token: sessionToken,
      year,
      leagues: leaguesList,
      linkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to authenticate MFL account' });
  }
});

// 4. Token verification: /api/auth/mfl/verify
app.post(['/api/auth/mfl/verify', '/auth/mfl/verify'], async (req: Request, res: Response) => {
  try {
    const { token, year = '2026' } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const checkRes = await fetchWithSslControl(
      `https://api.myfantasyleague.com/${year}/export?TYPE=myleagues&JSON=1`,
      false,
      { 'Cookie': `MFL_USER_ID=${token}` }
    );

    if (checkRes.data?.error) {
      return res.status(401).json({ valid: false, error: checkRes.data.error.$t || 'Invalid session' });
    }

    const leaguesList: any[] = [];
    const rawLeagues = checkRes.data?.leagues?.league;
    const arrayLeagues = Array.isArray(rawLeagues) ? rawLeagues : rawLeagues ? [rawLeagues] : [];

    for (const l of arrayLeagues) {
      if (l?.league_id) {
        leaguesList.push({
          league_id: String(l.league_id),
          name: l.name || `League ${l.league_id}`,
          franchise_id: l.franchise_id ? String(l.franchise_id) : undefined,
          url: l.url || `https://www.myfantasyleague.com/${year}/home/${l.league_id}`,
        });
      }
    }

    res.json({ valid: true, leagues: leaguesList });
  } catch (err: any) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// 4. Direct Evaluation & Fuzzy Match
app.post(['/evaluate/roster', '/api/evaluate'], (req: Request, res: Response) => {
  try {
    const roster: RosterRecord = req.body;
    if (!roster || !Array.isArray(roster.player_ids)) {
      return res.status(400).json({ error: 'Invalid roster record payload' });
    }
    const resolvedPlayers = resolvePlayersForRoster(roster.player_ids);
    const candidatePool = [...masterPlayersCache, ...resolvedPlayers];
    const result = RosterDNAMathEngine.evaluateRoster(roster, candidatePool);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Evaluation failed' });
  }
});

app.post(['/match/fuzzy', '/api/match/fuzzy'], (req: Request, res: Response) => {
  try {
    const { names, threshold } = req.body || {};
    const namesList: string[] = Array.isArray(names) ? names : [];
    const results = NormalizationEngine.batchMatch(namesList, masterPlayersCache, threshold || 85.0);
    res.json(results);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fuzzy matching failed' });
  }
});

// 5. AI Trade Architect with Gemini and KTC values
app.post(['/api/trade/ai-suggest', '/api/ai-trade-finder'], async (req: Request, res: Response) => {
  try {
    const { userTeam, opponentTeam, leagueTeams, shopPlayerId, targetPlayerId, strategyMode } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({ fallback: true, message: 'No GEMINI_API_KEY set, relying on algorithmic KTC engine' });
    }

    const ai = new GoogleGenAI({});

    const userPlayers = (userTeam?.players || []).map((p: any) => `${p.full_name} (${p.position}, age ${p.age}, KTC: ${p.market_value})`).join(', ');
    const userPicks = (userTeam?.draft_picks || []).map((p: any) => `${p.description} (KTC: ${p.market_value})`).join(', ');

    const oppPlayers = (opponentTeam?.players || []).map((p: any) => `${p.full_name} (${p.position}, age ${p.age}, KTC: ${p.market_value})`).join(', ');
    const oppPicks = (opponentTeam?.draft_picks || []).map((p: any) => `${p.description} (KTC: ${p.market_value})`).join(', ');

    const prompt = `You are an elite Dynasty Fantasy Football General Manager and Trade Architect.
We are using KeepTradeCut (KTC) consensus dynasty market values.
Current season context: 2026 In-Season. The 2026 rookie draft has completed; priority draft class is 2027, followed by compounding multi-year 2028/2029 picks. "Flex for a 1st" is a golden rule.

User Franchise: "${userTeam?.franchise_name || 'My Team'}"
User Players: ${userPlayers || 'None listed'}
User Draft Capital: ${userPicks || '2027 1st, 2027 2nd, 2028 1st'}

Trade Partner: "${opponentTeam?.franchise_name || 'Rival Team'}"
Partner Players: ${oppPlayers || 'None listed'}
Partner Draft Capital: ${oppPicks || '2027 1st, 2027 2nd'}

Selected Shop Player (from user roster): ${shopPlayerId || 'None'}
Selected Target Player (from partner roster): ${targetPlayerId || 'None'}
Strategy Stance: ${strategyMode || 'BALANCED'}

Generate 3 balanced, realistic trade proposals in valid JSON format:
{
  "proposals": [
    {
      "id": "gemini-prop-1",
      "title": "Descriptive Package Title",
      "blueprint_type": "FAIR_EQUILIBRIUM" | "TIER_UP_SWEETENER" | "FLEX_FOR_FIRST" | "REBUILD_PIVOT" | "WIN_NOW_BOOST",
      "summary": "1-2 sentence executive summary of the deal",
      "partner_franchise_id": "${opponentTeam?.franchise_id || 'partner'}",
      "partner_franchise_name": "${opponentTeam?.franchise_name || 'Trade Partner'}",
      "send_player_names": ["Exact Name"],
      "send_pick_descriptions": ["2027 Round 1"],
      "receive_player_names": ["Exact Name"],
      "receive_pick_descriptions": ["2027 Round 2"],
      "total_ktc_sent": 5200,
      "total_ktc_received": 5350,
      "ktc_difference": 150,
      "fairness_verdict": "FAIR",
      "fairness_score_pct": 98,
      "predicted_gross_liquidity_delta": 0.7,
      "rationale_for_you": "Why this benefits user roster DNA and Gross Liquidity",
      "rationale_for_partner": "Why partner accepts based on their roster needs"
    }
  ]
}
Respond ONLY with pure JSON. Do not include markdown codeblocks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    // Map names back to actual player and pick objects
    const allUserPlayers: MasterPlayer[] = userTeam?.players || [];
    const allPartnerPlayers: MasterPlayer[] = opponentTeam?.players || [];
    const allUserPicks: DraftPick[] = userTeam?.draft_picks || [];
    const allPartnerPicks: DraftPick[] = opponentTeam?.draft_picks || [];

    const formattedProposals = (parsed.proposals || []).map((p: any, idx: number) => {
      const sendPlayers = (p.send_player_names || []).map((name: string) =>
        allUserPlayers.find((up) => up.full_name.toLowerCase() === name.toLowerCase()) || {
          id: `p-ai-${idx}-${name.toLowerCase().replace(/\s+/g, '_')}`,
          full_name: name,
          position: 'WR',
          nfl_team: 'FA',
          age: 24,
          market_value: 2500,
          consensus_rank: 50,
        }
      );

      const receivePlayers = (p.receive_player_names || []).map((name: string) =>
        allPartnerPlayers.find((pp) => pp.full_name.toLowerCase() === name.toLowerCase()) || {
          id: `p-ai-rec-${idx}-${name.toLowerCase().replace(/\s+/g, '_')}`,
          full_name: name,
          position: 'RB',
          nfl_team: 'FA',
          age: 25,
          market_value: 3000,
          consensus_rank: 40,
        }
      );

      const sendPicks = (p.send_pick_descriptions || []).map((desc: string) =>
        allUserPicks.find((pk) => pk.description.toLowerCase().includes(desc.toLowerCase())) || {
          id: `pk-ai-${idx}`,
          year: 2027,
          round: 1,
          description: desc,
          market_value: 5200,
          original_owner_id: userTeam?.franchise_id || 'user',
          current_owner_id: userTeam?.franchise_id || 'user',
        }
      );

      const receivePicks = (p.receive_pick_descriptions || []).map((desc: string) =>
        allPartnerPicks.find((pk) => pk.description.toLowerCase().includes(desc.toLowerCase())) || {
          id: `pk-ai-rec-${idx}`,
          year: 2027,
          round: 2,
          description: desc,
          market_value: 2200,
          original_owner_id: opponentTeam?.franchise_id || 'partner',
          current_owner_id: opponentTeam?.franchise_id || 'partner',
        }
      );

      return {
        id: p.id || `gemini-prop-${idx}-${Date.now()}`,
        title: p.title || 'AI Optimized Trade Proposal',
        blueprint_type: p.blueprint_type || 'FAIR_EQUILIBRIUM',
        summary: p.summary || '',
        partner_franchise_id: opponentTeam?.franchise_id || 'partner',
        partner_franchise_name: opponentTeam?.franchise_name || 'Trade Partner',
        send_players: sendPlayers,
        send_picks: sendPicks,
        receive_players: receivePlayers,
        receive_picks: receivePicks,
        total_ktc_sent: p.total_ktc_sent || 0,
        total_ktc_received: p.total_ktc_received || 0,
        ktc_difference: p.ktc_difference || 0,
        fairness_verdict: p.fairness_verdict || 'FAIR',
        fairness_score_pct: p.fairness_score_pct || 95,
        predicted_gross_liquidity_delta: p.predicted_gross_liquidity_delta || 0,
        rationale_for_you: p.rationale_for_you || '',
        rationale_for_partner: p.rationale_for_partner || '',
      };
    });

    res.json({ success: true, proposals: formattedProposals });
  } catch (err: any) {
    console.warn('Gemini trade suggestion error, returning fallback signal:', err.message);
    res.json({ fallback: true, error: err.message });
  }
});

// ---------------- Vite Middleware Mount ----------------
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dynasty AI Evaluator Server running on port ${PORT}`);
  });
}

startServer();
