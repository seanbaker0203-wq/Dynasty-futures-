/**
 * Where to read and watch about a player. One list, so adding a site (or a paid partner) is one entry.
 *
 * Partner fields are ready for business arrangements: `partner` marks a site we have an agreement with (shown first,
 * labelled), and `ref` is appended to every link for affiliate / referral tracking. Exact player-page links need the
 * partner's player IDs; until a partner shares an ID map, `url` can fall back to a site-scoped search.
 */
export type ContentKind = 'Analysis' | 'News' | 'Video' | 'Values' | 'Stats';

export interface PlayerRef {
  name: string;
  position: string;
  team?: string | null;
  ktc_url?: string | null;
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
    // Their player pages use FBG ids (e.g. ChasJa00); search their site until we have their id map.
    url: (p) => siteSearch('footballguys.com', p.name),
  },
  {
    id: 'fantasypros',
    name: 'FantasyPros',
    kind: 'News',
    url: (p) => (p.position === 'DEF' || p.position === 'K' ? null : `https://www.fantasypros.com/nfl/players/${slug(p.name)}.php`),
  },
  { id: 'ktc', name: 'KeepTradeCut', kind: 'Values', url: (p) => p.ktc_url ?? null },
  {
    id: 'youtube',
    name: 'YouTube',
    kind: 'Video',
    url: (p) => `https://www.youtube.com/results?search_query=${enc(`${p.name} dynasty fantasy football`)}`,
  },
  {
    id: 'pfr',
    name: 'Pro Football Reference',
    kind: 'Stats',
    url: (p) => (p.position === 'DEF' ? null : siteSearch('pro-football-reference.com/players', p.name)),
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
