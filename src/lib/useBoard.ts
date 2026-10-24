import { useEffect, useState } from 'react';
import type { BoardPlayer, LeagueSettings } from '../types';
import { apiPost } from './api';
import { useAccount } from '../context/AccountContext';
import { useRoster } from '../context/RosterContext';

export interface BoardResponse {
  built_at: number;
  season: number;
  weights: { model: number; market: number; experts: number };
  sources: { market: boolean; experts: boolean; production_season: number | null };
  players: BoardPlayer[];
  /** True when signed out: only the top of the board plus your league's players */
  limited?: boolean;
}

// One fetch per league format per page load, shared by Rankings and Movers.
const cache = new Map<string, Promise<BoardResponse>>();

export function useBoard(settings: LeagueSettings | undefined) {
  const { session } = useAccount();
  const { leagueRequest } = useRoster();
  const lr = leagueRequest();
  const league = lr ? { platform: lr.platform, league_id: lr.league_id } : null;
  const key = settings
    ? JSON.stringify([settings.superflex, settings.league_size, settings.scoring_type, settings.te_premium, settings.slots, session?.user.id ?? null, league?.league_id ?? null])
    : '';
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    let live = true;
    if (!cache.has(key)) {
      cache.set(
        key,
        apiPost<BoardResponse>('/api/values/board', { settings, league })
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
