/**
 * Dynasty AI Evaluator - Archetype Classification & Championship Window Banner (Slice 6)
 * Displays quantitative archetype designation, Championship Window timeline,
 * verified league lineup requirements, and proactive roster improvement alerts.
 */

import React from 'react';
import {
  Crown,
  Trophy,
  AlertTriangle,
  Flame,
  Construction,
  Hourglass,
  Clock,
  ShieldCheck,
  TrendingUp,
  AlertOctagon,
  Calendar,
  Layers,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { RosterDNAMetrics, LeagueSettings, ChampionshipWindow } from '../types';

interface ArchetypeBannerProps {
  metrics: RosterDNAMetrics;
  franchiseName?: string;
  leagueName?: string;
  settings?: LeagueSettings;
  championshipWindow?: ChampionshipWindow;
  warnings?: string[];
  onNavigateToOptimization?: () => void;
  onNavigateToSitStart?: () => void;
}

export const ArchetypeBanner: React.FC<ArchetypeBannerProps> = ({
  metrics,
  franchiseName,
  leagueName,
  settings,
  championshipWindow,
  warnings = [],
  onNavigateToOptimization,
  onNavigateToSitStart,
}) => {
  const getArchetypeConfig = (classification: string) => {
    switch (classification) {
      case 'Juggernaut':
        return {
          icon: Crown,
          accentColor: 'text-cyan-400',
          borderColor: 'border-cyan-500/50',
          bgGradient: 'from-cyan-950/50 via-zinc-900 to-zinc-900',
          badgeBg: 'bg-cyan-950 border-cyan-500 text-cyan-300',
          headline: 'Dynasty Empire • Win-Now Peak',
          desc: 'Dominant starting firepower combined with multi-year prime runway. Your championship window is wide open.',
        };
      case 'Contender':
        return {
          icon: Trophy,
          accentColor: 'text-emerald-400',
          borderColor: 'border-emerald-500/50',
          bgGradient: 'from-emerald-950/50 via-zinc-900 to-zinc-900',
          badgeBg: 'bg-emerald-950 border-emerald-500 text-emerald-300',
          headline: 'Championship Contender',
          desc: 'High starter equity positioned to capture title. Monitor asset half-life and age cliff curves.',
        };
      case 'Fraudulent Contender':
        return {
          icon: AlertTriangle,
          accentColor: 'text-amber-400',
          borderColor: 'border-amber-500/50',
          bgGradient: 'from-amber-950/50 via-zinc-900 to-zinc-900',
          badgeBg: 'bg-amber-950 border-amber-500 text-amber-300',
          headline: 'High Fragility • Age Cliff Exposure',
          desc: 'Fragile starter reliance with impending age dropoffs. Immediate roster insulation required.',
        };
      case 'Productive Struggle':
        return {
          icon: Flame,
          accentColor: 'text-cyan-400',
          borderColor: 'border-cyan-500/50',
          bgGradient: 'from-cyan-950/50 via-zinc-900 to-zinc-900',
          badgeBg: 'bg-cyan-950 border-cyan-500 text-cyan-300',
          headline: 'Ascending Youth Portfolio',
          desc: 'Massive asset half-life with premium blue-chip assets. Championship window projected to open next season.',
        };
      case 'Total Rebuild':
        return {
          icon: Construction,
          accentColor: 'text-rose-400',
          borderColor: 'border-rose-500/50',
          bgGradient: 'from-rose-950/50 via-zinc-900 to-zinc-900',
          badgeBg: 'bg-rose-950 border-rose-500 text-rose-300',
          headline: 'Asset Restructuring Phase',
          desc: 'Liquidate veterans above age 27 for future draft capital and young foundational receivers.',
        };
      default:
        return {
          icon: Hourglass,
          accentColor: 'text-zinc-400',
          borderColor: 'border-zinc-700/50',
          bgGradient: 'from-zinc-900 via-zinc-900 to-zinc-900',
          badgeBg: 'bg-zinc-800 border-zinc-700 text-zinc-300',
          headline: 'Dynasty Crossroads',
          desc: 'Roster sits in the middle tier. Consolidate assets to contend or pivot down the age curve.',
        };
    }
  };

  const config = getArchetypeConfig(metrics.classification);
  const ArchetypeIcon = config.icon;

  const windowData = championshipWindow || metrics.championship_window || {
    status: 'Win-Now Peak' as const,
    years_remaining: metrics.asset_half_life || 4.4,
    peak_start_year: 2026,
    peak_end_year: 2030,
    verdict: 'Championship window open through 2030.',
    urgency_level: 'Moderate' as const,
    target_acquisitions: ['High-volume target WRs', 'Win-now RB1 handcuffs'],
  };

  const slots = settings?.slots || {
    QB: 1,
    RB: 2,
    WR: 3,
    TE: 1,
    FLEX: 2,
    SUPER_FLEX: 0,
    K: 1,
    DEF: 1,
  };

  return (
    <div
      className={`w-full bg-gradient-to-r ${config.bgGradient} border ${config.borderColor} rounded-2xl p-5 md:p-6 shadow-2xl relative overflow-hidden space-y-5`}
    >
      {/* Top Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-4 border-b border-zinc-800/80">
        {/* Left Column: Archetype Designation */}
        <div className="flex items-start space-x-4">
          <div
            className={`p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 ${config.accentColor} shrink-0 shadow-xl`}
          >
            <ArchetypeIcon className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`text-xs font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full border font-bold ${config.badgeBg}`}
              >
                {metrics.classification}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                {franchiseName || 'Franchise'} {leagueName ? `• ${leagueName}` : ''}
              </span>
            </div>

            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">
              {config.headline}
            </h3>

            <p className="text-xs md:text-sm text-zinc-300 max-w-2xl leading-relaxed">
              {config.desc}
            </p>
          </div>
        </div>

        {/* Quick Action Navigation Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onNavigateToSitStart && (
            <button
              type="button"
              onClick={onNavigateToSitStart}
              className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <span>Weekly Sit / Start</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {onNavigateToOptimization && (
            <button
              type="button"
              onClick={onNavigateToOptimization}
              className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 font-bold text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Optimize Roster</span>
            </button>
          )}
        </div>
      </div>

      {/* Two Focal Feature Cards: Championship Window (Foreground) & League Lineup Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1: Championship Window Hero (7 cols) */}
        <div className="lg:col-span-7 bg-zinc-950/90 border border-amber-900/40 rounded-xl p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Championship Window Projection
              </span>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/80">
              {windowData.status} ({windowData.peak_start_year} - {windowData.peak_end_year})
            </span>
          </div>

          {/* Visual Timeline Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>Season {windowData.peak_start_year} (Current)</span>
              <span className="text-amber-300 font-semibold">{windowData.years_remaining} Years Runway</span>
              <span>Season {windowData.peak_end_year}</span>
            </div>
            <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-cyan-500 rounded-full"
                style={{ width: `${Math.min(100, (windowData.years_remaining / 5) * 100)}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed pt-1">
            {windowData.verdict}
          </p>
        </div>

        {/* Card 2: League Lineup & Starter Slots (5 cols) */}
        <div className="lg:col-span-5 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                League Lineup Settings
              </span>
            </div>
            <span className="text-xs font-mono text-cyan-400 font-semibold">
              {settings?.league_size || 10} Teams • {settings?.starter_count || 11} Starters
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 pt-1 text-center font-mono text-xs">
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">QB</span>
              <strong className="text-white text-sm">{slots.QB}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">RB</span>
              <strong className="text-white text-sm">{slots.RB}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">WR</span>
              <strong className="text-white text-sm">{slots.WR}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">TE</span>
              <strong className="text-white text-sm">{slots.TE}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-cyan-400 block">FLEX</span>
              <strong className="text-cyan-300 text-sm">{slots.FLEX}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">K</span>
              <strong className="text-white text-sm">{slots.K || 1}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">DEF</span>
              <strong className="text-white text-sm">{slots.DEF || 1}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">ROSTER</span>
              <strong className="text-white text-sm">{settings?.roster_size || 28}</strong>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400 pt-0.5">
            1-QB format with 2 Flex slots. Backup QBs act as bench trade assets.
          </p>
        </div>
      </div>
    </div>
  );
};
