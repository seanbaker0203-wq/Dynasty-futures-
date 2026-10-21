/**
 * Dynasty AI Evaluator - Dynasty Core 3-Season Health Score Projection
 * Recharts visualization modeling how a team's roster age, talent tier score,
 * and overall Dynasty Core health score evolve over 3 seasons if a trade is accepted.
 */

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Calendar,
  Shield,
  Sparkles,
  AlertTriangle,
  Award,
  Layers,
  Clock,
  Zap,
  Info,
} from 'lucide-react';
import { MasterPlayer, DraftPick } from '../types';
import {
  DynastyCoreSimulationEngine,
  DynastyCoreSummary,
  SeasonProjectionPoint,
} from '../lib/dynastyCoreSimulation';

interface DynastyCoreProjectionProps {
  currentPlayers: MasterPlayer[];
  currentPicks?: DraftPick[];
  sendPlayers: MasterPlayer[];
  sendPicks?: DraftPick[];
  receivePlayers: MasterPlayer[];
  receivePicks?: DraftPick[];
  teamName?: string;
  hasActiveTrade?: boolean;
}

type MetricMode = 'HEALTH_SCORE' | 'ROSTER_AGE' | 'TALENT_TIER' | 'COMBINED';

export const DynastyCoreProjection: React.FC<DynastyCoreProjectionProps> = ({
  currentPlayers,
  currentPicks = [],
  sendPlayers,
  sendPicks = [],
  receivePlayers,
  receivePicks = [],
  teamName = 'Your Roster',
  hasActiveTrade = false,
}) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('HEALTH_SCORE');
  const [chartType, setChartType] = useState<'area' | 'line'>('area');

  // Compute 3-Season Simulation
  const simulation: DynastyCoreSummary = useMemo(() => {
    return DynastyCoreSimulationEngine.simulateDynastyCoreTrajectory({
      currentPlayers,
      currentPicks,
      sendPlayerIds: sendPlayers.map((p) => p.id),
      sendPickIds: sendPicks.map((p) => p.id),
      receivePlayers,
      receivePicks,
      baseCurrentYear: 2026,
    });
  }, [currentPlayers, currentPicks, sendPlayers, sendPicks, receivePlayers, receivePicks]);

  // Chart data formatting
  const chartData = useMemo(() => {
    return simulation.projections.map((p) => ({
      year: p.seasonYear,
      label: p.seasonIndex === 0 ? `'26 Current` : `'${String(p.seasonYear).slice(2)} (+${p.seasonIndex}y)`,
      fullLabel: p.seasonLabel,

      // Health Score
      statusQuoHealth: p.statusQuoHealthScore,
      postTradeHealth: p.postTradeHealthScore,
      healthDelta: p.healthScoreDelta,

      // Roster Age
      statusQuoAge: p.statusQuoRosterAge,
      postTradeAge: p.postTradeRosterAge,
      ageDelta: p.rosterAgeDelta,

      // Talent Tier
      statusQuoTier: p.statusQuoTalentTierScore,
      postTradeTier: p.postTradeTalentTierScore,
      tierDelta: p.talentTierScoreDelta,

      keyTrend: p.keyTrend,
    }));
  }, [simulation]);

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt = chartData.find((d) => d.label === label || d.year === label);
    if (!pt) return null;

    return (
      <div className="bg-zinc-950/95 border border-zinc-800 p-3.5 rounded-xl shadow-2xl font-mono text-xs backdrop-blur-md max-w-xs space-y-2">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
          <span className="font-bold text-white flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            {pt.fullLabel}
          </span>
          {hasActiveTrade && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                metricMode === 'ROSTER_AGE'
                  ? pt.ageDelta <= 0
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-amber-950 text-amber-300 border-amber-700'
                  : pt.healthDelta >= 0
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-rose-950 text-rose-300 border-rose-700'
              }`}
            >
              {metricMode === 'ROSTER_AGE'
                ? pt.ageDelta > 0
                  ? `+${pt.ageDelta.toFixed(1)}y older`
                  : `${pt.ageDelta.toFixed(1)}y younger`
                : pt.healthDelta >= 0
                ? `+${pt.healthDelta.toFixed(1)} Δ`
                : `${pt.healthDelta.toFixed(1)} Δ`}
            </span>
          )}
        </div>

        {/* Metric rows */}
        {metricMode === 'HEALTH_SCORE' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                Post-Trade Core Health:
              </span>
              <span className="font-black text-cyan-300 text-sm">
                {pt.postTradeHealth.toFixed(1)} <span className="text-[10px] text-zinc-500">/ 100</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                Status Quo (No Trade):
              </span>
              <span className="font-bold text-zinc-400">
                {pt.statusQuoHealth.toFixed(1)}
              </span>
            </div>
          </div>
        )}

        {metricMode === 'ROSTER_AGE' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Post-Trade Weighted Age:
              </span>
              <span className="font-black text-amber-300 text-sm">
                {pt.postTradeAge.toFixed(1)} yrs
              </span>
            </div>
            <div className="flex items-center justify-between text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                Status Quo Age:
              </span>
              <span className="font-bold text-zinc-400">
                {pt.statusQuoAge.toFixed(1)} yrs
              </span>
            </div>
          </div>
        )}

        {metricMode === 'TALENT_TIER' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Post-Trade Talent Tier:
              </span>
              <span className="font-black text-emerald-300 text-sm">
                {pt.postTradeTier} <span className="text-[10px] text-zinc-500">pts</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                Status Quo Tier:
              </span>
              <span className="font-bold text-zinc-400">
                {pt.statusQuoTier} pts
              </span>
            </div>
          </div>
        )}

        {metricMode === 'COMBINED' && (
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-cyan-400">Health Score:</span>
              <span className="text-white font-bold">{pt.postTradeHealth.toFixed(1)} ({pt.healthDelta >= 0 ? `+${pt.healthDelta}` : pt.healthDelta})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-400">Roster Age:</span>
              <span className="text-white font-bold">{pt.postTradeAge.toFixed(1)}y ({pt.ageDelta > 0 ? `+${pt.ageDelta}` : pt.ageDelta}y)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-400">Talent Tier:</span>
              <span className="text-white font-bold">{pt.postTradeTier} pts ({pt.tierDelta >= 0 ? `+${pt.tierDelta}` : pt.tierDelta})</span>
            </div>
          </div>
        )}

        <div className="pt-1.5 border-t border-zinc-800/80 text-[10px] text-zinc-400 leading-snug">
          {pt.keyTrend}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl space-y-5">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-800/80 text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white tracking-tight">
                  Dynasty Core Health Score & 3-Season Evolution
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-800/80 font-bold">
                  RECHARTS SIMULATION
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Quantifies how accepting this proposal alters {teamName}'s talent tier density and roster age cliff curve over 3 full seasons.
              </p>
            </div>
          </div>
        </div>

        {/* View Switchers: Health Score, Roster Age, Talent Tier, Combined */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 font-mono text-xs">
            <button
              type="button"
              onClick={() => setMetricMode('HEALTH_SCORE')}
              className={`px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                metricMode === 'HEALTH_SCORE'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Core Health Score
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('ROSTER_AGE')}
              className={`px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                metricMode === 'ROSTER_AGE'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Roster Age Cliff
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('TALENT_TIER')}
              className={`px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                metricMode === 'TALENT_TIER'
                  ? 'bg-emerald-400 text-slate-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Talent Tier Score
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('COMBINED')}
              className={`px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                metricMode === 'COMBINED'
                  ? 'bg-purple-400 text-slate-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Multi-Metric
            </button>
          </div>

          {/* Chart style toggle */}
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                chartType === 'area' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Area
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                chartType === 'line' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Line
            </button>
          </div>
        </div>
      </div>

      {/* Trajectory Verdict Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg ${
          simulation.trajectoryVerdict === 'SURGING_CONTENDER' || simulation.trajectoryVerdict === 'EXTENDED_WINDOW'
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : simulation.trajectoryVerdict === 'WIN_NOW_SPIKE'
            ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            : simulation.trajectoryVerdict === 'VALUE_EROSION'
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            : 'bg-zinc-950 border-zinc-800 text-zinc-300'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg shrink-0 mt-0.5 ${
              simulation.trajectoryVerdict === 'SURGING_CONTENDER' || simulation.trajectoryVerdict === 'EXTENDED_WINDOW'
                ? 'bg-emerald-500/20 text-emerald-400'
                : simulation.trajectoryVerdict === 'WIN_NOW_SPIKE'
                ? 'bg-amber-500/20 text-amber-400'
                : simulation.trajectoryVerdict === 'VALUE_EROSION'
                ? 'bg-rose-500/20 text-rose-400'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {simulation.trajectoryVerdict === 'SURGING_CONTENDER' || simulation.trajectoryVerdict === 'EXTENDED_WINDOW' ? (
              <TrendingUp className="w-5 h-5" />
            ) : simulation.trajectoryVerdict === 'WIN_NOW_SPIKE' ? (
              <Zap className="w-5 h-5" />
            ) : simulation.trajectoryVerdict === 'VALUE_EROSION' ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Shield className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-black uppercase tracking-wider">
                {simulation.verdictTitle}
              </span>
              {simulation.championshipWindowDeltaYears !== 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900/90 font-bold border border-current">
                  {simulation.championshipWindowDeltaYears > 0
                    ? `+${simulation.championshipWindowDeltaYears}y Window Expansion`
                    : `${simulation.championshipWindowDeltaYears}y Window Contraction`}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              {simulation.verdictDescription}
            </p>
          </div>
        </div>

        {/* 3-Year Projection Deltas Summary Badges */}
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0 font-mono text-xs">
          <div className="bg-zinc-950/80 px-3 py-2 rounded-lg border border-zinc-800 text-center">
            <span className="text-[9px] uppercase text-zinc-500 block">Year 3 Health Δ</span>
            <span
              className={`font-black ${
                simulation.projections[3].healthScoreDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {simulation.projections[3].healthScoreDelta >= 0 ? '+' : ''}
              {simulation.projections[3].healthScoreDelta.toFixed(1)} Δ
            </span>
          </div>

          <div className="bg-zinc-950/80 px-3 py-2 rounded-lg border border-zinc-800 text-center">
            <span className="text-[9px] uppercase text-zinc-500 block">Roster Age Δ</span>
            <span
              className={`font-black ${
                simulation.rosterAgeDelta <= 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {simulation.rosterAgeDelta > 0 ? `+${simulation.rosterAgeDelta.toFixed(1)}y` : `${simulation.rosterAgeDelta.toFixed(1)}y`}
            </span>
          </div>

          <div className="bg-zinc-950/80 px-3 py-2 rounded-lg border border-zinc-800 text-center">
            <span className="text-[9px] uppercase text-zinc-500 block">Talent Tier Δ</span>
            <span
              className={`font-black ${
                simulation.projections[3].talentTierScoreDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {simulation.projections[3].talentTierScoreDelta >= 0 ? '+' : ''}
              {simulation.projections[3].talentTierScoreDelta} pts
            </span>
          </div>
        </div>
      </div>

      {/* Main Recharts Graphic Container */}
      <div className="w-full h-72 sm:h-80 bg-zinc-950/90 rounded-xl p-4 border border-zinc-800 relative">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={chartData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="postTradeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="statusQuoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#71717a" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#71717a" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="ageGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="tierGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#71717a"
                tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                stroke="#71717a"
                tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
                domain={
                  metricMode === 'ROSTER_AGE'
                    ? [22, 31]
                    : metricMode === 'TALENT_TIER'
                    ? [20, 100]
                    : [30, 100]
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
              />

              {metricMode === 'HEALTH_SCORE' && (
                <>
                  <ReferenceLine y={85} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Juggernaut (85)', fill: '#10b981', fontSize: 10 }} />
                  <ReferenceLine y={70} stroke="#06b6d4" strokeDasharray="3 3" label={{ value: 'Contender (70)', fill: '#06b6d4', fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="statusQuoHealth"
                    name="Status Quo (No Trade)"
                    stroke="#71717a"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#statusQuoGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="postTradeHealth"
                    name="Post-Trade (Accepted)"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#postTradeGrad)"
                  />
                </>
              )}

              {metricMode === 'ROSTER_AGE' && (
                <>
                  <ReferenceLine y={27.5} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Cliff Threshold (27.5y)', fill: '#f43f5e', fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="statusQuoAge"
                    name="Status Quo Roster Age"
                    stroke="#71717a"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fill="url(#statusQuoGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="postTradeAge"
                    name="Post-Trade Roster Age"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    fill="url(#ageGrad)"
                  />
                </>
              )}

              {metricMode === 'TALENT_TIER' && (
                <>
                  <Area
                    type="monotone"
                    dataKey="statusQuoTier"
                    name="Status Quo Talent Tier"
                    stroke="#71717a"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fill="url(#statusQuoGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="postTradeTier"
                    name="Post-Trade Talent Tier"
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="url(#tierGrad)"
                  />
                </>
              )}

              {metricMode === 'COMBINED' && (
                <>
                  <Area
                    type="monotone"
                    dataKey="postTradeHealth"
                    name="Core Health Score"
                    stroke="#06b6d4"
                    strokeWidth={2.5}
                    fill="url(#postTradeGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="postTradeTier"
                    name="Talent Tier Score"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#tierGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="statusQuoHealth"
                    name="Status Quo Benchmark"
                    stroke="#71717a"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    fill="none"
                  />
                </>
              )}
            </AreaChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#71717a"
                tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                stroke="#71717a"
                tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
                domain={metricMode === 'ROSTER_AGE' ? [22, 31] : [20, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
              />

              {metricMode === 'HEALTH_SCORE' && (
                <>
                  <Line
                    type="monotone"
                    dataKey="statusQuoHealth"
                    name="Status Quo (No Trade)"
                    stroke="#71717a"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 4, fill: '#71717a' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="postTradeHealth"
                    name="Post-Trade (Accepted)"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#06b6d4' }}
                  />
                </>
              )}

              {metricMode === 'ROSTER_AGE' && (
                <>
                  <Line
                    type="monotone"
                    dataKey="statusQuoAge"
                    name="Status Quo Roster Age"
                    stroke="#71717a"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="postTradeAge"
                    name="Post-Trade Roster Age"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#f59e0b' }}
                  />
                </>
              )}

              {metricMode === 'TALENT_TIER' && (
                <>
                  <Line
                    type="monotone"
                    dataKey="statusQuoTier"
                    name="Status Quo Talent Tier"
                    stroke="#71717a"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="postTradeTier"
                    name="Post-Trade Talent Tier"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#10b981' }}
                  />
                </>
              )}

              {metricMode === 'COMBINED' && (
                <>
                  <Line
                    type="monotone"
                    dataKey="postTradeHealth"
                    name="Core Health Score"
                    stroke="#06b6d4"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="postTradeTier"
                    name="Talent Tier"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="statusQuoHealth"
                    name="Status Quo Baseline"
                    stroke="#71717a"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={{ r: 3 }}
                  />
                </>
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* 4-Season Evolution Milestone Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
        {simulation.projections.map((p) => {
          const isCurrent = p.seasonIndex === 0;
          return (
            <div
              key={p.seasonIndex}
              className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                isCurrent
                  ? 'bg-zinc-950 border-cyan-800/60 shadow-md'
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-mono text-xs font-bold text-white">
                      {p.seasonYear} Season
                    </span>
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      isCurrent
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {isCurrent ? 'Current' : `+${p.seasonIndex} Season${p.seasonIndex > 1 ? 's' : ''}`}
                  </span>
                </div>

                <div className="space-y-1.5 font-mono text-xs">
                  {/* Health Score */}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-[11px]">Core Health:</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-cyan-300 font-black">
                        {p.postTradeHealthScore.toFixed(1)}
                      </span>
                      {hasActiveTrade && (
                        <span
                          className={`text-[10px] ${
                            p.healthScoreDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ({p.healthScoreDelta >= 0 ? `+${p.healthScoreDelta.toFixed(1)}` : p.healthScoreDelta.toFixed(1)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Roster Age */}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-[11px]">Weighted Age:</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-amber-300 font-bold">
                        {p.postTradeRosterAge.toFixed(1)}y
                      </span>
                      {hasActiveTrade && (
                        <span
                          className={`text-[10px] ${
                            p.rosterAgeDelta <= 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          ({p.rosterAgeDelta > 0 ? `+${p.rosterAgeDelta.toFixed(1)}` : p.rosterAgeDelta.toFixed(1)}y)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Talent Tier */}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-[11px]">Talent Tier:</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-emerald-300 font-bold">
                        {p.postTradeTalentTierScore}
                      </span>
                      {hasActiveTrade && (
                        <span
                          className={`text-[10px] ${
                            p.talentTierScoreDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ({p.talentTierScoreDelta >= 0 ? `+${p.talentTierScoreDelta}` : p.talentTierScoreDelta})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-400 leading-tight">
                {p.keyTrend}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
