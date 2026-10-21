/**
 * Dynasty AI Evaluator - Market Momentum & Historical Value Tracker Component
 * Tracks player ranking and value over time, identifies top risers/fallers,
 * and highlights actionable buy-low targets and sell-high propositions.
 */

import React, { useState, useMemo } from 'react';
import { useRoster } from '../context/RosterContext';
import { MarketTrendsEngine } from '../lib/marketTrends';
import { PlayerMarketTrend, TradeSignalType, Position } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ArrowLeftRight,
  Clock,
  ShieldAlert,
  Flame,
  Filter,
  ChevronRight,
  Info,
  CheckCircle2,
  X,
} from 'lucide-react';

export const MarketTracker: React.FC = () => {
  const { evaluation: teamA, comparisonEvaluation: teamB, setActiveView } = useRoster();

  // Active filters
  const [selectedSignal, setSelectedSignal] = useState<string>('ALL');
  const [selectedPos, setSelectedPos] = useState<string>('ALL');
  const [timeframe, setTimeframe] = useState<'30d' | '90d'>('30d');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [inspectingPlayer, setInspectingPlayer] = useState<PlayerMarketTrend | null>(null);

  // Compute all market trends
  const allTrends = useMemo(() => MarketTrendsEngine.computeMarketTrends(), []);

  // Set of player IDs owned by Team A and Team B
  const teamAIds = useMemo(() => new Set(teamA?.players.map((p) => p.id) || []), [teamA]);
  const teamBIds = useMemo(() => new Set(teamB?.players.map((p) => p.id) || []), [teamB]);

  // Top Risers, Fallers, Sell-High, Buy-Low
  const topRisers = useMemo(() => MarketTrendsEngine.getTopRisers(allTrends, 4), [allTrends]);
  const topFallers = useMemo(() => MarketTrendsEngine.getTopFallers(allTrends, 4), [allTrends]);
  const sellHighTargets = useMemo(() => MarketTrendsEngine.getSellHighTargets(allTrends, 4), [allTrends]);
  const buyLowTargets = useMemo(() => MarketTrendsEngine.getBuyLowTargets(allTrends, 4), [allTrends]);

  // Filtered list
  const filteredTrends = useMemo(() => {
    return allTrends.filter((item) => {
      const matchSearch =
        item.player.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.player.nfl_team.toLowerCase().includes(searchTerm.toLowerCase());

      const matchPos = selectedPos === 'ALL' || item.player.position === selectedPos;
      const matchSignal = selectedSignal === 'ALL' || item.trade_signal === selectedSignal;

      return matchSearch && matchPos && matchSignal;
    });
  }, [allTrends, searchTerm, selectedPos, selectedSignal]);

  // Helper for pure SVG mini sparkline
  const renderSparkline = (history: { market_value: number }[], isPositive: boolean) => {
    const width = 80;
    const height = 24;
    const values = history.map((h) => h.market_value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values
      .map((val, idx) => {
        const x = (idx / (values.length - 1)) * (width - 4) + 2;
        const y = height - 3 - ((val - min) / range) * (height - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const strokeColor = isPositive ? '#10b981' : '#f43f5e';

    return (
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  // Helper for detailed large historical SVG chart
  const renderDetailedChart = (history: { date: string; market_value: number; rank: number }[]) => {
    const width = 460;
    const height = 140;
    const padding = { top: 20, right: 30, bottom: 25, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const values = history.map((h) => h.market_value);
    const minVal = Math.min(...values) * 0.95;
    const maxVal = Math.max(...values) * 1.05;
    const valRange = maxVal - minVal || 1;

    const coords = history.map((h, i) => {
      const x = padding.left + (i / (history.length - 1)) * chartW;
      const y = padding.top + chartH - ((h.market_value - minVal) / valRange) * chartH;
      return { x, y, ...h };
    });

    const pathD = coords.reduce((acc, curr, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${curr.x},${curr.y}`, '');
    const isUp = values[values.length - 1] >= values[0];
    const color = isUp ? '#10b981' : '#f43f5e';

    return (
      <div className="w-full overflow-x-auto">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
          {/* Grid lines */}
          <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="#27272a" strokeDasharray="3 3" />
          <line x1={padding.left} y1={padding.top + chartH / 2} x2={width - padding.right} y2={padding.top + chartH / 2} stroke="#27272a" strokeDasharray="3 3" />
          <line x1={padding.left} y1={padding.top + chartH} x2={width - padding.right} y2={padding.top + chartH} stroke="#3f3f46" />

          {/* Area fill */}
          <path
            d={`${pathD} L ${coords[coords.length - 1].x},${padding.top + chartH} L ${coords[0].x},${padding.top + chartH} Z`}
            fill={isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)'}
          />

          {/* Trend line */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Points & Labels */}
          {coords.map((c, i) => (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r="4" fill="#09090b" stroke={color} strokeWidth="2" />
              <text x={c.x} y={c.y - 8} textAnchor="middle" fill="#f4f4f5" fontSize="10" fontFamily="monospace" fontWeight="bold">
                {c.market_value.toLocaleString()}
              </text>
              <text x={c.x} y={height - 6} textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="sans-serif">
                {c.date}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  const getSignalBadge = (signal: TradeSignalType) => {
    switch (signal) {
      case 'SELL_HIGH':
        return {
          label: 'Sell High',
          badge: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
          dot: 'bg-amber-400',
        };
      case 'BUY_LOW':
        return {
          label: 'Buy Low',
          badge: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
          dot: 'bg-cyan-400',
        };
      case 'STRONG_BUY':
        return {
          label: 'Strong Buy',
          badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
          dot: 'bg-emerald-400',
        };
      default:
        return {
          label: 'Hold Core',
          badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          dot: 'bg-zinc-400',
        };
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Dynasty Market Velocity & Historical Trends
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold">
                  TRADE INTELLIGENCE
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Track asset valuation shifts over 30 and 90 days to identify opportunistic buy-low windows and sell-high propositions.
              </p>
            </div>
          </div>

          {/* Timeframe Toggle */}
          <div className="flex items-center bg-zinc-950 rounded-lg border border-zinc-800 p-1 text-xs font-medium">
            <button
              onClick={() => setTimeframe('30d')}
              className={`px-3 py-1.5 rounded-md transition-all font-mono ${
                timeframe === '30d'
                  ? 'bg-zinc-800 text-emerald-400 font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              30-Day Velocity
            </button>
            <button
              onClick={() => setTimeframe('90d')}
              className={`px-3 py-1.5 rounded-md transition-all font-mono ${
                timeframe === '90d'
                  ? 'bg-zinc-800 text-cyan-400 font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              90-Day Trajectory
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Strategic Trade Radar Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Top Risers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Top Market Risers
            </span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">30D Momentum</span>
          </div>

          <div className="space-y-2.5">
            {topRisers.map((t) => (
              <div
                key={t.player.id}
                onClick={() => setInspectingPlayer(t)}
                className="flex items-center justify-between hover:bg-zinc-800/40 p-1.5 rounded-lg cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>{t.player.full_name}</span>
                    <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                      {t.player.position}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {t.player.market_value.toLocaleString()} pts
                  </span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-xs font-bold text-emerald-400 block flex items-center justify-end">
                    <ArrowUpRight className="w-3 h-3 stroke-[3]" />
                    +{t.change_30d_pct}%
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    +{t.change_30d_points.toLocaleString()} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Top Fallers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
            <span className="text-xs font-mono font-bold text-rose-400 uppercase flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" />
              Top Market Fallers
            </span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">30D Dip</span>
          </div>

          <div className="space-y-2.5">
            {topFallers.map((t) => (
              <div
                key={t.player.id}
                onClick={() => setInspectingPlayer(t)}
                className="flex items-center justify-between hover:bg-zinc-800/40 p-1.5 rounded-lg cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>{t.player.full_name}</span>
                    <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                      {t.player.position}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {t.player.market_value.toLocaleString()} pts
                  </span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-xs font-bold text-rose-400 block flex items-center justify-end">
                    <ArrowDownRight className="w-3 h-3 stroke-[3]" />
                    {t.change_30d_pct}%
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {t.change_30d_points.toLocaleString()} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Sell-High Propositions */}
        <div className="bg-zinc-900 border border-amber-900/60 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
            <span className="text-xs font-mono font-bold text-amber-400 uppercase flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Sell-High Propositions
            </span>
            <span className="text-[10px] font-mono text-amber-500/80 uppercase">Cliff Risk</span>
          </div>

          <div className="space-y-2.5">
            {sellHighTargets.map((t) => (
              <div
                key={t.player.id}
                onClick={() => setInspectingPlayer(t)}
                className="flex items-center justify-between hover:bg-zinc-800/40 p-1.5 rounded-lg cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>{t.player.full_name}</span>
                    <span className="text-[10px] font-mono px-1 rounded bg-amber-950 text-amber-300">
                      Age {t.player.age.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {t.player.market_value.toLocaleString()} pts
                  </span>
                </div>
                <span className="text-[11px] font-mono text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/60">
                  Liquidate
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: Buy-Low Targets */}
        <div className="bg-zinc-900 border border-cyan-900/60 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
            <span className="text-xs font-mono font-bold text-cyan-400 uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Buy-Low Targets
            </span>
            <span className="text-[10px] font-mono text-cyan-500/80 uppercase">High Upside</span>
          </div>

          <div className="space-y-2.5">
            {buyLowTargets.map((t) => (
              <div
                key={t.player.id}
                onClick={() => setInspectingPlayer(t)}
                className="flex items-center justify-between hover:bg-zinc-800/40 p-1.5 rounded-lg cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>{t.player.full_name}</span>
                    <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                      {t.player.position}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {t.player.market_value.toLocaleString()} pts
                  </span>
                </div>
                <span className="text-[11px] font-mono text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60">
                  Target
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Detailed Master Ledger with Sparklines */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Table Filter Controls */}
        <div className="p-4 md:p-5 border-b border-zinc-800 bg-zinc-950/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Market Velocity Ledger
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                {filteredTrends.length} tracked
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Click any player row to view the detailed historical chart and strategic trade rationale.
            </p>
          </div>

          {/* Search, Signal Filter, Position Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search player..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Signal Filter */}
            <select
              value={selectedSignal}
              onChange={(e) => setSelectedSignal(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-xs rounded-lg px-2.5 py-1.5 text-zinc-200 outline-none focus:border-emerald-500 font-mono"
            >
              <option value="ALL">All Signals</option>
              <option value="SELL_HIGH">Sell High Only</option>
              <option value="BUY_LOW">Buy Low Only</option>
              <option value="STRONG_BUY">Strong Buy Only</option>
              <option value="HOLD_CORNERSTONE">Hold Core Only</option>
            </select>

            {/* Position Filter */}
            <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-800 p-0.5 text-xs font-mono">
              {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setSelectedPos(pos)}
                  className={`px-2 py-1 rounded transition-colors ${
                    selectedPos === pos
                      ? 'bg-zinc-800 text-emerald-400 font-bold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300 border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/90 text-[11px] uppercase font-mono text-zinc-400 tracking-wider">
                <th className="py-3 px-4 font-semibold">Rank</th>
                <th className="py-3 px-4 font-semibold">Player</th>
                <th className="py-3 px-3 font-semibold text-center">Pos</th>
                <th className="py-3 px-4 font-semibold text-right">Age</th>
                <th className="py-3 px-4 font-semibold text-right">Current Value</th>
                <th className="py-3 px-4 font-semibold text-right">
                  {timeframe === '30d' ? '30D Velocity (Δ)' : '90D Velocity (Δ)'}
                </th>
                <th className="py-3 px-4 font-semibold text-center">90-Day Trajectory</th>
                <th className="py-3 px-4 font-semibold text-center">Action Signal</th>
                <th className="py-3 px-4 font-semibold text-center">Trade Quick Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {filteredTrends.map((item) => {
                const isPositive =
                  timeframe === '30d' ? item.change_30d_pct >= 0 : item.change_90d_pct >= 0;
                const pctDelta = timeframe === '30d' ? item.change_30d_pct : item.change_90d_pct;
                const pointDelta =
                  timeframe === '30d' ? item.change_30d_points : item.change_90d_points;
                const signal = getSignalBadge(item.trade_signal);

                const isOwnedByA = teamAIds.has(item.player.id);
                const isOwnedByB = teamBIds.has(item.player.id);

                return (
                  <tr
                    key={item.player.id}
                    onClick={() => setInspectingPlayer(item)}
                    className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
                    {/* Consensus Rank */}
                    <td className="py-3 px-4 whitespace-nowrap text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">#{item.player.consensus_rank}</span>
                        {item.rank_change_30d !== 0 && (
                          <span
                            className={`text-[10px] ${
                              item.rank_change_30d > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.rank_change_30d > 0
                              ? `+${item.rank_change_30d}`
                              : item.rank_change_30d}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Full Name & Ownership Badge */}
                    <td className="py-3 px-4 font-sans whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{item.player.full_name}</span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {item.player.nfl_team}
                        </span>
                        {isOwnedByA && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                            Your Roster
                          </span>
                        )}
                        {isOwnedByB && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800">
                            Opponent
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Position */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                        {item.player.position}
                      </span>
                    </td>

                    {/* Age */}
                    <td className="py-3 px-4 text-right whitespace-nowrap text-zinc-300">
                      {item.player.age.toFixed(1)}y
                    </td>

                    {/* Current Value */}
                    <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-white">
                      {item.current_value.toLocaleString()}{' '}
                      <span className="text-[10px] text-zinc-500 font-sans">pts</span>
                    </td>

                    {/* Velocity Delta */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-bold inline-flex items-center gap-1 ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="w-3 h-3 stroke-[3]" /> : <ArrowDownRight className="w-3 h-3 stroke-[3]" />}
                        {isPositive ? `+${pctDelta}%` : `${pctDelta}%`}
                      </span>
                      <span className="text-[10px] text-zinc-500 block">
                        {isPositive ? `+${pointDelta.toLocaleString()}` : `${pointDelta.toLocaleString()}`} pts
                      </span>
                    </td>

                    {/* 90-Day Sparkline */}
                    <td className="py-3 px-4 whitespace-nowrap flex justify-center items-center">
                      {renderSparkline(item.history, isPositive)}
                    </td>

                    {/* Trade Signal Badge */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${signal.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${signal.dot}`} />
                        {signal.label}
                      </span>
                    </td>

                    {/* Quick Trade Button */}
                    <td className="py-3 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setActiveView('trade')}
                        className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-700 hover:border-emerald-500 hover:text-emerald-400 text-zinc-300 text-[11px] font-medium transition-all flex items-center justify-center gap-1 mx-auto cursor-pointer"
                        title="Open Trade Builder with this player"
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>Trade</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Interactive Historical Chart Modal / Inspector */}
      {inspectingPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setInspectingPlayer(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xl font-bold text-white">
                    {inspectingPlayer.player.full_name}
                  </h4>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {inspectingPlayer.player.position} • {inspectingPlayer.player.nfl_team}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Rank #{inspectingPlayer.player.consensus_rank} • Age {inspectingPlayer.player.age.toFixed(1)}y • Valuation: {inspectingPlayer.current_value.toLocaleString()} pts
                </p>
              </div>
            </div>

            {/* Historical Curve SVG */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 my-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-xs font-mono">
                <span className="text-zinc-400 uppercase">90-Day Market Valuation History</span>
                <span className="text-emerald-400 font-bold">
                  {inspectingPlayer.change_90d_pct >= 0 ? `+${inspectingPlayer.change_90d_pct}%` : `${inspectingPlayer.change_90d_pct}%`} overall
                </span>
              </div>
              {renderDetailedChart(inspectingPlayer.history)}
            </div>

            {/* Strategic Rationale */}
            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 mb-5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                    getSignalBadge(inspectingPlayer.trade_signal).badge
                  }`}
                >
                  {getSignalBadge(inspectingPlayer.trade_signal).label}
                </span>
                <span className="text-xs font-bold text-white font-mono">
                  Dynasty Strategy Rationale:
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {inspectingPlayer.signal_rationale}
              </p>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setInspectingPlayer(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
              >
                Close Inspector
              </button>
              <button
                type="button"
                onClick={() => {
                  setInspectingPlayer(null);
                  setActiveView('trade');
                }}
                className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>Stage in Trade Builder</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
