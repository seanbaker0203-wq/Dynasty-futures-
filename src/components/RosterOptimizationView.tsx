/**
 * Dynasty AI Evaluator - Roster Optimization & Remediation Engine
 * Detects portfolio deficiencies, below-threshold metrics, surplus capital,
 * and age cliff liabilities, prescribing actionable trade blueprints and optimization steps.
 */

import React from 'react';
import { useRoster } from '../context/RosterContext';
import {
  Zap,
  TrendingUp,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldCheck,
  Coins,
  Hourglass,
  Sliders,
  CheckCircle2,
  ArrowLeftRight,
  Sparkles,
} from 'lucide-react';
import { RosterRemediationAdvice } from '../types';

export const RosterOptimizationView: React.FC = () => {
  const { evaluation, setActiveView } = useRoster();

  if (!evaluation) return null;

  const { metrics, remediations = [], championship_window, settings, starters, bench } = evaluation;

  return (
    <div className="w-full space-y-6">
      {/* Top Banner */}
      <div className="w-full bg-gradient-to-r from-cyan-950/40 via-zinc-900 to-zinc-900 border border-cyan-500/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
                <Zap className="w-4 h-4" />
              </span>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Roster Optimization & Remediation Engine
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-semibold">
                  PORTFOLIO HEALTH
                </span>
              </h2>
            </div>
            <p className="text-xs text-zinc-400">
              Diagnostic remediation blueprints tailored to your league settings ({settings?.league_size || 10} Teams • {settings?.starter_count || 11} Starters).
            </p>
          </div>

          {/* Championship Window Pill */}
          {championship_window && (
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0">
              <span className="text-[10px] font-mono text-zinc-400 uppercase block">
                Championship Window
              </span>
              <span className="text-sm font-bold text-white font-mono flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {championship_window.status} ({championship_window.peak_start_year} - {championship_window.peak_end_year})
              </span>
            </div>
          )}
        </div>

        {/* 4 Core Quantitative Health Thresholds */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] font-mono uppercase text-zinc-400 block">Gross Liquidity</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className={`text-xl font-black font-mono ${metrics.gross_liquidity >= 100 ? 'text-cyan-400' : 'text-amber-400'}`}>
                {metrics.gross_liquidity}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">/ 100 target</span>
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {metrics.gross_liquidity >= 100 ? '✓ Elite Firepower' : '⚠ Below Baseline'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] font-mono uppercase text-zinc-400 block">Asset Half-Life</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className={`text-xl font-black font-mono ${metrics.asset_half_life >= 3.2 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.asset_half_life}y
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">/ 3.5y target</span>
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {metrics.asset_half_life >= 3.2 ? '✓ Prime Longevity' : '⚠ Age Cliff Risk'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] font-mono uppercase text-zinc-400 block">Structural Integrity</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className={`text-xl font-black font-mono ${metrics.structural_integrity >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {metrics.structural_integrity}%
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">/ 70% target</span>
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {metrics.structural_integrity >= 70 ? '✓ Insulated Depth' : '⚠ Roster Fragility'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] font-mono uppercase text-zinc-400 block">Active Remediation Actions</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black font-mono text-amber-400">
                {remediations.length}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">prescriptions</span>
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              High-leverage trade moves
            </span>
          </div>
        </div>
      </div>

      {/* Active Remediation Prescriptions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            Prescribed Trade Blueprints & Roster Improvements
          </h3>
          <span className="text-xs text-zinc-400 font-mono">
            Generated via Roster DNA Vector Math
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {remediations.map((rem, idx) => {
            const isOpportunity = rem.severity === 'opportunity';
            const isCritical = rem.severity === 'critical';

            return (
              <div
                key={idx}
                className={`p-5 rounded-xl bg-zinc-900 border ${
                  isCritical
                    ? 'border-rose-500/60 shadow-lg shadow-rose-950/20'
                    : isOpportunity
                    ? 'border-cyan-500/50 shadow-lg shadow-cyan-950/20'
                    : 'border-amber-500/50 shadow-lg shadow-amber-950/20'
                } space-y-3`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                        isCritical
                          ? 'bg-rose-950 text-rose-300 border-rose-800'
                          : isOpportunity
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                          : 'bg-amber-950 text-amber-300 border-amber-800'
                      }`}
                    >
                      {rem.category}
                    </span>
                    <h4 className="text-base font-bold text-white">
                      {rem.metric_name}
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-zinc-400">Current: <strong className="text-white">{rem.current_value}</strong></span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-zinc-400">Target: <strong className="text-emerald-400">{rem.threshold}</strong></span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-300">
                    <strong className="text-zinc-200">Diagnostic Finding: </strong>
                    {rem.issue}
                  </p>
                  <p className="text-xs text-cyan-300 font-medium">
                    <strong className="text-cyan-400">Recommended Action: </strong>
                    {rem.actionable_step}
                  </p>
                </div>

                {/* Specific Actionable Trade Moves */}
                <div className="pt-2">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block mb-2 font-semibold">
                    Specific Execution Steps:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {rem.recommended_moves.map((move, mIdx) => (
                      <div
                        key={mIdx}
                        className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed flex items-start gap-2"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{move}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Button: Simulate in Trade Builder */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveView('trade')}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-cyan-400 hover:text-cyan-300 text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Simulate Trade in Trade Builder &rarr;</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
