/**
 * Dynasty AI Evaluator - Trade Builder Component
 * Simulates multi-player trades and calculates the net change (Δ) in Gross Liquidity,
 * Structural Integrity, Asset Half-Life, and Archetype Classification.
 */

import React, { useState, useMemo , useEffect} from 'react';
import { useRoster } from '../context/RosterContext';
import { MasterPlayer, Position, DraftPick, AITradeProposal } from '../types';
import { RosterDNAMathEngine } from '../lib/rosterMath';
import { SEASON } from '../lib/season';
import { DraftPickEngine } from '../lib/draftPicks';
import { TradeHistory } from './TradeHistory';
import { TradeHistoryEngine } from '../lib/tradeHistory';
import { AITradeArchitect } from './AITradeArchitect';
import { MarketSaturationHeatmap } from './MarketSaturationHeatmap';
import { DynastyCoreProjection } from './DynastyCoreProjection';
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  X,
  Shield,
  Zap,
  Activity,
  Award,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Search,
  Check,
  Coins,
  Trophy,
  Calendar,
  Layers,
  Info,
  History,
  CheckCircle2,
  Flame,
  Scale,
  ShieldAlert,
} from 'lucide-react';

export const TradeBuilder: React.FC = () => {
  const {
    evaluation: teamA,
    comparisonEvaluation: teamB,
    loadComparisonDemo,
    setComparisonEvaluation,
  } = useRoster();

  // Primary Tab: Builder Simulator vs Trade History Verifier vs AI Trade Architect vs Market Heatmap vs Dynasty Core Projection
  const [activeMainTab, setActiveMainTab] = useState<'BUILDER' | 'HISTORY' | 'AI_FINDER' | 'HEATMAP' | 'PROJECTION'>('BUILDER');
  const [tradeLoggedSuccess, setTradeLoggedSuccess] = useState<string | null>(null);
  const [historyTradeCount, setHistoryTradeCount] = useState<number>(() => {
    return TradeHistoryEngine.getTradeHistory(teamA?.roster?.external_league_id || 'default').length;
  });

  // Preselected player shortcuts for AI Trade Architect
  const [preselectedShopPlayer, setPreselectedShopPlayer] = useState<MasterPlayer | null>(null);
  const [preselectedTargetPlayer, setPreselectedTargetPlayer] = useState<MasterPlayer | null>(null);

  // Selected player IDs & pick IDs
  const [sendIds, setSendIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);
  const [sendPickIds, setSendPickIds] = useState<string[]>([]);
  const [receivePickIds, setReceivePickIds] = useState<string[]>([]);

  // Sub-tabs: Players vs Draft Picks
  const [subTabA, setSubTabA] = useState<'PLAYERS' | 'PICKS'>('PLAYERS');
  const [subTabB, setSubTabB] = useState<'PLAYERS' | 'PICKS'>('PLAYERS');

  // Filter & Search states
  const [searchA, setSearchA] = useState<string>('');
  const [searchB, setSearchB] = useState<string>('');
  const [posFilterA, setPosFilterA] = useState<string>('ALL');
  const [posFilterB, setPosFilterB] = useState<string>('ALL');

  const toggleSendPlayer = (id: string) => {
    setSendIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleReceivePlayer = (id: string) => {
    setReceiveIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSendPick = (id: string) => {
    setSendPickIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleReceivePick = (id: string) => {
    setReceivePickIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Custom dynamically created future draft picks
  const [dynamicPicksA, setDynamicPicksA] = useState<DraftPick[]>([]);
  const [dynamicPicksB, setDynamicPicksB] = useState<DraftPick[]>([]);

  // Dynamic Future Draft Pick Modeler Input States (2027, 2028, 2029)
  const [dynPickYear, setDynPickYear] = useState<number>(SEASON.upcomingDraftYear);
  const [dynPickRound, setDynPickRound] = useState<number>(1);
  const [dynPickTier, setDynPickTier] = useState<'Early' | 'Mid' | 'Late'>('Mid');
  const [dynPickTarget, setDynPickTarget] = useState<'RECEIVE_B' | 'SEND_A'>('RECEIVE_B');

  // Live pick value on this league's scale (1QB vs Superflex) from the server's value feed.
  const [dynPickMarketValue, setDynPickMarketValue] = useState<number>(0);
  const isSuperflex = !!teamA?.settings?.superflex;
  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ year: String(dynPickYear), round: String(dynPickRound), tier: dynPickTier, superflex: String(isSuperflex) });
    fetch(`/api/values/pick?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setDynPickMarketValue(d.value))
      .catch(() => !cancelled && setDynPickMarketValue(DraftPickEngine.calculatePickValue(dynPickYear, dynPickRound, dynPickTier)));
    return () => {
      cancelled = true;
    };
  }, [dynPickYear, dynPickRound, dynPickTier, isSuperflex]);

  // League baseline (median starting lineup) recovered from the synced team's metrics.
  const baselineValue =
    teamA && teamA.metrics.gross_liquidity > 0 && teamA.metrics.starter_value
      ? (teamA.metrics.starter_value / teamA.metrics.gross_liquidity) * 100
      : RosterDNAMathEngine.DEFAULT_LEAGUE_BASELINE_VALUE;

  // Direct Gross Liquidity Impact based on standard dynasty pick valuation models
  const dynPickGrossLiquidityImpact = useMemo(() => {
    const impact = (dynPickMarketValue / baselineValue) * 100;
    return Math.round(impact * 10) / 10;
  }, [dynPickMarketValue, baselineValue]);

  const handleAddDynamicPick = () => {
    const pickId = `dyn-${dynPickYear}-r${dynPickRound}-${dynPickTier.toLowerCase()}-${Date.now()}`;
    const desc = `${dynPickYear} Round ${dynPickRound} (${dynPickTier})`;
    const isPriority = dynPickYear === SEASON.upcomingDraftYear;
    const yearsOut = dynPickYear - SEASON.upcomingDraftYear;

    const newPick: DraftPick = {
      id: pickId,
      year: dynPickYear,
      round: dynPickRound,
      tier: dynPickTier,
      original_owner_id: dynPickTarget === 'SEND_A' ? (teamA?.roster?.franchise_id || 'teamA') : (teamB?.roster?.franchise_id || 'teamB'),
      original_owner_name: dynPickTarget === 'SEND_A' ? (teamA?.roster?.franchise_name || 'Your Team') : (teamB?.roster?.franchise_name || 'Opponent'),
      current_owner_id: dynPickTarget === 'SEND_A' ? (teamA?.roster?.franchise_id || 'teamA') : (teamB?.roster?.franchise_id || 'teamB'),
      description: desc,
      market_value: dynPickMarketValue,
      is_priority_class: isPriority,
      years_out: yearsOut,
    };

    if (dynPickTarget === 'SEND_A') {
      setDynamicPicksA((prev) => [...prev, newPick]);
      setSendPickIds((prev) => [...prev, pickId]);
      setSubTabA('PICKS');
    } else {
      setDynamicPicksB((prev) => [...prev, newPick]);
      setReceivePickIds((prev) => [...prev, pickId]);
      setSubTabB('PICKS');
    }
  };

  const clearTrade = () => {
    setSendIds([]);
    setReceiveIds([]);
    setSendPickIds([]);
    setReceivePickIds([]);
    setDynamicPicksA([]);
    setDynamicPicksB([]);
  };

  // Pre-load comparison opponent if none loaded yet
  if (!teamA) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
        <p className="text-zinc-400 text-sm">
          Please upload or select your primary roster first to launch the Trade Builder.
        </p>
      </div>
    );
  }

  // Active players from both teams
  const playersA = teamA.players;
  const playersB = teamB?.players || [];

  // Outgoing and Incoming Player objects
  const sendPlayers = useMemo(
    () => playersA.filter((p) => sendIds.includes(p.id)),
    [playersA, sendIds]
  );
  const receivePlayers = useMemo(
    () => playersB.filter((p) => receiveIds.includes(p.id)),
    [playersB, receiveIds]
  );

  // Combine synced draft picks with dynamically generated future draft picks
  const picksA = useMemo(() => {
    return [...(teamA.draft_picks || []), ...dynamicPicksA];
  }, [teamA.draft_picks, dynamicPicksA]);

  const picksB = useMemo(() => {
    return [...(teamB?.draft_picks || []), ...dynamicPicksB];
  }, [teamB?.draft_picks, dynamicPicksB]);

  const sendPicks = useMemo(
    () => picksA.filter((p) => sendPickIds.includes(p.id)),
    [picksA, sendPickIds]
  );
  const receivePicks = useMemo(
    () => picksB.filter((p) => receivePickIds.includes(p.id)),
    [picksB, receivePickIds]
  );

  const totalOutgoingPlayerVal = sendPlayers.reduce((sum, p) => sum + p.market_value, 0);
  const totalOutgoingPickVal = sendPicks.reduce((sum, p) => sum + p.market_value, 0);
  const totalOutgoingValue = totalOutgoingPlayerVal + totalOutgoingPickVal;

  const totalIncomingPlayerVal = receivePlayers.reduce((sum, p) => sum + p.market_value, 0);
  const totalIncomingPickVal = receivePicks.reduce((sum, p) => sum + p.market_value, 0);
  const totalIncomingValue = totalIncomingPlayerVal + totalIncomingPickVal;

  const netValueDelta = totalIncomingValue - totalOutgoingValue;

  // ---------------- Quantitative Simulated Post-Trade Rosters ----------------

  // Team A Simulated Post-Trade Roster
  const postTradePlayersA = useMemo(() => {
    const retained = playersA.filter((p) => !sendIds.includes(p.id));
    return [...retained, ...receivePlayers];
  }, [playersA, sendIds, receivePlayers]);

  // Team A Baseline Metrics
  const preLiquidityA = teamA.metrics.gross_liquidity;
  const preIntegrityA = teamA.metrics.structural_integrity;
  const preHalfLifeA = teamA.metrics.asset_half_life;
  const preClassificationA = teamA.metrics.classification;

  // Team A Post-Trade Metrics
  const { starters: postStartersA, bench: postBenchA } = useMemo(
    () => RosterDNAMathEngine.splitStartersAndBench(postTradePlayersA, [], teamA?.settings),
    [postTradePlayersA]
  );

  const postLiquidityA = useMemo(
    () => RosterDNAMathEngine.calculateGrossLiquidity(postStartersA, baselineValue),
    [postStartersA]
  );
  const postIntegrityA = useMemo(
    () => RosterDNAMathEngine.calculateStructuralIntegrity(postStartersA, postBenchA, baselineValue),
    [postStartersA, postBenchA]
  );
  const postHalfLifeA = useMemo(
    () => RosterDNAMathEngine.calculateAssetHalfLife(postTradePlayersA),
    [postTradePlayersA]
  );
  const postClassificationA = useMemo(
    () => RosterDNAMathEngine.classifyRoster(postLiquidityA, postHalfLifeA, postIntegrityA),
    [postLiquidityA, postHalfLifeA, postIntegrityA]
  );

  // Net Metric Shifts (Post minus Pre)
  const liquidityDeltaA = postLiquidityA - preLiquidityA;
  const integrityDeltaA = postIntegrityA - preIntegrityA;
  const halfLifeDeltaA = postHalfLifeA - preHalfLifeA;

  // ---------------- Draft Capital Gross Liquidity & Overall Liquidity Index ----------------
  // In standard dynasty pick valuation models, future picks represent 100% liquid store-of-value equity.
  const outgoingPickLiquidityA = Math.round(((totalOutgoingPickVal / baselineValue) * 100) * 10) / 10;
  const incomingPickLiquidityA = Math.round(((totalIncomingPickVal / baselineValue) * 100) * 10) / 10;
  const pickLiquidityDeltaA = Math.round((incomingPickLiquidityA - outgoingPickLiquidityA) * 10) / 10;

  // Composite Total Gross Liquidity = Starter Scoring Output + Net Future Draft Capital Liquidity
  const compositeGrossLiquidityA = Math.max(0, Math.round((postLiquidityA + pickLiquidityDeltaA) * 10) / 10);
  const compositeLiquidityDeltaA = Math.round((compositeGrossLiquidityA - preLiquidityA) * 10) / 10;

  // Team B Simulated Post-Trade Roster
  const postTradePlayersB = useMemo(() => {
    if (!playersB.length) return [];
    const retained = playersB.filter((p) => !receiveIds.includes(p.id));
    return [...retained, ...sendPlayers];
  }, [playersB, receiveIds, sendPlayers]);

  const { starters: postStartersB, bench: postBenchB } = useMemo(
    () => RosterDNAMathEngine.splitStartersAndBench(postTradePlayersB, [], teamA?.settings),
    [postTradePlayersB]
  );

  const preLiquidityB = teamB?.metrics.gross_liquidity || 0;
  const preIntegrityB = teamB?.metrics.structural_integrity || 0;

  const postLiquidityB = useMemo(
    () => (postStartersB.length ? RosterDNAMathEngine.calculateGrossLiquidity(postStartersB, baselineValue) : 0),
    [postStartersB]
  );
  const postIntegrityB = useMemo(
    () => (postTradePlayersB.length ? RosterDNAMathEngine.calculateStructuralIntegrity(postStartersB, postBenchB, baselineValue) : 0),
    [postStartersB, postBenchB]
  );

  const liquidityDeltaB = postLiquidityB - preLiquidityB;
  const integrityDeltaB = postIntegrityB - preIntegrityB;

  // Opponent Team B pick liquidity
  const outgoingPickLiquidityB = incomingPickLiquidityA;
  const incomingPickLiquidityB = outgoingPickLiquidityA;
  const pickLiquidityDeltaB = Math.round((incomingPickLiquidityB - outgoingPickLiquidityB) * 10) / 10;
  const compositeGrossLiquidityB = Math.max(0, Math.round((postLiquidityB + pickLiquidityDeltaB) * 10) / 10);
  const compositeLiquidityDeltaB = Math.round((compositeGrossLiquidityB - preLiquidityB) * 10) / 10;

  const hasSelections = sendIds.length > 0 || receiveIds.length > 0 || sendPickIds.length > 0 || receivePickIds.length > 0;

  // ---------------- Fair Market Value Notification Engine (market Logic) ----------------
  const fairMarketAnalysis = useMemo(() => {
    if (!hasSelections || totalOutgoingValue === 0) return null;

    const diff = totalIncomingValue - totalOutgoingValue;
    const deficit = Math.max(0, -diff);
    const deficitPct = totalOutgoingValue > 0 ? (deficit / totalOutgoingValue) * 100 : 0;
    const surplusPct = totalOutgoingValue > 0 && diff > 0 ? (diff / totalOutgoingValue) * 100 : 0;

    // Thresholds:
    // Critical underpay: deficit >= 18% or deficit >= 1,600 pts (when outgoing >= 1,800)
    const isCriticalUnderpay = (deficitPct >= 18 || deficit >= 1600) && totalOutgoingValue >= 1800;
    const isModerateUnderpay = !isCriticalUnderpay && (deficitPct >= 10 || deficit >= 600);
    const isFair = !isCriticalUnderpay && !isModerateUnderpay && Math.abs(diff) < 600;
    const isSurplus = !isCriticalUnderpay && !isModerateUnderpay && !isFair && diff > 600;

    // Find best market balancer asset from opponent if underpaid
    let recommendedBalancer: {
      type: 'PICK' | 'PLAYER';
      id: string;
      label: string;
      value: number;
      distFromDeficit: number;
    } | null = null;

    if (deficit > 0 && (isCriticalUnderpay || isModerateUnderpay) && teamB) {
      const unselectedPicks = picksB.filter((pk) => !receivePickIds.includes(pk.id));
      const unselectedPlayers = playersB.filter((p) => !receiveIds.includes(p.id));

      let bestPick: DraftPick | null = null;
      let bestPickDist = Infinity;
      for (const pk of unselectedPicks) {
        const dist = Math.abs(pk.market_value - deficit);
        if (dist < bestPickDist) {
          bestPickDist = dist;
          bestPick = pk;
        }
      }

      let bestPlayer: MasterPlayer | null = null;
      let bestPlayerDist = Infinity;
      for (const p of unselectedPlayers) {
        const dist = Math.abs(p.market_value - deficit);
        if (dist < bestPlayerDist) {
          bestPlayerDist = dist;
          bestPlayer = p;
        }
      }

      if (bestPick && bestPickDist <= bestPlayerDist) {
        recommendedBalancer = {
          type: 'PICK',
          id: bestPick.id,
          label: bestPick.description,
          value: bestPick.market_value,
          distFromDeficit: bestPickDist,
        };
      } else if (bestPlayer) {
        recommendedBalancer = {
          type: 'PLAYER',
          id: bestPlayer.id,
          label: `${bestPlayer.position} ${bestPlayer.full_name}`,
          value: bestPlayer.market_value,
          distFromDeficit: bestPlayerDist,
        };
      }
    }

    return {
      diff,
      deficit,
      deficitPct,
      surplusPct,
      isCriticalUnderpay,
      isModerateUnderpay,
      isFair,
      isSurplus,
      recommendedBalancer,
    };
  }, [hasSelections, totalOutgoingValue, totalIncomingValue, teamB, picksB, playersB, receivePickIds, receiveIds]);

  const handleAddRecommendedBalancer = () => {
    if (!fairMarketAnalysis?.recommendedBalancer) return;
    const { type, id } = fairMarketAnalysis.recommendedBalancer;
    if (type === 'PICK') {
      setReceivePickIds((prev) => [...prev, id]);
    } else {
      setReceiveIds((prev) => [...prev, id]);
    }
  };

  // Filtered lists for selection
  const filteredA = useMemo(() => {
    return playersA.filter((p) => {
      const matchSearch =
        p.full_name.toLowerCase().includes(searchA.toLowerCase()) ||
        p.nfl_team.toLowerCase().includes(searchA.toLowerCase());
      const matchPos = posFilterA === 'ALL' || p.position === posFilterA;
      return matchSearch && matchPos;
    });
  }, [playersA, searchA, posFilterA]);

  const filteredB = useMemo(() => {
    return playersB.filter((p) => {
      const matchSearch =
        p.full_name.toLowerCase().includes(searchB.toLowerCase()) ||
        p.nfl_team.toLowerCase().includes(searchB.toLowerCase());
      const matchPos = posFilterB === 'ALL' || p.position === posFilterB;
      return matchSearch && matchPos;
    });
  }, [playersB, searchB, posFilterB]);

  // Quick preset actions
  const applyPresetWinNow = () => {
    if (!playersA.length || !playersB.length) return;
    // Find highest valued asset on Team B that Team A doesn't have
    const targetB = [...playersB].sort((a, b) => b.market_value - a.market_value)[0];
    // Find young bench depth from Team A
    const benchPiecesA = [...playersA]
      .filter((p) => !teamA.starters.some((s) => s.id === p.id))
      .sort((a, b) => b.market_value - a.market_value)
      .slice(0, 2);

    if (targetB && benchPiecesA.length) {
      setReceiveIds([targetB.id]);
      setSendIds(benchPiecesA.map((p) => p.id));
    }
  };

  const applyPresetRebuild = () => {
    if (!playersA.length || !playersB.length) return;
    // Find veteran on Team A (age >= 27)
    const veteranA = [...playersA].filter((p) => p.age >= 27).sort((a, b) => b.market_value - a.market_value)[0];
    // Find young assets on Team B (age <= 23)
    const youngAssetsB = [...playersB].filter((p) => p.age <= 23.5).sort((a, b) => b.market_value - a.market_value).slice(0, 2);

    if (veteranA && youngAssetsB.length) {
      setSendIds([veteranA.id]);
      setReceiveIds(youngAssetsB.map((p) => p.id));
    }
  };

  // Dynasty Rule: "Flex for a First" Preset
  const applyPresetFlexForFirst = () => {
    if (!playersA.length || !picksB.length) return;
    // Find Team B's top 1st round pick (2027 priority or 2028 multi-year)
    const targetPick = [...picksB]
      .filter((p) => p.round === 1 && p.year >= SEASON.upcomingDraftYear)
      .sort((a, b) => a.year - b.year)[0];
    // Find best flex candidate on Team A (WR/RB/TE market_value between 1400 and 3900)
    const flexCandidate = [...playersA]
      .filter((p) => (p.position === 'WR' || p.position === 'RB' || p.position === 'TE') && p.market_value >= 1400 && p.market_value <= 3900)
      .sort((a, b) => b.market_value - a.market_value)[0];

    if (targetPick && flexCandidate) {
      setSendIds([flexCandidate.id]);
      setSendPickIds([]);
      setReceiveIds([]);
      setReceivePickIds([targetPick.id]);
    }
  };

  // Dynasty Rule Check: Flex for a First Execution
  const flexForFirstDetected = useMemo(() => {
    const firstRoundPick = receivePicks.find((p) => p.round === 1 && p.year >= SEASON.upcomingDraftYear);
    if (!firstRoundPick) return null;

    const flexPlayer = sendPlayers.find(
      (p) => (p.position === 'WR' || p.position === 'RB' || p.position === 'TE') && p.market_value >= 1200 && p.market_value <= 4200
    );
    if (!flexPlayer) return null;

    return {
      flexPlayer,
      pick: firstRoundPick,
    };
  }, [receivePicks, sendPlayers]);

  // Multi-Year Pick Strategy Check: Picks 2+ years out (2028, 2029, 2030)
  const multiYearArbitrageDetected = useMemo(() => {
    const distantPick = receivePicks.find((p) => p.year >= SEASON.upcomingDraftYear + 1 && p.round <= 2);
    return distantPick || null;
  }, [receivePicks]);

  // Execute and Log Trade to Trade History
  const handleExecuteAndLogTrade = () => {
    if (!hasSelections) return;
    const newRecord = TradeHistoryEngine.logExecutedTrade({
      partnerFranchiseId: teamB?.roster?.franchise_id || 'opponent',
      partnerFranchiseName: teamB?.roster?.franchise_name || 'Trade Partner',
      sentPlayers: sendPlayers,
      sentPicks: sendPicks,
      receivedPlayers: receivePlayers,
      receivedPicks: receivePicks,
      preGrossLiquidity: preLiquidityA,
      postGrossLiquidity: compositeGrossLiquidityA,
      liquidityDelta: compositeLiquidityDeltaA,
      integrityDelta: integrityDeltaA,
      isFlexForFirst: !!flexForFirstDetected,
      leagueId: teamA?.roster?.external_league_id || 'default',
    });

    setHistoryTradeCount(
      TradeHistoryEngine.getTradeHistory(teamA?.roster?.external_league_id || 'default').length
    );
    setTradeLoggedSuccess(
      `Trade with ${newRecord.partner_franchise_name} logged to History! Predicted Gross Liquidity impact: ${
        newRecord.predicted_liquidity_delta >= 0 ? '+' : ''
      }${newRecord.predicted_liquidity_delta.toFixed(1)}Δ.`
    );
    clearTrade();
  };

  // Launch AI Trade Architect with specific preselected player
  const handleLaunchAITarget = (player: MasterPlayer, role: 'SHOP' | 'TARGET') => {
    if (role === 'SHOP') {
      setPreselectedShopPlayer(player);
      setPreselectedTargetPlayer(null);
    } else {
      setPreselectedTargetPlayer(player);
      setPreselectedShopPlayer(null);
    }
    setActiveMainTab('AI_FINDER');
  };

  // Load selected AI trade proposal directly into active simulator
  const handleLoadAIProposal = (prop: AITradeProposal) => {
    // If trade partner differs, switch partner
    if (prop.partner_franchise_id && teamA?.league_teams) {
      const targetTeam = teamA.league_teams.find((t) => t.franchise_id === prop.partner_franchise_id);
      if (targetTeam) {
        setComparisonEvaluation({
          roster: {
            roster_id: targetTeam.franchise_id,
            platform: teamA.roster.platform,
            external_league_id: teamA.roster.external_league_id,
            franchise_id: targetTeam.franchise_id,
            franchise_name: targetTeam.franchise_name,
            player_ids: [...targetTeam.starters, ...targetTeam.bench].map((p) => p.id),
            valuation_mode: teamA.roster.valuation_mode,
            draft_picks: targetTeam.draft_picks,
          },
          metrics: {
            classification: targetTeam.classification,
            gross_liquidity: targetTeam.gross_liquidity,
            asset_half_life: targetTeam.asset_half_life,
            structural_integrity: targetTeam.structural_integrity,
            total_roster_value: targetTeam.total_value,
            starter_value: targetTeam.starter_value,
            bench_value: targetTeam.bench_value,
            draft_capital_value: targetTeam.draft_capital_value,
          },
          players: [...targetTeam.starters, ...targetTeam.bench],
          starters: targetTeam.starters,
          bench: targetTeam.bench,
          draft_picks: targetTeam.draft_picks,
          positional_breakdown: {},
        } as any);
      }
    }

    setSendIds(prop.send_players.map((p) => p.id));
    setReceiveIds(prop.receive_players.map((p) => p.id));
    setSendPickIds(prop.send_picks.map((p) => p.id));
    setReceivePickIds(prop.receive_picks.map((p) => p.id));

    setActiveMainTab('BUILDER');
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Tab Switcher: Active Simulator vs AI Trade Architect vs Trade History */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveMainTab('BUILDER')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'BUILDER'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Active Trade Simulator</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPreselectedShopPlayer(null);
              setPreselectedTargetPlayer(null);
              setActiveMainTab('AI_FINDER');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'AI_FINDER'
                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                : 'text-amber-400/90 hover:text-amber-300 bg-amber-950/30 border border-amber-500/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Trade Architect</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('HISTORY')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'HISTORY'
                ? 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-400/20'
                : 'text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Trade History & Verifier</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                activeMainTab === 'HISTORY'
                  ? 'bg-slate-950 text-emerald-400'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              {historyTradeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('HEATMAP')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'HEATMAP'
                ? 'bg-rose-500 text-slate-950 shadow-md shadow-rose-500/20'
                : 'text-rose-400 hover:text-rose-300 bg-rose-950/30 border border-rose-500/40'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Market Heatmap (D3)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('PROJECTION')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'PROJECTION'
                ? 'bg-purple-400 text-slate-950 shadow-md shadow-purple-400/20'
                : 'text-purple-400 hover:text-purple-300 bg-purple-950/30 border border-purple-500/40'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Dynasty Core 3-Yr Projection</span>
          </button>
        </div>

        {activeMainTab === 'BUILDER' && (
          <div className="text-[11px] font-mono text-zinc-400 hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Quantitative Model Active (In-Season 2026)</span>
          </div>
        )}
      </div>

      {/* Trade Logged Success Alert Banner */}
      {tradeLoggedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{tradeLoggedSuccess}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveMainTab('HISTORY');
                setTradeLoggedSuccess(null);
              }}
              className="px-2.5 py-1 rounded bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold font-mono text-[11px] transition-colors cursor-pointer"
            >
              View in Trade History &rarr;
            </button>
            <button
              type="button"
              onClick={() => setTradeLoggedSuccess(null)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Render Subviews: Trade History, AI Trade Architect, Market Heatmap, Dynasty Core Projection, or Active Simulator */}
      {activeMainTab === 'HISTORY' ? (
        <TradeHistory
          onBackToBuilder={() => setActiveMainTab('BUILDER')}
          leagueId={teamA?.roster?.external_league_id || 'default'}
        />
      ) : activeMainTab === 'AI_FINDER' ? (
        <AITradeArchitect
          userTeam={{
            franchise_id: teamA.roster.franchise_id,
            franchise_name: teamA.roster.franchise_name || 'My Team',
            players: teamA.players,
            draft_picks: picksA,
            metrics: teamA.metrics,
          }}
          opponentTeam={
            teamB
              ? {
                  franchise_id: teamB.roster.franchise_id,
                  franchise_name: teamB.roster.franchise_name || 'Opponent Team',
                  players: teamB.players,
                  draft_picks: picksB,
                  metrics: teamB.metrics,
                }
              : undefined
          }
          leagueTeams={teamA.league_teams}
          initialShopPlayer={preselectedShopPlayer}
          initialTargetPlayer={preselectedTargetPlayer}
          onLoadTradeIntoBuilder={handleLoadAIProposal}
          onBackToBuilder={() => setActiveMainTab('BUILDER')}
        />
      ) : activeMainTab === 'HEATMAP' ? (
        <MarketSaturationHeatmap
          userTeam={{
            franchise_id: teamA.roster.franchise_id,
            franchise_name: teamA.roster.franchise_name || 'My Team',
            players: teamA.players,
            draft_picks: picksA,
          }}
          opponentTeam={
            teamB
              ? {
                  franchise_id: teamB.roster.franchise_id,
                  franchise_name: teamB.roster.franchise_name || 'Opponent Team',
                  players: teamB.players,
                  draft_picks: picksB,
                }
              : undefined
          }
          leagueTeams={teamA.league_teams}
          onSelectSendPlayer={(player) => {
            if (!sendIds.includes(player.id)) {
              setSendIds((prev) => [...prev, player.id]);
            }
            setActiveMainTab('BUILDER');
          }}
          onSelectReceivePlayer={(player) => {
            if (!receiveIds.includes(player.id)) {
              setReceiveIds((prev) => [...prev, player.id]);
            }
            setActiveMainTab('BUILDER');
          }}
          onLaunchAITrade={(shopPlayer, targetPlayer) => {
            if (shopPlayer) setPreselectedShopPlayer(shopPlayer);
            if (targetPlayer) setPreselectedTargetPlayer(targetPlayer);
            setActiveMainTab('AI_FINDER');
          }}
          onBackToBuilder={() => setActiveMainTab('BUILDER')}
        />
      ) : activeMainTab === 'PROJECTION' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveMainTab('BUILDER')}
              className="text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 cursor-pointer bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg"
            >
              &larr; Back to Active Trade Simulator
            </button>
            <span className="text-xs font-mono text-zinc-400">
              Active Trade Package: {sendPlayers.length + sendPicks.length} Out • {receivePlayers.length + receivePicks.length} In
            </span>
          </div>
          <DynastyCoreProjection
            currentPlayers={playersA}
            currentPicks={picksA}
            sendPlayers={sendPlayers}
            sendPicks={sendPicks}
            receivePlayers={receivePlayers}
            receivePicks={receivePicks}
            teamName={teamA.roster.franchise_name || 'Your Team'}
            hasActiveTrade={hasSelections}
          />
        </div>
      ) : (
        <>
          {/* Header and Opponent Benchmark Selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
              <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Roster DNA Trade Builder & Simulator
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold">
                  QUANTITATIVE IMPACT
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Model multi-asset trade proposals and calculate real-time net change in Gross Liquidity and Structural Integrity.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase text-zinc-400">Trade Partner:</span>
            {teamA.league_teams && teamA.league_teams.length > 0 ? (
              <select
                value={teamB?.roster.franchise_id || ''}
                onChange={(e) => {
                  const selectedFid = e.target.value;
                  const selectedTeam = teamA.league_teams?.find((t) => t.franchise_id === selectedFid);
                  if (selectedTeam) {
                    setComparisonEvaluation({
                      roster: {
                        roster_id: selectedTeam.franchise_id,
                        platform: teamA.roster.platform,
                        external_league_id: teamA.roster.external_league_id,
                        franchise_id: selectedTeam.franchise_id,
                        franchise_name: selectedTeam.franchise_name,
                        player_ids: [...selectedTeam.starters, ...selectedTeam.bench].map((p) => p.id),
                        valuation_mode: teamA.roster.valuation_mode,
                        draft_picks: selectedTeam.draft_picks,
                      },
                      metrics: {
                        classification: selectedTeam.classification,
                        gross_liquidity: selectedTeam.gross_liquidity,
                        asset_half_life: selectedTeam.asset_half_life,
                        structural_integrity: selectedTeam.structural_integrity,
                        total_roster_value: selectedTeam.total_value,
                        starter_value: selectedTeam.starter_value,
                        bench_value: selectedTeam.bench_value,
                        draft_capital_value: selectedTeam.draft_capital_value,
                      },
                      players: [...selectedTeam.starters, ...selectedTeam.bench],
                      starters: selectedTeam.starters,
                      bench: selectedTeam.bench,
                      draft_picks: selectedTeam.draft_picks,
                      positional_breakdown: {},
                    } as any);
                    clearTrade();
                  }
                }}
                className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs font-mono text-white outline-none focus:border-amber-500 font-bold"
              >
                {teamA.league_teams
                  .filter((t) => t.franchise_id !== teamA.roster.franchise_id && t.franchise_name !== teamA.roster.franchise_name)
                  .map((t) => (
                    <option key={t.franchise_id} value={t.franchise_id}>
                      #{t.power_rank} {t.franchise_name} ({t.stance_label})
                    </option>
                  ))}
              </select>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => loadComparisonDemo('contender')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    teamB?.roster.franchise_name === 'Gotham Iron Men'
                      ? 'bg-amber-950 text-amber-300 border-amber-600 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  Gotham (Contender)
                </button>
                <button
                  type="button"
                  onClick={() => loadComparisonDemo('rebuild')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    teamB?.roster.franchise_name === 'Future First Rounders'
                      ? 'bg-amber-950 text-amber-300 border-amber-600 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  Rebuilders (Youth)
                </button>
                <button
                  type="button"
                  onClick={() => loadComparisonDemo('juggernaut')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    teamB?.roster.franchise_name === 'Metropolis Apex Predator'
                      ? 'bg-amber-950 text-amber-300 border-amber-600 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  Apex (Juggernaut)
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Real-Time Net Metric Impact Bar */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-5 md:p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold block">
              Simulated Post-Trade Impact Analysis
            </span>
            <h4 className="text-lg font-black text-white flex items-center gap-2 mt-0.5">
              <span>{teamA.roster.franchise_name || 'Your Roster'} Portfolio Trajectory</span>
              {hasSelections && (
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {sendPlayers.length} Out • {receivePlayers.length} In
                </span>
              )}
            </h4>
          </div>

          {/* Quick Scenario Buttons & Reset */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPreselectedShopPlayer(null);
                setPreselectedTargetPlayer(null);
                setActiveMainTab('AI_FINDER');
              }}
              className="px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-black font-mono transition-all flex items-center gap-1 shadow-md shadow-amber-400/20 cursor-pointer"
              title="Launch AI Trade Architect"
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
              <span>AI Architect</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('HEATMAP')}
              className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-500/80 hover:border-rose-400 text-rose-300 text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
              title="Open D3 Heatmap of player trade values relative to the rest of the league"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Market Heatmap</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('PROJECTION')}
              className="px-2.5 py-1 rounded bg-purple-950/80 border border-purple-500/80 hover:border-purple-400 text-purple-300 text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
              title="Open 3-Season Dynasty Core Recharts Projection"
            >
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>3-Yr Trajectory</span>
            </button>
            <button
              type="button"
              onClick={applyPresetFlexForFirst}
              className="px-2.5 py-1 rounded bg-amber-950/80 border border-amber-500/80 hover:border-amber-400 text-amber-300 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
              title="Dynasty Rule: Trade your flex producer for contender's future 1st round pick"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>"Flex for 1st" Blueprint</span>
            </button>
            <button
              type="button"
              onClick={applyPresetWinNow}
              className="px-2.5 py-1 rounded bg-zinc-950 border border-cyan-800/80 hover:border-cyan-500 text-cyan-400 text-xs font-medium transition-all"
            >
              Preset: Win-Now Package
            </button>
            <button
              type="button"
              onClick={applyPresetRebuild}
              className="px-2.5 py-1 rounded bg-zinc-950 border border-emerald-800/80 hover:border-emerald-500 text-emerald-400 text-xs font-medium transition-all"
            >
              Preset: Rebuild Pivot
            </button>
            {hasSelections && (
              <button
                type="button"
                onClick={clearTrade}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1 transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* The 4 Core Metric Impact Dials */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {/* Card 1: Gross Liquidity Change (Based on Standard Dynasty Pick Valuation Models) */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
                  Gross Liquidity
                </span>
                <span className="text-[9px] font-mono px-1 rounded bg-zinc-800 text-cyan-400 font-bold">
                  DYNASTY MODEL
                </span>
              </div>
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded border ${
                  compositeLiquidityDeltaA > 0
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                    : compositeLiquidityDeltaA < 0
                    ? 'bg-rose-950/90 text-rose-300 border-rose-700'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {compositeLiquidityDeltaA > 0 ? `+${compositeLiquidityDeltaA.toFixed(1)} Δ` : `${compositeLiquidityDeltaA.toFixed(1)} Δ`}
              </span>
            </div>

            <div className="flex items-baseline gap-2 py-1">
              <span className="text-2xl font-black font-mono text-white">
                {compositeGrossLiquidityA.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-zinc-500 line-through">
                {preLiquidityA.toFixed(1)}
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">idx</span>
            </div>

            {/* Subtext with Starter Firepower vs Future Draft Capital Breakdown */}
            <div className="text-[11px] text-zinc-400 mt-2 border-t border-zinc-800/80 pt-2 space-y-1">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-zinc-500">Starter Output:</span>
                <span className={liquidityDeltaA >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {postLiquidityA.toFixed(1)} ({liquidityDeltaA >= 0 ? `+${liquidityDeltaA.toFixed(1)}` : liquidityDeltaA.toFixed(1)} Δ)
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-zinc-500">Draft Capital:</span>
                <span className={pickLiquidityDeltaA >= 0 ? 'text-cyan-400 font-bold' : 'text-rose-400 font-bold'}>
                  {pickLiquidityDeltaA >= 0 ? `+${pickLiquidityDeltaA.toFixed(1)}` : pickLiquidityDeltaA.toFixed(1)} Δ idx
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 pt-0.5 leading-tight">
                {pickLiquidityDeltaA > 0
                  ? `Future picks provide +${pickLiquidityDeltaA.toFixed(1)} liquid store-of-value equity.`
                  : pickLiquidityDeltaA < 0
                  ? `Sending future picks redeploys ${pickLiquidityDeltaA.toFixed(1)} capital into active starters.`
                  : liquidityDeltaA > 0
                  ? 'Starter scoring firepower expanded.'
                  : liquidityDeltaA < 0
                  ? 'Starter scoring power reduced.'
                  : 'Balanced asset liquidity.'}
              </p>
            </div>
          </div>

          {/* Card 2: Structural Integrity Change */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
                Structural Integrity
              </span>
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded border ${
                  integrityDeltaA > 0
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                    : integrityDeltaA < 0
                    ? 'bg-rose-950/90 text-rose-300 border-rose-700'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {integrityDeltaA > 0 ? `+${integrityDeltaA.toFixed(1)}% Δ` : `${integrityDeltaA.toFixed(1)}% Δ`}
              </span>
            </div>

            <div className="flex items-baseline gap-2 py-1">
              <span className="text-2xl font-black font-mono text-white">
                {postIntegrityA.toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-zinc-500 line-through">
                {preIntegrityA.toFixed(1)}%
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 mt-2 border-t border-zinc-800/80 pt-2">
              {integrityDeltaA > 0
                ? 'Bench Insulation Fortified: Roster withstands injury volatility.'
                : integrityDeltaA < 0
                ? 'Fragility Warning: Starting capital isolated with reduced bench safety.'
                : 'Maintains current structural balance.'}
            </p>
          </div>

          {/* Card 3: Asset Half-Life Change */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
                Asset Half-Life
              </span>
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded border ${
                  halfLifeDeltaA > 0
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                    : halfLifeDeltaA < 0
                    ? 'bg-amber-950/90 text-amber-300 border-amber-700'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {halfLifeDeltaA > 0 ? `+${halfLifeDeltaA.toFixed(1)}y Δ` : `${halfLifeDeltaA.toFixed(1)}y Δ`}
              </span>
            </div>

            <div className="flex items-baseline gap-2 py-1">
              <span className="text-2xl font-black font-mono text-white">
                {postHalfLifeA.toFixed(1)}y
              </span>
              <span className="text-xs font-mono text-zinc-500 line-through">
                {preHalfLifeA.toFixed(1)}y
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 mt-2 border-t border-zinc-800/80 pt-2">
              {halfLifeDeltaA > 0
                ? 'Timeline Extended: Weighted roster age shifts down the cliff curve.'
                : halfLifeDeltaA < 0
                ? 'Win-Now Concentration: Premium production acquired at peak age.'
                : 'Timeline remains unchanged.'}
            </p>
          </div>

          {/* Card 4: Archetype Status Shift */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
                Archetype Status
              </span>
              <Award className="w-4 h-4 text-cyan-400" />
            </div>

            <div className="py-1">
              <span className="text-base font-extrabold font-mono text-cyan-300 block">
                {postClassificationA}
              </span>
              {postClassificationA !== preClassificationA ? (
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                  Shifted from {preClassificationA}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-zinc-500">
                  Maintains {preClassificationA}
                </span>
              )}
            </div>

            <div className="text-[11px] font-mono text-zinc-400 mt-2 border-t border-zinc-800/80 pt-2 flex items-center justify-between">
              <span>Net Valuation Δ:</span>
              <span className={netValueDelta >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {netValueDelta >= 0 ? `+${netValueDelta.toLocaleString()}` : `${netValueDelta.toLocaleString()}`} pts
              </span>
            </div>
          </div>
        </div>

        {/* Opponent Symmetrical Feedback (What happens to Team B) */}
        {teamB && hasSelections && (
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-zinc-400">
            <span className="text-amber-400 font-semibold">
              Opponent ({teamB.roster.franchise_name}) Impact:
            </span>
            <div className="flex items-center gap-4">
              <span>
                Total Liquidity: <strong className={compositeLiquidityDeltaB >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {compositeLiquidityDeltaB >= 0 ? `+${compositeLiquidityDeltaB.toFixed(1)}` : `${compositeLiquidityDeltaB.toFixed(1)}`}
                </strong>
              </span>
              <span>
                Integrity: <strong className={integrityDeltaB >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {integrityDeltaB >= 0 ? `+${integrityDeltaB.toFixed(1)}%` : `${integrityDeltaB.toFixed(1)}%`}
                </strong>
              </span>
              <span>
                Net Market Capital: <strong className={-netValueDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {-netValueDelta >= 0 ? `+${(-netValueDelta).toLocaleString()}` : `${(-netValueDelta).toLocaleString()}`} pts
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* Special Dynasty Rule Trigger: "Flex for a First" */}
        {flexForFirstDetected && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-950/80 via-yellow-950/50 to-zinc-950 border border-amber-500/60 shadow-xl flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider bg-amber-400 text-zinc-950">
                  CARDINAL DYNASTY RULE UNLOCKED
                </span>
                <span className="text-xs font-bold text-amber-200">
                  "Flex for a First" Execution Achieved!
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                You are trading flex producer <strong className="text-white">{flexForFirstDetected.flexPlayer.full_name}</strong> in exchange for <strong className="text-amber-300">{flexForFirstDetected.pick.description}</strong>. Contenders urgently burn future capital for temporary weekly points; you lock in permanent, appreciating first-round equity that is 100% insulated against injuries and age cliffs!
              </p>
            </div>
          </div>
        )}

        {/* Special Strategy Trigger: Multi-Year Pick Arbitrage */}
        {multiYearArbitrageDetected && !flexForFirstDetected && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-cyan-950/80 via-blue-950/40 to-zinc-950 border border-cyan-500/50 shadow-xl flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shrink-0">
              <Coins className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider bg-cyan-400 text-zinc-950">
                  MULTI-YEAR ARBITRAGE
                </span>
                <span className="text-xs font-bold text-cyan-200">
                  Compounding Equity: {multiYearArbitrageDetected.year} Future Pick
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Trading for picks multiple years out ({multiYearArbitrageDetected.year}) takes advantage of rival present-bias. Opponents undervalue distant classes, allowing you to acquire appreciating assets that compound 20-30% in value each season without risk.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2.5 Dynamic Future Draft Pick Modeler & Liquidity Calculator */}
      <div className="bg-zinc-900 border border-amber-500/40 rounded-xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white tracking-tight">
                  Dynamic Future Draft Pick Modeler & Injector
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  STANDARD DYNASTY VALUATION MODEL
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Model upcoming draft capital and compute real-time impact on <strong>Gross Liquidity</strong> based on consensus dynasty pick trade models.
              </p>
            </div>
          </div>

          {/* Dynamic Valuation & Gross Liquidity Impact Readout Badge */}
          <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800 self-start lg:self-auto font-mono text-xs shadow-inner">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block font-medium">Consensus Value</span>
              <span className="font-black text-amber-400 text-base">
                {dynPickMarketValue.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">pts</span>
              </span>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block font-medium">Gross Liquidity Impact</span>
              <span className="font-black text-emerald-400 text-base">
                +{dynPickGrossLiquidityImpact.toFixed(1)} Δ <span className="text-[10px] text-zinc-500 font-sans">idx</span>
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-4 items-end">
          {/* 1. Year Selector */}
          <div>
            <label className="text-[11px] font-mono uppercase text-zinc-300 block mb-1.5 font-bold flex items-center justify-between">
              <span>Draft Year</span>
              {dynPickYear === SEASON.upcomingDraftYear ? (
                <span className="text-[9px] text-amber-400">Priority Class</span>
              ) : (
                <span className="text-[9px] text-cyan-400">Multi-Year</span>
              )}
            </label>
            <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              {[0, 1, 2, 3].map((n) => SEASON.upcomingDraftYear + n).map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setDynPickYear(yr)}
                  className={`flex-1 py-1.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                    dynPickYear === yr
                      ? yr === SEASON.upcomingDraftYear
                        ? 'bg-amber-400 text-zinc-950 shadow-sm'
                        : 'bg-cyan-500 text-zinc-950 shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Round Selector */}
          <div>
            <label className="text-[11px] font-mono uppercase text-zinc-300 block mb-1.5 font-bold">
              Draft Round
            </label>
            <select
              value={dynPickRound}
              onChange={(e) => setDynPickRound(Number(e.target.value))}
              className="w-full py-1.5 px-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-white outline-none focus:border-amber-500 font-bold"
            >
              <option value={1}>Round 1 (Premier Asset)</option>
              <option value={2}>Round 2 (High Upside)</option>
              <option value={3}>Round 3 (Dart Throw)</option>
              <option value={4}>Round 4 (Bench Stash)</option>
              <option value={5}>Round 5 (Speculative)</option>
            </select>
          </div>

          {/* 3. Projection Tier */}
          <div>
            <label className="text-[11px] font-mono uppercase text-zinc-300 block mb-1.5 font-bold">
              Pick Position Tier
            </label>
            <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              {(['Early', 'Mid', 'Late'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setDynPickTier(tier)}
                  className={`flex-1 py-1.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                    dynPickTier === tier
                      ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Target Trade Side */}
          <div>
            <label className="text-[11px] font-mono uppercase text-zinc-300 block mb-1.5 font-bold">
              Trade Target
            </label>
            <select
              value={dynPickTarget}
              onChange={(e) => setDynPickTarget(e.target.value as any)}
              className="w-full py-1.5 px-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-white outline-none focus:border-amber-500 font-bold"
            >
              <option value="RECEIVE_B">Incoming &rarr; You Receive (from Opponent)</option>
              <option value="SEND_A">Outgoing &larr; You Send (from Your Team)</option>
            </select>
          </div>

          {/* 5. Inject Button */}
          <div>
            <button
              type="button"
              onClick={handleAddDynamicPick}
              className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-black font-mono text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-400/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Pick to Trade</span>
            </button>
          </div>
        </div>

        {/* Tactical Guidance Footer */}
        <div className="mt-3.5 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Selected Configuration:</span>
            <span className="text-white font-bold">
              {dynPickYear} Round {dynPickRound} ({dynPickTier})
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-amber-400 font-bold">
              {dynPickMarketValue.toLocaleString()} pts
            </span>
            <span className="text-zinc-600">•</span>
            <span className={dynPickTarget === 'RECEIVE_B' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {dynPickTarget === 'RECEIVE_B' ? `+${dynPickGrossLiquidityImpact.toFixed(1)} Δ` : `-${dynPickGrossLiquidityImpact.toFixed(1)} Δ`} Gross Liquidity
            </span>
          </div>

          <div>
            {dynPickYear === SEASON.upcomingDraftYear ? (
              <span className="text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                🌟 {SEASON.upcomingDraftYear} Priority Class: Prime upcoming draft currency (highest market liquidity)
              </span>
            ) : (
              <span className="text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                💎 {dynPickYear} Multi-Year Arbitrage: Compounding store-of-value, buy at market discount
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2.8 Fair Market Value Notification System (market Logic) */}
      {hasSelections && fairMarketAnalysis && (
        <div
          className={`rounded-xl p-4 sm:p-5 border transition-all shadow-xl relative overflow-hidden ${
            fairMarketAnalysis.isCriticalUnderpay
              ? 'bg-gradient-to-r from-rose-950/90 via-red-950/70 to-zinc-950 border-2 border-rose-500/80 shadow-rose-950/50'
              : fairMarketAnalysis.isModerateUnderpay
              ? 'bg-gradient-to-r from-amber-950/80 via-yellow-950/50 to-zinc-950 border border-amber-500/70 shadow-amber-950/40'
              : fairMarketAnalysis.isFair
              ? 'bg-gradient-to-r from-emerald-950/70 via-zinc-900 to-zinc-950 border border-emerald-500/60 shadow-emerald-950/30'
              : 'bg-gradient-to-r from-cyan-950/70 via-blue-950/50 to-zinc-950 border border-cyan-500/60 shadow-cyan-950/30'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                  fairMarketAnalysis.isCriticalUnderpay
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 animate-pulse'
                    : fairMarketAnalysis.isModerateUnderpay
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : fairMarketAnalysis.isFair
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                }`}
              >
                {fairMarketAnalysis.isCriticalUnderpay ? (
                  <ShieldAlert className="w-6 h-6" />
                ) : fairMarketAnalysis.isModerateUnderpay ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : fairMarketAnalysis.isFair ? (
                  <Scale className="w-6 h-6" />
                ) : (
                  <Sparkles className="w-6 h-6" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider ${
                      fairMarketAnalysis.isCriticalUnderpay
                        ? 'bg-rose-500 text-white'
                        : fairMarketAnalysis.isModerateUnderpay
                        ? 'bg-amber-400 text-zinc-950'
                        : fairMarketAnalysis.isFair
                        ? 'bg-emerald-400 text-zinc-950'
                        : 'bg-cyan-400 text-zinc-950'
                    }`}
                  >
                    {fairMarketAnalysis.isCriticalUnderpay
                      ? 'FAIR MARKET VALUE WARNING'
                      : fairMarketAnalysis.isModerateUnderpay
                      ? 'SUB-CONSENSUS NOTICE'
                      : fairMarketAnalysis.isFair
                      ? 'FAIR MARKET EQUILIBRIUM'
                      : 'VALUE SURPLUS ADVANTAGE'}
                  </span>
                  <span className="text-xs font-bold text-white">
                    {fairMarketAnalysis.isCriticalUnderpay
                      ? `Proposal is ${fairMarketAnalysis.deficitPct.toFixed(1)}% Below Consensus Market Value`
                      : fairMarketAnalysis.isModerateUnderpay
                      ? `Mild Deficit: -${fairMarketAnalysis.deficitPct.toFixed(1)}% vs Consensus Market Value`
                      : fairMarketAnalysis.isFair
                      ? `Consensus Value Equilibrium Verified (within ${Math.abs(fairMarketAnalysis.deficitPct).toFixed(1)}%)`
                      : `Surplus Value Acquisition (+${fairMarketAnalysis.surplusPct.toFixed(1)}% Market Edge)`}
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  {fairMarketAnalysis.isCriticalUnderpay ? (
                    <>
                      You are surrendering <strong className="text-white font-mono">{totalOutgoingValue.toLocaleString()} pts</strong> in market consensus market value while only receiving <strong className="text-white font-mono">{totalIncomingValue.toLocaleString()} pts</strong>. This leaves you with an uncompensated deficit of <strong className="text-rose-400 font-mono">-{fairMarketAnalysis.deficit.toLocaleString()} pts</strong>. Accepting this deal locks in a severe negative value transfer and depreciates your dynasty roster equity.
                    </>
                  ) : fairMarketAnalysis.isModerateUnderpay ? (
                    <>
                      You are giving up slightly more consensus value (<span className="text-amber-300 font-mono">-{fairMarketAnalysis.deficit.toLocaleString()} pts</span>) than receiving. While positional need can justify minor discounts, consider requesting a sweetener pick or young bench stash to protect asset liquidity.
                    </>
                  ) : fairMarketAnalysis.isFair ? (
                    <>
                      Both sides exchange equitable consensus market value (<span className="text-emerald-300 font-mono">{totalOutgoingValue.toLocaleString()} sent vs {totalIncomingValue.toLocaleString()} received</span>). The trade hinges on strategic fit, roster construction, and championship windows rather than equity exploitation.
                    </>
                  ) : (
                    <>
                      You receive a surplus of <strong className="text-cyan-300 font-mono">+{fairMarketAnalysis.diff.toLocaleString()} market pts</strong> relative to outgoing capital. This trade represents a high-leverage value acquisition for your roster portfolio.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Balancer Action if underpaid */}
            {fairMarketAnalysis.recommendedBalancer && (
              <div className="bg-zinc-950/90 p-3 rounded-xl border border-zinc-800 flex flex-col gap-2 shrink-0 lg:max-w-xs shadow-inner">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-400 font-bold flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5 text-amber-400" />
                    Market Balancer:
                  </span>
                  <span className="text-amber-400 font-bold">
                    +{fairMarketAnalysis.recommendedBalancer.value.toLocaleString()} pts
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300">
                  Requesting opponent's <strong className="text-white">{fairMarketAnalysis.recommendedBalancer.label}</strong> bridges the deficit and restores fair consensus parity.
                </p>
                <button
                  type="button"
                  onClick={handleAddRecommendedBalancer}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-black font-mono text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-400/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Auto-Add to Balance Deal</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Trade Stage Package Chips */}
      {hasSelections && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Outgoing Package */}
          <div className="bg-zinc-900 border border-cyan-900/60 rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase flex items-center gap-1.5">
                <Minus className="w-3.5 h-3.5" />
                Outgoing: You Send ({sendPlayers.length + sendPicks.length} pieces)
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {totalOutgoingValue.toLocaleString()} pts
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {sendPlayers.length === 0 && sendPicks.length === 0 ? (
                <span className="text-xs text-zinc-500 italic">No assets selected yet</span>
              ) : (
                <>
                  {sendPlayers.map((p) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-cyan-700/60 text-xs font-medium text-white shadow-sm"
                    >
                      <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-cyan-300">
                        {p.position}
                      </span>
                      <span>{p.full_name}</span>
                      <span className="text-cyan-400 font-mono text-[11px]">
                        {p.market_value.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSendPlayer(p.id)}
                        className="text-zinc-400 hover:text-rose-400 transition-colors ml-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {sendPicks.map((pick) => (
                    <div
                      key={pick.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-cyan-500/80 text-xs font-medium text-white shadow-sm font-mono"
                    >
                      <Coins className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{pick.description}</span>
                      <span className="text-cyan-400 font-bold">{pick.market_value.toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={() => toggleSendPick(pick.id)}
                        className="text-zinc-400 hover:text-rose-400 transition-colors ml-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Incoming Package */}
          <div className="bg-zinc-900 border border-amber-900/60 rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Incoming: You Receive ({receivePlayers.length + receivePicks.length} pieces)
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {totalIncomingValue.toLocaleString()} pts
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {receivePlayers.length === 0 && receivePicks.length === 0 ? (
                <span className="text-xs text-zinc-500 italic">No assets selected yet</span>
              ) : (
                <>
                  {receivePlayers.map((p) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-amber-700/60 text-xs font-medium text-white shadow-sm"
                    >
                      <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-amber-300">
                        {p.position}
                      </span>
                      <span>{p.full_name}</span>
                      <span className="text-amber-400 font-mono text-[11px]">
                        {p.market_value.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleReceivePlayer(p.id)}
                        className="text-zinc-400 hover:text-rose-400 transition-colors ml-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {receivePicks.map((pick) => (
                    <div
                      key={pick.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-amber-500/80 text-xs font-medium text-white shadow-sm font-mono"
                    >
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>{pick.description}</span>
                      <span className="text-amber-400 font-bold">{pick.market_value.toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={() => toggleReceivePick(pick.id)}
                        className="text-zinc-400 hover:text-rose-400 transition-colors ml-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Trade Execution & History Logging Action Bar */}
          <div className="col-span-1 md:col-span-2 bg-gradient-to-r from-emerald-950/70 via-zinc-900 to-zinc-950 border border-emerald-500/50 rounded-xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-white block flex items-center gap-2">
                  <span>Proposal Ready to Log & Verify</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    REAL-TIME MODELING
                  </span>
                </span>
                <span className="text-[11px] text-zinc-400 font-mono">
                  Projected Gross Liquidity:{' '}
                  <strong className={compositeLiquidityDeltaA >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {compositeLiquidityDeltaA >= 0 ? `+${compositeLiquidityDeltaA.toFixed(1)} Δ` : `${compositeLiquidityDeltaA.toFixed(1)} Δ`}
                  </strong>
                  {' '}• Net Value Δ:{' '}
                  <strong className={netValueDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {netValueDelta >= 0 ? `+${netValueDelta.toLocaleString()}` : netValueDelta.toLocaleString()} pts
                  </strong>
                  {' '}• Integrity:{' '}
                  <strong className={integrityDeltaA >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {integrityDeltaA >= 0 ? `+${integrityDeltaA.toFixed(1)}%` : `${integrityDeltaA.toFixed(1)}%`}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <button
                type="button"
                onClick={clearTrade}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs transition-colors cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleExecuteAndLogTrade}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-zinc-950 font-black font-mono text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Execute & Log to Trade History</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.5 Dynasty Core Health Score 3-Season Evolution (Recharts) */}
      <DynastyCoreProjection
        currentPlayers={playersA}
        currentPicks={picksA}
        sendPlayers={sendPlayers}
        sendPicks={sendPicks}
        receivePlayers={receivePlayers}
        receivePicks={receivePicks}
        teamName={teamA.roster.franchise_name || 'Your Team'}
        hasActiveTrade={hasSelections}
      />

      {/* 4. Side-by-Side Interactive Player Selection Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Column A: Your Roster (Team A) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
          <div className="p-4 border-b border-zinc-800 bg-zinc-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">
                Source: Primary Roster
              </span>
              <h4 className="text-sm font-bold text-white">
                {teamA.roster.franchise_name || 'Team A'}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-[120px]">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter name..."
                  value={searchA}
                  onChange={(e) => setSearchA(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[11px] text-zinc-200 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex bg-zinc-900 rounded border border-zinc-800 p-0.5 text-[10px] font-mono">
                {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setPosFilterA(pos)}
                    className={`px-1.5 py-0.5 rounded ${
                      posFilterA === pos ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex border-b border-zinc-800 bg-zinc-950/60 text-xs font-mono">
            <button
              type="button"
              onClick={() => setSubTabA('PLAYERS')}
              className={`flex-1 py-2 text-center transition-colors font-bold cursor-pointer ${
                subTabA === 'PLAYERS'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-zinc-900/60'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Players ({playersA.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTabA('PICKS')}
              className={`flex-1 py-2 text-center transition-colors font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                subTabA === 'PICKS'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-zinc-900/60'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Coins className="w-3.5 h-3.5 text-cyan-400" />
              Draft Picks ({picksA.length})
            </button>
          </div>

          {/* List of Players with Quick Checkbox/Click to Add */}
          {subTabA === 'PLAYERS' && (
            <div className="divide-y divide-zinc-800/60 max-h-[480px] overflow-y-auto">
              {filteredA.map((player) => {
                const isSelected = sendIds.includes(player.id);
                return (
                  <div
                    key={player.id}
                    onClick={() => toggleSendPlayer(player.id)}
                    className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/40 border-l-2 border-cyan-400'
                        : 'hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                            : 'border-zinc-700 bg-zinc-950'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white">
                            {player.full_name}
                          </span>
                          <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                            {player.position}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {player.nfl_team}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400">
                          Age: {player.age.toFixed(1)}y • #{player.consensus_rank}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono flex items-center gap-2">
                      <div>
                        <span className="text-xs font-bold text-cyan-300 block">
                          {player.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">value</span>
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {player.is_starter ? 'Starter' : 'Bench'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLaunchAITarget(player, 'SHOP');
                        }}
                        className="px-2 py-1 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Shop this player with AI Trade Architect"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        <span>AI</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* List of Draft Picks */}
          {subTabA === 'PICKS' && (
            <div className="divide-y divide-zinc-800/60 max-h-[480px] overflow-y-auto font-mono">
              {picksA.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No draft picks recorded for your team.</div>
              ) : (
                picksA.map((pick) => {
                  const isSelected = sendPickIds.includes(pick.id);
                  return (
                    <div
                      key={pick.id}
                      onClick={() => toggleSendPick(pick.id)}
                      className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-950/40 border-l-2 border-cyan-400'
                          : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                              : 'border-zinc-700 bg-zinc-950'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-white">
                              {pick.description}
                            </span>
                            {pick.is_priority_class && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                Priority '27
                              </span>
                            )}
                            {(pick.years_out ?? 0) >= 1 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                                {pick.year} Multi-Year
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-400">
                            Round {pick.round} • Class of {pick.year}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <span className="text-xs font-bold text-cyan-300 block">
                          {pick.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">pts</span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Column B: Opponent Roster (Team B) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
          <div className="p-4 border-b border-zinc-800 bg-zinc-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                Target: Opponent Roster
              </span>
              <h4 className="text-sm font-bold text-white">
                {teamB?.roster.franchise_name || 'Team B'}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-[120px]">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter name..."
                  value={searchB}
                  onChange={(e) => setSearchB(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[11px] text-zinc-200 outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex bg-zinc-900 rounded border border-zinc-800 p-0.5 text-[10px] font-mono">
                {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setPosFilterB(pos)}
                    className={`px-1.5 py-0.5 rounded ${
                      posFilterB === pos ? 'bg-zinc-800 text-amber-400 font-bold' : 'text-zinc-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex border-b border-zinc-800 bg-zinc-950/60 text-xs font-mono">
            <button
              type="button"
              onClick={() => setSubTabB('PLAYERS')}
              className={`flex-1 py-2 text-center transition-colors font-bold cursor-pointer ${
                subTabB === 'PLAYERS'
                  ? 'text-amber-400 border-b-2 border-amber-400 bg-zinc-900/60'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Players ({playersB.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTabB('PICKS')}
              className={`flex-1 py-2 text-center transition-colors font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                subTabB === 'PICKS'
                  ? 'text-amber-400 border-b-2 border-amber-400 bg-zinc-900/60'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              Draft Picks ({picksB.length})
            </button>
          </div>

          {/* List of Players with Quick Checkbox/Click to Add */}
          {subTabB === 'PLAYERS' && (
            <div className="divide-y divide-zinc-800/60 max-h-[480px] overflow-y-auto">
              {filteredB.map((player) => {
                const isSelected = receiveIds.includes(player.id);
                return (
                  <div
                    key={player.id}
                    onClick={() => toggleReceivePlayer(player.id)}
                    className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-950/40 border-l-2 border-amber-400'
                        : 'hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'border-zinc-700 bg-zinc-950'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white">
                            {player.full_name}
                          </span>
                          <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                            {player.position}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {player.nfl_team}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400">
                          Age: {player.age.toFixed(1)}y • #{player.consensus_rank}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono flex items-center gap-2">
                      <div>
                        <span className="text-xs font-bold text-amber-300 block">
                          {player.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">value</span>
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {player.is_starter ? 'Starter' : 'Bench'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLaunchAITarget(player, 'TARGET');
                        }}
                        className="px-2 py-1 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Target this player with AI Trade Architect"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        <span>AI</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* List of Opponent Draft Picks */}
          {subTabB === 'PICKS' && (
            <div className="divide-y divide-zinc-800/60 max-h-[480px] overflow-y-auto font-mono">
              {picksB.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No draft picks recorded for opponent.</div>
              ) : (
                picksB.map((pick) => {
                  const isSelected = receivePickIds.includes(pick.id);
                  return (
                    <div
                      key={pick.id}
                      onClick={() => toggleReceivePick(pick.id)}
                      className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-amber-950/40 border-l-2 border-amber-400'
                          : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-amber-500 border-amber-400 text-slate-950'
                              : 'border-zinc-700 bg-zinc-950'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-white">
                              {pick.description}
                            </span>
                            {pick.is_priority_class && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                Priority '27
                              </span>
                            )}
                            {(pick.years_out ?? 0) >= 1 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                                {pick.year} Multi-Year
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-400">
                            Round {pick.round} • Class of {pick.year}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <span className="text-xs font-bold text-amber-300 block">
                          {pick.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">pts</span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
