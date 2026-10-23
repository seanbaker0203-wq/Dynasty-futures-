/**
 * "The values your league uses": another value source to compare with Futures Value and to judge whether a trade
 * looks fair to the other manager. Sources: FantasyCalc trade market and FantasyPros experts (already part of our
 * blend), or a list the user imports privately (e.g. copied from the KTC rankings page). Imported values are mapped
 * onto our scale by rank, so different number scales compare fairly.
 */
import type { DraftPick, MasterPlayer } from '../types';
import type { FinderAsset } from './tradeFinder';

export type ReferenceSource = 'market' | 'experts' | 'imported';

export interface ImportedValues {
  label: string; // e.g. "KTC"
  imported_at: string;
  players: { name: string; key: string; value: number }[];
  picks: { year: number; round: number; tier: 'Early' | 'Mid' | 'Late' | null; value: number }[];
}

export const SOURCE_LABEL: Record<ReferenceSource, string> = {
  market: 'FantasyCalc (trade market)',
  experts: 'FantasyPros (experts)',
  imported: 'Your imported values',
};

/** Lowercase, no punctuation or suffixes: "Kenneth Walker III" → "kenneth walker". */
export const nameKey = (n: string) =>
  n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’`,-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ROUND: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
const PICK_RE = /\b(20\d\d)\s+(?:(early|mid|late)\s+)?(1st|2nd|3rd|4th|5th)\b/i;
const INT_RE = /^\d{1,5}$/;

/**
 * Parse pasted rankings: a copied rankings page or a simple "name, value" list. A value is the first whole number
 * after a name (skipping "Tier N", ages like 24.5, position ranks like WR3 and +/- trends).
 */
export function parseImported(text: string, knownNames: string[], label = 'KTC'): ImportedValues {
  const known = new Map<string, string>();
  for (const n of knownNames) known.set(nameKey(n), n);
  const maxWords = 4;
  const tokens = text.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/\t/g, ' ').split(/[\s,;|]+/).filter(Boolean);
  const players = new Map<string, { name: string; key: string; value: number }>();
  const picks = new Map<string, ImportedValues['picks'][number]>();
  let current: { kind: 'player'; name: string; key: string } | { kind: 'pick'; year: number; round: number; tier: 'Early' | 'Mid' | 'Late' | null } | null = null;

  for (let i = 0; i < tokens.length; i++) {
    // Pick names: "2027 Early 1st" / "2028 1st"
    const window3 = tokens.slice(i, i + 3).join(' ');
    const pm = window3.match(PICK_RE);
    if (pm && pm.index === 0) {
      const tier = pm[2] ? ((pm[2][0].toUpperCase() + pm[2].slice(1).toLowerCase()) as 'Early' | 'Mid' | 'Late') : null;
      current = { kind: 'pick', year: Number(pm[1]), round: ROUND[pm[3].toLowerCase()], tier };
      i += pm[2] ? 2 : 1;
      continue;
    }
    // Player names: longest run of 2-4 tokens matching a known player
    let matched = false;
    for (let w = maxWords; w >= 2; w--) {
      const k = nameKey(tokens.slice(i, i + w).join(' '));
      if (k && known.has(k)) {
        current = { kind: 'player', name: known.get(k)!, key: k };
        i += w - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (!current) continue;
    const t = tokens[i];
    if (/^tier$/i.test(tokens[i - 1] || '')) continue;
    if (!INT_RE.test(t)) continue;
    const v = Number(t.replace(',', ''));
    if (current.kind === 'player') {
      if (!players.has(current.key)) players.set(current.key, { name: current.name, key: current.key, value: v });
    } else {
      const k = `${current.year}-${current.round}-${current.tier ?? ''}`;
      if (!picks.has(k)) picks.set(k, { year: current.year, round: current.round, tier: current.tier, value: v });
    }
    current = null;
  }
  return { label, imported_at: new Date().toISOString(), players: [...players.values()], picks: [...picks.values()] };
}

export interface Reference {
  source: ReferenceSource;
  label: string;
  /** Their value on our scale, or null if this source has no value for it */
  player: (p: MasterPlayer) => number | null;
  pick: (p: DraftPick) => number | null;
  /** For the trade finder: falls back to our value when the source has none */
  asset: (a: FinderAsset) => number;
}

/** Build a reference. `universe` = the players/picks to rank against (league rosters + free agents). */
export function makeReference(
  source: ReferenceSource,
  imported: ImportedValues | null,
  universe: { players: MasterPlayer[]; picks: DraftPick[] }
): Reference | null {
  let player: Reference['player'];
  let pick: Reference['pick'];
  let label = SOURCE_LABEL[source];

  if (source === 'market') {
    player = (p) => p.futures?.market ?? null;
    pick = (p) => p.sources?.market ?? null;
  } else if (source === 'experts') {
    player = (p) => p.futures?.experts ?? null;
    pick = (p) => p.sources?.experts ?? null;
  } else {
    if (!imported || (!imported.players.length && !imported.picks.length)) return null;
    label = imported.label;
    const byKey = new Map(imported.players.map((x) => [x.key, x.value]));
    const pickRaw = (p: DraftPick) => {
      const exact = imported.picks.find((x) => x.year === p.year && x.round === p.round && x.tier === (p.tier ?? null));
      const anyTier = imported.picks.filter((x) => x.year === p.year && x.round === p.round);
      if (exact) return exact.value;
      if (anyTier.length) return anyTier.reduce((s, x) => s + x.value, 0) / anyTier.length;
      return null;
    };
    // Rank-to-rank: an asset's place in the imported list gets the value our scale gives that place.
    const items: { id: string; raw: number; ours: number }[] = [];
    const seen = new Set<string>();
    for (const p of universe.players) {
      const raw = byKey.get(nameKey(p.full_name));
      if (raw != null && !seen.has(`p${p.id}`)) {
        seen.add(`p${p.id}`);
        items.push({ id: `p${p.id}`, raw, ours: p.market_value });
      }
    }
    for (const p of universe.picks) {
      const raw = pickRaw(p);
      const id = `k${p.year}-${p.round}-${p.tier ?? ''}`;
      if (raw != null && !seen.has(id)) {
        seen.add(id);
        items.push({ id, raw, ours: p.market_value });
      }
    }
    const ourSorted = items.map((x) => x.ours).sort((a, b) => b - a);
    const rawSorted = items.map((x) => x.raw).sort((a, b) => b - a);
    // Map a raw value to our scale by its position in the imported ranking (interpolated).
    const onOurScale = (raw: number) => {
      if (!rawSorted.length) return null;
      let i = rawSorted.findIndex((r) => r <= raw);
      if (i === -1) return ourSorted[ourSorted.length - 1];
      if (i === 0) return ourSorted[0];
      const hi = rawSorted[i - 1], lo = rawSorted[i];
      const t = hi === lo ? 0 : (hi - raw) / (hi - lo);
      return ourSorted[i - 1] + (ourSorted[i] - ourSorted[i - 1]) * t;
    };
    player = (p) => {
      const raw = byKey.get(nameKey(p.full_name));
      return raw == null ? null : onOurScale(raw);
    };
    pick = (p) => {
      const raw = pickRaw(p);
      return raw == null ? null : onOurScale(raw);
    };
  }
  return {
    source,
    label,
    player,
    pick,
    asset: (a) => (a.kind === 'player' ? player(a.item) : pick(a.item)) ?? a.item.market_value,
  };
}

/** gap > 0: the source values it above Futures Value (sell to its users); < 0: below (buy from them). */
export const gapOf = (ours: number, theirs: number | null) =>
  // Under ~300 a source is usually just not tracking the player (thin market), so it's no signal.
  theirs == null || ours <= 0 || theirs < 300 ? null : theirs / ours - 1;
