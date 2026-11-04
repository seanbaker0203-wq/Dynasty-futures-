import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';

export interface MarketAsset {
  kind: 'player' | 'pick';
  id?: string;
  label: string;
  position?: string;
}
export interface MarketTrade {
  date: string;
  superflex: boolean;
  teams: number;
  ppr: number;
  te_premium: number;
  sides: MarketAsset[][];
}
interface MarketResponse {
  built: string | null;
  meta: { asof: string; trades: number } | null;
  trades: MarketTrade[];
}

async function getMarket(params: Record<string, string>, signal: AbortSignal): Promise<MarketResponse> {
  const r = await fetch(`/api/market/trades?${new URLSearchParams(params)}`, { signal });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error || `Request failed (${r.status}).`);
  return data as MarketResponse;
}

const scoring = (t: MarketTrade) =>
  `${t.teams}-team ${t.superflex ? 'SF' : '1QB'}${t.ppr >= 1 ? ' PPR' : t.ppr > 0 ? ' half PPR' : ''}${t.te_premium ? ` TE+${t.te_premium}` : ''}`;

const Side: React.FC<{ assets: MarketAsset[]; highlight?: string }> = ({ assets, highlight }) => (
  <span>
    {assets.map((a, i) => (
      <React.Fragment key={i}>
        {i > 0 && ', '}
        <span className={a.id && a.id === highlight ? 'font-semibold text-ink' : ''}>
          {a.label}
          {a.position && <span className="text-muted text-[12px]"> {a.position}</span>}
        </span>
      </React.Fragment>
    ))}
  </span>
);

export const TradeRow: React.FC<{ t: MarketTrade; highlight?: string }> = ({ t, highlight }) => (
  <li className="py-2.5 text-[14px]">
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-x-2">
      <Side assets={t.sides[0]} highlight={highlight} />
      <span className="text-muted text-[12px] sm:shrink-0">for</span>
      <Side assets={t.sides[1]} highlight={highlight} />
    </div>
    <div className="text-[12px] text-muted mt-0.5">
      {t.date} · {scoring(t)}
    </div>
  </li>
);

/** Recent real trades that included one player (inside the Values player detail). */
export const PlayerMarketTrades: React.FC<{ sleeperId: string | null; superflex: boolean }> = ({ sleeperId, superflex }) => {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sleeperId) return;
    const ac = new AbortController();
    getMarket({ player: sleeperId, sf: superflex ? '1' : '0', limit: '8' }, ac.signal)
      .then(setData)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
  }, [sleeperId, superflex]);
  if (!sleeperId) return null;
  if (error) return <p className="text-[13px] text-down">{error}</p>;
  if (!data) return <p className="text-[13px] text-muted flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Recent trades</p>;
  return (
    <div>
      <div className="text-[13px] font-semibold">Recent real trades ({superflex ? 'Superflex' : '1QB'} dynasty)</div>
      {data.trades.length ? (
        <ul className="divide-y divide-line">{data.trades.map((t, i) => <TradeRow key={i} t={t} highlight={sleeperId} />)}</ul>
      ) : (
        <p className="text-[13px] text-muted">No trades for him in our sample yet.</p>
      )}
    </div>
  );
};

/** Values → Market: the latest real trades in leagues like yours, searchable by player or pick. */
export const MarketScreen: React.FC<{ superflex: boolean }> = ({ superflex }) => {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    const ac = new AbortController();
    getMarket({ sf: superflex ? '1' : '0', limit: '100', ...(term ? { q: term } : {}) }, ac.signal)
      .then(setData)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
  }, [superflex, term]);
  const hit = useMemo(() => {
    const t = term.toLowerCase();
    return t && data ? data.trades.flatMap((x) => x.sides.flat()).find((a) => a.label.toLowerCase().includes(t))?.id : undefined;
  }, [data, term]);

  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading recent trades
      </p>
    );
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">
        Real {superflex ? 'Superflex' : '1QB'} dynasty trades from public Sleeper leagues, newest first
        {data.meta ? ` (${data.meta.trades.toLocaleString()} trades in the last year)` : ''}.
      </p>
      <label className="relative block">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Player or pick, e.g. Puka or 2027 1st" className="field !pl-9" aria-label="Search trades" />
      </label>
      {data.trades.length ? (
        <ul className="divide-y divide-line border-y border-line">{data.trades.map((t, i) => <TradeRow key={i} t={t} highlight={hit} />)}</ul>
      ) : (
        <p className="text-muted">No recent trades match.</p>
      )}
      <p className="text-[12px] text-muted">Only two-team trades are shown. League managers' names are never collected.</p>
    </div>
  );
};
