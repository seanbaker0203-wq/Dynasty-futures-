import type { LeagueSettings, Platform, RosterDesignation } from '../../src/types';

/** A player as the league platform knows them, before market values are applied. */
export interface LeaguePlayer {
  /** platform player id (Sleeper id or MFL id) */
  id: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  /** DynastyProcess id when we have a market value for this player */
  value_key: string | null;
}

export interface LeaguePickRef {
  year: number;
  round: number;
  original_team_id: string;
}

export interface LeagueTeam {
  team_id: string;
  name: string;
  owner_name?: string;
  player_ids: string[];
  starters: string[];
  designations: Record<string, RosterDesignation>;
  /** Salary-cap leagues: salary and contract years left per player */
  contracts?: Record<string, { salary: number; years: number | null }>;
  picks: LeaguePickRef[];
}

/** Platform-neutral league snapshot every adapter produces. */
export interface NormalizedLeague {
  platform: Platform;
  league_id: string;
  name: string;
  season: number;
  settings: LeagueSettings;
  teams: LeagueTeam[];
  players: Map<string, LeaguePlayer>;
  /** team_id of the requesting user, when we could identify it */
  user_team_id: string | null;
}

export class LeagueSyncError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
