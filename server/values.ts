/**
 * Player & pick market values from DynastyProcess (github.com/dynastyprocess/data),
 * refreshed daily. Every player carries Sleeper and MFL ids so rosters resolve
 * by id — never by fuzzy name matching.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchText } from './http';

const RAW_BASE = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files';
const BUNDLED_PATH = path.resolve(process.cwd(), 'data', 'values.json');
const REFRESH_MS = 24 * 60 * 60 * 1000;

export interface ValuedPlayer {
  id: string; // fp_<fantasypros id>
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  draft_year: number | null;
  value_1qb: number;
  value_sf: number;
  ecr_1qb: number | null;
  ecr_sf: number | null;
  sleeper_id: string | null;
  mfl_id: string | null;
  ktc_id: string | null;
  birthdate: string | null;
}

export interface PickValue {
  name: string;
  value_1qb: number;
  value_sf: number;
}

export interface IdCrosswalkRow {
  mfl_id: string | null;
  sleeper_id: string | null;
  espn_id?: string | null;
  yahoo_id?: string | null;
  fleaflicker_id?: string | null;
  name: string;
  position: string;
  team: string | null;
  birthdate: string | null;
}

export interface ValuesSnapshot {
  source: string;
  scrape_date: string | null;
  built_at: string;
  players: ValuedPlayer[];
  picks: PickValue[];
  /** mfl_id -> sleeper_id etc. for every NFL player, valued or not (not in bundled file) */
  crosswalk?: IdCrosswalkRow[];
}

/** Minimal RFC-4180 CSV parser. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const clean = (v: string | undefined) => (v === undefined || v === '' || v === 'NA' ? null : v);
const num = (v: string | undefined) => {
  const c = clean(v);
  return c === null ? null : Number(c);
};

/** Builds a snapshot from the raw DynastyProcess CSV texts. */
export function buildSnapshot(valuesCsv: string, idsCsv: string): ValuesSnapshot {
  const idRows = parseCsv(idsCsv);
  const byFp = new Map(idRows.filter((r) => clean(r.fantasypros_id)).map((r) => [r.fantasypros_id, r]));
  const rows = parseCsv(valuesCsv);

  const players: ValuedPlayer[] = [];
  const picks: PickValue[] = [];
  let scrapeDate: string | null = null;

  for (const r of rows) {
    scrapeDate = scrapeDate || clean(r.scrape_date);
    if (r.pos === 'PICK') {
      picks.push({ name: r.player, value_1qb: num(r.value_1qb) ?? 0, value_sf: num(r.value_2qb) ?? 0 });
      continue;
    }
    const ids = byFp.get(r.fp_id) || ({} as Record<string, string>);
    players.push({
      id: `fp_${r.fp_id}`,
      name: r.player,
      position: r.pos,
      team: clean(r.team),
      age: num(r.age),
      draft_year: num(r.draft_year),
      value_1qb: num(r.value_1qb) ?? 0,
      value_sf: num(r.value_2qb) ?? 0,
      ecr_1qb: num(r.ecr_1qb),
      ecr_sf: num(r.ecr_2qb),
      sleeper_id: clean(ids.sleeper_id),
      mfl_id: clean(ids.mfl_id),
      ktc_id: clean(ids.ktc_id),
      birthdate: clean(ids.birthdate),
    });
  }

  const crosswalk: IdCrosswalkRow[] = idRows
    .filter((r) => clean(r.mfl_id) || clean(r.sleeper_id))
    .map((r) => ({
      mfl_id: clean(r.mfl_id),
      sleeper_id: clean(r.sleeper_id),
      espn_id: clean(r.espn_id),
      yahoo_id: clean(r.yahoo_id),
      fleaflicker_id: clean(r.fleaflicker_id),
      name: r.name,
      position: r.position,
      team: clean(r.team),
      birthdate: clean(r.birthdate),
    }));

  return {
    source: 'DynastyProcess (github.com/dynastyprocess/data), derived from FantasyPros ECR',
    scrape_date: scrapeDate,
    built_at: new Date().toISOString(),
    players,
    picks,
    crosswalk,
  };
}

const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };

export class ValueStore {
  private snapshot: ValuesSnapshot;
  private byKey = new Map<string, ValuedPlayer>();
  private bySleeper = new Map<string, ValuedPlayer>();
  private byMfl = new Map<string, ValuedPlayer>();
  private crosswalkByMfl = new Map<string, IdCrosswalkRow>();
  private pickByName = new Map<string, PickValue>();
  private lastRefresh = 0;

  constructor() {
    this.snapshot = JSON.parse(fs.readFileSync(BUNDLED_PATH, 'utf8'));
    this.index();
  }

  private index() {
    this.bySleeper.clear();
    this.byMfl.clear();
    this.pickByName.clear();
    this.byKey.clear();
    for (const p of this.snapshot.players) {
      this.byKey.set(p.id, p);
      if (p.sleeper_id) this.bySleeper.set(p.sleeper_id, p);
      if (p.mfl_id) this.byMfl.set(p.mfl_id, p);
    }
    if (this.snapshot.crosswalk) {
      this.crosswalkByMfl.clear();
      for (const r of this.snapshot.crosswalk) if (r.mfl_id) this.crosswalkByMfl.set(r.mfl_id, r);
      this.otherIndex = null;
    }
    for (const pk of this.snapshot.picks) this.pickByName.set(pk.name.toLowerCase(), pk);
  }

  /** Pulls today's values; keeps the previous snapshot if anything fails. */
  async refresh(force = false): Promise<void> {
    if (!force && Date.now() - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = Date.now();
    try {
      const [valuesCsv, idsCsv] = await Promise.all([
        fetchText(`${RAW_BASE}/values.csv`),
        fetchText(`${RAW_BASE}/db_playerids.csv`),
      ]);
      const next = buildSnapshot(valuesCsv, idsCsv);
      if (next.players.length < 200) throw new Error(`only ${next.players.length} players in feed`);
      this.snapshot = next;
      this.index();
      console.log(`[values] refreshed: ${next.players.length} players, scraped ${next.scrape_date}`);
    } catch (err: any) {
      console.warn(`[values] refresh failed, keeping ${this.snapshot.scrape_date} values:`, err.message);
    }
  }

  startAutoRefresh() {
    this.refresh(true);
    setInterval(() => this.refresh(true), REFRESH_MS).unref();
  }

  get meta() {
    return {
      source: this.snapshot.source,
      scrape_date: this.snapshot.scrape_date,
      player_count: this.snapshot.players.length,
    };
  }

  get allPlayers(): ValuedPlayer[] {
    return this.snapshot.players;
  }

  byValueKey(id: string) {
    return this.byKey.get(id);
  }

  bySleeperId(id: string) {
    return this.bySleeper.get(id);
  }

  byMflId(id: string) {
    return this.byMfl.get(id);
  }

  /** Every id-crosswalk row (after first refresh). */
  allCrosswalk(): IdCrosswalkRow[] {
    return this.snapshot.crosswalk ?? [];
  }

  /** Sleeper id for another platform's player id (ESPN, Yahoo, Fleaflicker). */
  sleeperIdFor(platform: 'espn' | 'yahoo' | 'fleaflicker', id: string): string | null {
    if (!this.otherIndex) {
      this.otherIndex = new Map();
      for (const r of this.snapshot.crosswalk ?? []) {
        if (!r.sleeper_id) continue;
        if (r.espn_id) this.otherIndex.set(`espn:${r.espn_id}`, r.sleeper_id);
        if (r.yahoo_id) this.otherIndex.set(`yahoo:${r.yahoo_id}`, r.sleeper_id);
        if (r.fleaflicker_id) this.otherIndex.set(`fleaflicker:${r.fleaflicker_id}`, r.sleeper_id);
      }
    }
    return this.otherIndex.get(`${platform}:${id}`) ?? null;
  }
  private otherIndex: Map<string, string> | null = null;

  /** Name/position/sleeper id for any MFL player id, valued or not (after first refresh). */
  crosswalkForMfl(id: string) {
    return this.crosswalkByMfl.get(id);
  }

  /**
   * Value of a future rookie pick.
   * tier only applies where the feed prices Early/Mid/Late (the upcoming draft);
   * years beyond what the feed covers are discounted 10% per extra year.
   */
  pickValue(year: number, round: number, superflex: boolean, tier: 'Early' | 'Mid' | 'Late' = 'Mid'): number {
    const pick = (y: number, r: number, t?: string) =>
      this.pickByName.get(`${y} ${t ? `${t} ` : ''}${ORDINAL[r] ?? ''}`.toLowerCase());
    const val = (pk?: PickValue) => (pk ? (superflex ? pk.value_sf : pk.value_1qb) : undefined);

    if (round > 5) return Math.round((this.pickValue(year, 5, superflex, tier) || 0) * 0.5);

    const exact = val(pick(year, round, tier)) ?? val(pick(year, round));
    if (exact !== undefined) return exact;

    // Furthest-out year the feed prices for this round, discounted per extra year.
    const years = [...this.pickByName.keys()]
      .map((k) => k.match(/^(\d{4}) (?:early |mid |late )?(\w+)$/))
      .filter((m): m is RegExpMatchArray => !!m && m[2] === (ORDINAL[round] ?? '').toLowerCase())
      .map((m) => Number(m[1]));
    if (years.length === 0) return 0;
    const latest = Math.max(...years);
    if (year < Math.min(...years)) return 0;
    const base = val(pick(latest, round)) ?? 0;
    return Math.round(base * Math.pow(0.9, Math.max(0, year - latest)));
  }
}

export const valueStore = new ValueStore();
