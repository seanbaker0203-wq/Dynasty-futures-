import { RosterRecord } from '../../types';

export interface LeagueAdapter {
  fetchRoster(leagueId: string, identifier: string): Promise<RosterRecord>;
  fetchLeagueRosters(leagueId: string): Promise<RosterRecord[]>;
}
