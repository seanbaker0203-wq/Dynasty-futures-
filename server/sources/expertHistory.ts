/**
 * Weekly history of expert (FantasyPros-based) dynasty values, rebuilt from the DynastyProcess
 * repo's version history: each weekly commit of files/values-players.csv is one snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson, fetchText } from '../http';
import { parseCsv } from '../values';

const BUNDLED = path.resolve(process.cwd(), 'data', 'expert-history.json');

/** History shipped with the app (scripts/build-expert-history.mjs). */
function loadBundled(): { byFp: Map<string, ExpertPoint[]>; dates: string[] } {
  try {
    const raw = JSON.parse(fs.readFileSync(BUNDLED, 'utf8')) as { dates: string[]; players: Record<string, [string, number, number][]> };
    const byFp = new Map<string, ExpertPoint[]>();
    for (const [fp, pts] of Object.entries(raw.players)) {
      byFp.set(fp, pts.map(([date, a, b]) => ({ date, value_1qb: a, value_sf: b })));
    }
    return { byFp, dates: raw.dates };
  } catch {
    return { byFp: new Map(), dates: [] };
  }
}

export interface ExpertPoint {
  date: string;
  value_1qb: number;
  value_sf: number;
}

const REPO = 'dynastyprocess/data';
const PATH = 'files/values-players.csv';
const TTL = 12 * 60 * 60 * 1000;
const WEEKS = 13; // GitHub look-back; bundled file holds ~26 weeks

let state: { at: number; byFp: Map<string, ExpertPoint[]>; dates: string[] } | null = null;
let inflight: Promise<void> | null = null;

async function load() {
  const base = loadBundled();
  const lastBundled = base.dates[base.dates.length - 1] ?? '';
  let extra: { date: string; rows: Record<string, string>[] }[] = [];
  try {
    const commits = await fetchJson<any[]>(`https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(PATH)}&per_page=10`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    const seen = new Set<string>(base.dates);
    const newer: { sha: string; date: string }[] = [];
    for (const c of commits) {
      const date = String(c?.commit?.committer?.date || '').slice(0, 10);
      if (!date || date <= lastBundled || seen.has(date)) continue;
      seen.add(date);
      newer.push({ sha: c.sha, date });
    }
    extra = (
      await Promise.all(
        newer.map(async (p) => {
          try {
            return { date: p.date, rows: parseCsv(await fetchText(`https://raw.githubusercontent.com/${REPO}/${p.sha}/${PATH}`)) };
          } catch {
            return null;
          }
        })
      )
    ).filter((x): x is { date: string; rows: Record<string, string>[] } => !!x);
  } catch (err: any) {
    console.warn('[experts] GitHub history unavailable, using bundled history:', err.message);
  }

  const byFp = base.byFp;
  const dates = [...base.dates];
  for (const f of extra) {
    dates.push(f.date);
    for (const r of f.rows) {
      if (!r.fp_id) continue;
      if (!byFp.has(r.fp_id)) byFp.set(r.fp_id, []);
      byFp.get(r.fp_id)!.push({ date: f.date, value_1qb: Number(r.value_1qb) || 0, value_sf: Number(r.value_2qb) || 0 });
    }
  }
  for (const list of byFp.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  dates.sort();
  state = { at: Date.now(), byFp, dates: dates.slice(-WEEKS * 2) };
  console.log(`[experts] history: ${dates.length} weekly snapshots (${dates[0]} to ${dates[dates.length - 1]})`);
}

export async function getExpertHistory() {
  if (!state || Date.now() - state.at > TTL) {
    inflight ??= load()
      .catch((err) => console.warn('[experts] history failed:', err.message))
      .finally(() => (inflight = null));
    // First load: wait for it. Later refreshes: serve the old copy meanwhile.
    if (!state) await inflight;
  }
  return state;
}

/** Percent change in expert value over roughly `weeks` weeks, or null without enough history. */
export function expertChange(points: ExpertPoint[] | undefined, superflex: boolean, weeks = 4): number | null {
  if (!points || points.length < 2) return null;
  const v = (p: ExpertPoint) => (superflex ? p.value_sf : p.value_1qb);
  const last = points[points.length - 1];
  const prior = points[Math.max(0, points.length - 1 - weeks)];
  if (!v(prior)) return null;
  return (v(last) - v(prior)) / v(prior);
}
