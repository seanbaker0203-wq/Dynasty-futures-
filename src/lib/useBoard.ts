import { useEffect, useState } from 'react';
import type { BoardPlayer, LeagueSettings } from '../types';

export interface BoardResponse {
  built_at: number;
  season: number;
  weights: { model: number; market: number; experts: number };
  sources: { market: boolean; experts: boolean; production_season: number | null };
  players: BoardPlayer[];
}

// One fetch per league format per page load, shared by Rankings and Movers.
const cache = new Map<string, Promise<BoardResponse>>();

export function useBoard(settings: LeagueSettings | undefined) {
  const key = settings ? JSON.stringify([settings.superflex, settings.league_size, settings.scoring_type, settings.te_premium, settings.slots]) : '';
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    let live = true;
    if (!cache.has(key)) {
      cache.set(
        key,
        fetch('/api/values/board', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings }),
        }).then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error || `Couldn't load values (${r.status}).`);
          return body as BoardResponse;
        })
      );
    }
    cache
      .get(key)!
      .then((d) => live && setData(d))
      .catch((e) => {
        cache.delete(key);
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [key]);

  return { data, error, loading: !data && !error };
}
