/**
 * Where to read and watch about a player. One list, so adding a site (or a paid partner) is one entry.
 *
 * Partner fields are ready for business arrangements: `partner` marks a site we have an agreement with (shown first,
 * labelled), and `ref` is appended to every link for affiliate / referral tracking. Exact player-page links need the
 * partner's player IDs; until a partner shares an ID map, `url` can fall back to a site-scoped search.
 */
export type ContentKind = 'Analysis' | 'News' | 'Video' | 'Values' | 'Stats' | 'Player page';

export interface PlayerRef {
  name: string;
  position: string;
  team?: string | null;
  ktc_url?: string | null;
  ext_ids?: { espn: string | null; yahoo: string | null; cbs: string | null; pfr: string | null } | null;
  /** dynasty or redraft: the KTC dynasty link is skipped in redraft */
  format?: string;
}

export interface ContentSource {
  id: string;
  name: string;
  kind: ContentKind;
  /** Requires a paid subscription on that site */
  subscriber?: boolean;
  /** We have a business arrangement with this source */
  partner?: boolean;
  /** Query string appended for referral tracking, e.g. "ref=dynastyfutures" */
  ref?: string;
  url: (p: PlayerRef) => string | null;
}

const enc = encodeURIComponent;
const slug = (n: string) =>
  n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const siteSearch = (site: string, q: string) => `https://www.google.com/search?q=${enc(`site:${site} "${q}"`)}`;

export const CONTENT_SOURCES: ContentSource[] = [
  {
    id: 'footballguys',
    name: 'Footballguys',
    kind: 'Analysis',
    subscriber: true,
    // Footballguys player pages use Pro Football Reference-style ids (e.g. /player/Ja'Marr+Chase/ChasJa00).
    url: (p) =>
      p.ext_ids?.pfr ? `https://www.footballguys.com/player/${p.name.replace(/\s+/g, '+')}/${p.ext_ids.pfr}` : siteSearch('footballguys.com', p.name),
  },
  {
    id: 'fantasypros',
    name: 'FantasyPros',
    kind: 'News',
    url: (p) => (p.position === 'DEF' || p.position === 'K' ? null : `https://www.fantasypros.com/nfl/players/${slug(p.name)}.php`),
  },
  {
    id: 'espn',
    name: 'ESPN',
    kind: 'Player page',
    url: (p) => (p.ext_ids?.espn ? `https://www.espn.com/nfl/player/_/id/${p.ext_ids.espn}` : siteSearch('espn.com/nfl/player', p.name)),
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    kind: 'Player page',
    url: (p) => (p.ext_ids?.yahoo ? `https://sports.yahoo.com/nfl/players/${p.ext_ids.yahoo}/` : siteSearch('sports.yahoo.com/nfl/players', p.name)),
  },
  {
    id: 'cbs',
    name: 'CBS Sports',
    kind: 'Player page',
    url: (p) => (p.ext_ids?.cbs ? `https://www.cbssports.com/nfl/players/${p.ext_ids.cbs}/` : siteSearch('cbssports.com/nfl/players', p.name)),
  },
  {
    id: 'nfl',
    name: 'NFL.com',
    kind: 'Player page',
    url: (p) => (p.position === 'DEF' ? null : `https://www.nfl.com/players/${slug(p.name)}/`),
  },
  { id: 'ktc', name: 'KeepTradeCut', kind: 'Values', url: (p) => (p.format === 'redraft' ? null : p.ktc_url ?? null) },
  {
    id: 'youtube',
    name: 'YouTube',
    kind: 'Video',
    url: (p) => `https://www.youtube.com/results?search_query=${enc(`${p.name} ${p.format === 'redraft' ? 'fantasy football' : 'dynasty fantasy football'}`)}`,
  },
  {
    id: 'pfr',
    name: 'Pro Football Reference',
    kind: 'Stats',
    url: (p) =>
      p.position === 'DEF'
        ? null
        : p.ext_ids?.pfr
          ? `https://www.pro-football-reference.com/players/${p.ext_ids.pfr[0]}/${p.ext_ids.pfr}.htm`
          : siteSearch('pro-football-reference.com/players', p.name),
  },
];

export function linksFor(p: PlayerRef, sources: ContentSource[] = CONTENT_SOURCES) {
  return sources
    .map((s) => {
      const raw = s.url(p);
      if (!raw) return null;
      const href = s.ref ? `${raw}${raw.includes('?') ? '&' : '?'}${s.ref}` : raw;
      return { ...s, href };
    })
    .filter((x): x is ContentSource & { href: string } => !!x)
    .sort((a, b) => Number(!!b.partner) - Number(!!a.partner));
}
