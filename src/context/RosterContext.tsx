import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { RosterEvaluationResult, SyncRequest, Platform } from '../types';
import { SEED_PLAYERS } from '../data/seedPlayers';
import { DEMO_ROSTERS } from '../data/demoRosters';
import { RosterDNAMathEngine } from '../lib/rosterMath';
import { generateDemoLeagueTeams } from '../lib/demoLeague';

export type DashboardViewMode =
  | 'ingest'
  | 'single'
  | 'optimization'
  | 'league'
  | 'compare'
  | 'trade';

interface RosterContextType {
  evaluation: RosterEvaluationResult | null;
  comparisonEvaluation: RosterEvaluationResult | null;
  setComparisonEvaluation: (result: RosterEvaluationResult | null) => void;
  activeView: DashboardViewMode;
  setActiveView: (view: DashboardViewMode) => void;
  isLoading: boolean;
  isComparisonLoading: boolean;
  error: string | null;
  comparisonError: string | null;
  activePlatform: Platform;
  /** True when the current data is the built-in sample, not a real league */
  isDemo: boolean;
  syncRoster: (req: SyncRequest) => Promise<void>;
  syncComparisonRoster: (req: SyncRequest) => Promise<void>;
  /** Re-evaluate the synced league from another team's point of view (makes it "my team") */
  selectMyTeam: (franchiseId: string) => Promise<void>;
  /** Load another team in the synced league as the comparison / trade partner */
  compareWithLeagueTeam: (franchiseId: string) => Promise<void>;
  loadDemoRoster: (type: 'juggernaut' | 'contender' | 'rebuild') => void;
  loadComparisonDemo: (type: 'juggernaut' | 'contender' | 'rebuild') => void;
  clearRoster: () => void;
  clearComparisonRoster: () => void;
  syncHistory: SyncRequest[];
}

const RosterContext = createContext<RosterContextType | undefined>(undefined);

const HISTORY_KEY = 'dynasty_sync_history';

/** Only non-secret fields are remembered between visits. */
const toHistoryEntry = (req: SyncRequest): SyncRequest => ({
  platform: req.platform,
  league_id: req.league_id,
  username: req.platform === 'sleeper' ? req.username : undefined,
  franchise_id: req.franchise_id,
});

async function postSync(req: SyncRequest): Promise<RosterEvaluationResult> {
  const endpoint = req.platform === 'sleeper' ? '/api/sync/sleeper' : '/api/sync/mfl';
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Sync failed (${response.status}).`);
  return data as RosterEvaluationResult;
}

export const RosterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [evaluation, setEvaluation] = useState<RosterEvaluationResult | null>(null);
  const [comparisonEvaluation, setComparisonEvaluation] = useState<RosterEvaluationResult | null>(null);
  const [activeView, setActiveView] = useState<DashboardViewMode>('ingest');
  const [isLoading, setIsLoading] = useState(false);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>('mfl');
  const [isDemo, setIsDemo] = useState(false);
  const [syncHistory, setSyncHistory] = useState<SyncRequest[]>([]);
  // Last successful request, kept in memory only (may hold an MFL password or API key).
  const lastSync = useRef<SyncRequest | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setSyncHistory((JSON.parse(saved) as SyncRequest[]).map(toHistoryEntry));
    } catch {
      // Storage unavailable (private mode); history is a convenience only.
    }
  }, []);

  const saveToHistory = (req: SyncRequest) => {
    const entry = toHistoryEntry(req);
    setSyncHistory((prev) => {
      const updated = [entry, ...prev.filter((h) => !(h.platform === entry.platform && h.league_id === entry.league_id))].slice(0, 5);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const syncRoster = async (req: SyncRequest): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await postSync(req);
      const myTeamId = result.roster.franchise_id;
      lastSync.current = { ...req, franchise_id: myTeamId };
      setActivePlatform(req.platform);
      setIsDemo(false);
      setEvaluation(result);
      setComparisonEvaluation(null);
      setActiveView('single');
      saveToHistory({ ...req, franchise_id: myTeamId });
    } catch (err: any) {
      setError(err.message || 'Sync failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const syncComparisonRoster = async (req: SyncRequest): Promise<void> => {
    setIsComparisonLoading(true);
    setComparisonError(null);
    try {
      setComparisonEvaluation(await postSync(req));
    } catch (err: any) {
      setComparisonError(err.message || 'Sync failed.');
    } finally {
      setIsComparisonLoading(false);
    }
  };

  const selectMyTeam = async (franchiseId: string) => {
    if (!lastSync.current) return;
    await syncRoster({ ...lastSync.current, franchise_id: franchiseId });
  };

  const compareWithLeagueTeam = async (franchiseId: string) => {
    if (!lastSync.current) return;
    await syncComparisonRoster({ ...lastSync.current, franchise_id: franchiseId });
  };

  // Sample data for first-time visitors: always explicit, always labelled.
  const demoEvaluation = (type: 'juggernaut' | 'contender' | 'rebuild') => {
    const demo = DEMO_ROSTERS[type];
    const result = RosterDNAMathEngine.evaluateRoster(demo, SEED_PLAYERS);
    const league = generateDemoLeagueTeams(demo.franchise_name);
    return {
      ...result,
      draft_picks: league.user_draft_picks,
      league_teams: league.league_teams,
      free_agents: league.free_agents,
      warnings: ['Sample data: these are not real league rosters or current values.', ...(result.warnings || [])],
    };
  };

  const loadDemoRoster = (type: 'juggernaut' | 'contender' | 'rebuild') => {
    lastSync.current = null;
    setError(null);
    setIsDemo(true);
    setActivePlatform(DEMO_ROSTERS[type].platform);
    setEvaluation(demoEvaluation(type));
    setComparisonEvaluation(null);
    setActiveView('single');
  };

  const loadComparisonDemo = (type: 'juggernaut' | 'contender' | 'rebuild') => {
    setComparisonError(null);
    setComparisonEvaluation(demoEvaluation(type));
  };

  return (
    <RosterContext.Provider
      value={{
        evaluation,
        comparisonEvaluation,
        setComparisonEvaluation,
        activeView,
        setActiveView,
        isLoading,
        isComparisonLoading,
        error,
        comparisonError,
        activePlatform,
        isDemo,
        syncRoster,
        syncComparisonRoster,
        selectMyTeam,
        compareWithLeagueTeam,
        loadDemoRoster,
        loadComparisonDemo,
        clearRoster: () => {
          setEvaluation(null);
          setError(null);
          setIsDemo(false);
          lastSync.current = null;
        },
        clearComparisonRoster: () => {
          setComparisonEvaluation(null);
          setComparisonError(null);
        },
        syncHistory,
      }}
    >
      {children}
    </RosterContext.Provider>
  );
};

export const useRoster = (): RosterContextType => {
  const context = useContext(RosterContext);
  if (!context) throw new Error('useRoster must be used within a RosterProvider');
  return context;
};
