import { RosterRecord } from '../../types';
import { LeagueAdapter } from './leagueAdapter';
import { NormalizationEngine } from '../normalization';

export class SleeperClientAdapter implements LeagueAdapter {
  private static playersCache: Map<string, { full_name: string; position: string; team: string; age: number }> = new Map();
  private static cacheInitialized = false;

  public static async initPlayersCache(): Promise<void> {
    if (this.cacheInitialized) return;

    try {
      // Check localStorage for previously stored minimized cache
      const stored = localStorage.getItem('dynasty_sleeper_players_min');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, data] of Object.entries(parsed)) {
          this.playersCache.set(id, data as any);
        }
        this.cacheInitialized = true;
        return;
      }
    } catch {
      // Ignore localStorage errors in restricted environments
    }

    this.cacheInitialized = true;
  }

  public static getPlayerData(playerId: string) {
    return this.playersCache.get(playerId);
  }

  async fetchLeagueRosters(leagueId: string): Promise<RosterRecord[]> {
    const cleanId = leagueId.trim();
    const [rostersRes, usersRes, leagueRes] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${cleanId}/rosters`),
      fetch(`https://api.sleeper.app/v1/league/${cleanId}/users`),
      fetch(`https://api.sleeper.app/v1/league/${cleanId}`),
    ]);

    if (!rostersRes.ok) {
      throw new Error(`Sleeper API returned status ${rostersRes.status}`);
    }

    const rostersData = await rostersRes.json();
    const usersData = usersRes.ok ? await usersRes.json() : [];
    const leagueData = leagueRes.ok ? await leagueRes.json() : {};

    const leagueName = leagueData.name || `Sleeper League ${cleanId}`;
    const userMap = new Map<string, any>();
    if (Array.isArray(usersData)) {
      usersData.forEach((u) => {
        if (u && u.user_id) userMap.set(u.user_id, u);
      });
    }

    const records: RosterRecord[] = [];
    if (Array.isArray(rostersData)) {
      for (const r of rostersData) {
        const rosterId = String(r.roster_id || '');
        const ownerId = String(r.owner_id || '');
        const user = userMap.get(ownerId);
        const franchiseName =
          user?.metadata?.team_name || user?.display_name || `Team ${rosterId}`;

        records.push({
          roster_id: rosterId,
          platform: 'sleeper',
          external_league_id: cleanId,
          franchise_id: ownerId || rosterId,
          player_ids: (r.players || []).map(String),
          valuation_mode: 'auction_desc',
          league_name: leagueName,
          franchise_name: franchiseName,
          starters: (r.starters || []).map(String),
          taxi_ids: (r.taxi || []).map(String),
          reserve_ids: (r.reserve || []).map(String),
        });
      }
    }

    return records;
  }

  async fetchRoster(leagueId: string, identifier: string): Promise<RosterRecord> {
    const rosters = await this.fetchLeagueRosters(leagueId);
    if (!rosters || rosters.length === 0) {
      throw new Error(`No rosters found for Sleeper League ${leagueId}`);
    }

    const normTarget = NormalizationEngine.normalizeString(identifier);

    // 1. Direct ID match
    for (const r of rosters) {
      if (r.franchise_id === identifier || r.roster_id === identifier) {
        return r;
      }
    }

    // 2. Franchise name normalized match
    for (const r of rosters) {
      if (NormalizationEngine.normalizeString(r.franchise_name || '') === normTarget) {
        return r;
      }
    }

    // 3. Sleeper username lookup
    try {
      const userRes = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(identifier)}`);
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData?.user_id) {
          const match = rosters.find((r) => r.franchise_id === userData.user_id);
          if (match) return match;
        }
      }
    } catch {
      // Continue to fallback
    }

    // Return the first roster if not specified
    return rosters[0];
  }
}
