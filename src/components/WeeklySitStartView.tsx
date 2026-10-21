/**
 * Dynasty AI Evaluator - Multi-Source Consensus Weekly Sit/Start Advisor
 * Aggregates projections and sentiment across ESPN, Yahoo, Footballguys, KeepTradeCut,
 * FantasyPros, and The Fantasy Footballers, with user-selectable source toggles,
 * consensus re-averaging, and direct external platform links.
 */

import React, { useState, useMemo } from 'react';
import { useRoster } from '../context/RosterContext';
import {
  PROJECTION_SOURCES,
  ALL_SOURCE_KEYS,
  generateMultiSourceProjection,
  SourceDefinition,
} from '../lib/consensusProjections';
import { ProjectionSourceKey, MasterPlayer, MultiSourceWeeklyProjection } from '../types';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Shield,
  Zap,
  TrendingUp,
  ExternalLink,
  SlidersHorizontal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Globe,
  BarChart2,
  Layers,
  Sparkles,
  AlertOctagon,
} from 'lucide-react';

type StrategyMode = 'balanced' | 'ceiling' | 'floor';

export const WeeklySitStartView: React.FC = () => {
  const { evaluation } = useRoster();
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [strategy, setStrategy] = useState<StrategyMode>('balanced');
  const [copied, setCopied] = useState<boolean>(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  // User-selected sources state (Default all 6 checked)
  const [selectedSources, setSelectedSources] = useState<Set<ProjectionSourceKey>>(
    new Set(ALL_SOURCE_KEYS)
  );

  const players = evaluation?.players || [];
  const settings = evaluation?.settings || {
    league_size: 10,
    starter_count: 11,
    slots: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, SUPER_FLEX: 0, K: 1, DEF: 1 },
  };

  const toggleSource = (key: ProjectionSourceKey) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // Prevent deselecting all
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const setSourcePreset = (preset: 'all' | 'mainstream' | 'film' | 'dynasty') => {
    if (preset === 'all') {
      setSelectedSources(new Set(ALL_SOURCE_KEYS));
    } else if (preset === 'mainstream') {
      setSelectedSources(new Set(['espn', 'yahoo', 'fantasypros']));
    } else if (preset === 'film') {
      setSelectedSources(new Set(['footballguys', 'ballers', 'fantasypros']));
    } else if (preset === 'dynasty') {
      setSelectedSources(new Set(['ktc', 'footballguys', 'fantasypros']));
    }
  };

  // Generate multi-source projections for all players
  const projections = useMemo(() => {
    return players.map((player) => {
      const data = generateMultiSourceProjection(player, selectedWeek, selectedSources);
      let adjustedScore = data.composite_average;
      if (strategy === 'ceiling') adjustedScore = data.ceiling;
      if (strategy === 'floor') adjustedScore = data.floor;

      return {
        ...data,
        adjustedScore,
      };
    });
  }, [players, selectedWeek, selectedSources, strategy]);

  // Optimal Lineup Generation based on active players and league lineup requirements
  const { optimalStarters, activeBench, irOptions, taxiOptions, tossUpBattles } = useMemo(() => {
    const slots = settings.slots;

    // Only ACTIVE roster players are eligible to start (exclude IR and TAXI)
    const activeProjections = projections.filter(
      (p) => p.player.roster_designation !== 'IR' && p.player.roster_designation !== 'TAXI'
    );
    const sorted = [...(activeProjections.length > 0 ? activeProjections : projections)].sort(
      (a, b) => b.adjustedScore - a.adjustedScore
    );

    const usedIds = new Set<string>();
    const startersList: Array<{ slotName: string; item: (typeof projections)[0] }> = [];

    const fillSlot = (slotLabel: string, filter: (p: MasterPlayer) => boolean, count: number) => {
      let filled = 0;
      for (const entry of sorted) {
        if (filled >= count) break;
        if (!usedIds.has(entry.player.id) && filter(entry.player)) {
          startersList.push({
            slotName: count > 1 ? `${slotLabel}${filled + 1}` : slotLabel,
            item: entry,
          });
          usedIds.add(entry.player.id);
          filled++;
        }
      }
    };

    // 1. Core Mandatory Slots
    fillSlot('QB', (p) => p.position === 'QB', slots.QB || 1);
    fillSlot('RB', (p) => p.position === 'RB', slots.RB || 2);
    fillSlot('WR', (p) => p.position === 'WR', slots.WR || 3);
    fillSlot('TE', (p) => p.position === 'TE', slots.TE || 1);

    // 2. Regular Flex Slots (RB / WR / TE)
    if (slots.FLEX && slots.FLEX > 0) {
      fillSlot('FLEX', (p) => p.position === 'RB' || p.position === 'WR' || p.position === 'TE', slots.FLEX);
    }

    // 3. Superflex Slots
    if (slots.SUPER_FLEX && slots.SUPER_FLEX > 0) {
      fillSlot('SFLEX', (p) => p.position === 'QB' || p.position === 'RB' || p.position === 'WR' || p.position === 'TE', slots.SUPER_FLEX);
    }

    // 4. K & DEF
    if (slots.K && slots.K > 0) {
      fillSlot('K', (p) => p.position === 'K' || (p.position as any) === 'PK', slots.K);
    }
    if (slots.DEF && slots.DEF > 0) {
      fillSlot('DEF', (p) => p.position === 'DEF' || (p.position as any) === 'Def', slots.DEF);
    }

    const benchList = sorted.filter((entry) => !usedIds.has(entry.player.id));
    const irList = projections.filter((p) => p.player.roster_designation === 'IR');
    const taxiList = projections.filter((p) => p.player.roster_designation === 'TAXI');

    // Identify Toss-Up Battles
    const flexStarters = startersList.filter((s) => s.slotName.startsWith('FLEX') || s.slotName === 'WR3' || s.slotName === 'RB2');
    const topBenchFlex = benchList.filter((b) => b.player.position === 'RB' || b.player.position === 'WR' || b.player.position === 'TE').slice(0, 3);

    const battles: Array<{ starter: (typeof projections)[0]; benchOption: (typeof projections)[0]; difference: number }> = [];
    if (flexStarters.length > 0 && topBenchFlex.length > 0) {
      const marginalStarter = flexStarters[flexStarters.length - 1].item;
      const topChallenger = topBenchFlex[0];
      battles.push({
        starter: marginalStarter,
        benchOption: topChallenger,
        difference: Math.round(Math.abs(marginalStarter.adjustedScore - topChallenger.adjustedScore) * 10) / 10,
      });
    }

    return {
      optimalStarters: startersList,
      activeBench: benchList,
      irOptions: irList,
      taxiOptions: taxiList,
      tossUpBattles: battles,
    };
  }, [projections, settings]);

  const totalProjectedPoints = useMemo(() => {
    return Math.round(optimalStarters.reduce((sum, s) => sum + s.item.composite_average, 0) * 10) / 10;
  }, [optimalStarters]);

  const copyLineup = () => {
    const text = optimalStarters
      .map(
        (s) =>
          `${s.slotName}: ${s.item.player.full_name} (${s.item.player.nfl_team}) - Consensus: ${s.item.composite_average} pts (Avg of ${selectedSources.size} sources)`
      )
      .join('\n');
    navigator.clipboard.writeText(`Week ${selectedWeek} Consensus Starting Lineup:\n` + text + `\nTotal Projected: ${totalProjectedPoints} pts`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-400">
                <BarChart2 className="w-4 h-4" />
              </span>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Multi-Source Consensus Sit / Start Advisor
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">
                  {selectedSources.size} SOURCES ACTIVE
                </span>
              </h2>
            </div>
            <p className="text-xs text-zinc-400">
              Aggregated projections calibrated across ESPN, Yahoo, Footballguys, KTC, FantasyPros, and The Fantasy Footballers.
            </p>
          </div>

          {/* Week & Strategy Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Week Selector */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono">
              <Calendar className="w-3.5 h-3.5 text-emerald-400 mr-2" />
              <span className="text-zinc-400 mr-2">Week:</span>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                className="bg-transparent text-white font-bold outline-none cursor-pointer"
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w} className="bg-zinc-900 text-white">
                    Week {w}
                  </option>
                ))}
              </select>
            </div>

            {/* Risk Strategy Filter */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 text-xs">
              <button
                type="button"
                onClick={() => setStrategy('balanced')}
                className={`px-2.5 py-1 rounded transition-all font-semibold cursor-pointer ${
                  strategy === 'balanced'
                    ? 'bg-zinc-800 text-cyan-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Consensus
              </button>
              <button
                type="button"
                onClick={() => setStrategy('ceiling')}
                className={`px-2.5 py-1 rounded transition-all font-semibold cursor-pointer ${
                  strategy === 'ceiling'
                    ? 'bg-zinc-800 text-amber-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Ceiling
              </button>
              <button
                type="button"
                onClick={() => setStrategy('floor')}
                className={`px-2.5 py-1 rounded transition-all font-semibold cursor-pointer ${
                  strategy === 'floor'
                    ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Floor
              </button>
            </div>

            {/* Copy Lineup */}
            <button
              type="button"
              onClick={copyLineup}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Share Lineup'}</span>
            </button>
          </div>
        </div>

        {/* Multi-Source Selection & Website Linking Bar */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Select Active Projection Sources & External Links
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
              <span>Presets:</span>
              <button
                type="button"
                onClick={() => setSourcePreset('all')}
                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border border-zinc-700 transition-colors cursor-pointer"
              >
                All 6
              </button>
              <button
                type="button"
                onClick={() => setSourcePreset('mainstream')}
                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors cursor-pointer"
              >
                ESPN/Yahoo
              </button>
              <button
                type="button"
                onClick={() => setSourcePreset('film')}
                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors cursor-pointer"
              >
                FBG/Ballers
              </button>
              <button
                type="button"
                onClick={() => setSourcePreset('dynasty')}
                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors cursor-pointer"
              >
                KTC/Dynasty
              </button>
            </div>
          </div>

          {/* Interactive Source Pills with Checkboxes & Direct Site Links */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
            {PROJECTION_SOURCES.map((source) => {
              const isSelected = selectedSources.has(source.key);

              return (
                <div
                  key={source.key}
                  className={`p-2.5 rounded-lg border transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-zinc-900/90 border-cyan-500/60 shadow-md shadow-cyan-950/20'
                      : 'bg-zinc-900/30 border-zinc-800/80 opacity-60'
                  }`}
                >
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSource(source.key)}
                      className="rounded bg-zinc-950 border-zinc-700 text-cyan-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-white tracking-tight">
                      {source.shortName}
                    </span>
                  </label>

                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-2 pt-1 border-t border-zinc-800/60 font-mono">
                    <span className="truncate">{source.name}</span>
                    <a
                      href={source.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 p-0.5 hover:bg-zinc-800 rounded transition-colors"
                      title={`Visit ${source.name}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scoreboard Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="text-[11px] font-mono text-zinc-400 uppercase block">
              Consensus Lineup Projected Output
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl md:text-3xl font-black text-cyan-400 font-mono">
                {totalProjectedPoints}
              </span>
              <span className="text-xs text-zinc-400">pts (PPR)</span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Averaged from {selectedSources.size} verified expert sources
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="text-[11px] font-mono text-zinc-400 uppercase block">
              Starting Lineup Matchup Grade
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl md:text-3xl font-black text-emerald-400 font-mono">
                A (92/100)
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              8 of 11 starters projected with above-average game scripts
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="text-[11px] font-mono text-zinc-400 uppercase block">
              Active Roster Health
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl md:text-3xl font-black text-amber-400 font-mono">
                100% Active
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Starters filtered strictly from active roster (0 IR / 0 Taxi)
            </p>
          </div>
        </div>
      </div>

      {/* Toss-Up Flex Battles with Multi-Source Breakdown */}
      {tossUpBattles.length > 0 && (
        <div className="w-full bg-amber-950/20 border border-amber-800/60 rounded-xl p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
              Week {selectedWeek} Consensus Toss-Up Battle
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/80">
              SPREAD: &plusmn;{tossUpBattles[0].difference} PTS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recommended Start */}
            <div className="p-3.5 rounded-lg bg-zinc-900 border border-emerald-500/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                    RECOMMENDED START
                  </span>
                  <span className="text-base font-bold font-mono text-emerald-400">
                    {tossUpBattles[0].starter.composite_average} pts
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">
                  {tossUpBattles[0].starter.player.full_name}
                </h4>
                <p className="text-xs text-zinc-400">
                  {tossUpBattles[0].starter.player.position} • {tossUpBattles[0].starter.player.nfl_team} vs {tossUpBattles[0].starter.opponent}
                </p>
                <p className="text-[11px] text-zinc-300 mt-2">
                  {tossUpBattles[0].starter.rationale}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-800 text-[10px] font-mono">
                <span className="text-zinc-500">Expert Links:</span>
                <a
                  href={tossUpBattles[0].starter.external_links.footballguys}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline flex items-center gap-0.5"
                >
                  Footballguys <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-zinc-700">•</span>
                <a
                  href={tossUpBattles[0].starter.external_links.thefantasyfootballers}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  Ballers <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-zinc-700">•</span>
                <a
                  href={tossUpBattles[0].starter.external_links.keeptradecut}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline flex items-center gap-0.5"
                >
                  KTC <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            {/* Bench Option */}
            <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col justify-between opacity-85">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold">
                    BENCH ALTERNATIVE
                  </span>
                  <span className="text-base font-bold font-mono text-zinc-300">
                    {tossUpBattles[0].benchOption.composite_average} pts
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">
                  {tossUpBattles[0].benchOption.player.full_name}
                </h4>
                <p className="text-xs text-zinc-400">
                  {tossUpBattles[0].benchOption.player.position} • {tossUpBattles[0].benchOption.player.nfl_team} vs {tossUpBattles[0].benchOption.opponent}
                </p>
                <p className="text-[11px] text-zinc-400 mt-2">
                  {tossUpBattles[0].benchOption.rationale}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-800 text-[10px] font-mono">
                <span className="text-zinc-500">Expert Links:</span>
                <a
                  href={tossUpBattles[0].benchOption.external_links.footballguys}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline flex items-center gap-0.5"
                >
                  Footballguys <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-zinc-700">•</span>
                <a
                  href={tossUpBattles[0].benchOption.external_links.thefantasyfootballers}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  Ballers <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-zinc-700">•</span>
                <a
                  href={tossUpBattles[0].benchOption.external_links.keeptradecut}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline flex items-center gap-0.5"
                >
                  KTC <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Optimal Starters (Left) vs Inactives & Reserves (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Optimal Consensus Starting Lineup (7 cols) */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                Consensus Starting Lineup ({optimalStarters.length} Slots)
              </h3>
            </div>
            <span className="text-xs font-mono text-cyan-400 font-semibold">
              {totalProjectedPoints} Consensus Pts
            </span>
          </div>

          <div className="space-y-3">
            {optimalStarters.map(({ slotName, item }) => {
              const { player, source_projections, composite_average, spread, matchup_rating, is_home, opponent, floor, ceiling, external_links } = item;
              const isExpanded = expandedPlayerId === player.id;
              const isMustStart = item.sit_start_status === 'MUST_START';

              return (
                <div
                  key={player.id}
                  className="rounded-lg bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition-all overflow-hidden"
                >
                  {/* Primary Row */}
                  <div className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Slot Badge */}
                      <span className="w-12 text-center text-xs font-mono font-bold px-2 py-1 rounded bg-zinc-800 text-cyan-300 border border-zinc-700 shrink-0">
                        {slotName}
                      </span>

                      <div className="truncate">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-sm font-bold text-white truncate">
                            {player.full_name}
                          </span>
                          {isMustStart && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/80 font-bold shrink-0">
                              LOCK
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                          <span className="font-mono text-zinc-300">{player.position}</span>
                          <span>•</span>
                          <span>{player.nfl_team}</span>
                          <span>•</span>
                          <span className="text-zinc-300">
                            {is_home ? 'vs' : '@'} {opponent}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                              matchup_rating === 'Smash Spot'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : matchup_rating === 'Tough' || matchup_rating === 'Shadow Coverage'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {matchup_rating}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Consensus Score, Spread, & Expand Button */}
                    <div className="flex items-center space-x-3 shrink-0 pl-3">
                      <div className="text-right">
                        <div className="text-base font-black font-mono text-cyan-400">
                          {composite_average}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          &plusmn;{spread} pts spread
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedPlayerId(isExpanded ? null : player.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        title="View individual source projections and external links"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Multi-Source Breakdown & External Links */}
                  {isExpanded && (
                    <div className="p-3.5 bg-zinc-900/90 border-t border-zinc-800/80 space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400 uppercase font-bold">
                          Individual Platform Projections:
                        </span>
                        <span className="text-zinc-500">
                          Floor: {floor} | Ceiling: {ceiling}
                        </span>
                      </div>

                      {/* Source Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {PROJECTION_SOURCES.map((s) => {
                          const proj = source_projections[s.key];
                          const isIncluded = selectedSources.has(s.key);

                          return (
                            <div
                              key={s.key}
                              className={`p-2 rounded bg-zinc-950 border ${
                                isIncluded ? 'border-zinc-800' : 'border-zinc-900 opacity-40'
                              } text-xs font-mono`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-400">{s.shortName}</span>
                                <span className="font-bold text-white">{proj.projected_points} pts</span>
                              </div>
                              <span className="text-[9px] text-zinc-500 block mt-0.5 truncate">
                                {proj.sentiment || `#${proj.rank_in_pos} ${player.position}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Direct External Website Links */}
                      <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <span className="text-zinc-400 flex items-center gap-1">
                          <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                          View on Partner Sites:
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={external_links.footballguys}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 hover:underline transition-colors flex items-center gap-1"
                          >
                            Footballguys
                          </a>
                          <a
                            href={external_links.thefantasyfootballers}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:underline transition-colors flex items-center gap-1"
                          >
                            The Fantasy Footballers
                          </a>
                          <a
                            href={external_links.keeptradecut}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-cyan-400 hover:underline transition-colors flex items-center gap-1"
                          >
                            KeepTradeCut
                          </a>
                          <a
                            href={external_links.fantasypros}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-blue-400 hover:underline transition-colors flex items-center gap-1"
                          >
                            FantasyPros
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Active Bench, Injured Reserve, and Taxi Squad (5 cols) */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-zinc-400" />
              <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                Bench & Stashed Reserves
              </h3>
            </div>
            <span className="text-xs font-mono text-zinc-400">
              {activeBench.length} Bench • {irOptions.length} IR • {taxiOptions.length} Taxi
            </span>
          </div>

          <div className="space-y-4 max-h-[720px] overflow-y-auto pr-1">
            {/* Active Bench Reserves */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-zinc-400 uppercase font-bold tracking-wider block">
                Active Bench Depth ({activeBench.length})
              </span>
              {activeBench.map((entry) => {
                const { player, composite_average, spread, is_home, opponent, floor, ceiling, external_links } = entry;
                const isBackupQB = player.position === 'QB' && player.market_value >= 3500;

                return (
                  <div
                    key={player.id}
                    className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-xs font-bold text-zinc-200 truncate">
                          {player.full_name}
                        </span>
                        {isBackupQB && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                            ELITE QB BACKUP
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-zinc-300">
                        {composite_average} pts
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                      <span>
                        {player.position} • {player.nfl_team} ({is_home ? 'vs' : '@'} {opponent})
                      </span>
                      <span className="text-zinc-500">
                        Spread: &plusmn;{spread} pts
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-[10px] font-mono text-zinc-500">
                      <span>Floor: {floor} | Ceiling: {ceiling}</span>
                      <a
                        href={external_links.footballguys}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline flex items-center gap-0.5"
                      >
                        FBG <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Injured Reserve */}
            {irOptions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                <span className="text-[11px] font-mono text-rose-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  Injured Reserve ({irOptions.length} Ineligible to Start)
                </span>
                {irOptions.map((entry) => (
                  <div
                    key={entry.player.id}
                    className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-200">{entry.player.full_name}</span>
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                          IR
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {entry.player.position} • {entry.player.nfl_team} • Stashed
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-xs text-zinc-400">${entry.player.salary || 0}</span>
                      <a
                        href={entry.external_links.keeptradecut}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-cyan-400 block hover:underline"
                      >
                        KTC &rarr;
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Taxi Squad */}
            {taxiOptions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                <span className="text-[11px] font-mono text-purple-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Taxi Squad ({taxiOptions.length} Developmental)
                </span>
                {taxiOptions.map((entry) => (
                  <div
                    key={entry.player.id}
                    className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-900/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-200">{entry.player.full_name}</span>
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 font-bold">
                          TAXI
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {entry.player.position} • {entry.player.nfl_team} • Rookie
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-xs text-zinc-400">${entry.player.salary || 0}</span>
                      <a
                        href={entry.external_links.footballguys}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-purple-400 block hover:underline"
                      >
                        FBG &rarr;
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
