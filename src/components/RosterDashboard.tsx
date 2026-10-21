/**
 * Dynasty AI Evaluator - Master Roster DNA Dashboard (Slice 6)
 * Contains Archetype Classification & Championship Window Banner,
 * Actionable Roster Improvement notifications, 3 SVG circular dial gauges,
 * Positional Breakdown, and dense scannable Roster Table.
 */

import React, { useState } from 'react';
import { useRoster } from '../context/RosterContext';
import { CircularDialGauge } from './CircularDialGauge';
import { ArchetypeBanner } from './ArchetypeBanner';
import { PositionalBreakdownCard } from './PositionalBreakdownCard';
import { RosterTable } from './RosterTable';
import { Dna, BarChart3, AlertTriangle, Zap, ArrowRight, ChevronDown, ChevronUp, Layers, Trophy } from 'lucide-react';

export const RosterDashboard: React.FC = () => {
  const { evaluation, isLoading, setActiveView } = useRoster();
  const [showSecondaryStats, setShowSecondaryStats] = useState<boolean>(false);

  if (isLoading) {
    return (
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-xl">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
          <Dna className="w-5 h-5 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
        </div>
        <div>
          <h4 className="text-base font-bold text-white tracking-tight">
            Synthesizing Roster DNA Matrix
          </h4>
          <p className="text-xs text-zinc-400 mt-1">
            Running lineup allocation, championship window analysis, and asset dropoff scoring...
          </p>
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl p-10 text-center flex flex-col items-center justify-center space-y-3">
        <BarChart3 className="w-10 h-10 text-zinc-600" />
        <h4 className="text-base font-bold text-zinc-300">
          No Dynasty Portfolio Loaded
        </h4>
        <p className="text-xs text-zinc-500 max-w-sm">
          Please enter your league credentials in the Roster Ingestion Engine to evaluate your roster.
        </p>
        <button
          type="button"
          onClick={() => setActiveView('ingest')}
          className="mt-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
        >
          Open Ingestion Engine
        </button>
      </div>
    );
  }

  const { metrics, roster, players, starters, bench, positional_breakdown, warnings, settings, championship_window, remediations = [] } = evaluation;

  return (
    <div className="w-full space-y-6">
      {/* 1. Archetype & Championship Window Banner */}
      <ArchetypeBanner
        metrics={metrics}
        franchiseName={roster.franchise_name}
        leagueName={roster.league_name}
        settings={settings}
        championshipWindow={championship_window}
        warnings={warnings}
        onNavigateToOptimization={() => setActiveView('optimization')}
        onNavigateToSitStart={() => setActiveView('sitstart')}
      />

      {/* 2. League Power Rankings & Trade Radar Banner */}
      {evaluation.league_teams && evaluation.league_teams.length > 0 && (
        <div className="w-full bg-zinc-900/90 border border-amber-500/30 rounded-xl p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                  League Power Rankings & Trade Radar Active
                </span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                  {evaluation.league_teams.length} Teams
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5">
                Full league rosters, draft picks, and win-now vs. rebuilder targets mapped. Know if your trade partner is an aggressive buyer or rebuilder.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveView('league')}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-mono transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-amber-500/20"
          >
            <span>Explore League Radar & Targets</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Proactive Actionable Roster Improvement Alert Banner (When remediations exist) */}
      {remediations.length > 0 && (
        <div className="w-full bg-cyan-950/40 border border-cyan-500/50 rounded-xl p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-cyan-900/60 text-cyan-300 shrink-0 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                  Roster Improvement Opportunity Detected
                </span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                  {remediations[0].category}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                {remediations[0].issue}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveView('optimization')}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-cyan-500/20"
          >
            <span>View Trade Roadmap</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. The 3 SVG Circular Dial Gauges (Core Specification Requirement) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Dial 1: Gross Liquidity (Cyan) */}
        <CircularDialGauge
          title="Gross Liquidity"
          value={metrics.gross_liquidity}
          min={0}
          max={150}
          unit="idx"
          variant="cyan"
          benchmarkLabel="Baseline: 100.0"
          benchmarkValue="100.0"
          subtitle="Top starting asset value normalized against 10-team league baseline."
        />

        {/* Dial 2: Asset Half-Life (Amber) */}
        <CircularDialGauge
          title="Asset Half-Life"
          value={metrics.asset_half_life}
          min={0}
          max={6}
          unit="yrs"
          variant="amber"
          benchmarkLabel="Target: 3.5+ yrs"
          benchmarkValue="3.5y"
          subtitle="Value-weighted mean age relative to position peak-performance dropoff thresholds."
        />

        {/* Dial 3: Structural Integrity (Emerald) */}
        <CircularDialGauge
          title="Structural Integrity"
          value={metrics.structural_integrity}
          min={0}
          max={100}
          unit="%"
          variant="emerald"
          benchmarkLabel="Target: 70%+"
          benchmarkValue="70.0%"
          subtitle="Starting lineup power vs bench depth insulation and positional insulation."
        />
      </div>

      {/* Collapsible Secondary Portfolio Stats Drawer */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5">
        <button
          type="button"
          onClick={() => setShowSecondaryStats(!showSecondaryStats)}
          className="w-full flex items-center justify-between text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Secondary Financial Stats (Total Valuation, Equity Ratio & Bench Value)</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            {showSecondaryStats ? 'Hide' : 'Show Details'}
            {showSecondaryStats ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>

        {showSecondaryStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 mt-3 border-t border-zinc-800">
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] uppercase font-mono text-zinc-400 block">Total Valuation</span>
              <span className="text-sm font-bold font-mono text-white">
                {(metrics.total_roster_value || 0).toLocaleString()} pts
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] uppercase font-mono text-zinc-400 block">Starter Equity Ratio</span>
              <span className="text-sm font-bold font-mono text-cyan-400">
                {metrics.starter_equity_ratio || 0}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] uppercase font-mono text-zinc-400 block">Starting Capital</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                {(metrics.starter_value || 0).toLocaleString()} pts
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] uppercase font-mono text-zinc-400 block">Bench Capital</span>
              <span className="text-sm font-bold font-mono text-zinc-300">
                {(metrics.bench_value || 0).toLocaleString()} pts
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4. Positional Capital Allocation Card */}
      {positional_breakdown && (
        <PositionalBreakdownCard breakdown={positional_breakdown} />
      )}

      {/* 5. Dense Scannable Roster Table Grouped by Active, IR, and Taxi */}
      <RosterTable
        players={players}
        starters={starters}
        bench={bench}
        activeRoster={evaluation.active_roster}
        injuredReserve={evaluation.injured_reserve}
        taxiSquad={evaluation.taxi_squad}
        draftPicks={evaluation.draft_picks}
        totalRosterValue={metrics.total_roster_value || 0}
      />
    </div>
  );
};
