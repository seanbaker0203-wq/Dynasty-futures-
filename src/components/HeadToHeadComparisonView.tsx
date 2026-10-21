/**
 * Dynasty AI Evaluator - Head-to-Head Roster DNA Comparison View
 * Secondary Dashboard View: Side-by-side comparison of Roster DNA metrics against another uploaded roster.
 */

import React, { useState } from 'react';
import { useRoster } from '../context/RosterContext';
import { CircularDialGauge } from './CircularDialGauge';
import { Platform } from '../types';
import {
  Swords,
  TrendingUp,
  TrendingDown,
  Shield,
  Layers,
  ArrowRight,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Award,
} from 'lucide-react';

export const HeadToHeadComparisonView: React.FC = () => {
  const {
    evaluation: teamA,
    comparisonEvaluation: teamB,
    setActiveView,
    syncComparisonRoster,
    loadComparisonDemo,
    isComparisonLoading,
    comparisonError,
  } = useRoster();

  const [comparePlatform, setComparePlatform] = useState<Platform>('sleeper');
  const [compareLeagueId, setCompareLeagueId] = useState<string>('');
  const [compareIdentifier, setCompareIdentifier] = useState<string>('');
  const [comparePassword, setComparePassword] = useState<string>('');
  const [compareYear, setCompareYear] = useState<string>('2026');
  const [showSyncDrawer, setShowSyncDrawer] = useState<boolean>(false);
  const [activeLedgerTab, setActiveLedgerTab] = useState<'starters' | 'bench' | 'all'>('starters');

  const handleCompareSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compareLeagueId.trim()) return;

    syncComparisonRoster({
      platform: comparePlatform,
      league_id: compareLeagueId.trim(),
      username: compareIdentifier.trim() || undefined,
      password: comparePlatform === 'mfl' && comparePassword.trim() ? comparePassword.trim() : undefined,
      franchise_id: comparePlatform === 'mfl' ? compareIdentifier.trim() : undefined,
      year: comparePlatform === 'mfl' ? compareYear : '2026',
      valuation_mode: 'auction_desc',
    });
  };

  if (!teamA) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
        <p className="text-zinc-400 text-sm">
          Please upload or select your primary roster first to initiate a head-to-head comparison.
        </p>
      </div>
    );
  }

  // Calculate comparative deltas (Team A minus Team B)
  const liquidityDelta = teamB ? (teamA.metrics.gross_liquidity - teamB.metrics.gross_liquidity) : 0;
  const halfLifeDelta = teamB ? (teamA.metrics.asset_half_life - teamB.metrics.asset_half_life) : 0;
  const integrityDelta = teamB ? (teamA.metrics.structural_integrity - teamB.metrics.structural_integrity) : 0;
  const totalValDelta = teamB ? ((teamA.metrics.total_roster_value || 0) - (teamB.metrics.total_roster_value || 0)) : 0;
  const starterValDelta = teamB ? ((teamA.metrics.starter_value || 0) - (teamB.metrics.starter_value || 0)) : 0;

  // Verdict calculation
  const getMatchupVerdict = () => {
    if (!teamB) return null;
    let winNowAdvantage = 'Tied';
    if (starterValDelta > 1500) winNowAdvantage = `${teamA.roster.franchise_name || 'Team A'} (+${starterValDelta.toLocaleString()} pts)`;
    else if (starterValDelta < -1500) winNowAdvantage = `${teamB.roster.franchise_name || 'Team B'} (+${Math.abs(starterValDelta).toLocaleString()} pts)`;

    let futureAdvantage = 'Tied';
    if (halfLifeDelta > 0.4) futureAdvantage = `${teamA.roster.franchise_name || 'Team A'} (+${halfLifeDelta.toFixed(1)}y prime)`;
    else if (halfLifeDelta < -0.4) futureAdvantage = `${teamB.roster.franchise_name || 'Team B'} (+${Math.abs(halfLifeDelta).toFixed(1)}y prime)`;

    return {
      winNow: winNowAdvantage,
      future: futureAdvantage,
    };
  };

  const verdict = getMatchupVerdict();

  const positions = ['QB', 'RB', 'WR', 'TE'];

  return (
    <div className="w-full space-y-6">
      {/* 1. Comparison Control Bar & Opponent Selector */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-400">
              <Swords className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Head-to-Head Roster DNA Comparison
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60 font-semibold">
                  MATCHUP ANALYTICS
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Compare portfolio health, starter firepower, and dynasty window longevity side-by-side
              </p>
            </div>
          </div>

          {/* Quick Benchmark Loaders */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase text-zinc-400">Compare With:</span>
            <button
              type="button"
              onClick={() => loadComparisonDemo('contender')}
              className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-amber-800/60 hover:border-amber-500 text-amber-300 text-xs font-medium transition-all"
            >
              Demo Contender
            </button>
            <button
              type="button"
              onClick={() => loadComparisonDemo('juggernaut')}
              className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-cyan-800/60 hover:border-cyan-500 text-cyan-300 text-xs font-medium transition-all"
            >
              Demo Juggernaut
            </button>
            <button
              type="button"
              onClick={() => loadComparisonDemo('rebuild')}
              className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-emerald-800/60 hover:border-emerald-500 text-emerald-300 text-xs font-medium transition-all"
            >
              Demo Rebuild
            </button>
            <button
              type="button"
              onClick={() => setShowSyncDrawer(!showSyncDrawer)}
              className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium transition-all flex items-center gap-1.5 border border-zinc-700"
            >
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>{showSyncDrawer ? 'Hide League Ingest' : 'Sync Opponent Roster ID'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Sync Form for Team B */}
        {showSyncDrawer && (
          <form
            onSubmit={handleCompareSync}
            className="mt-4 pt-4 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-4 gap-3"
          >
            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                Opponent Platform
              </label>
              <select
                value={comparePlatform}
                onChange={(e) => setComparePlatform(e.target.value as Platform)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-amber-500 font-medium"
              >
                <option value="sleeper">Sleeper (API Sync)</option>
                <option value="mfl">MyFantasyLeague (MFL SSL Bypass)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                League ID
              </label>
              <input
                type="text"
                value={compareLeagueId}
                onChange={(e) => setCompareLeagueId(e.target.value)}
                placeholder="e.g. 1048475294829375488"
                required
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                {comparePlatform === 'mfl' ? 'MFL Username or Franchise ID' : 'Opponent Username'}
              </label>
              <input
                type="text"
                value={compareIdentifier}
                onChange={(e) => setCompareIdentifier(e.target.value)}
                placeholder={comparePlatform === 'mfl' ? 'MFL username or 0001' : 'e.g. username'}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-amber-500"
              />
            </div>

            {comparePlatform === 'mfl' && (
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                  MFL Password (If Private)
                </label>
                <input
                  type="password"
                  value={comparePassword}
                  onChange={(e) => setComparePassword(e.target.value)}
                  placeholder="Optional MFL Password"
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isComparisonLoading || !compareLeagueId.trim()}
                className="w-full py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isComparisonLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Syncing Opponent...</span>
                  </>
                ) : (
                  <>
                    <span>Ingest Opponent</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {comparisonError && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{comparisonError}</span>
          </div>
        )}
      </div>

      {/* 2. Head-to-Head Matchup Summary Banner */}
      {teamB && (
        <div className="bg-gradient-to-r from-cyan-950/40 via-zinc-900 to-amber-950/40 border border-zinc-800 rounded-xl p-5 md:p-6 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Team A (Left) */}
            <div className="lg:col-span-5 flex items-start space-x-3">
              <div className="w-3 h-12 rounded-full bg-cyan-500 shrink-0 mt-1" />
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold block">
                  Primary Roster (Team A)
                </span>
                <h4 className="text-xl font-black text-white">
                  {teamA.roster.franchise_name || 'Team A'}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold font-mono">
                    {teamA.metrics.classification}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {(teamA.metrics.total_roster_value || 0).toLocaleString()} pts total
                  </span>
                </div>
              </div>
            </div>

            {/* VS Nexus & Verdict (Center) */}
            <div className="lg:col-span-2 flex flex-col items-center justify-center text-center py-2 px-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
              <div className="text-xs font-mono font-black text-zinc-400 uppercase tracking-widest mb-1">
                VS SHOWDOWN
              </div>
              <div className="text-sm font-extrabold text-white">
                {liquidityDelta >= 0 ? (
                  <span className="text-cyan-400">+{liquidityDelta.toFixed(1)} Liquidity</span>
                ) : (
                  <span className="text-amber-400">+{Math.abs(liquidityDelta).toFixed(1)} Opponent</span>
                )}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-1">
                {halfLifeDelta >= 0 ? (
                  <span className="text-cyan-400">+{halfLifeDelta.toFixed(1)}y Longevity Edge</span>
                ) : (
                  <span className="text-amber-400">+{Math.abs(halfLifeDelta).toFixed(1)}y Opponent Longevity</span>
                )}
              </div>
            </div>

            {/* Team B (Right) */}
            <div className="lg:col-span-5 flex items-start justify-start lg:justify-end space-x-3 text-left lg:text-right">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
                  Opponent / Benchmark (Team B)
                </span>
                <h4 className="text-xl font-black text-white">
                  {teamB.roster.franchise_name || 'Team B'}
                </h4>
                <div className="flex items-center lg:justify-end gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold font-mono">
                    {teamB.metrics.classification}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {(teamB.metrics.total_roster_value || 0).toLocaleString()} pts total
                  </span>
                </div>
              </div>
              <div className="w-3 h-12 rounded-full bg-amber-500 shrink-0 mt-1" />
            </div>
          </div>

          {/* Comparative Verdict Pills */}
          {verdict && (
            <div className="mt-5 pt-4 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3 flex items-center gap-3">
                <Award className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-[10px] font-mono uppercase text-zinc-400 block">
                    Immediate Win-Now Edge (Top Starting Assets)
                  </span>
                  <span className="text-xs font-bold text-white font-mono">
                    {verdict.winNow}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3 flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="text-[10px] font-mono uppercase text-zinc-400 block">
                    Dynasty Timeline Edge (Asset Half-Life)
                  </span>
                  <span className="text-xs font-bold text-white font-mono">
                    {verdict.future}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Route to Trade Builder */}
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-mono">
              Ready to adjust positional equity or negotiate a deal?
            </span>
            <button
              type="button"
              onClick={() => setActiveView('trade')}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <span>Model Trade Proposal in Trade Builder</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. The 3 Core DNA Metrics: Side-by-Side SVG Gauges */}
      {teamB && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              DNA Metrics Comparative Differential
            </h4>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                {teamA.roster.franchise_name || 'Team A'}
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                {teamB.roster.franchise_name || 'Team B'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Metric 1: Gross Liquidity Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Gross Liquidity
                </span>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                    liquidityDelta >= 0
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                      : 'bg-amber-950/80 text-amber-300 border-amber-800'
                  }`}
                >
                  {liquidityDelta >= 0 ? `+${liquidityDelta.toFixed(1)} Δ` : `${liquidityDelta.toFixed(1)} Δ`}
                </span>
              </div>

              <div className="py-6 flex items-center justify-around">
                <div className="text-center">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase">Team A</span>
                  <span className="text-3xl font-extrabold font-mono text-white">
                    {teamA.metrics.gross_liquidity.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-zinc-500 block">Index</span>
                </div>
                <div className="h-10 w-[1px] bg-zinc-800" />
                <div className="text-center">
                  <span className="text-[10px] font-mono text-amber-400 block uppercase">Team B</span>
                  <span className="text-3xl font-extrabold font-mono text-white">
                    {teamB.metrics.gross_liquidity.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-zinc-500 block">Index</span>
                </div>
              </div>

              <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden flex border border-zinc-800">
                <div
                  style={{ width: `${(teamA.metrics.gross_liquidity / (teamA.metrics.gross_liquidity + teamB.metrics.gross_liquidity)) * 100}%` }}
                  className="bg-cyan-500 h-full"
                  title={`Team A: ${teamA.metrics.gross_liquidity}`}
                />
                <div
                  style={{ width: `${(teamB.metrics.gross_liquidity / (teamA.metrics.gross_liquidity + teamB.metrics.gross_liquidity)) * 100}%` }}
                  className="bg-amber-500 h-full"
                  title={`Team B: ${teamB.metrics.gross_liquidity}`}
                />
              </div>
            </div>

            {/* Metric 2: Asset Half-Life Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Asset Half-Life
                </span>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                    halfLifeDelta >= 0
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                      : 'bg-amber-950/80 text-amber-300 border-amber-800'
                  }`}
                >
                  {halfLifeDelta >= 0 ? `+${halfLifeDelta.toFixed(1)}y Δ` : `${halfLifeDelta.toFixed(1)}y Δ`}
                </span>
              </div>

              <div className="py-6 flex items-center justify-around">
                <div className="text-center">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase">Team A</span>
                  <span className="text-3xl font-extrabold font-mono text-white">
                    {teamA.metrics.asset_half_life.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-zinc-500 block">Years Prime</span>
                </div>
                <div className="h-10 w-[1px] bg-zinc-800" />
                <div className="text-center">
                  <span className="text-[10px] font-mono text-amber-400 block uppercase">Team B</span>
                  <span className="text-3xl font-extrabold font-mono text-white">
                    {teamB.metrics.asset_half_life.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-zinc-500 block">Years Prime</span>
                </div>
              </div>

              <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden flex border border-zinc-800">
                <div
                  style={{ width: `${(teamA.metrics.asset_half_life / (teamA.metrics.asset_half_life + teamB.metrics.asset_half_life)) * 100}%` }}
                  className="bg-cyan-500 h-full"
                  title={`Team A: ${teamA.metrics.asset_half_life}y`}
                />
                <div
                  style={{ width: `${(teamB.metrics.asset_half_life / (teamA.metrics.asset_half_life + teamB.metrics.asset_half_life)) * 100}%` }}
                  className="bg-amber-500 h-full"
                  title={`Team B: ${teamB.metrics.asset_half_life}y`}
                />
              </div>
            </div>

            {/* Metric 3: Structural Integrity Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Structural Integrity
                </span>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                    integrityDelta >= 0
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                      : 'bg-amber-950/80 text-amber-300 border-amber-800'
                  }`}
                >
                  {integrityDelta >= 0 ? `+${integrityDelta.toFixed(1)}% Δ` : `${integrityDelta.toFixed(1)}% Δ`}
                </span>
              </div>

              <div className="py-6 flex items-center justify-around">
                <div className="text-center">
                  <span className="text-[10px] font-mono text-cyan-400 block uppercase">Team A</span>
                  <span className="text-3xl font-extrabold font-mono text-white">
                    {teamA.metrics.structural_integrity.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-zinc-500 block">Insulation</span>
                </div>
                <div className="h-10 w-[1px] bg-zinc-800" />
                <div className="text-center">
                  <span className="text-[10px] font-mono text-amber-400 block uppercase">Team B</span>
                  <span className="text-3xl font-extrabold font-mono text-white">
                    {teamB.metrics.structural_integrity.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-zinc-500 block">Insulation</span>
                </div>
              </div>

              <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden flex border border-zinc-800">
                <div
                  style={{ width: `${(teamA.metrics.structural_integrity / (teamA.metrics.structural_integrity + teamB.metrics.structural_integrity)) * 100}%` }}
                  className="bg-cyan-500 h-full"
                  title={`Team A: ${teamA.metrics.structural_integrity}%`}
                />
                <div
                  style={{ width: `${(teamB.metrics.structural_integrity / (teamA.metrics.structural_integrity + teamB.metrics.structural_integrity)) * 100}%` }}
                  className="bg-amber-500 h-full"
                  title={`Team B: ${teamB.metrics.structural_integrity}%`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Positional Head-to-Head Tale of the Tape */}
      {teamB && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                Positional Capital Showdown
              </h4>
            </div>
            <span className="text-xs font-mono text-zinc-400">
              Net Market Value Allocation By Group
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {positions.map((pos) => {
              const posA = teamA.positional_breakdown[pos] || { count: 0, total_value: 0 };
              const posB = teamB.positional_breakdown[pos] || { count: 0, total_value: 0 };
              const diff = posA.total_value - posB.total_value;
              const totalBoth = posA.total_value + posB.total_value;
              const shareA = totalBoth > 0 ? (posA.total_value / totalBoth) * 100 : 50;

              return (
                <div
                  key={pos}
                  className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                      {pos} Group
                    </span>
                    <span
                      className={`text-[11px] font-mono font-bold ${
                        diff >= 0 ? 'text-cyan-400' : 'text-amber-400'
                      }`}
                    >
                      {diff >= 0 ? `+${diff.toLocaleString()} Team A` : `+${Math.abs(diff).toLocaleString()} Team B`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono py-1">
                    <span className="text-cyan-400 font-semibold">
                      {posA.total_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">({posA.count})</span>
                    </span>
                    <span className="text-zinc-600">vs</span>
                    <span className="text-amber-400 font-semibold">
                      {posB.total_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">({posB.count})</span>
                    </span>
                  </div>

                  {/* Split Visual Bar */}
                  <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden flex mt-2 border border-zinc-800">
                    <div
                      style={{ width: `${shareA}%` }}
                      className="bg-cyan-500 h-full"
                    />
                    <div
                      style={{ width: `${100 - shareA}%` }}
                      className="bg-amber-500 h-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Side-by-Side Asset Ledger */}
      {teamB && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 md:p-5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
            <h4 className="text-sm font-bold text-white tracking-tight font-mono uppercase flex items-center gap-2">
              Side-by-Side Asset Ledger
            </h4>
            <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-800 p-0.5 text-xs font-medium">
              <button
                onClick={() => setActiveLedgerTab('starters')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeLedgerTab === 'starters'
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Top Starters
              </button>
              <button
                onClick={() => setActiveLedgerTab('bench')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeLedgerTab === 'bench'
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Bench Assets
              </button>
              <button
                onClick={() => setActiveLedgerTab('all')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeLedgerTab === 'all'
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Full Roster
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
            {/* Team A Column */}
            <div className="p-4">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-800/80">
                <span className="text-xs font-bold font-mono text-cyan-400">
                  {teamA.roster.franchise_name || 'Team A'} ({activeLedgerTab})
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  {activeLedgerTab === 'starters' ? `${teamA.starters.length} starters` : `${teamA.players.length} total`}
                </span>
              </div>

              <div className="space-y-2">
                {(activeLedgerTab === 'starters' ? teamA.starters : activeLedgerTab === 'bench' ? teamA.bench : teamA.players).map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/60 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {p.position}
                      </span>
                      <span className="font-semibold text-white">{p.full_name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{p.nfl_team}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-zinc-400 text-[11px]">{p.age.toFixed(1)}y</span>
                      <span className="font-bold text-cyan-300">
                        {p.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">pts</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team B Column */}
            <div className="p-4">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-800/80">
                <span className="text-xs font-bold font-mono text-amber-400">
                  {teamB.roster.franchise_name || 'Team B'} ({activeLedgerTab})
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  {activeLedgerTab === 'starters' ? `${teamB.starters.length} starters` : `${teamB.players.length} total`}
                </span>
              </div>

              <div className="space-y-2">
                {(activeLedgerTab === 'starters' ? teamB.starters : activeLedgerTab === 'bench' ? teamB.bench : teamB.players).map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/60 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {p.position}
                      </span>
                      <span className="font-semibold text-white">{p.full_name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{p.nfl_team}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-zinc-400 text-[11px]">{p.age.toFixed(1)}y</span>
                      <span className="font-bold text-amber-300">
                        {p.market_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">pts</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
