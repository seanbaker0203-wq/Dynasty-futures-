/**
 * Sleeper's full NFL player directory (name, position, team, age) keyed by Sleeper id.
 * Refreshed daily and cached on disk so cold starts don't need the 5+ MB download.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson } from './http';

export interface PlayerInfo {
  full_name: string;
  position: string;
  team: string | null;
  age: number | null;
}

const CACHE_PATH = path.resolve(process.cwd(), 'cache', 'sleeper_players_min.json');
const REFRESH_MS = 24 * 60 * 60 * 1000;

export function ageFromBirthdate(birthdate: string | null | undefined, now = new Date()): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  return Math.round(((now.getTime() - b.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
}

/** "Ja'Marr Chase Jr." -> "jamarr chase" */
export const normName = (n: string) =>
  String(n || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'’`]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

class PlayerDirectory {
  private players = new Map<string, PlayerInfo>();
  private loadedAt = 0;

  constructor() {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      for (const [id, p] of Object.entries<any>(cached)) {
        this.players.set(id, { full_name: p.full_name, position: p.position, team: p.team ?? null, age: p.age ?? null });
      }
      this.loadedAt = fs.statSync(CACHE_PATH).mtimeMs;
    } catch {
      // No cache yet; first refresh fills it.
    }
  }

  get size() {
    return this.players.size;
  }

  get(id: string): PlayerInfo | undefined {
    return this.players.get(id);
  }

  /**
   * Sleeper id by name + position (fallback when another platform's id isn't in the crosswalk).
   * Prefers players currently on an NFL team, then the given team if any.
   */
  findByName(name: string, position: string, team?: string | null): string | null {
    if (!this.nameIndex || this.nameIndexFor !== this.players) {
      this.nameIndex = new Map();
      this.nameIndexFor = this.players;
      for (const [id, p] of this.players) {
        if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(p.position)) continue;
        const k = `${normName(p.full_name)}|${p.position}`;
        this.nameIndex.set(k, [...(this.nameIndex.get(k) || []), id]);
      }
    }
    const ids = this.nameIndex.get(`${normName(name)}|${position === 'PK' ? 'K' : position}`) || [];
    if (ids.length <= 1) return ids[0] ?? null;
    const onTeam = ids.filter((id) => this.players.get(id)?.team);
    return onTeam.find((id) => team && this.players.get(id)?.team === team) ?? onTeam[0] ?? ids[0];
  }
  private nameIndex: Map<string, string[]> | null = null;
  private nameIndexFor: Map<string, PlayerInfo> | null = null;

  async refresh(force = false): Promise<void> {
    if (!force && this.players.size > 0 && Date.now() - this.loadedAt < REFRESH_MS) return;
    try {
      const data = await fetchJson<Record<string, any>>('https://api.sleeper.app/v1/players/nfl', { timeoutMs: 60000 });
      const next = new Map<string, PlayerInfo>();
      const out: Record<string, PlayerInfo> = {};
      for (const [id, p] of Object.entries(data)) {
        if (!p?.full_name && !p?.last_name) continue;
        const info: PlayerInfo = {
          full_name: p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          position: p.position || (p.fantasy_positions?.[0] ?? ''),
          team: p.team ?? null,
          age: ageFromBirthdate(p.birth_date) ?? (typeof p.age === 'number' ? p.age : null),
        };
        next.set(id, info);
        out[id] = info;
      }
      this.players = next;
      this.loadedAt = Date.now();
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, JSON.stringify(out));
      console.log(`[players] refreshed Sleeper directory: ${next.size} players`);
    } catch (err: any) {
      console.warn(`[players] Sleeper directory refresh failed (using ${this.players.size} cached):`, err.message);
    }
  }

  startAutoRefresh() {
    this.refresh();
    setInterval(() => this.refresh(true), REFRESH_MS).unref();
  }
}

export const playerDirectory = new PlayerDirectory();
