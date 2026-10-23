import React from 'react';
import { RosterProvider, useRoster, type DashboardViewMode } from './context/RosterContext';
import { ConnectScreen } from './screens/ConnectScreen';
import { TeamScreen } from './screens/TeamScreen';
import { MovesScreen } from './screens/MovesScreen';
import { LeagueScreen } from './screens/LeagueScreen';
import { CompareScreen } from './screens/CompareScreen';
import { FreeAgentsScreen } from './screens/FreeAgentsScreen';
import { TradeScreen } from './screens/TradeScreen';
import { TradesScreen } from './screens/TradesScreen';
import { IdeasScreen } from './screens/IdeasScreen';
import { ValuesScreen } from './screens/ValuesScreen';
import { MoversScreen } from './screens/MoversScreen';
import { PlanScreen } from './screens/PlanScreen';
import { RulesScreen } from './screens/RulesScreen';
import { WeekScreen } from './screens/WeekScreen';
import { AccountProvider } from './context/AccountContext';
import { LeagueBar } from './components/LeagueBar';
import { ArrowLeftRight, LineChart, Link2, Shield, Trophy } from 'lucide-react';

type Destination = 'team' | 'league' | 'values' | 'trade' | 'connect';

const DESTINATIONS: { id: Destination; label: string; icon: React.FC<{ className?: string }>; views: DashboardViewMode[] }[] = [
  { id: 'team', label: 'My team', icon: Shield, views: ['single', 'week', 'plan', 'optimization', 'rules'] },
  { id: 'league', label: 'League', icon: Trophy, views: ['league', 'compare', 'trades', 'freeagents'] },
  { id: 'values', label: 'Values', icon: LineChart, views: ['values', 'movers'] },
  { id: 'trade', label: 'Trade', icon: ArrowLeftRight, views: ['trade', 'ideas'] },
  { id: 'connect', label: 'Connect', icon: Link2, views: ['ingest'] },
];

const destinationOf = (view: DashboardViewMode): Destination =>
  DESTINATIONS.find((d) => d.views.includes(view))?.id ?? 'connect';

/** Section switch inside a destination, e.g. Overview / Moves. */
const SubTabs: React.FC<{ options: { view: DashboardViewMode; label: string; count?: number }[] }> = ({ options }) => {
  const { activeView, setActiveView } = useRoster();
  return (
    <div role="tablist" className="flex gap-5 sm:gap-6 border-b border-line overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
      {options.map((o) => {
        const active = activeView === o.view;
        return (
          <button
            key={o.view}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => setActiveView(o.view)}
            className={`shrink-0 whitespace-nowrap -mb-px pb-2.5 pt-1 border-b-2 font-semibold transition-colors ${
              active ? 'border-gold text-ink' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {o.label}
            {!!o.count && <span className="ml-1.5 text-muted font-medium">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { activeView, setActiveView, evaluation } = useRoster();
  const current = destinationOf(activeView);
  const go = (d: Destination) => setActiveView(DESTINATIONS.find((x) => x.id === d)!.views[0]);
  const locked = (d: Destination) => d !== 'connect' && !evaluation;

  const navButton = (d: (typeof DESTINATIONS)[number], variant: 'top' | 'bottom') => {
    const Icon = d.icon;
    const active = current === d.id;
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => go(d.id)}
        disabled={locked(d.id)}
        aria-current={active ? 'page' : undefined}
        className={
          variant === 'top'
            ? `px-3 py-2 flex items-center gap-2 font-semibold border-b-2 transition-colors disabled:opacity-35 ${
                active ? 'border-gold text-ink' : 'border-transparent text-muted hover:text-ink'
              }`
            : `flex-1 min-w-0 flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-semibold transition-colors disabled:opacity-35 ${
                active ? 'text-ink' : 'text-muted'
              }`
        }
      >
        <Icon className={variant === 'top' ? 'w-4 h-4' : `w-[22px] h-[22px] ${active ? 'text-gold' : ''}`} />
        {d.label}
      </button>
    );
  };

  const wide = current === 'trade' || current === 'league' || current === 'values' || activeView === 'plan';

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <header className="bg-paper/90 backdrop-blur border-b border-line sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button type="button" onClick={() => go(evaluation ? 'team' : 'connect')} className="display text-[22px] text-ink uppercase">
            Dynasty Futures
          </button>
          <nav aria-label="Main" className="hidden md:flex items-center gap-2 self-stretch">
            {DESTINATIONS.map((d) => navButton(d, 'top'))}
          </nav>
        </div>
      </header>

      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-28 md:pb-10 space-y-5 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {evaluation && current !== 'connect' && <LeagueBar />}

        {current === 'connect' && <ConnectScreen onDone={() => go('team')} />}

        {current === 'team' && (
          <>
            <SubTabs
              options={[
                { view: 'single', label: 'Overview' },
                { view: 'week', label: 'This week' },
                { view: 'plan', label: 'Plan' },
                { view: 'optimization', label: 'Moves', count: evaluation?.remediations?.length },
                { view: 'rules', label: 'Rules' },
              ]}
            />
            {activeView === 'rules' && <RulesScreen />}
            {activeView === 'week' && <WeekScreen />}
            {activeView === 'single' && <TeamScreen />}
            {activeView === 'plan' && <PlanScreen />}
            {activeView === 'optimization' && <MovesScreen />}
          </>
        )}

        {current === 'league' && (
          <>
            <SubTabs
              options={[
                { view: 'league', label: 'Rankings' },
                { view: 'compare', label: 'Compare' },
                { view: 'trades', label: 'Trades' },
                { view: 'freeagents', label: 'Free agents' },
              ]}
            />
            {activeView === 'trades' && <TradesScreen />}
            {activeView === 'league' && <LeagueScreen />}
            {activeView === 'compare' && <CompareScreen />}
            {activeView === 'freeagents' && <FreeAgentsScreen />}
          </>
        )}

        {current === 'values' && (
          <>
            <SubTabs
              options={[
                { view: 'values', label: 'Rankings' },
                { view: 'movers', label: 'Movers' },
              ]}
            />
            {activeView === 'values' ? <ValuesScreen /> : <MoversScreen />}
          </>
        )}

        {current === 'trade' && (
          <>
            <SubTabs
              options={[
                { view: 'trade', label: 'Builder' },
                { view: 'ideas', label: 'Ideas' },
              ]}
            />
            {activeView === 'ideas' ? <IdeasScreen /> : <TradeScreen />}
          </>
        )}
      </main>

      <footer className="hidden md:block border-t border-line py-6 text-sm text-muted">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between gap-2">
          <span>Dynasty Futures</span>
          <span>
            Futures Value blends our projections with{' '}
            <a href="https://fantasycalc.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
              FantasyCalc
            </a>{' '}
            and{' '}
            <a href="https://github.com/dynastyprocess/data" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
              DynastyProcess
            </a>
          </span>
        </div>
      </footer>

      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-line flex pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,61,46,0.06)]"
      >
        {DESTINATIONS.map((d) => navButton(d, 'bottom'))}
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <AccountProvider>
      <RosterProvider>
        <AppContent />
      </RosterProvider>
    </AccountProvider>
  );
}
