import React, { useMemo } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { useAccount } from '../context/AccountContext';
import { useBoard } from '../lib/useBoard';
import { fmt } from '../lib/leagueStats';
import { Change } from '../components/ValueBits';
import { ValueRow, useOwnership } from './ValuesScreen';

/** Values → Watchlist: players you starred, with how their value has moved since you added them. */
export const WatchlistScreen: React.FC = () => {
  const { evaluation } = useRoster();
  const { watchlist, toggleWatch, storage, error: accountError } = useAccount();
  const { data, error, loading } = useBoard(evaluation?.settings);
  const { owners, idOf, me } = useOwnership();
  const sf = evaluation?.settings?.superflex ? 'sf' : '1qb';

  const rows = useMemo(() => {
    if (!data) return [];
    const byKey = new Map(data.players.map((p) => [p.sleeper_id ?? (p.mfl_id ? `mfl:${p.mfl_id}` : p.id), p]));
    return watchlist.map((w) => ({ w, p: byKey.get(w.key) ?? null }));
  }, [data, watchlist]);

  if (!watchlist.length)
    return (
      <div className="space-y-2 text-[15px]">
        <p>Your watchlist is empty.</p>
        <p className="text-muted">
          In Values → Rankings, tap a player and choose <Star className="inline w-3.5 h-3.5 -mt-0.5" /> Watch. You'll see how his value moves
          from the day you added him, and his latest real trades.
        </p>
      </div>
    );
  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (loading || !data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading values
      </p>
    );

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">
        {watchlist.length} {watchlist.length === 1 ? 'player' : 'players'}. "Since added" compares today's Futures Value with the day you
        added him, in the same format. {storage === 'device' ? 'Saved on this device; sign in to keep it everywhere.' : ''}
      </p>
      {accountError && <p className="text-[13px] text-down">{accountError}</p>}
      <ul className="divide-y divide-line border-y border-line">
        {rows.map(({ w, p }) => {
          if (!p)
            return (
              <li key={w.key} className="flex items-center gap-3 py-3 sm:px-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">
                    {w.name} <span className="text-[13px] font-medium text-muted">{w.position}</span>
                  </span>
                  <span className="block text-[13px] text-muted">Not in the rankings you can see right now.</span>
                </span>
                <button type="button" className="text-[13px] text-muted underline" onClick={() => toggleWatch(w)}>
                  Remove
                </button>
              </li>
            );
          const since = w.format === sf && w.value_at_add ? (p.value - w.value_at_add) / w.value_at_add : null;
          const owner = owners.get(idOf(p));
          return (
            <ValueRow
              key={w.key}
              p={p}
              owner={owner?.name}
              mine={!!owner && owner.id === me}
              showRank={false}
              right={
                <span className="text-right shrink-0">
                  <span className="block display text-[22px] text-ink">{fmt(p.value)}</span>
                  <span className="block text-[12px] text-muted">
                    since added <Change value={since} className="font-semibold" />
                  </span>
                </span>
              }
            />
          );
        })}
      </ul>
      {watchlist.some((w) => w.format !== sf) && (
        <p className="text-[12px] text-muted">
          Some players were added while you viewed a {sf === 'sf' ? '1QB' : 'Superflex'} league. "Since added" shows only in the format
          you added them in.
        </p>
      )}
    </div>
  );
};
