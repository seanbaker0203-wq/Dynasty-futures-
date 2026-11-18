/**
 * Usage: offensive snap share by week (nflverse snap counts, from Pro Football Reference) plus Sleeper's depth chart.
 * Snap share is the most direct read on a player's role. Depth charts lag reality, so we also rank teammates at the
 * same position by their last three games of snaps ("RB1 by snaps").
 */
import { fetchText } from '../http';
import { parseCsv, valueStore } from '../values';
import { playerDirectory } from '../players';

const TTL = 6 * 3600_000;
let cache: { at: number; season: number; p: Promise<UsageIndex> } | null = null;

interface Row {
  week: number;
  team: string;
  position: string;
  pct: number;
  snaps: number;
}
export interface PlayerUsage {
  team: string;
  position: string;
  weeks: { week: number; pct: number; snaps: number }[];
  season_pct: number;
  last3_pct: number;
  /** Last three games minus the season before them, in percentage points */
  trend: number | null;
  /** Rank among teammates at his position by last-three snap share (1 = most) */
  team_rank: number;
  depth: { position: string; order: number } | null;
}
interface UsageIndex {
  season: number;
  through_week: number;
  bySleeper: Map<string, PlayerUsage>;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number) => Math.round(x * 1000) / 10; // share 0-1 -> percent with one decimal

async function build(season: number): Promise<UsageIndex> {
  const csv = await fetchText(`https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`, { timeoutMs: 60000 });
  const pfrToSleeper = new Map<string, string>();
  for (const r of valueStore.allCrosswalk()) if (r.pfr_id && r.sleeper_id) pfrToSleeper.set(r.pfr_id, r.sleeper_id);

  const rows = new Map<string, Row[]>(); // sleeper id -> rows
  let through = 0;
  for (const r of parseCsv(csv)) {
    if (r.game_type !== 'REG' && r.game_type !== 'POST') continue;
    const pos = r.position === 'FB' ? 'RB' : r.position;
    if (!['QB', 'RB', 'WR', 'TE'].includes(pos)) continue;
    const week = Number(r.week);
    through = Math.max(through, week);
    const id = pfrToSleeper.get(r.pfr_player_id) ?? playerDirectory.findByName(r.player, pos, r.team);
    if (!id) continue;
    const list = rows.get(id) ?? rows.set(id, []).get(id)!;
    list.push({ week, team: r.team, position: pos, pct: Number(r.offense_pct) || 0, snaps: Number(r.offense_snaps) || 0 });
  }

  const bySleeper = new Map<string, PlayerUsage>();
  for (const [id, list] of rows) {
    list.sort((a, b) => a.week - b.week);
    const last = list[list.length - 1];
    const cur = list.filter((x) => x.team === last.team); // after a trade, his role on the new team
    const l3 = cur.slice(-3);
    const before = cur.slice(0, -3);
    const info = playerDirectory.get(id) as any;
    bySleeper.set(id, {
      team: info?.team || last.team, // Sleeper's codes (LAR, not nflverse's LA), matching the rest of the app
      position: last.position,
      weeks: list.map((x) => ({ week: x.week, pct: r1(x.pct), snaps: x.snaps })),
      season_pct: r1(avg(list.map((x) => x.pct))),
      last3_pct: r1(avg(l3.map((x) => x.pct))),
      trend: before.length >= 2 ? Math.round((avg(l3.map((x) => x.pct)) - avg(before.map((x) => x.pct))) * 1000) / 10 : null,
      team_rank: 0,
      depth: info?.depth_chart_order ? { position: info.depth_chart_position || last.position, order: info.depth_chart_order } : null,
    });
  }
  // Rank teammates at the same position by recent snaps. Only players who played in one of the team's last three weeks.
  const groups = new Map<string, [string, PlayerUsage][]>();
  for (const e of bySleeper) {
    const lastWeek = e[1].weeks[e[1].weeks.length - 1].week;
    if (lastWeek < through - 3) continue;
    const k = `${e[1].team}|${e[1].position}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  for (const g of groups.values()) g.sort((a, b) => b[1].last3_pct - a[1].last3_pct).forEach(([, u], i) => (u.team_rank = i + 1));
  return { season, through_week: through, bySleeper };
}

function index(season: number): Promise<UsageIndex> {
  if (cache && cache.season === season && Date.now() - cache.at < TTL) return cache.p;
  const p = build(season).catch((e) => {
    cache = null;
    throw e;
  });
  cache = { at: Date.now(), season, p };
  return p;
}

/** Snap share for these Sleeper ids this season (falls back to last season before Week 1 data exists). */
export async function usageFor(ids: string[], season: number) {
  let idx = await index(season).catch(() => null);
  if (!idx || idx.through_week === 0) idx = await index(season - 1);
  const players: Record<string, PlayerUsage> = {};
  for (const id of ids) {
    const u = idx.bySleeper.get(id);
    if (u) players[id] = u;
  }
  return { season: idx.season, through_week: idx.through_week, players };
}
