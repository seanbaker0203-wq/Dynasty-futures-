import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  RosterEvaluationResult,
  SyncRequest,
  Platform,
  MasterPlayer,
  RosterRecord,
} from '../types';
import { SEED_PLAYERS } from '../data/seedPlayers';
import { DEMO_ROSTERS } from '../data/demoRosters';
import { RosterDNAMathEngine } from '../lib/rosterMath';
import { NormalizationEngine } from '../lib/normalization';
import { generateDemoLeagueTeams } from '../lib/demoLeague';

export type DashboardViewMode =
  | 'ingest'
  | 'single'
  | 'sitstart'
  | 'optimization'
  | 'league'
  | 'compare'
  | 'trade'
  | 'market';

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
  syncRoster: (req: SyncRequest) => Promise<void>;
  syncComparisonRoster: (req: SyncRequest) => Promise<void>;
  loadDemoRoster: (type: 'juggernaut' | 'contender' | 'rebuild') => void;
  loadComparisonDemo: (type: 'juggernaut' | 'contender' | 'rebuild') => void;
  uploadCsvRoster: (csvText: string, teamName?: string) => Promise<void>;
  uploadComparisonCsv: (csvText: string, teamName?: string) => Promise<void>;
  clearRoster: () => void;
  clearComparisonRoster: () => void;
  syncHistory: SyncRequest[];
}

const RosterContext = createContext<RosterContextType | undefined>(undefined);

export const RosterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [evaluation, setEvaluation] = useState<RosterEvaluationResult | null>(null);
  const [comparisonEvaluation, setComparisonEvaluation] = useState<RosterEvaluationResult | null>(null);
  const [activeView, setActiveView] = useState<DashboardViewMode>('ingest');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isComparisonLoading, setIsComparisonLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>('mfl');
  const [syncHistory, setSyncHistory] = useState<SyncRequest[]>([]);

  // Load initial demo data in background, but preserve 'ingest' as initial landing page
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('dynasty_sync_history');
      if (savedHistory) {
        setSyncHistory(JSON.parse(savedHistory));
      }
    } catch {
      // Ignore localStorage errors
    }

    // Pre-populate comparison demo in background
    loadComparisonDemo('contender');
  }, []);

  const saveToHistory = (req: SyncRequest) => {
    setSyncHistory((prev) => {
      const filtered = prev.filter(
        (h) => !(h.platform === req.platform && h.league_id === req.league_id)
      );
      const updated = [req, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('dynasty_sync_history', JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const syncRoster = async (req: SyncRequest): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setActivePlatform(req.platform);

    try {
      const endpoint = req.platform === 'sleeper' ? '/sync/sleeper' : '/sync/mfl';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.detail || `Server error (${response.status})`);
      }

      const result: RosterEvaluationResult = await response.json();
      const mockLeague = (!result.league_teams || result.league_teams.length === 0)
        ? generateDemoLeagueTeams(result.roster.franchise_name || 'My Franchise')
        : null;

      const finalResult: RosterEvaluationResult = {
        ...result,
        league_teams: result.league_teams && result.league_teams.length > 0 ? result.league_teams : mockLeague?.league_teams,
        free_agents: result.free_agents && result.free_agents.length > 0 ? result.free_agents : mockLeague?.free_agents,
        draft_picks: result.draft_picks && result.draft_picks.length > 0 ? result.draft_picks : mockLeague?.user_draft_picks,
      };

      setEvaluation(finalResult);
      setActiveView('single');
      saveToHistory(req);
    } catch (err: any) {
      console.warn('API sync endpoint failed, attempting client-side adapter fallback:', err);
      try {
        if (req.platform === 'sleeper') {
          const { SleeperClientAdapter } = await import('../lib/adapters/sleeperAdapter');
          const adapter = new SleeperClientAdapter();
          const identifier = req.username || req.franchise_id || '';
          const rosterRecord = await adapter.fetchRoster(req.league_id, identifier);
          const result = RosterDNAMathEngine.evaluateRoster(rosterRecord, SEED_PLAYERS);
          setEvaluation(result);
          setActiveView('single');
          saveToHistory(req);
          return;
        } else if (req.platform === 'mfl') {
          const { MFLClientAdapter } = await import('../lib/adapters/mflAdapter');
          const adapter = new MFLClientAdapter(req.year || '2026', req.username, req.password, req.mfl_token);
          const identifier = req.franchise_id || req.username || '0001';
          const rosterRecord = await adapter.fetchRoster(req.league_id, identifier);
          const result = RosterDNAMathEngine.evaluateRoster(rosterRecord, SEED_PLAYERS);
          setEvaluation(result);
          setActiveView('single');
          saveToHistory(req);
          return;
        }
      } catch (clientErr: any) {
        setError(clientErr.message || err.message || 'Failed to sync fantasy roster.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const syncComparisonRoster = async (req: SyncRequest): Promise<void> => {
    setIsComparisonLoading(true);
    setComparisonError(null);

    try {
      const endpoint = req.platform === 'sleeper' ? '/sync/sleeper' : '/sync/mfl';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.detail || `Server error (${response.status})`);
      }

      const result: RosterEvaluationResult = await response.json();
      setComparisonEvaluation(result);
      saveToHistory(req);
    } catch (err: any) {
      console.warn('Comparison sync endpoint failed, attempting client-side fallback:', err);
      try {
        if (req.platform === 'sleeper') {
          const { SleeperClientAdapter } = await import('../lib/adapters/sleeperAdapter');
          const adapter = new SleeperClientAdapter();
          const identifier = req.username || req.franchise_id || '';
          const rosterRecord = await adapter.fetchRoster(req.league_id, identifier);
          const result = RosterDNAMathEngine.evaluateRoster(rosterRecord, SEED_PLAYERS);
          setComparisonEvaluation(result);
          return;
        } else if (req.platform === 'mfl') {
          const { MFLClientAdapter } = await import('../lib/adapters/mflAdapter');
          const adapter = new MFLClientAdapter(req.year || '2026', req.username, req.password, req.mfl_token);
          const identifier = req.franchise_id || req.username || '0001';
          const rosterRecord = await adapter.fetchRoster(req.league_id, identifier);
          const result = RosterDNAMathEngine.evaluateRoster(rosterRecord, SEED_PLAYERS);
          setComparisonEvaluation(result);
          return;
        }
      } catch (clientErr: any) {
        setComparisonError(clientErr.message || err.message || 'Failed to sync opponent roster.');
      }
    } finally {
      setIsComparisonLoading(false);
    }
  };

  const loadDemoRoster = (type: 'juggernaut' | 'contender' | 'rebuild') => {
    setIsLoading(true);
    setError(null);
    const demo = DEMO_ROSTERS[type];
    setActivePlatform(demo.platform);
    const result = RosterDNAMathEngine.evaluateRoster(demo, SEED_PLAYERS);
    const demoLeague = generateDemoLeagueTeams(demo.franchise_name);
    setEvaluation({
      ...result,
      draft_picks: demoLeague.user_draft_picks,
      league_teams: demoLeague.league_teams,
      free_agents: demoLeague.free_agents,
    });
    setActiveView('single');
    setIsLoading(false);
  };

  const loadComparisonDemo = (type: 'juggernaut' | 'contender' | 'rebuild') => {
    setIsComparisonLoading(true);
    setComparisonError(null);
    const demo = DEMO_ROSTERS[type];
    const result = RosterDNAMathEngine.evaluateRoster(demo, SEED_PLAYERS);
    const demoLeague = generateDemoLeagueTeams(demo.franchise_name);
    setComparisonEvaluation({
      ...result,
      draft_picks: demoLeague.user_draft_picks,
      league_teams: demoLeague.league_teams,
      free_agents: demoLeague.free_agents,
    });
    setIsComparisonLoading(false);
  };

  const parseCsvToRecord = (csvText: string, teamName?: string, defaultId = 'csv-roster'): RosterRecord => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const rawNames: string[] = [];
    for (const line of lines) {
      if (/player|name|roster/i.test(line) && /pos|team|rank/i.test(line)) {
        continue;
      }
      const parts = line.split(/[,;\t]/);
      const nameCandidate = parts[0].replace(/^["']|["']$/g, '').trim();
      if (nameCandidate) {
        rawNames.push(nameCandidate);
      }
    }

    if (rawNames.length === 0) {
      throw new Error('No valid player names found in CSV.');
    }

    const matchCandidates = NormalizationEngine.batchMatch(rawNames, SEED_PLAYERS, 85.0);
    const matchedPlayerIds: string[] = [];

    for (const c of matchCandidates) {
      if (c.matched_player_id) {
        matchedPlayerIds.push(c.matched_player_id);
      }
    }

    return {
      roster_id: defaultId,
      platform: 'csv',
      external_league_id: 'csv-upload',
      franchise_id: `${defaultId}-franchise`,
      franchise_name: teamName || 'CSV Ingested Roster',
      league_name: 'Custom CSV Portfolio',
      player_ids: matchedPlayerIds,
      valuation_mode: 'auction_desc',
    };
  };

  const uploadCsvRoster = async (csvText: string, teamName?: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setActivePlatform('csv');
    try {
      const record = parseCsvToRecord(csvText, teamName, 'csv-primary');
      const result = RosterDNAMathEngine.evaluateRoster(record, SEED_PLAYERS);
      const demoLeague = generateDemoLeagueTeams(record.franchise_name || 'CSV Ingested Roster');
      setEvaluation({
        ...result,
        draft_picks: demoLeague.user_draft_picks,
        league_teams: demoLeague.league_teams,
        free_agents: demoLeague.free_agents,
      });
      setActiveView('single');
    } catch (err: any) {
      setError(err.message || 'Failed to process CSV roster.');
    } finally {
      setIsLoading(false);
    }
  };

  const uploadComparisonCsv = async (csvText: string, teamName?: string): Promise<void> => {
    setIsComparisonLoading(true);
    setComparisonError(null);
    try {
      const record = parseCsvToRecord(csvText, teamName, 'csv-comparison');
      const result = RosterDNAMathEngine.evaluateRoster(record, SEED_PLAYERS);
      setComparisonEvaluation(result);
    } catch (err: any) {
      setComparisonError(err.message || 'Failed to process opponent CSV roster.');
    } finally {
      setIsComparisonLoading(false);
    }
  };

  const clearRoster = () => {
    setEvaluation(null);
    setError(null);
  };

  const clearComparisonRoster = () => {
    setComparisonEvaluation(null);
    setComparisonError(null);
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
        syncRoster,
        syncComparisonRoster,
        loadDemoRoster,
        loadComparisonDemo,
        uploadCsvRoster,
        uploadComparisonCsv,
        clearRoster,
        clearComparisonRoster,
        syncHistory,
      }}
    >
      {children}
    </RosterContext.Provider>
  );
};

export const useRoster = (): RosterContextType => {
  const context = useContext(RosterContext);
  if (!context) {
    throw new Error('useRoster must be used within a RosterProvider');
  }
  return context;
};
