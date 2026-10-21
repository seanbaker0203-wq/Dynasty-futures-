/**
 * Dynasty AI Evaluator - League Power Rankings & Strategic Trade Radar Hub
 * Displays power rankings for all teams in the league, classifies Juggernauts vs Rebuilders,
 * highlights Draft Capital portfolios, provides unrostered Free Agents, and delivers specialized
 * target groups for Contenders (Veterans) vs Rebuilders (Picks & Youth).
 */

import React, { useState, useMemo } from 'react';
import { useRoster } from '../context/RosterContext';
import { LeagueTeamSummary, StrategyGoal, StrategicTarget, Position, FlexForFirstOpportunity } from '../types';
import { DraftPickEngine } from '../lib/draftPicks';
import {
  Trophy,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Shield,
  Zap,
  Flame,
  Search,
  Filter,
  Layers,
  Sparkles,
  Award,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Coins,
  Compass,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Target,
  Swords,
  Crosshair,
  Clock,
  Gem,
} from 'lucide-react';

export const LeaguePowerRankingsView: React.FC = () => {
  const { evaluation, setActiveView, setComparisonEvaluation } = useRoster();

  // Strategy Mode Toggle: Contender Win-Now (Veterans) vs Rebuild (Picks & Youth)
  const defaultStrategy: StrategyGoal = useMemo(() => {
    if (!evaluation) return 'WIN_NOW';
    const classification = evaluation.metrics.classification;
    if (classification === 'Total Rebuild' || classification === 'Productive Struggle') {
      return 'REBUILD';
    }
    return 'WIN_NOW';
  }, [evaluation]);

  const [strategyMode, setStrategyMode] = useState<StrategyGoal>(defaultStrategy);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [stanceFilter, setStanceFilter] = useState<string>('ALL');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rankings' | 'targets' | 'flex_first' | 'freeagents'>('rankings');
  const [faPositionFilter, setFaPositionFilter] = useState<string>('ALL');

  if (!evaluation) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-400">
        Please sync or load a roster to inspect the league rankings and trade radar.
      </div>
    );
  }

  const leagueTeams = evaluation.league_teams || [];
  const freeAgents = evaluation.free_agents || [];
  const userFranchiseId = evaluation.roster.franchise_id || evaluation.roster.roster_id;

  // Find user's team in league rankings
  const userTeam = useMemo(() => {
    return (
      leagueTeams.find(
        (t) =>
          t.franchise_id === userFranchiseId ||
          t.franchise_name.toLowerCase() === (evaluation.roster.franchise_name || '').toLowerCase()
      ) || null
    );
  }, [leagueTeams, userFranchiseId, evaluation]);

  const userAllPlayers = useMemo(() => {
    return [...(evaluation.starters || []), ...(evaluation.bench || [])];
  }, [evaluation]);

  // Compute Contender Targets (Veterans from Rebuilders)
  const contenderTargets = useMemo(() => {
    return DraftPickEngine.getContenderVeteranTargets(leagueTeams, userTeam?.franchise_id);
  }, [leagueTeams, userTeam]);

  // Compute Rebuilder Targets (Picks and Youth from Contenders)
  const rebuilderTargets = useMemo(() => {
    return DraftPickEngine.getRebuilderPickAndYouthTargets(leagueTeams, userTeam?.franchise_id);
  }, [leagueTeams, userTeam]);

  // Compute "Flex for a First" Opportunities (Trading flex producers to contenders for 2027/2028 1sts)
  const flexForFirstOpps = useMemo(() => {
    return DraftPickEngine.findFlexForFirstOpportunities(userAllPlayers, leagueTeams, userTeam?.franchise_id);
  }, [userAllPlayers, leagueTeams, userTeam]);

  const displayedTargets = strategyMode === 'WIN_NOW' ? contenderTargets : rebuilderTargets;

  // Filtered league teams
  const filteredTeams = useMemo(() => {
    let list = [...leagueTeams];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (t) =>
          t.franchise_name.toLowerCase().includes(q) ||
          (t.owner_name && t.owner_name.toLowerCase().includes(q)) ||
          t.top_players.some((p) => p.full_name.toLowerCase().includes(q))
      );
    }

    if (stanceFilter === 'BUYERS') {
      list = list.filter((t) => t.trade_stance === 'WIN_NOW_BUYER' || t.trade_stance === 'BALANCED_CONTENDER');
    } else if (stanceFilter === 'SELLERS') {
      list = list.filter((t) => t.trade_stance === 'REBUILD_SELLER' || t.trade_stance === 'YOUTH_ACCUMULATOR');
    } else if (stanceFilter === 'PICKS') {
      list = list.filter((t) => (t.draft_picks || []).some((p) => p.round === 1));
    }

    return list;
  }, [leagueTeams, searchTerm, stanceFilter]);

  // Filtered Free Agents
  const filteredFreeAgents = useMemo(() => {
    if (faPositionFilter === 'ALL') return freeAgents;
    return freeAgents.filter((p) => p.position === faPositionFilter);
  }, [freeAgents, faPositionFilter]);

  // Handle trade initiation
  const handleTradeWithTeam = (team: LeagueTeamSummary) => {
    // Construct mock evaluation for comparison team
    const compEval = {
      roster: {
        roster_id: team.franchise_id,
        platform: evaluation.roster.platform,
        external_league_id: evaluation.roster.external_league_id,
        franchise_id: team.franchise_id,
        franchise_name: team.franchise_name,
        player_ids: [...team.starters, ...team.bench].map((p) => p.id),
        valuation_mode: evaluation.roster.valuation_mode,
        draft_picks: team.draft_picks,
      },
      metrics: {
        classification: team.classification,
        gross_liquidity: team.gross_liquidity,
        asset_half_life: team.asset_half_life,
        structural_integrity: team.structural_integrity,
        total_roster_value: team.total_value,
        starter_value: team.starter_value,
        bench_value: team.bench_value,
        draft_capital_value: team.draft_capital_value,
      },
      players: [...team.starters, ...team.bench],
      starters: team.starters,
      bench: team.bench,
      draft_picks: team.draft_picks,
      positional_breakdown: {},
    };

    setComparisonEvaluation(compEval as any);
    setActiveView('trade');
  };

  const getClassificationBadge = (cls: string) => {
    switch (cls) {
      case 'Juggernaut':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/80';
      case 'Contender':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      case 'Productive Struggle':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80';
      case 'Fraudulent Contender':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      case 'Total Rebuild':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/80';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  const getStanceBadge = (stance: string) => {
    switch (stance) {
      case 'WIN_NOW_BUYER':
        return 'bg-purple-900/40 text-purple-300 border-purple-600/60';
      case 'BALANCED_CONTENDER':
        return 'bg-emerald-900/40 text-emerald-300 border-emerald-600/60';
      case 'REBUILD_SELLER':
        return 'bg-rose-900/40 text-rose-300 border-rose-600/60';
      case 'YOUTH_ACCUMULATOR':
        return 'bg-cyan-900/40 text-cyan-300 border-cyan-600/60';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & League Overview Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 sm:p-6 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                {evaluation.roster.platform.toUpperCase()} LEAGUE RADAR
              </span>
              <span className="text-zinc-500 text-xs">•</span>
              <span className="text-zinc-400 text-xs font-mono">{leagueTeams.length} Franchises Ranked</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Trophy className="w-6 h-6 text-amber-400" />
              {evaluation.roster.league_name || 'Dynasty League Power Rankings'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Real-time portfolio valuations, championship window classifications, and trade matchmaking.
              Know immediately if your trade partner is an aggressive Win-Now Juggernaut or an asset-liquidating Rebuilder.
            </p>
          </div>

          {/* User's Power Rank Spotlight */}
          {userTeam && (
            <div className="flex items-center gap-3 bg-zinc-950/80 border border-cyan-500/30 rounded-xl p-3.5 sm:px-4">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center font-mono font-bold text-cyan-400 text-lg">
                #{userTeam.power_rank}
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">Your Franchise Rank</div>
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{userTeam.franchise_name}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] border ${getClassificationBadge(userTeam.classification)}`}>
                    {userTeam.classification}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 font-mono">
                  {userTeam.total_value.toLocaleString()} total pts • {userTeam.stance_label}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 border-t border-zinc-800/80 pt-4 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('rankings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'rankings'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/10'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            League Power Rankings ({leagueTeams.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('flex_first')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'flex_first'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/10'
                : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-950/30 border border-amber-500/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>"Flex for a 1st" Radar ({flexForFirstOpps.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('targets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'targets'
                ? 'bg-indigo-400 text-slate-950 font-bold shadow-md shadow-indigo-400/10'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            Strategic Target Finder ({displayedTargets.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('freeagents')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'freeagents'
                ? 'bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-400/10'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Free Agents & Waivers ({freeAgents.length})
          </button>
        </div>
      </div>

      {/* Temporal Calibration & Dynasty Strategy Doctrine */}
      <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-zinc-900 to-purple-950/30 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shrink-0">
              <Clock className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black font-mono tracking-wider uppercase text-indigo-300">
                  TEMPORAL CALIBRATION: IN-SEASON 2026 (WEEKS 3-4)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  2026 Rookie Draft Completed
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Priority: 2027 Rookie Draft Class
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Multi-Year: 2028 & 2029 Arbitrage
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed max-w-4xl">
                The 2026 rookie class is already active on rosters. Draft capital priority now centers on <strong className="text-white">2027 draft picks</strong> as the premier liquid asset. Additionally, trading for picks <strong className="text-cyan-300">multiple years out (2028 & 2029)</strong> is a dominant dynasty exploit—rivals discount far-off years, allowing you to buy compounding equity before contender rosters decay. Live by the cardinal dynasty rule: <strong className="text-amber-300">"Flex for a First"</strong>—trade productive flex starters to desperate contenders when in-season urgency peaks!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('flex_first')}
              className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black font-mono text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-400/10 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              View Flex for 1st Deals ({flexForFirstOpps.length})
            </button>
          </div>
        </div>
      </div>

      {/* 2. STRATEGY MODE BANNER: Win-Now vs Rebuild (Crucial User Requirement!) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${strategyMode === 'WIN_NOW' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'}`}>
              {strategyMode === 'WIN_NOW' ? <Flame className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  Strategy Objective: {strategyMode === 'WIN_NOW' ? 'Championship Win-Now Mode' : 'Dynasty Reconstruction / Rebuild Mode'}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {strategyMode === 'WIN_NOW' ? 'Targeting Productive Veterans' : 'Targeting Future Picks & Youth'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {strategyMode === 'WIN_NOW'
                  ? 'As a contender, target high-scoring veteran producers from rebuilding teams who are looking to liquidate points.'
                  : 'As a rebuilder, target future 1st & 2nd round picks and ascending 21-24 year-old cornerstones from win-now buyers.'}
              </p>
            </div>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setStrategyMode('WIN_NOW')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                strategyMode === 'WIN_NOW'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Contender (Win Now)
            </button>

            <button
              type="button"
              onClick={() => setStrategyMode('REBUILD')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                strategyMode === 'REBUILD'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Rebuilder (Picks & Youth)
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: LEAGUE POWER RANKINGS */}
      {activeTab === 'rankings' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/80">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search team, owner, or player..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto text-xs font-mono">
              <button
                type="button"
                onClick={() => setStanceFilter('ALL')}
                className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                  stanceFilter === 'ALL' ? 'bg-zinc-800 text-white border-zinc-700 font-bold' : 'text-zinc-400 border-transparent hover:bg-zinc-800/50'
                }`}
              >
                All Teams
              </button>
              <button
                type="button"
                onClick={() => setStanceFilter('BUYERS')}
                className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                  stanceFilter === 'BUYERS' ? 'bg-purple-950/80 text-purple-300 border-purple-800 font-bold' : 'text-zinc-400 border-transparent hover:bg-zinc-800/50'
                }`}
              >
                Contenders / Buyers
              </button>
              <button
                type="button"
                onClick={() => setStanceFilter('SELLERS')}
                className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                  stanceFilter === 'SELLERS' ? 'bg-rose-950/80 text-rose-300 border-rose-800 font-bold' : 'text-zinc-400 border-transparent hover:bg-zinc-800/50'
                }`}
              >
                Rebuilders / Sellers
              </button>
              <button
                type="button"
                onClick={() => setStanceFilter('PICKS')}
                className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                  stanceFilter === 'PICKS' ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800 font-bold' : 'text-zinc-400 border-transparent hover:bg-zinc-800/50'
                }`}
              >
                Has 1st Round Picks
              </button>
            </div>
          </div>

          {/* Teams List */}
          <div className="space-y-3">
            {filteredTeams.map((team) => {
              const isUser = team.franchise_id === userFranchiseId || team.franchise_name === userTeam?.franchise_name;
              const isExpanded = expandedTeamId === team.franchise_id;
              const totalPicks = (team.draft_picks || []).length;
              const round1Picks = (team.draft_picks || []).filter((p) => p.round === 1).length;

              return (
                <div
                  key={team.franchise_id}
                  className={`rounded-xl border transition-all ${
                    isUser
                      ? 'border-cyan-500/40 bg-zinc-900/90 ring-1 ring-cyan-500/20 shadow-lg shadow-cyan-950/10'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Rank & Team Identity */}
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm shrink-0 border ${
                          team.power_rank === 1
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : team.power_rank === 2
                            ? 'bg-slate-300/20 text-slate-200 border-slate-400/40'
                            : team.power_rank === 3
                            ? 'bg-amber-700/20 text-amber-500 border-amber-700/40'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        #{team.power_rank}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                            {team.franchise_name}
                          </h3>
                          {isUser && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-500 text-slate-950 font-bold">
                              YOU
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getClassificationBadge(team.classification)}`}>
                            {team.classification}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getStanceBadge(team.trade_stance)}`}>
                            {team.stance_label}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-mono">
                          {team.owner_name && <span>Owner: {team.owner_name}</span>}
                          <span>Window: <strong className="text-zinc-200">{team.championship_window_status}</strong></span>
                          <span>Picks: <strong className="text-cyan-400">{totalPicks} total</strong> {round1Picks > 0 && `(${round1Picks} 1sts)`}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Financial & DNA Metric Badges */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center lg:text-right font-mono text-xs">
                      <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80">
                        <div className="text-[10px] text-zinc-500 uppercase">Total Value</div>
                        <div className="font-bold text-white text-sm">{team.total_value.toLocaleString()}</div>
                      </div>

                      <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80">
                        <div className="text-[10px] text-zinc-500 uppercase">Starters</div>
                        <div className="font-bold text-emerald-400 text-sm">{team.starter_value.toLocaleString()}</div>
                      </div>

                      <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80">
                        <div className="text-[10px] text-zinc-500 uppercase">Draft Capital</div>
                        <div className="font-bold text-cyan-400 text-sm">{team.draft_capital_value.toLocaleString()}</div>
                      </div>

                      <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80 hidden sm:block">
                        <div className="text-[10px] text-zinc-500 uppercase">Half-Life</div>
                        <div className={`font-bold text-sm ${team.asset_half_life >= 3.5 ? 'text-cyan-400' : team.asset_half_life < 2.2 ? 'text-rose-400' : 'text-zinc-200'}`}>
                          {team.asset_half_life} yrs
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/60">
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleTradeWithTeam(team)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          Trade
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedTeamId(isExpanded ? null : team.franchise_id)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide' : 'Details'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Top Key Assets Row (Always visible for fast scanning) */}
                  <div className="px-4 pb-3 sm:px-5 sm:pb-4 flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/40">
                    <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1">Top Assets:</span>
                    {team.top_players.slice(0, 4).map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800 text-[11px] font-mono"
                      >
                        <span className="font-bold text-white">{p.full_name}</span>
                        <span className="text-zinc-500">({p.position}, Age {p.age})</span>
                        <span className="text-cyan-400">{p.market_value}</span>
                      </span>
                    ))}
                  </div>

                  {/* Expanded Full Roster & Pick Portfolio Details */}
                  {isExpanded && (
                    <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950/80 space-y-4">
                      {/* Trade Matchmaking Strategy Insight */}
                      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                        <div className="font-bold text-white flex items-center gap-1.5 mb-1">
                          <Compass className="w-4 h-4 text-cyan-400" />
                          Trade Matchmaking Analysis with {team.franchise_name}
                        </div>
                        <p className="text-zinc-400 text-xs">{team.stance_description}</p>
                      </div>

                      {/* Draft Picks Stash */}
                      <div>
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-cyan-400" />
                          Draft Pick Portfolio ({team.draft_picks?.length || 0} picks)
                        </h4>
                        {(!team.draft_picks || team.draft_picks.length === 0) ? (
                          <div className="text-xs text-zinc-500 font-mono">No future draft picks recorded.</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {team.draft_picks.map((pick) => (
                              <div
                                key={pick.id}
                                className={`p-2 rounded border flex items-center justify-between text-xs font-mono ${
                                  pick.is_priority_class
                                    ? 'bg-amber-950/20 border-amber-500/30 text-zinc-200'
                                    : (pick.years_out ?? 0) >= 1
                                    ? 'bg-cyan-950/20 border-cyan-500/30 text-zinc-200'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                }`}
                              >
                                <div className="flex flex-col">
                                  <span>{pick.description}</span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {pick.is_priority_class && (
                                      <span className="px-1 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold">
                                        2027 Priority
                                      </span>
                                    )}
                                    {(pick.years_out ?? 0) >= 1 && (
                                      <span className="px-1 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-bold">
                                        {pick.year} Multi-Year
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="font-bold text-cyan-400">{pick.market_value.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Full Starters Roster */}
                      <div>
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          Starting Lineup ({team.starters.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {team.starters.map((p) => (
                            <div
                              key={p.id}
                              className="p-2 rounded bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between text-xs"
                            >
                              <div className="truncate">
                                <span className="font-bold text-white mr-1">{p.full_name}</span>
                                <span className="text-zinc-500 text-[10px] font-mono">{p.position} • {p.nfl_team}</span>
                              </div>
                              <span className="font-mono text-cyan-400 shrink-0">{p.market_value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: STRATEGIC TARGET FINDER (Contenders targeting Veterans vs Rebuilders targeting Picks) */}
      {activeTab === 'targets' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-white text-sm">
                {strategyMode === 'WIN_NOW' ? 'Veteran Heavyweight Targets' : 'Draft Pick & Youth Foundation Targets'}
              </span>
              <p className="text-zinc-400 mt-0.5">
                {strategyMode === 'WIN_NOW'
                  ? 'Matched players belong to Rebuilding or Youth Accumulator teams in your league. They have declining windows and are motivated sellers.'
                  : 'Matched picks and young foundation assets belong to Contender teams pushing for immediate points.'}
              </p>
            </div>
            <div className="shrink-0 font-mono text-cyan-400 font-bold">
              {displayedTargets.length} Optimal Opportunities
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedTargets.map((target) => {
              const matchedTeam = leagueTeams.find((t) => t.franchise_id === target.owner_franchise_id);

              return (
                <div
                  key={target.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3 relative overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                            target.type === 'VETERAN'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                              : target.type === 'MULTI_YEAR_PICK'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : target.type === 'PICK'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {target.type === 'VETERAN'
                            ? 'Win-Now Veteran Producer'
                            : target.type === 'MULTI_YEAR_PICK'
                            ? '💎 Multi-Year Compounding Pick'
                            : target.type === 'PICK'
                            ? '🌟 2027 Priority Draft Pick'
                            : 'Ascending Young Cornerstone'}
                        </span>
                        <h3 className="text-base font-bold text-white tracking-tight mt-1.5">
                          {target.name}
                        </h3>
                        {target.multi_year_bonus && (
                          <div className="mt-1 text-[11px] font-mono text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 inline-flex items-center gap-1">
                            <Gem className="w-3 h-3 text-cyan-400" />
                            {target.multi_year_bonus}
                          </div>
                        )}
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">
                          {target.position && <span>{target.position} • </span>}
                          {target.age && <span>Age {target.age} • </span>}
                          <strong className="text-cyan-400">{target.market_value.toLocaleString()} market pts</strong>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-zinc-500 font-mono uppercase">Held By</div>
                        <div className="text-xs font-bold text-zinc-200">{target.owner_franchise_name}</div>
                        <div className="text-[10px] font-mono text-rose-400 mt-0.5">
                          {target.owner_trade_stance.replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1.5 text-xs">
                      <div>
                        <span className="text-zinc-500 font-mono text-[10px] uppercase block">Why They Will Sell:</span>
                        <p className="text-zinc-300">{target.rationale}</p>
                      </div>
                      <div className="pt-1.5 border-t border-zinc-800">
                        <span className="text-emerald-400 font-mono text-[10px] uppercase font-bold block">Recommended Trade Offer:</span>
                        <p className="text-zinc-200">{target.suggested_offer}</p>
                      </div>
                    </div>
                  </div>

                  {matchedTeam && (
                    <button
                      type="button"
                      onClick={() => handleTradeWithTeam(matchedTeam)}
                      className="w-full mt-2 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Build Trade with {target.owner_franchise_name} &rarr;
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: "FLEX FOR A FIRST" RADAR (Golden Dynasty Rule) */}
      {activeTab === 'flex_first' && (
        <div className="space-y-6">
          {/* Concept Header & Strategic Doctrine */}
          <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-zinc-900 to-yellow-950/20 p-5 sm:p-6 shadow-xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider bg-amber-400 text-zinc-950">
                    DYNASTY RULE TO LIVE BY
                  </span>
                  <span className="text-xs font-mono text-amber-300 font-bold">
                    "Flex for a First" Doctrine
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  Trading Flex Players for Future Firsts When the Time is Right
                </h2>
                <p className="text-xs text-zinc-300 leading-relaxed max-w-3xl">
                  <strong>The Golden Rule:</strong> Flex points (WR3/WR4s, RB2s, situational starters) are transient and replaceable through waivers and depth. <strong>Future 1st Round Picks (2027 & 2028)</strong> are scarce, appreciating blue-chip equity tickets that never suffer injuries or age-cliffs.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-zinc-950/80 text-amber-300 border border-amber-500/30">
                    🕒 Timing: Weeks 3-10 In-Season Urgency Peak
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-950/80 text-emerald-300 border border-emerald-500/30">
                    🏆 Contender Target: Teams fighting for playoff seeds
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-950/80 text-cyan-300 border border-cyan-500/30">
                    📈 Return: Permanent 2027 / 2028 First-Round Equity
                  </span>
                </div>
              </div>

              <div className="bg-zinc-950/90 border border-amber-500/30 p-4 rounded-xl flex items-center gap-4 shrink-0">
                <div className="text-center">
                  <div className="text-2xl font-black font-mono text-amber-400">
                    {flexForFirstOpps.length}
                  </div>
                  <div className="text-[10px] uppercase font-mono text-zinc-400">
                    High-Leverage Matches
                  </div>
                </div>
                <div className="w-px h-8 bg-zinc-800" />
                <div className="text-center">
                  <div className="text-2xl font-black font-mono text-cyan-400">
                    2027 & 2028
                  </div>
                  <div className="text-[10px] uppercase font-mono text-zinc-400">
                    Target 1st Round Picks
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Opportunities Cards Grid */}
          {flexForFirstOpps.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-400 space-y-2">
              <p className="text-sm font-bold text-zinc-300">
                No Direct "Flex for a 1st" Matches Detected Right Now
              </p>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                To execute this strategy, ensure you have flex-tier players (WR2/WR3, RB2 with market value 1,400 to 3,800) and that rival contenders hold 2027 or 2028 1st round draft picks.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {flexForFirstOpps.map((opp) => (
                <div
                  key={opp.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-4 shadow-lg hover:border-amber-500/50 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header: Urgency & Timing */}
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                          opp.urgency === 'HIGH'
                            ? 'bg-rose-950 text-rose-300 border border-rose-700/80'
                            : 'bg-amber-950 text-amber-300 border border-amber-700/80'
                        }`}>
                          {opp.urgency} Urgency
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {opp.timing_window}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                        {opp.target_pick.is_priority_class ? '🌟 Next draft' : '💎 Multi-Year \'28 Pick'}
                      </span>
                    </div>

                    {/* Trade Matchup Row: Your Flex Player -> Contender's 1st */}
                    <div className="grid grid-cols-1 sm:grid-cols-11 gap-2 items-center bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80">
                      {/* Left: Your Flex Player */}
                      <div className="sm:col-span-5 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-zinc-500">You Send (Flex Asset)</span>
                        <div className="font-bold text-white text-sm">{opp.flex_player.full_name}</div>
                        <div className="text-[11px] font-mono text-zinc-400">
                          {opp.flex_player.position} • Age {opp.flex_player.age} • <span className="text-amber-400 font-bold">{opp.flex_player.market_value.toLocaleString()} pts</span>
                        </div>
                      </div>

                      {/* Middle: Swap Arrow */}
                      <div className="sm:col-span-1 text-center py-1 sm:py-0">
                        <ArrowLeftRight className="w-4 h-4 text-amber-400 mx-auto" />
                      </div>

                      {/* Right: Target 1st Pick */}
                      <div className="sm:col-span-5 space-y-1 sm:text-right">
                        <span className="text-[10px] font-mono uppercase text-zinc-500">You Receive (Appreciating Pick)</span>
                        <div className="font-bold text-cyan-300 text-sm">{opp.target_pick.description}</div>
                        <div className="text-[11px] font-mono text-zinc-400">
                          Round 1 • <span className="text-cyan-400 font-bold">{opp.target_pick.market_value.toLocaleString()} pts</span> • via {opp.target_team.franchise_name}
                        </div>
                      </div>
                    </div>

                    {/* Rationale & Tactical Opportunity */}
                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 space-y-1">
                        <div className="text-[10px] font-mono uppercase font-bold text-amber-400">
                          Tactical Window Rationale:
                        </div>
                        <p className="leading-relaxed">{opp.rationale}</p>
                      </div>

                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 space-y-1">
                        <div className="text-[10px] font-mono uppercase font-bold text-cyan-400">
                          Contender Vulnerability & Urgency:
                        </div>
                        <p className="leading-relaxed">{opp.contender_vulnerability}</p>
                      </div>

                      <div className="p-2 rounded bg-zinc-950/60 border border-emerald-900/40 text-emerald-300 text-[11px] font-mono">
                        <strong>Recommended Blueprint:</strong> {opp.suggested_offer}
                      </div>
                    </div>
                  </div>

                  {/* Action CTA */}
                  <button
                    type="button"
                    onClick={() => handleTradeWithTeam(opp.target_team)}
                    className="w-full mt-2 py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold font-mono text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-400/10"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Load "Flex for a 1st" Trade with {opp.target_team.franchise_name} &rarr;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FREE AGENTS & WAIVER RADAR */}
      {activeTab === 'freeagents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-white">Unrostered Free Agent Pool</h3>
              <p className="text-xs text-zinc-400">
                Top players available on the waiver wire not currently claimed by any of the {leagueTeams.length} franchises in your league.
              </p>
            </div>

            {/* Position filter */}
            <div className="flex items-center gap-1 text-xs font-mono overflow-x-auto">
              {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setFaPositionFilter(pos)}
                  className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                    faPositionFilter === pos
                      ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400'
                      : 'text-zinc-400 border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 font-mono text-[11px] uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Player</th>
                    <th className="py-2.5 px-3">Position</th>
                    <th className="py-2.5 px-3">NFL Team</th>
                    <th className="py-2.5 px-3">Age</th>
                    <th className="py-2.5 px-4 text-right">Dynasty Market Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {filteredFreeAgents.slice(0, 40).map((player) => (
                    <tr key={player.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-4 font-sans font-bold text-white">
                        {player.full_name}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300">
                          {player.position}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400">{player.nfl_team}</td>
                      <td className="py-2.5 px-3 text-zinc-400">{player.age}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                        {player.market_value.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
