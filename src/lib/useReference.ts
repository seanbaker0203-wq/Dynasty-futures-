import { useMemo } from 'react';
import { useAccount } from '../context/AccountContext';
import { useRoster } from '../context/RosterContext';
import { makeReference, type Reference } from './referenceValues';
import type { DraftPick, MasterPlayer } from '../types';

/** Everyone in the league (rosters + free agents) and every pick, deduplicated. */
export function useLeagueUniverse() {
  const { evaluation } = useRoster();
  return useMemo(() => {
    const players = new Map<string, MasterPlayer>();
    const picks = new Map<string, DraftPick>();
    if (!evaluation) return { players: [] as MasterPlayer[], picks: [] as DraftPick[] };
    for (const p of evaluation.players) players.set(p.id, p);
    for (const t of evaluation.league_teams || []) {
      for (const p of [...t.starters, ...t.bench, ...(t.reserves || [])]) if (!players.has(p.id)) players.set(p.id, p);
      for (const k of t.draft_picks) picks.set(k.id, k);
    }
    for (const p of evaluation.free_agents || []) if (!players.has(p.id)) players.set(p.id, p);
    for (const k of evaluation.draft_picks || []) picks.set(k.id, k);
    return { players: [...players.values()], picks: [...picks.values()] };
  }, [evaluation]);
}

/** The value source your league mates use, mapped onto our scale (null when not available). */
export function useReference(): Reference | null {
  const { reference } = useAccount();
  const universe = useLeagueUniverse();
  return useMemo(() => makeReference(reference.source, reference.imported, universe), [reference, universe]);
}
