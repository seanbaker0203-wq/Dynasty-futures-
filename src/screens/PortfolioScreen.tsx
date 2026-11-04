import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { apiPost } from '../lib/api';
import { fmt } from '../lib/leagueStats';

interface PortfolioLeague {
  platform: string;
  league_id: string;
  name: string;
  team_name: string | null;
  format: string;
  superflex: boolean;
  teams: number;
  ok: boolean;
  error?: string;
  value: number;
  players: number;
}
interface Holding {
  key: string;
  name: string;
  position: string;
  nfl_team: string | null;
  age: number | null;
  count: number;
  value: number;
  avg_value: number;
  in: { league: number; value: number; starter: boolean; designation: string | null }[];
}
interface Portfolio {
  leagues: PortfolioLeague[];
  holdings: Holding[];
  total_value: number;
  by_position: Record<string, { value: number; share: number; players: number }>;
  value_weighted_age: number | null;
  value_age_28_plus: number;
  top5_share: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
type Sort = 'value' | 'count';

/** My team → Portfolio: every player you own across your saved leagues. */
export const PortfolioScreen: React.FC = () => {
  const { syncHistory } = useRoster();
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('All');
  const [sort, setSort] = useState<Sort>('value');
  const [open, setOpen] = useState<string | null>(null);

  const key = syncHistory.map((h) => `${h.platform}:${h.league_id}:${h.franchise_id ?? ''}`).join(',');
  useEffect(() => {
    if (syncHistory.length < 2) return;
    const ac = new AbortController();
    setData(null);
    setError(null);
    apiPost<Portfolio>(
      '/api/portfolio',
      { leagues: syncHistory.map((h) => ({ platform: h.platform, league_id: h.league_id, franchise_id: h.franchise_id, username: h.username, format: h.format })) },
      ac.signal
    )
      .then(setData)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const okLeagues = data?.leagues.filter((l) => l.ok).length ?? 0;
  const shown = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.holdings
      .filter((h) => (pos === 'All' || h.position === pos) && (!term || h.name.toLowerCase().includes(term)))
      .sort((a, b) => (sort === 'count' ? b.count - a.count || b.value - a.value : b.value - a.value));
  }, [data, q, pos, sort]);

  if (syncHistory.length < 2)
    return <p className="text-muted">Connect a second league to see everything you own across your leagues in one place.</p>;
  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading all {syncHistory.length} leagues
      </p>
    );

  const multi = data.holdings.filter((h) => h.count >= 2);
  return (
    <div className="space-y-7">
      <section>
        <h2 className="display text-[24px] text-ink">Across {okLeagues} leagues</h2>
        <p className="text-[14px] text-muted">
          Each player is valued in his own league's format, so a Superflex QB counts for more than the same QB in 1QB.
        </p>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[13px]">
          {[
            ['Total value', fmt(data.total_value)],
            ['Players', String(data.holdings.length)],
            ['In 2+ leagues', String(multi.length)],
            ['Top 5 players’ share', pct(data.top5_share)],
            ['Value-weighted age', data.value_weighted_age != null ? data.value_weighted_age.toFixed(1) : '–'],
            ['Value in players 28+', pct(data.value_age_28_plus)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-card px-2.5 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold text-[15px]">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold mb-2">Value by position</h3>
        <div className="space-y-1.5">
          {POS_ORDER.filter((p) => data.by_position[p]).map((p) => {
            const b = data.by_position[p];
            return (
              <div key={p} className="flex items-center gap-3 text-[14px]">
                <span className="w-8 font-semibold">{p}</span>
                <span className="flex-1 h-2.5 rounded-full bg-line overflow-hidden">
                  <span className="block h-full bg-ink" style={{ width: `${Math.max(2, b.share * 100)}%` }} />
                </span>
                <span className="w-24 text-right text-muted">
                  {pct(b.share)} · {b.players}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold mb-2">Leagues</h3>
        <ul className="divide-y divide-line border-y border-line text-[14px]">
          {data.leagues.map((l, i) => (
            <li key={i} className="py-2 flex items-baseline gap-3">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{l.name}</span>
                <span className="block text-[12px] text-muted truncate">
                  {l.ok ? `${l.team_name} · ${l.teams} teams ${l.superflex ? 'SF' : '1QB'} ${l.format}` : l.error}
                </span>
              </span>
              <span className={`shrink-0 font-semibold ${l.ok ? '' : 'text-muted'}`}>{l.ok ? fmt(l.value) : '–'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold">Your players</h3>
        <label className="relative block">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your players" className="field !pl-9" aria-label="Search your players" />
        </label>
        <div className="flex flex-wrap gap-2 items-center">
          {['All', ...POS_ORDER].map((p) => (
            <button key={p} type="button" onClick={() => setPos(p)} className={`shrink-0 rounded-full border px-3.5 py-1 font-semibold text-[14px] ${pos === p ? 'border-ink bg-ink text-paper' : 'border-line text-muted'}`} aria-pressed={pos === p}>
              {p}
            </button>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field !w-auto ml-auto" aria-label="Sort">
            <option value="value">Most value</option>
            <option value="count">Most leagues</option>
          </select>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((h) => (
            <li key={h.key}>
              <button type="button" onClick={() => setOpen(open === h.key ? null : h.key)} aria-expanded={open === h.key} className="w-full flex items-center gap-3 py-2.5 text-left">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">
                    {h.name} <span className="text-[13px] font-medium text-muted">{h.position}</span>
                  </span>
                  <span className="block text-[13px] text-muted truncate">
                    {h.nfl_team || 'FA'}
                    {h.age ? `, ${Math.floor(h.age)}` : ''} · {h.count} of {okLeagues} leagues
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block display text-[20px] text-ink">{fmt(h.value)}</span>
                  <span className="block text-[12px] text-muted">{pct(data.total_value ? h.value / data.total_value : 0)} of total</span>
                </span>
              </button>
              {open === h.key && (
                <ul className="pb-3 text-[13px] space-y-1">
                  {h.in.map((x, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="truncate">
                        {data.leagues[x.league].name}
                        <span className="text-muted">
                          {x.designation ? ` · ${x.designation}` : x.starter ? ' · starting' : ''}
                        </span>
                      </span>
                      <span className="font-semibold shrink-0">{fmt(x.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
