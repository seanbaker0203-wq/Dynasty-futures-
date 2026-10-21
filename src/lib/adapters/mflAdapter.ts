import { RosterRecord } from '../../types';
import { LeagueAdapter } from './leagueAdapter';
import { NormalizationEngine } from '../normalization';

export class MFLClientAdapter implements LeagueAdapter {
  private year: string;
  private username?: string;
  private password?: string;
  private token?: string;

  constructor(year: string = '2026', username?: string, password?: string, token?: string) {
    this.year = year;
    this.username = username;
    this.password = password;
    this.token = token;
  }

  async fetchLeagueRosters(leagueId: string): Promise<RosterRecord[]> {
    const cleanId = leagueId.trim();

    // Use proxy route to bypass browser CORS and expired SSL certificates
    const proxyUrl = `/sync/mfl`;
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        league_id: cleanId,
        year: this.year,
        username: this.username,
        password: this.password,
        token: this.token,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to fetch MFL data (${res.status})`);
    }

    const data = await res.json();
    if (data.roster) return [data.roster];
    if (data.rosters) return data.rosters;

    return [];
  }

  async fetchRoster(leagueId: string, identifier: string): Promise<RosterRecord> {
    const cleanId = leagueId.trim();
    const proxyUrl = `/sync/mfl`;
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        league_id: cleanId,
        franchise_id: identifier,
        username: this.username || identifier,
        password: this.password,
        token: this.token,
        year: this.year,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to fetch MFL roster (${res.status})`);
    }

    const data = await res.json();
    if (data.roster) return data.roster;
    throw new Error(`No roster returned for MFL League ${leagueId}`);
  }
}
