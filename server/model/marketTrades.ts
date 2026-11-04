/**
 * Our own trade market: real dynasty trades collected from public Sleeper leagues (scripts/collect/crawl-sleeper.ts)
 * and the player/pick values fitted from them (scripts/analysis/trade_values.py).
 *
 *   data/trade-values.json  { superflex: {...fit}, oneqb: {...fit} }  — values on a 0–10,000 scale
 *   data/market-trades.json { built, trades: [[ts, sf, teams, ppr, tep, sideA, sideB], ...] }  — recent trades, compact
 *     asset = Sleeper player id, or "P<year>-<round>" for a pick
 */
import fs from 'fs';
import path from 'path';
import { playerDirectory } from '../players';

interface Fit {
  asof: string;
  superflex: boolean;
  alpha: number;
  trades: number;
  values: Record<string, { value: number; trades: number }>;
}
type CompactTrade = [number, 0 | 1, number, number, number, string[], string[]];

/** A format's fitted values are shown only once they rest on this many trades. */
export const MIN_FIT_TRADES = 2000;

const read = <T>(f: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data', f), 'utf8')) as T;
  } catch {
    return null;
  }
};

let fits: { superflex?: Fit; oneqb?: Fit } | null = null;
let recent: { built: string; trades: CompactTrade[] } | null = null;
let byPlayer: Map<string, number[]> | null = null;

function load() {
  if (fits) return;
  fits = read('trade-values.json') ?? {};
  recent = read('market-trades.json');
  byPlayer = new Map();
  (recent?.trades ?? []).forEach((t, i) => {
    for (const a of [...t[5], ...t[6]]) if (!a.startsWith('P')) (byPlayer!.get(a) ?? byPlayer!.set(a, []).get(a)!).push(i);
  });
}

/** Fitted trade value (0–10,000 scale of that fit) and how many trades it rests on. */
export function ownTradeValue(sleeperId: string | null | undefined, superflex: boolean): { value: number; trades: number } | null {
  load();
  if (!sleeperId) return null;
  const fit = superflex ? fits!.superflex : fits!.oneqb;
  // Too few trades in this format to trust the fit: show nothing rather than noise.
  if (!fit || fit.trades < MIN_FIT_TRADES) return null;
  return fit.values[sleeperId] ?? null;
}

export function ownTradeMeta(superflex: boolean): { asof: string; trades: number } | null {
  load();
  const fit = superflex ? fits!.superflex : fits!.oneqb;
  return fit ? { asof: fit.asof, trades: fit.trades } : null;
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
function describe(asset: string): { kind: 'player' | 'pick'; id?: string; label: string; position?: string } {
  const pk = /^P(\d{4})-(\d)$/.exec(asset);
  if (pk) return { kind: 'pick', label: `${pk[1]} ${ORD[Number(pk[2])] ?? `round ${pk[2]}`}` };
  const p = playerDirectory.get(asset);
  return { kind: 'player', id: asset, label: p?.full_name ?? `Player ${asset}`, position: p?.position };
}

export interface MarketTrade {
  date: string;
  superflex: boolean;
  teams: number;
  ppr: number;
  te_premium: number;
  sides: { kind: 'player' | 'pick'; id?: string; label: string; position?: string }[][];
}

/** Recent real trades, newest first: all of them for a format, or only those including one player. */
export function marketTrades(opts: { superflex?: boolean; player?: string; q?: string; limit?: number }): { built: string | null; trades: MarketTrade[] } {
  load();
  const all = recent?.trades ?? [];
  const rows = opts.player ? (byPlayer!.get(opts.player) ?? []).map((i) => all[i]) : all;
  const term = opts.q?.trim().toLowerCase() || '';
  const out: MarketTrade[] = [];
  for (const t of rows) {
    if (opts.superflex != null && Boolean(t[1]) !== opts.superflex) continue;
    if (term && ![...t[5], ...t[6]].some((a) => describe(a).label.toLowerCase().includes(term))) continue;
    let sides = [t[5], t[6]];
    // Put the searched player's side first.
    if (opts.player && !t[5].includes(opts.player)) sides = [t[6], t[5]];
    out.push({
      date: new Date(t[0]).toISOString().slice(0, 10),
      superflex: Boolean(t[1]),
      teams: t[2],
      ppr: t[3],
      te_premium: t[4],
      sides: sides.map((s) => s.map(describe)),
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { built: recent?.built ?? null, trades: out.slice(0, opts.limit ?? 50) };
}
