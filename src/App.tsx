import React from 'react';
import { RosterProvider, useRoster, type DashboardViewMode } from './context/RosterContext';
import { LiveSyncCard } from './components/LiveSyncCard';
import { RosterDashboard } from './components/RosterDashboard';
import { RosterOptimizationView } from './components/RosterOptimizationView';
import { HeadToHeadComparisonView } from './components/HeadToHeadComparisonView';
import { TradeBuilder } from './components/TradeBuilder';
import { LeagueBar } from './components/LeagueBar';
import { LeaguePowerRankingsView } from './components/LeaguePowerRankingsView';
import { SEASON } from './lib/season';
import { ArrowLeftRight, Dna, Link2, Shield, Trophy } from 'lucide-react';

type Destination = 'team' | 'league' | 'trade' | 'connect';

const DESTINATIONS: { id: Destination; label: string; icon: React.FC<{ className?: string }>; views: DashboardViewMode[] }[] = [
  { id: 'team', label: 'My team', icon: Shield, views: ['single', 'optimization'] },
  { id: 'league', label: 'League', icon: Trophy, views: ['league', 'compare'] },
  { id: 'trade', label: 'Trade', icon: ArrowLeftRight, views: ['trade'] },
  { id: 'connect', label: 'Connect', icon: Link2, views: ['ingest'] },
];

const destinationOf = (view: DashboardViewMode): Destination =>
  DESTINATIONS.find((d) => d.views.includes(view))?.id ?? 'connect';

/** Two-way switch inside a destination (e.g. Overview / Moves). */
const SubTabs: React.FC<{ options: { view: DashboardViewMode; label: string; badge?: number }[] }> = ({ options }) => {
  const { activeView, setActiveView } = useRoster();
  return (
    <div role="tablist" className="grid grid-flow-col auto-cols-fr rounded-lg bg-zinc-900 p-1 border border-zinc-800 text-sm sm:inline-grid">
      {options.map((o) => (
        <button
          key={o.view}
          role="tab"
          type="button"
          aria-selected={activeView === o.view}
          onClick={() => setActiveView(o.view)}
          className={`px-4 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            activeView === o.view ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {o.label}
          {!!o.badge && (
            <span className="min-w-5 px-1.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-semibold">{o.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { activeView, setActiveView, evaluation } = useRoster();
  const current = destinationOf(activeView);
  const go = (d: Destination) => setActiveView(DESTINATIONS.find((x) => x.id === d)!.views[0]);
  const needsLeague = (d: Destination) => d !== 'connect' && !evaluation;

  const navButton = (d: (typeof DESTINATIONS)[number], variant: 'top' | 'bottom') => {
    const Icon = d.icon;
    const active = current === d.id;
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => go(d.id)}
        disabled={needsLeague(d.id)}
        aria-current={active ? 'page' : undefined}
        className={
          variant === 'top'
            ? `px-3.5 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-40 ${
                active ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-100'
              }`
            : `flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] transition-colors disabled:opacity-40 ${
                active ? 'text-cyan-400 font-semibold' : 'text-zinc-400'
              }`
        }
      >
        <Icon className={variant === 'top' ? 'w-4 h-4' : 'w-5 h-5'} />
        {d.label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-zinc-100 flex flex-col overflow-x-clip selection:bg-cyan-500 selection:text-slate-950">
      <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => go(evaluation ? 'team' : 'connect')}
            className="flex items-center gap-2.5 min-w-0 text-left"
          >
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 p-0.5 shrink-0">
              <span className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
                <Dna className="w-4 h-4 text-cyan-400" />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block font-extrabold tracking-tight text-white leading-tight">Dynasty Futures</span>
              <span className="block text-[11px] text-zinc-400 truncate">
                {SEASON.seasonYear} season · next draft {SEASON.upcomingDraftYear}
              </span>
            </span>
          </button>
          <nav aria-label="Main" className="hidden md:flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {DESTINATIONS.map((d) => navButton(d, 'top'))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-28 md:pb-6">
        {evaluation && current !== 'connect' && <LeagueBar />}

        {current === 'connect' && (
          <section aria-label="Connect your league" className="space-y-4">
            <LiveSyncCard />
            {evaluation && (
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                <span className="text-zinc-300">
                  Currently loaded: <strong className="text-white">{evaluation.roster.franchise_name}</strong>
                </span>
                <button type="button" onClick={() => go('team')} className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold">
                  Back to my team
                </button>
              </div>
            )}
          </section>
        )}

        {current === 'team' && (
          <section aria-label="My team" className="space-y-4 sm:space-y-6">
            <SubTabs
              options={[
                { view: 'single', label: 'Overview' },
                { view: 'optimization', label: 'Moves', badge: evaluation?.remediations?.length },
              ]}
            />
            {activeView === 'single' ? <RosterDashboard /> : <RosterOptimizationView />}
          </section>
        )}

        {current === 'league' && (
          <section aria-label="League" className="space-y-4 sm:space-y-6">
            <SubTabs
              options={[
                { view: 'league', label: 'Rankings' },
                { view: 'compare', label: 'Head-to-head' },
              ]}
            />
            {activeView === 'league' ? <LeaguePowerRankingsView /> : <HeadToHeadComparisonView />}
          </section>
        )}

        {current === 'trade' && (
          <section aria-label="Trade">
            <TradeBuilder />
          </section>
        )}
      </main>

      <footer className="hidden md:block border-t border-zinc-900 bg-zinc-950 py-6 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between gap-2">
          <span>Dynasty Futures</span>
          <span>
            Market values:{' '}
            <a href="https://github.com/dynastyprocess/data" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-zinc-300">
              DynastyProcess
            </a>
            {evaluation?.values_meta?.scrape_date ? `, updated ${evaluation.values_meta.scrape_date}` : ''}
          </span>
        </div>
      </footer>

      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 flex pb-[env(safe-area-inset-bottom)]"
      >
        {DESTINATIONS.map((d) => navButton(d, 'bottom'))}
      </nav>
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
