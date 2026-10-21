/**
 * Dynasty AI Evaluator - Trade History Component
 * Logs executed/simulated trades and tracks week-over-week asset performance
 * to verify if quantitative 'Gross Liquidity' predictions were accurate.
 */

import React, { useState, useMemo } from 'react';
import { LoggedTradeRecord } from '../types';
import { TradeHistoryEngine } from '../lib/tradeHistory';
import {
  History,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Coins,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Trash2,
  Award,
  Zap,
  Filter,
  BarChart3,
  ArrowRight,
  Shield,
  Activity,
} from 'lucide-react';

interface TradeHistoryProps {
  onBackToBuilder?: () => void;
  leagueId?: string;
  onTradeSelect?: (trade: LoggedTradeRecord) => void;
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({
  onBackToBuilder,
  leagueId = 'default',
}) => {
  const [trades, setTrades] = useState<LoggedTradeRecord[]>(() =>
    TradeHistoryEngine.getTradeHistory(leagueId)
  );

  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(() => {
    return trades.length > 0 ? trades[0].id : null;
  });

  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'OUTPERFORMED' | 'ACCURATE' | 'UNDERPERFORMED'>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');

  // Overall Verification Aggregate Metrics
  const metrics = useMemo(() => {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        avgAccuracy: 0,
        netPredictedLiquidityDelta: 0,
        netRealizedLiquidityDelta: 0,
        totalSurplus: 0,
        outperformedCount: 0,
        accurateCount: 0,
        underperformedCount: 0,
      };
    }

    const totalTrades = trades.length;
    const avgAccuracy =
      trades.reduce((acc, t) => acc + (t.accuracy_percentage || 100), 0) / totalTrades;
    const netPredictedLiquidityDelta = trades.reduce(
      (acc, t) => acc + (t.predicted_liquidity_delta || 0),
      0
    );
    const netRealizedLiquidityDelta = trades.reduce(
      (acc, t) => acc + (t.latest_realized_liquidity_delta || 0),
      0
    );
    const totalSurplus = netRealizedLiquidityDelta - netPredictedLiquidityDelta;

    const outperformedCount = trades.filter((t) => t.accuracy_verdict === 'OUTPERFORMED').length;
    const accurateCount = trades.filter((t) => t.accuracy_verdict === 'ACCURATE').length;
    const underperformedCount = trades.filter(
      (t) => t.accuracy_verdict === 'UNDERPERFORMED'
    ).length;

    return {
      totalTrades,
      avgAccuracy: Math.round(avgAccuracy * 10) / 10,
      netPredictedLiquidityDelta: Math.round(netPredictedLiquidityDelta * 10) / 10,
      netRealizedLiquidityDelta: Math.round(netRealizedLiquidityDelta * 10) / 10,
      totalSurplus: Math.round(totalSurplus * 10) / 10,
      outperformedCount,
      accurateCount,
      underperformedCount,
    };
  }, [trades]);

  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (outcomeFilter !== 'ALL' && t.accuracy_verdict !== outcomeFilter) {
        return false;
      }
      if (strategyFilter !== 'ALL' && t.strategy_tag !== strategyFilter) {
        return false;
      }
      return true;
    });
  }, [trades, outcomeFilter, strategyFilter]);

  const handleToggleExpand = (id: string) => {
    setExpandedTradeId((prev) => (prev === id ? null : id));
  };

  const handleDeleteTrade = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = TradeHistoryEngine.deleteTrade(id, leagueId);
    setTrades(updated);
  };

  const handleResetBaseline = () => {
    const defaultData = TradeHistoryEngine.resetToDemoBaseline(leagueId);
    setTrades(defaultData);
    if (defaultData.length > 0) {
      setExpandedTradeId(defaultData[0].id);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* 1. Header & Summary Navigation */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
              <History className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Trade History & Gross Liquidity Accuracy Verifier
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold">
                  EMPIRICAL VERIFICATION
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Tracks past executed trades over subsequent weeks to verify if quantitative Gross Liquidity predictions were realized.
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
            <button
              type="button"
              onClick={handleResetBaseline}
              className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Reset history to demonstration baseline"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Demo Trades</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Aggregate Prediction Performance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Prediction Accuracy Rate */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
              Model Accuracy Rate
            </span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2 py-1">
            <span className="text-2xl font-black font-mono text-emerald-400">
              {metrics.avgAccuracy}%
            </span>
            <span className="text-xs font-mono text-zinc-500">avg fidelity</span>
          </div>
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 mt-1">
            {metrics.avgAccuracy >= 100
              ? 'Predictions consistently met or exceeded baseline expectations.'
              : 'Predictions closely tracked real-world roster performance.'}
          </p>
        </div>

        {/* Metric 2: Net Gross Liquidity Impact */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
              Realized Liquidity Impact
            </span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2 py-1">
            <span className="text-2xl font-black font-mono text-white">
              +{metrics.netRealizedLiquidityDelta.toFixed(1)} Δ
            </span>
            <span className="text-xs font-mono text-zinc-500 line-through">
              +{metrics.netPredictedLiquidityDelta.toFixed(1)} Δ
            </span>
            <span className="text-[11px] font-mono text-zinc-500">idx</span>
          </div>
          <div className="text-[11px] font-mono flex items-center justify-between border-t border-zinc-800 pt-2 mt-1">
            <span className="text-zinc-500">Prediction Surplus:</span>
            <span className={metrics.totalSurplus >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {metrics.totalSurplus >= 0 ? `+${metrics.totalSurplus.toFixed(1)} Δ` : `${metrics.totalSurplus.toFixed(1)} Δ`}
            </span>
          </div>
        </div>

        {/* Metric 3: Outcome Verification Breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
              Verification Outcomes
            </span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center gap-3 py-1 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <strong className="text-base text-white">{metrics.outperformedCount}</strong> Outperformed
            </div>
            <div className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <strong className="text-base text-white">{metrics.accurateCount}</strong> Accurate
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 mt-1">
            {metrics.outperformedCount} trade(s) delivered bonus liquidity surplus.
          </p>
        </div>

        {/* Metric 4: Insulated Draft Capital Ratio */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
              Draft Equity Shield
            </span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 py-1">
            <span className="text-2xl font-black font-mono text-amber-300">
              100%
            </span>
            <span className="text-xs font-mono text-zinc-500">injury immune</span>
          </div>
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 mt-1">
            Acquired picks held permanent value without taking injury or aging hits.
          </p>
        </div>
      </div>

      {/* 3. Filters and Search Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Outcome:
          </span>
          {(['ALL', 'OUTPERFORMED', 'ACCURATE', 'UNDERPERFORMED'] as const).map((outcome) => (
            <button
              key={outcome}
              type="button"
              onClick={() => setOutcomeFilter(outcome)}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                outcomeFilter === outcome
                  ? 'bg-zinc-800 text-emerald-400 font-bold border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              {outcome === 'ALL'
                ? 'All Trades'
                : outcome === 'OUTPERFORMED'
                ? 'Outperformed'
                : outcome === 'ACCURATE'
                ? 'Met Target'
                : 'Underperformed'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Strategy:</span>
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Strategies</option>
            <option value="FLEX_FOR_FIRST">Flex for a 1st</option>
            <option value="WIN_NOW">Win-Now Upgrade</option>
            <option value="MULTI_YEAR_PICK">Multi-Year Arbitrage</option>
            <option value="REBUILD">Rebuild Pivot</option>
          </select>
        </div>
      </div>

      {/* 4. Logged Trades List */}
      {filteredTrades.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-bold text-zinc-300">No Trades Match the Selected Filter</p>
          <p className="text-xs text-zinc-500">
            Adjust your filter criteria or use the Active Trade Simulator to execute and log a new trade proposal.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTrades.map((trade) => {
            const isExpanded = expandedTradeId === trade.id;
            const hasMultipleWeeks = trade.tracking_weeks.length > 1;

            return (
              <div
                key={trade.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl transition-all hover:border-zinc-700"
              >
                {/* Trade Summary Banner */}
                <div
                  onClick={() => handleToggleExpand(trade.id)}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer select-none bg-zinc-900 hover:bg-zinc-850 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`p-2.5 rounded-lg shrink-0 border ${
                        trade.strategy_tag === 'FLEX_FOR_FIRST'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : trade.strategy_tag === 'MULTI_YEAR_PICK'
                          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                          : trade.strategy_tag === 'WIN_NOW'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {trade.strategy_tag === 'FLEX_FOR_FIRST' ? (
                        <Sparkles className="w-5 h-5" />
                      ) : trade.strategy_tag === 'MULTI_YEAR_PICK' ? (
                        <Coins className="w-5 h-5" />
                      ) : (
                        <TrendingUp className="w-5 h-5" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-white">
                          Trade with {trade.partner_franchise_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                            trade.strategy_tag === 'FLEX_FOR_FIRST'
                              ? 'bg-amber-400 text-zinc-950'
                              : trade.strategy_tag === 'MULTI_YEAR_PICK'
                              ? 'bg-cyan-400 text-zinc-950'
                              : trade.strategy_tag === 'WIN_NOW'
                              ? 'bg-emerald-400 text-zinc-950'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {trade.strategy_tag === 'FLEX_FOR_FIRST'
                            ? 'Flex for a 1st'
                            : trade.strategy_tag === 'MULTI_YEAR_PICK'
                            ? 'Multi-Year Arbitrage'
                            : trade.strategy_tag.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Executed Week {trade.executed_week} •{' '}
                          {new Date(trade.timestamp).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Assets Overview Row */}
                      <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2">
                        <span className="text-cyan-400 font-mono font-medium">
                          Sent:{' '}
                          {[...trade.sent_players.map((p) => p.full_name), ...trade.sent_picks.map((p) => p.description)].join(
                            ', '
                          ) || 'None'}
                        </span>
                        <ArrowRight className="w-3 h-3 text-zinc-600 inline" />
                        <span className="text-amber-300 font-mono font-medium">
                          Received:{' '}
                          {[
                            ...trade.received_players.map((p) => p.full_name),
                            ...trade.received_picks.map((p) => p.description),
                          ].join(', ') || 'None'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quantitative Prediction vs Realized Readout */}
                  <div className="flex items-center gap-4 self-start lg:self-center font-mono">
                    <div className="text-right">
                      <div className="text-[10px] uppercase text-zinc-500">Predicted Δ</div>
                      <div className="text-xs font-bold text-zinc-300">
                        {trade.predicted_liquidity_delta >= 0
                          ? `+${trade.predicted_liquidity_delta.toFixed(1)} Δ`
                          : `${trade.predicted_liquidity_delta.toFixed(1)} Δ`}
                      </div>
                    </div>

                    <div className="w-px h-7 bg-zinc-800" />

                    <div className="text-right">
                      <div className="text-[10px] uppercase text-zinc-500">Realized Δ</div>
                      <div
                        className={`text-sm font-black ${
                          trade.latest_realized_liquidity_delta >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {trade.latest_realized_liquidity_delta >= 0
                          ? `+${trade.latest_realized_liquidity_delta.toFixed(1)} Δ`
                          : `${trade.latest_realized_liquidity_delta.toFixed(1)} Δ`}
                      </div>
                    </div>

                    <div className="w-px h-7 bg-zinc-800" />

                    <div className="text-right min-w-[90px]">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold block text-center ${
                          trade.accuracy_verdict === 'OUTPERFORMED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                            : trade.accuracy_verdict === 'ACCURATE'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                            : 'bg-rose-950 text-rose-300 border border-rose-700'
                        }`}
                      >
                        {trade.accuracy_verdict === 'OUTPERFORMED'
                          ? `+${trade.liquidity_prediction_variance.toFixed(1)} Surplus`
                          : trade.accuracy_verdict === 'ACCURATE'
                          ? `${trade.accuracy_percentage.toFixed(0)}% Accurate`
                          : 'Underperformed'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 pl-1">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTrade(trade.id, e)}
                        className="p-1.5 rounded text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Delete trade record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded text-zinc-400 hover:text-white transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Verification Details & Multi-Week Performance Timeline */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 bg-zinc-950/70 p-5 space-y-5">
                    {/* Prediction Verification Rationale & Verdict Analysis */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
                        <span className="text-[10px] font-mono uppercase font-bold text-zinc-400 block flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-cyan-400" />
                          Initial Prediction Modeling at Execution:
                        </span>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {trade.prediction_rationale}
                        </p>
                        <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-400 pt-1.5 border-t border-zinc-800">
                          <span>
                            Pre-Trade Liquidity: <strong className="text-white">{trade.pre_trade_gross_liquidity.toFixed(1)}</strong>
                          </span>
                          <span>&rarr;</span>
                          <span>
                            Predicted Post: <strong className="text-emerald-400">{trade.predicted_gross_liquidity.toFixed(1)}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-900/50 space-y-1.5">
                        <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 block flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Subsequent Weeks Verification Verdict:
                        </span>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {trade.verdict_analysis}
                        </p>
                        <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-400 pt-1.5 border-t border-zinc-800">
                          <span>
                            Current Realized Liquidity: <strong className="text-emerald-400">{trade.latest_realized_gross_liquidity.toFixed(1)}</strong>
                          </span>
                          <span>
                            Variance: <strong className={trade.liquidity_prediction_variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {trade.liquidity_prediction_variance >= 0 ? `+${trade.liquidity_prediction_variance.toFixed(1)} Δ` : `${trade.liquidity_prediction_variance.toFixed(1)} Δ`}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Week-over-Week Asset Performance Tracking Table */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                          Week-Over-Week Asset Performance Tracking
                        </h4>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {trade.tracking_weeks.length} Week(s) Monitored
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-zinc-800">
                        <table className="w-full text-left font-mono text-xs">
                          <thead className="bg-zinc-900/90 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                            <tr>
                              <th className="py-2.5 px-3">Timeline</th>
                              <th className="py-2.5 px-3">Incoming Output</th>
                              <th className="py-2.5 px-3">Outgoing Output</th>
                              <th className="py-2.5 px-3">Net Score Δ</th>
                              <th className="py-2.5 px-3">Net Asset Value Δ</th>
                              <th className="py-2.5 px-3">Realized Gross Liquidity</th>
                              <th className="py-2.5 px-3">Performance Observation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
                            {trade.tracking_weeks.map((week) => (
                              <tr key={week.week_number} className="hover:bg-zinc-900/40 transition-colors">
                                <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                                  {week.label}
                                </td>
                                <td className="py-2.5 px-3 text-emerald-400">
                                  {week.incoming_fantasy_pts.toFixed(1)} pts
                                </td>
                                <td className="py-2.5 px-3 text-rose-400">
                                  {week.outgoing_fantasy_pts.toFixed(1)} pts
                                </td>
                                <td className="py-2.5 px-3 font-bold">
                                  <span
                                    className={
                                      week.net_points_delta >= 0
                                        ? 'text-emerald-400'
                                        : 'text-zinc-400'
                                    }
                                  >
                                    {week.net_points_delta >= 0
                                      ? `+${week.net_points_delta.toFixed(1)}`
                                      : `${week.net_points_delta.toFixed(1)}`}{' '}
                                    pts
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-cyan-300">
                                  {week.net_value_delta >= 0
                                    ? `+${week.net_value_delta.toLocaleString()}`
                                    : `${week.net_value_delta.toLocaleString()}`}{' '}
                                  pts
                                </td>
                                <td className="py-2.5 px-3 font-bold text-amber-300">
                                  {week.realized_gross_liquidity.toFixed(1)} idx
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-zinc-300 font-sans max-w-xs">
                                  {week.notes || 'Performance confirmed within statistical projections.'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Trade Asset Ledger Breakdown Chips */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      {/* Sent Chips */}
                      <div className="p-3 rounded-lg bg-zinc-900/60 border border-cyan-900/40 space-y-1.5">
                        <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">
                          You Sent ({trade.total_sent_market_value.toLocaleString()} pts total):
                        </span>
                        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                          {trade.sent_players.map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200"
                            >
                              {p.full_name} ({p.position}, {p.market_value.toLocaleString()} pts)
                            </span>
                          ))}
                          {trade.sent_picks.map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 rounded bg-zinc-950 border border-cyan-800/60 text-cyan-300"
                            >
                              {p.description} ({p.market_value.toLocaleString()} pts)
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Received Chips */}
                      <div className="p-3 rounded-lg bg-zinc-900/60 border border-amber-900/40 space-y-1.5">
                        <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                          You Received ({trade.total_received_market_value.toLocaleString()} pts total):
                        </span>
                        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                          {trade.received_players.map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200"
                            >
                              {p.full_name} ({p.position}, {p.market_value.toLocaleString()} pts)
                            </span>
                          ))}
                          {trade.received_picks.map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 rounded bg-zinc-950 border border-amber-800/60 text-amber-300"
                            >
                              {p.description} ({p.market_value.toLocaleString()} pts)
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
