import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { apiPost } from '../lib/api';
import { fmt } from '../lib/leagueStats';
import type { TradeItem } from '../types';

interface MyTrade {
  id: string;
  date: string;
  season: number;
  partner: string;
  got: TradeItem[];
  gave: TradeItem[];
  got_value: number;
  gave_value: number;
  net: number;
  verdict: 'won' | 'lost' | 'even';
}
interface LeagueTrades {
  platform: string;
  league_id: string;
  name: string;
  unsupported?: boolean;
  error?: string;
  superflex?: boolean;
  trades: MyTrade[];
}

const VERDICT: Record<MyTrade['verdict'], { label: string; cls: string }> = {
  won: { label: 'Winning', cls: 'text-up' },
  lost: { label: 'Losing', cls: 'text-down' },
  even: { label: 'Even', cls: 'text-muted' },
};

const Items: React.FC<{ items: TradeItem[] }> = ({ items }) => (
  <span>
    {items.map((it, i) => (
      <React.Fragment key={i}>
        {i > 0 && ', '}
        {it.label}
        {it.position && <span className="text-muted text-[12px]"> {it.position}</span>}
        <span className="text-muted text-[12px]"> {fmt(it.value)}</span>
      </React.Fragment>
    ))}
  </span>
);

/** Trade → My trades: every trade you made in your saved leagues, and who's ahead on today's values. */
export const MyTradesScreen: React.FC = () => {
  const { syncHistory } = useRoster();
  const [data, setData] = useState<LeagueTrades[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState('all');
  const key = syncHistory.map((h) => `${h.platform}:${h.league_id}:${h.franchise_id ?? ''}`).join(',');

  useEffect(() => {
    if (!syncHistory.length) return;
    const ac = new AbortController();
    setData(null);
    setError(null);
    apiPost<{ leagues: LeagueTrades[] }>(
      '/api/trades/mine',
      {
        leagues: syncHistory.map((h) => ({
          platform: h.platform,
          league_id: h.league_id,
          franchise_id: h.franchise_id,
          username: h.username,
          format: h.format,
          league_name: h.league_name,
        })),
      },
      ac.signal
    )
      .then((d) => setData(d.leagues))
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const all = useMemo(
    () =>
      (data ?? [])
        .flatMap((l, i) => l.trades.map((t) => ({ ...t, league: l.name, li: i })))
        .filter((t) => league === 'all' || String(t.li) === league)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data, league]
  );

  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your trades
      </p>
    );

  const record = { won: all.filter((t) => t.verdict === 'won').length, lost: all.filter((t) => t.verdict === 'lost').length, even: all.filter((t) => t.verdict === 'even').length };
  const net = all.reduce((s, t) => s + t.net, 0);
  const skipped = data.filter((l) => l.unsupported || l.error);

  return (
    <div className="space-y-5">
      <p className="text-[14px] text-muted">
        Every trade you made in the last three seasons, scored on today's Futures Values. Picks already used count as the same pick in
        the next draft.
      </p>

      <dl className="grid grid-cols-3 gap-2 text-[13px]">
        {[
          ['Trades', String(all.length)],
          ['Winning · losing · even', `${record.won} · ${record.lost} · ${record.even}`],
          ['Net value today', `${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-card px-2.5 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className={`font-semibold text-[15px] ${k.startsWith('Net') ? (net >= 0 ? 'text-up' : 'text-down') : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>

      {data.length > 1 && (
        <select value={league} onChange={(e) => setLeague(e.target.value)} className="field !w-auto" aria-label="League">
          <option value="all">All leagues</option>
          {data.map((l, i) => (
            <option key={i} value={String(i)} disabled={!l.trades.length}>
              {l.name} ({l.trades.length})
            </option>
          ))}
        </select>
      )}

      {all.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {all.map((t) => (
            <li key={`${t.li}-${t.id}`} className="py-3 text-[14px] space-y-1">
              <div className="flex items-baseline gap-3">
                <span className="flex-1 min-w-0 text-[12px] text-muted truncate">
                  {t.date} · with {t.partner}
                  {data.length > 1 ? ` · ${t.league}` : ''}
                </span>
                <span className={`shrink-0 font-semibold ${VERDICT[t.verdict].cls}`}>
                  {VERDICT[t.verdict].label} {t.verdict !== 'even' && `${t.net > 0 ? '+' : '−'}${fmt(Math.abs(t.net))}`}
                </span>
              </div>
              <div>
                <span className="text-muted text-[12px]">You got </span>
                <Items items={t.got} />
              </div>
              <div>
                <span className="text-muted text-[12px]">You gave </span>
                <Items items={t.gave} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No trades found in your saved leagues.</p>
      )}

      {skipped.length > 0 && (
        <p className="text-[12px] text-muted">
          Not included:{' '}
          {skipped.map((l) => `${l.name} (${l.unsupported ? 'trade history is Sleeper and MFL only for now' : l.error})`).join('; ')}.
        </p>
      )}
    </div>
  );
};
