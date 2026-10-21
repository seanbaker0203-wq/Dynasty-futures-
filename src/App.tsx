import React from 'react';
import { RosterProvider, useRoster } from './context/RosterContext';
import { LiveSyncCard } from './components/LiveSyncCard';
import { RosterDashboard } from './components/RosterDashboard';
import { WeeklySitStartView } from './components/WeeklySitStartView';
import { RosterOptimizationView } from './components/RosterOptimizationView';
import { HeadToHeadComparisonView } from './components/HeadToHeadComparisonView';
import { TradeBuilder } from './components/TradeBuilder';
import { MarketTracker } from './components/MarketTracker';
import { LeaguePowerRankingsView } from './components/LeaguePowerRankingsView';
import {
  Dna,
  Swords,
  Activity,
  ArrowLeftRight,
  TrendingUp,
  DownloadCloud,
  Calendar,
  Zap,
  RotateCcw,
  Trophy,
} from 'lucide-react';

const AppContent: React.FC = () => {
  const { activeView, setActiveView, comparisonEvaluation, evaluation } = useRoster();

  const remediationCount = evaluation?.remediations?.length || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-zinc-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Platform Tag */}
          <div
            onClick={() => setActiveView(evaluation ? 'single' : 'ingest')}
            className="flex items-center space-x-3 cursor-pointer select-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Dna className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">
                  Dynasty AI Evaluator
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold">
                  2026 In-Season
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-semibold hidden md:inline">
                  2027 Draft Priority
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-medium hidden sm:block">
                In-Season 2026 • 2027 Pick Priority • 'Flex for a 1st' Doctrine
              </p>
            </div>
          </div>

          {/* View Switcher Tabs */}
          <div className="flex items-center space-x-1 sm:space-x-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex items-center text-xs font-medium overflow-x-auto max-w-[calc(100vw-120px)]">
              {/* 1. Ingestion Engine */}
              <button
                type="button"
                onClick={() => setActiveView('ingest')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'ingest'
                    ? 'bg-zinc-800 text-cyan-400 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Roster Ingestion</span>
                <span className="lg:hidden">Ingest</span>
              </button>

              {/* 2. Dynasty Core Dashboard */}
              <button
                type="button"
                onClick={() => setActiveView('single')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'single'
                    ? 'bg-zinc-800 text-cyan-400 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Dynasty Core</span>
              </button>

              {/* 3. League Power Rankings & Trade Radar */}
              <button
                type="button"
                onClick={() => setActiveView('league')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'league'
                    ? 'bg-zinc-800 text-amber-400 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">League Radar</span>
                <span className="md:hidden">League</span>
              </button>

              {/* 4. Weekly Sit/Start Advisor */}
              <button
                type="button"
                onClick={() => setActiveView('sitstart')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'sitstart'
                    ? 'bg-zinc-800 text-emerald-400 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline">Sit / Start</span>
                <span className="md:hidden">Sit/Start</span>
              </button>

              {/* 4. Roster Optimization */}
              <button
                type="button"
                onClick={() => setActiveView('optimization')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'optimization'
                    ? 'bg-zinc-800 text-amber-400 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">Optimization</span>
                <span className="md:hidden">Optimize</span>
                {remediationCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-mono border border-amber-500/40 font-bold">
                    {remediationCount}
                  </span>
                )}
              </button>

              {/* 5. Head-to-Head */}
              <button
                type="button"
                onClick={() => setActiveView('compare')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'compare'
                    ? 'bg-zinc-800 text-amber-300 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Head-to-Head</span>
                <span className="xl:hidden">H2H</span>
                {comparisonEvaluation && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>

              {/* 6. Trade Builder */}
              <button
                type="button"
                onClick={() => setActiveView('trade')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'trade'
                    ? 'bg-zinc-800 text-emerald-400 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Trade Builder</span>
                <span className="xl:hidden">Trade</span>
              </button>

              {/* 7. Market Trends */}
              <button
                type="button"
                onClick={() => setActiveView('market')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeView === 'market'
                    ? 'bg-zinc-800 text-emerald-300 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xl:inline">Market Radar</span>
                <span className="xl:hidden">Market</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* VIEW 1: Roster Ingestion (First page on arrival) */}
        {activeView === 'ingest' && (
          <section aria-label="Roster Ingestion Engine" className="space-y-4">
            <LiveSyncCard />
            {evaluation && (
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-300">
                  Active evaluated portfolio: <strong className="text-white">{evaluation.roster.franchise_name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveView('single')}
                  className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono transition-colors cursor-pointer"
                >
                  Return to Dynasty Core &rarr;
                </button>
              </div>
            )}
          </section>
        )}

        {/* VIEW 2: Dynasty Core Dashboard (Main page once ingested) */}
        {activeView === 'single' && (
          <section aria-label="Roster DNA Dashboard" className="space-y-6">
            <RosterDashboard />
          </section>
        )}

        {/* VIEW 3: League Power Rankings & Trade Radar */}
        {activeView === 'league' && (
          <section aria-label="League Power Rankings and Trade Radar">
            <LeaguePowerRankingsView />
          </section>
        )}

        {/* VIEW 4: Weekly Sit / Start Advisor */}
        {activeView === 'sitstart' && (
          <section aria-label="Weekly Sit Start Advisor">
            <WeeklySitStartView />
          </section>
        )}

        {/* VIEW 4: Roster Optimization & Remediation Engine */}
        {activeView === 'optimization' && (
          <section aria-label="Roster Optimization Engine">
            <RosterOptimizationView />
          </section>
        )}

        {/* VIEW 5: Head-to-Head Comparison */}
        {activeView === 'compare' && (
          <section aria-label="Head-to-Head Roster Comparison">
            <HeadToHeadComparisonView />
          </section>
        )}

        {/* VIEW 6: Trade Builder and Simulation */}
        {activeView === 'trade' && (
          <section aria-label="Trade Builder and Simulation">
            <TradeBuilder />
          </section>
        )}

        {/* VIEW 7: Market Trends and Trade Signals */}
        {activeView === 'market' && (
          <section aria-label="Market Trends and Trade Signals">
            <MarketTracker />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-center text-xs text-zinc-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Dynasty AI Evaluator • 2026 Roster DNA & Lineup Allocation Architecture</span>
          <div className="flex items-center gap-4">
            <span className="text-zinc-600">|</span>
            <span className="text-cyan-400/80">Lineup-Slot Allocation</span>
            <span className="text-zinc-600">|</span>
            <span className="text-emerald-400/80">Weekly Sit/Start Projections</span>
            <span className="text-zinc-600">|</span>
            <span className="text-amber-400/80">Diagnostic Roster Remediation</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <RosterProvider>
      <AppContent />
    </RosterProvider>
  );
}
