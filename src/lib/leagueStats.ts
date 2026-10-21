import type { DraftPick, LeagueTeamSummary, MasterPlayer } from '../types';

/** Plain-language names for the Roster DNA classifications. */
export const LABELS: Record<string, string> = {
  Juggernaut: 'Juggernaut',
  Contender: 'Contender',
  'Fraudulent Contender': 'Aging contender',
  'Middle of the Pack': 'Middle of the pack',
  'Productive Struggle': 'Young rebuild',
  'Total Rebuild': 'Full rebuild',
};

export const labelFor = (classification: string) => LABELS[classification] ?? classification;

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export const fmt = (n: number | undefined | null) => Math.round(n ?? 0).toLocaleString('en-US');

/** 14,676 -> "14.7k", 980 -> "980" */
export const fmtShort = (n: number | undefined | null) => {
  const v = Math.round(n ?? 0);
  return Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString('en-US');
};

/** 1-based rank of `teamId` when teams are sorted by `score`, highest first. */
export function rankBy(teams: LeagueTeamSummary[], teamId: string, score: (t: LeagueTeamSummary) => number): number {
  const sorted = [...teams].sort((a, b) => score(b) - score(a));
  return sorted.findIndex((t) => t.franchise_id === teamId) + 1;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

export function groupByPosition(players: MasterPlayer[]): [string, MasterPlayer[]][] {
  const groups = new Map<string, MasterPlayer[]>();
  for (const p of players) {
    const pos = p.position || 'Other';
    if (!groups.has(pos)) groups.set(pos, []);
    groups.get(pos)!.push(p);
  }
  for (const list of groups.values()) list.sort((a, b) => b.market_value - a.market_value);
  return [...groups.entries()].sort(
    (a, b) => (POSITION_ORDER.indexOf(a[0]) + 1 || 99) - (POSITION_ORDER.indexOf(b[0]) + 1 || 99)
  );
}

export function picksByYear(picks: DraftPick[]): [number, DraftPick[]][] {
  const years = new Map<number, DraftPick[]>();
  for (const p of picks) {
    if (!years.has(p.year)) years.set(p.year, []);
    years.get(p.year)!.push(p);
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]);
}

export const roundName = (r: number) => ordinal(r);

/** "2027 1st (early), from Team X" */
export function pickName(p: DraftPick, ownerId?: string): string {
  const tier = p.tier ? ` (${p.tier.toLowerCase()})` : '';
  const via = ownerId && p.original_owner_id !== ownerId ? `, from ${p.original_owner_name}` : '';
  return `${p.year} ${roundName(p.round)}${tier}${via}`;
}
