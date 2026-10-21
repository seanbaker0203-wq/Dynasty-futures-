/**
 * Dynasty AI Evaluator - AI Trade Architect
 * Allows users to select a player to shop from their roster, a player to target from another roster,
 * or both, and lets AI architect balanced, win-win trade packages using market values.
 */

import React, { useState, useMemo } from 'react';
import { MasterPlayer, DraftPick, LeagueTeamSummary, AITradeProposal } from '../types';
import { AITradeFinderEngine } from '../lib/aiTradeFinder';
import {
  Sparkles,
  Search,
  ArrowRight,
  ArrowLeftRight,
  TrendingUp,
  Coins,
  Shield,
  Layers,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Users,
  Target,
  Zap,
  Info,
} from 'lucide-react';

interface AITradeArchitectProps {
  userTeam: {
    franchise_id: string;
    franchise_name?: string;
    players: MasterPlayer[];
    draft_picks?: DraftPick[];
    metrics?: any;
  };
  opponentTeam?: {
    franchise_id: string;
    franchise_name?: string;
    players: MasterPlayer[];
    draft_picks?: DraftPick[];
    metrics?: any;
  };
  leagueTeams?: LeagueTeamSummary[];
  initialShopPlayer?: MasterPlayer | null;
  initialTargetPlayer?: MasterPlayer | null;
  onLoadTradeIntoBuilder: (proposal: AITradeProposal) => void;
  onBackToBuilder?: () => void;
}

export const AITradeArchitect: React.FC<AITradeArchitectProps> = ({
  userTeam,
  opponentTeam,
  leagueTeams = [],
  initialShopPlayer = null,
  initialTargetPlayer = null,
  onLoadTradeIntoBuilder,
  onBackToBuilder,
}) => {
  // Target Selection States
  const [selectedPartnerFid, setSelectedPartnerFid] = useState<string>(() => {
    if (initialTargetPlayer && leagueTeams.length > 0) {
      const owner = leagueTeams.find((t) =>
        [...t.starters, ...t.bench].some((p) => p.id === initialTargetPlayer.id)
      );
      if (owner) return owner.franchise_id;
    }
    return opponentTeam?.franchise_id || (leagueTeams[0]?.franchise_id ?? '');
  });

  const [shopPlayer, setShopPlayer] = useState<MasterPlayer | null>(initialShopPlayer);
  const [targetPlayer, setTargetPlayer] = useState<MasterPlayer | null>(initialTargetPlayer);
  const [strategyMode, setStrategyMode] = useState<'BALANCED' | 'WIN_NOW' | 'REBUILD' | 'FLEX_FOR_FIRST'>('BALANCED');

  // Search filters for player selectors
  const [searchShop, setSearchShop] = useState('');
  const [searchTarget, setSearchTarget] = useState('');
  const [posFilterShop, setPosFilterShop] = useState('ALL');
  const [posFilterTarget, setPosFilterTarget] = useState('ALL');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [proposals, setProposals] = useState<AITradeProposal[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active trade partner object
  const activePartner = useMemo(() => {
    if (leagueTeams.length > 0) {
      const found = leagueTeams.find((t) => t.franchise_id === selectedPartnerFid);
      if (found) {
        return {
          franchise_id: found.franchise_id,
          franchise_name: found.franchise_name,
          players: [...found.starters, ...found.bench],
          draft_picks: found.draft_picks,
        };
      }
    }
    return opponentTeam || {
      franchise_id: 'opponent',
      franchise_name: 'Opponent Team',
      players: [],
      draft_picks: [],
    };
  }, [leagueTeams, selectedPartnerFid, opponentTeam]);

  // Filtered Shop Players (from user roster)
  const filteredShopPlayers = useMemo(() => {
    return userTeam.players.filter((p) => {
      const matchSearch = p.full_name.toLowerCase().includes(searchShop.toLowerCase()) || p.nfl_team.toLowerCase().includes(searchShop.toLowerCase());
      const matchPos = posFilterShop === 'ALL' || p.position === posFilterShop;
      return matchSearch && matchPos;
    });
  }, [userTeam.players, searchShop, posFilterShop]);

  // Filtered Target Players (from active trade partner)
  const filteredTargetPlayers = useMemo(() => {
    return activePartner.players.filter((p) => {
      const matchSearch = p.full_name.toLowerCase().includes(searchTarget.toLowerCase()) || p.nfl_team.toLowerCase().includes(searchTarget.toLowerCase());
      const matchPos = posFilterTarget === 'ALL' || p.position === posFilterTarget;
      return matchSearch && matchPos;
    });
  }, [activePartner.players, searchTarget, posFilterTarget]);

  // Handle Trade Generation
  const handleGenerateTrades = async () => {
    if (!shopPlayer && !targetPlayer) {
      setErrorMsg('Please select at least one player to shop (from your roster) or target (from partner roster).');
      return;
    }
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const results = await AITradeFinderEngine.generateTradeProposals({
        userTeam,
        opponentTeam: activePartner,
        leagueTeams,
        shopPlayer,
        targetPlayer,
        strategyMode,
      });

      setProposals(results);
      setHasGenerated(true);
    } catch (err: any) {
      console.error('Error generating AI trades:', err);
      // Fallback
      const fallback = AITradeFinderEngine.generateAlgorithmicKtcProposals({
        userTeam,
        opponentTeam: activePartner,
        leagueTeams,
        shopPlayer,
        targetPlayer,
        strategyMode,
      });
      setProposals(fallback);
      setHasGenerated(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResetSelections = () => {
    setShopPlayer(null);
    setTargetPlayer(null);
    setProposals([]);
    setHasGenerated(false);
    setErrorMsg(null);
  };

  return (
    <div className="w-full space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-bold shadow-lg shadow-amber-400/20">
              <Sparkles className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  AI Trade Architect
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  MARKET VALUES
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Pick a player on your roster to shop, a player on another team to target, or both—and let AI craft balanced, win-win packages.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onBackToBuilder && (
              <button
                type="button"
                onClick={onBackToBuilder}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium transition-colors cursor-pointer"
              >
                &larr; Back to Active Simulator
              </button>
            )}
            {(shopPlayer || targetPlayer) && (
              <button
                type="button"
                onClick={handleResetSelections}
                className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Targets</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Interactive Target Selector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column: Player to Shop (Your Roster) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
          <div className="p-4 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">
                Step 1 (Optional): Select Player on Your Roster to Shop
              </span>
              <h4 className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
                <span>{userTeam.franchise_name}</span>
                {shopPlayer && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    Selected: {shopPlayer.full_name}
                  </span>
                )}
              </h4>
            </div>

            {shopPlayer && (
              <button
                type="button"
                onClick={() => setShopPlayer(null)}
                className="text-xs text-rose-400 hover:text-rose-300 font-mono"
              >
                Deselect
              </button>
            )}
          </div>

          {/* Search & Pos Filter */}
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/40 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search your players..."
                value={searchShop}
                onChange={(e) => setSearchShop(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="flex bg-zinc-900 rounded border border-zinc-800 p-0.5 text-[10px] font-mono">
              {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosFilterShop(pos)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    posFilterShop === pos ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-400'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* Player Selection List */}
          <div className="divide-y divide-zinc-800/60 max-h-[300px] overflow-y-auto">
            {filteredShopPlayers.map((player) => {
              const isSelected = shopPlayer?.id === player.id;
              return (
                <div
                  key={player.id}
                  onClick={() => setShopPlayer(isSelected ? null : player)}
                  className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-cyan-950/60 border-l-4 border-cyan-400' : 'hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-cyan-400 border-cyan-300' : 'border-zinc-700 bg-zinc-950'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-zinc-950" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-white">{player.full_name}</span>
                        <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                          {player.position}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">{player.nfl_team}</span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400">
                        Age: {player.age.toFixed(1)}y • #{player.consensus_rank}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className="text-xs font-bold text-cyan-300 block">
                      {player.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">value</span>
                    </span>
                    <span className="text-[10px] text-zinc-500">{player.is_starter ? 'Starter' : 'Bench'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Player to Target (Another Team's Roster) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
          <div className="p-4 border-b border-zinc-800 bg-zinc-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                Step 2 (Optional): Select Player to Target on Another Roster
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-zinc-400">Team:</span>
                <select
                  value={selectedPartnerFid}
                  onChange={(e) => {
                    setSelectedPartnerFid(e.target.value);
                    setTargetPlayer(null); // Clear selected player if switching teams
                  }}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-white font-bold outline-none focus:border-amber-400"
                >
                  {leagueTeams
                    .filter((t) => t.franchise_id !== userTeam.franchise_id)
                    .map((t) => (
                      <option key={t.franchise_id} value={t.franchise_id}>
                        {t.franchise_name} (#{t.power_rank})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {targetPlayer && (
              <button
                type="button"
                onClick={() => setTargetPlayer(null)}
                className="text-xs text-rose-400 hover:text-rose-300 font-mono self-start sm:self-auto"
              >
                Deselect
              </button>
            )}
          </div>

          {/* Search & Pos Filter */}
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/40 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={`Search ${activePartner.franchise_name} players...`}
                value={searchTarget}
                onChange={(e) => setSearchTarget(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div className="flex bg-zinc-900 rounded border border-zinc-800 p-0.5 text-[10px] font-mono">
              {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosFilterTarget(pos)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    posFilterTarget === pos ? 'bg-zinc-800 text-amber-400 font-bold' : 'text-zinc-400'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* Player Selection List */}
          <div className="divide-y divide-zinc-800/60 max-h-[300px] overflow-y-auto">
            {filteredTargetPlayers.map((player) => {
              const isSelected = targetPlayer?.id === player.id;
              return (
                <div
                  key={player.id}
                  onClick={() => setTargetPlayer(isSelected ? null : player)}
                  className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-amber-950/60 border-l-4 border-amber-400' : 'hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-amber-400 border-amber-300' : 'border-zinc-700 bg-zinc-950'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-zinc-950" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-white">{player.full_name}</span>
                        <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                          {player.position}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">{player.nfl_team}</span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400">
                        Age: {player.age.toFixed(1)}y • #{player.consensus_rank}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className="text-xs font-bold text-amber-300 block">
                      {player.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">value</span>
                    </span>
                    <span className="text-[10px] text-zinc-500">{player.is_starter ? 'Starter' : 'Bench'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Strategy Configuration & Action Trigger */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
              Step 3: Trade Philosophy & Strategy Stance
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {(['BALANCED', 'WIN_NOW', 'REBUILD', 'FLEX_FOR_FIRST'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setStrategyMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    strategyMode === mode
                      ? mode === 'FLEX_FOR_FIRST'
                        ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/20'
                        : 'bg-zinc-800 text-white border border-zinc-600 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 bg-zinc-950 border border-zinc-800'
                  }`}
                >
                  {mode === 'BALANCED'
                    ? '50/50 Value Parity'
                    : mode === 'WIN_NOW'
                    ? 'Win-Now Starter Push'
                    : mode === 'REBUILD'
                    ? 'Youth & Draft Picks'
                    : '🌟 Flex for a 1st Doctrine'}
                </button>
              ))}
            </div>
          </div>

          {/* Big Action Button */}
          <div className="self-start sm:self-center">
            <button
              type="button"
              disabled={isGenerating || (!shopPlayer && !targetPlayer)}
              onClick={handleGenerateTrades}
              className={`px-6 py-3 rounded-xl font-mono text-sm font-black flex items-center gap-2.5 transition-all shadow-xl cursor-pointer ${
                isGenerating || (!shopPlayer && !targetPlayer)
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                  : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-zinc-950 shadow-amber-400/20 active:scale-95'
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Building trade ideas...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-zinc-950" />
                  <span>Generate AI Trade Packages</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Selected Summary Chips */}
        {(shopPlayer || targetPlayer) && (
          <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80 flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-zinc-400 font-medium">Selected Objective:</span>
            {shopPlayer && (
              <span className="px-2.5 py-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80 flex items-center gap-1.5">
                <span>Shop:</span>
                <strong>{shopPlayer.full_name}</strong>
                <span className="text-[10px] text-cyan-400">({shopPlayer.market_value.toLocaleString()} market)</span>
              </span>
            )}
            {shopPlayer && targetPlayer && <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />}
            {targetPlayer && (
              <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800/80 flex items-center gap-1.5">
                <span>Target:</span>
                <strong>{targetPlayer.full_name}</strong>
                <span className="text-[10px] text-amber-400">({targetPlayer.market_value.toLocaleString()} market)</span>
              </span>
            )}
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-400">
              Partner: <strong className="text-white">{activePartner.franchise_name}</strong>
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 4. Generated Proposals Display */}
      {hasGenerated && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>AI Generated Trade Packages</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {proposals.length} Proposals Formulated
                </span>
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Review balanced trade blueprints calibrated using consensus dynasty market value models.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {proposals.map((prop, idx) => {
              const netKtcDiff = prop.ktc_difference;
              const isPositive = netKtcDiff >= 0;

              return (
                <div
                  key={prop.id || idx}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl space-y-4 hover:border-amber-500/50 transition-all relative overflow-hidden"
                >
                  {/* Top Blueprint Tag & Fairness Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider bg-amber-400 text-zinc-950">
                          {prop.blueprint_type.replace(/_/g, ' ')}
                        </span>
                        <h4 className="text-base font-bold text-white tracking-tight">
                          {prop.title}
                        </h4>
                      </div>
                      <p className="text-xs text-zinc-300">{prop.summary}</p>
                    </div>

                    <div className="flex items-center gap-3 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 self-start sm:self-auto font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Value Match</span>
                        <span className="text-emerald-400 font-bold">{prop.fairness_score_pct}% Fair</span>
                      </div>
                      <div className="w-px h-6 bg-zinc-800" />
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Gross Liquidity</span>
                        <span className={prop.predicted_gross_liquidity_delta >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {prop.predicted_gross_liquidity_delta >= 0 ? `+${prop.predicted_gross_liquidity_delta.toFixed(1)} Δ` : `${prop.predicted_gross_liquidity_delta.toFixed(1)} Δ`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Trade Exchange Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Outgoing Package */}
                    <div className="bg-zinc-950/70 p-4 rounded-xl border border-cyan-900/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono font-bold pb-2 border-b border-zinc-800">
                        <span className="text-cyan-400 uppercase">You Send:</span>
                        <span className="text-white">{prop.total_ktc_sent.toLocaleString()} market pts</span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {prop.send_players.map((p) => (
                          <div
                            key={p.id}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-cyan-700/60 text-xs font-mono text-white"
                          >
                            <span className="text-[10px] px-1 rounded bg-zinc-800 text-cyan-300 font-bold">
                              {p.position}
                            </span>
                            <span>{p.full_name}</span>
                            <span className="text-cyan-400 font-bold">{p.market_value.toLocaleString()}</span>
                          </div>
                        ))}

                        {prop.send_picks.map((pk) => (
                          <div
                            key={pk.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-cyan-500/60 text-xs font-mono text-cyan-300"
                          >
                            <Coins className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{pk.description}</span>
                            <span className="text-cyan-400 font-bold">({pk.market_value.toLocaleString()})</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Incoming Package */}
                    <div className="bg-zinc-950/70 p-4 rounded-xl border border-amber-900/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono font-bold pb-2 border-b border-zinc-800">
                        <span className="text-amber-400 uppercase">You Receive:</span>
                        <span className="text-white">{prop.total_ktc_received.toLocaleString()} market pts</span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {prop.receive_players.map((p) => (
                          <div
                            key={p.id}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-amber-700/60 text-xs font-mono text-white"
                          >
                            <span className="text-[10px] px-1 rounded bg-zinc-800 text-amber-300 font-bold">
                              {p.position}
                            </span>
                            <span>{p.full_name}</span>
                            <span className="text-amber-400 font-bold">{p.market_value.toLocaleString()}</span>
                          </div>
                        ))}

                        {prop.receive_picks.map((pk) => (
                          <div
                            key={pk.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-amber-500/60 text-xs font-mono text-amber-300"
                          >
                            <Coins className="w-3.5 h-3.5 text-amber-400" />
                            <span>{pk.description}</span>
                            <span className="text-amber-400 font-bold">({pk.market_value.toLocaleString()})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Why It Works Rationale Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold block">
                        Why This Works for Your Roster:
                      </span>
                      <p className="text-zinc-300 leading-relaxed">{prop.rationale_for_you}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                        Why {prop.partner_franchise_name} Accepts:
                      </span>
                      <p className="text-zinc-300 leading-relaxed">{prop.rationale_for_partner}</p>
                    </div>
                  </div>

                  {/* Action CTA */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-800/80">
                    <div className="text-xs font-mono text-zinc-400">
                      <span>Value Difference: </span>
                      <strong className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                        {isPositive ? `+${netKtcDiff.toLocaleString()}` : `${netKtcDiff.toLocaleString()}`} pts
                      </strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => onLoadTradeIntoBuilder(prop)}
                      className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-400/10 cursor-pointer"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>Load into Trade Simulator &rarr;</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
