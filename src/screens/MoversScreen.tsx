import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { useBoard } from '../lib/useBoard';
import { fmt } from '../lib/leagueStats';
import { Change, Sparkline } from '../components/ValueBits';
import { ValueRow, useOwnership } from './ValuesScreen';
import type { BoardPlayer } from '../types';

type Scope = 'all' | 'league' | 'mine';

const Section: React.FC<{ title: string; note: string; children: React.ReactNode; empty: boolean }> = ({ title, note, children, empty }) => (
  <section className="space-y-1">
    <h2 className="display text-[24px] text-ink">{title}</h2>
    <p className="text-[14px] text-muted">{note}</p>
    {empty ? <p className="py-3 text-muted">Nothing right now.</p> : <ol className="divide-y divide-line border-y border-line">{children}</ol>}
  </section>
);

export const MoversScreen: React.FC = () => {
  const { evaluation } = useRoster();
  const { data, error, loading } = useBoard(evaluation?.settings);
  const { owners, idOf, me } = useOwnership();
  const [scope, setScope] = useState<Scope>('league');

  const lists = useMemo(() => {
    if (!data) return null;
    const inScope = (p: BoardPlayer) => {
      if (scope === 'all') return true;
      const o = owners.get(idOf(p));
      return scope === 'league' ? !!o : o?.id === me;
    };
    const ps = data.players.filter((p) => p.value >= 800 && inScope(p));
    const by = (f: (p: BoardPlayer) => number | null, dir: 1 | -1, n = 8) =>
      ps.filter((p) => f(p) != null && dir * f(p)! > 0).sort((a, b) => dir * (f(b)! - f(a)!)).slice(0, n);
    return {
      buyLow: ps.filter((p) => p.signal === 'BUY_LOW').sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0)).slice(0, 10),
      sellHigh: ps.filter((p) => p.signal === 'SELL_HIGH').sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0)).slice(0, 10),
      risers: by((p) => p.market_trend_30d, 1),
      fallers: by((p) => p.market_trend_30d, -1),
      expertUp: by((p) => p.expert_trend_4w, 1, 6),
      expertDown: by((p) => p.expert_trend_4w, -1, 6),
    };
  }, [data, scope, owners, idOf, me]);

  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (loading || !lists)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading value changes
      </p>
    );

  const row = (p: BoardPlayer, change: number | null) => {
    const o = owners.get(idOf(p));
    return (
      <ValueRow
        key={p.id}
        p={p}
        owner={o?.name}
        mine={!!o && o.id === me}
        showRank={false}
        right={
          <span className="flex items-center gap-3 shrink-0">
            <Sparkline values={p.expert_history.map((h) => h.value)} width={56} />
            <span className="text-right">
              <span className="block font-semibold">{fmt(p.value)}</span>
              <Change value={change} className="text-[13px] font-semibold" />
            </span>
          </span>
        }
      />
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-muted shrink-0">Show</span>
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="field sm:max-w-[15rem]" aria-label="Which players">
          <option value="league">Players in my league</option>
          <option value="mine">My team</option>
          <option value="all">All players</option>
        </select>
      </div>

      <Section
        title="Buy low"
        note="We value them above the market, and the market just dipped. Check injury news before you offer."
        empty={!lists.buyLow.length}
      >
        {lists.buyLow.map((p) => row(p, p.market_trend_30d))}
      </Section>

      <Section
        title="Sell high"
        note="We value them below the market, and the market just rose. A good time to shop them."
        empty={!lists.sellHigh.length}
      >
        {lists.sellHigh.map((p) => row(p, p.market_trend_30d))}
      </Section>

      <div className="grid md:grid-cols-2 gap-8">
        <Section title="Market risers" note="Biggest trade-market gains, last 30 days." empty={!lists.risers.length}>
          {lists.risers.map((p) => row(p, p.market_trend_30d))}
        </Section>
        <Section title="Market fallers" note="Biggest trade-market drops, last 30 days." empty={!lists.fallers.length}>
          {lists.fallers.map((p) => row(p, p.market_trend_30d))}
        </Section>
        <Section title="Experts moving up" note="Biggest gains in expert rankings, last 4 weeks." empty={!lists.expertUp.length}>
          {lists.expertUp.map((p) => row(p, p.expert_trend_4w))}
        </Section>
        <Section title="Experts moving down" note="Biggest drops in expert rankings, last 4 weeks." empty={!lists.expertDown.length}>
          {lists.expertDown.map((p) => row(p, p.expert_trend_4w))}
        </Section>
      </div>
    </div>
  );
};
