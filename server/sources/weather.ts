/**
 * Game-day weather for start/sit.
 *  - Schedule and kickoff: ESPN's public scoreboard (exact kickoff, venue, indoor flag), falling back to Sleeper's
 *    schedule (date only) and our stadium table.
 *  - Forecast: US National Weather Service gridpoint forecast (api.weather.gov; free, public domain, ~7 days out).
 *  - Effects: measured from 2016-2025 games by scripts/analysis/weather_effects.py into data/weather-effects.json.
 */
import fs from 'fs';
import path from 'path';
import { fetchJson } from '../http';
import { sleeperTeam } from './weekly';

type Roof = 'outdoor' | 'dome' | 'retractable';
// Home stadiums (2026). SoFi has a fixed roof; Seattle and Miami have partial canopies over seats only.
const STADIUMS: Record<string, { name: string; city: string; lat: number; lon: number; roof: Roof; tz: string }> = {
  ARI: { name: 'State Farm Stadium', city: 'Glendale', lat: 33.5276, lon: -112.2626, roof: 'retractable', tz: 'America/Phoenix' },
  ATL: { name: 'Mercedes-Benz Stadium', city: 'Atlanta', lat: 33.7554, lon: -84.4008, roof: 'retractable', tz: 'America/New_York' },
  BAL: { name: 'M&T Bank Stadium', city: 'Baltimore', lat: 39.278, lon: -76.6227, roof: 'outdoor', tz: 'America/New_York' },
  BUF: { name: 'Highmark Stadium', city: 'Orchard Park', lat: 42.7738, lon: -78.787, roof: 'outdoor', tz: 'America/New_York' },
  CAR: { name: 'Bank of America Stadium', city: 'Charlotte', lat: 35.2258, lon: -80.8528, roof: 'outdoor', tz: 'America/New_York' },
  CHI: { name: 'Soldier Field', city: 'Chicago', lat: 41.8623, lon: -87.6167, roof: 'outdoor', tz: 'America/Chicago' },
  CIN: { name: 'Paycor Stadium', city: 'Cincinnati', lat: 39.0955, lon: -84.5161, roof: 'outdoor', tz: 'America/New_York' },
  CLE: { name: 'Huntington Bank Field', city: 'Cleveland', lat: 41.5061, lon: -81.6995, roof: 'outdoor', tz: 'America/New_York' },
  DAL: { name: 'AT&T Stadium', city: 'Arlington', lat: 32.7473, lon: -97.0945, roof: 'retractable', tz: 'America/Chicago' },
  DEN: { name: 'Empower Field', city: 'Denver', lat: 39.7439, lon: -105.0201, roof: 'outdoor', tz: 'America/Denver' },
  DET: { name: 'Ford Field', city: 'Detroit', lat: 42.34, lon: -83.0456, roof: 'dome', tz: 'America/New_York' },
  GB: { name: 'Lambeau Field', city: 'Green Bay', lat: 44.5013, lon: -88.0622, roof: 'outdoor', tz: 'America/Chicago' },
  HOU: { name: 'NRG Stadium', city: 'Houston', lat: 29.6847, lon: -95.4107, roof: 'retractable', tz: 'America/Chicago' },
  IND: { name: 'Lucas Oil Stadium', city: 'Indianapolis', lat: 39.7601, lon: -86.1639, roof: 'retractable', tz: 'America/Indiana/Indianapolis' },
  JAX: { name: 'EverBank Stadium', city: 'Jacksonville', lat: 30.3239, lon: -81.6373, roof: 'outdoor', tz: 'America/New_York' },
  KC: { name: 'Arrowhead Stadium', city: 'Kansas City', lat: 39.0489, lon: -94.4839, roof: 'outdoor', tz: 'America/Chicago' },
  LV: { name: 'Allegiant Stadium', city: 'Las Vegas', lat: 36.0909, lon: -115.1833, roof: 'dome', tz: 'America/Los_Angeles' },
  LAC: { name: 'SoFi Stadium', city: 'Inglewood', lat: 33.9535, lon: -118.3392, roof: 'dome', tz: 'America/Los_Angeles' },
  LAR: { name: 'SoFi Stadium', city: 'Inglewood', lat: 33.9535, lon: -118.3392, roof: 'dome', tz: 'America/Los_Angeles' },
  MIA: { name: 'Hard Rock Stadium', city: 'Miami Gardens', lat: 25.958, lon: -80.2389, roof: 'outdoor', tz: 'America/New_York' },
  MIN: { name: 'U.S. Bank Stadium', city: 'Minneapolis', lat: 44.9737, lon: -93.2581, roof: 'dome', tz: 'America/Chicago' },
  NE: { name: 'Gillette Stadium', city: 'Foxborough', lat: 42.0909, lon: -71.2643, roof: 'outdoor', tz: 'America/New_York' },
  NO: { name: 'Caesars Superdome', city: 'New Orleans', lat: 29.9511, lon: -90.0812, roof: 'dome', tz: 'America/Chicago' },
  NYG: { name: 'MetLife Stadium', city: 'East Rutherford', lat: 40.8135, lon: -74.0745, roof: 'outdoor', tz: 'America/New_York' },
  NYJ: { name: 'MetLife Stadium', city: 'East Rutherford', lat: 40.8135, lon: -74.0745, roof: 'outdoor', tz: 'America/New_York' },
  PHI: { name: 'Lincoln Financial Field', city: 'Philadelphia', lat: 39.9008, lon: -75.1675, roof: 'outdoor', tz: 'America/New_York' },
  PIT: { name: 'Acrisure Stadium', city: 'Pittsburgh', lat: 40.4468, lon: -80.0158, roof: 'outdoor', tz: 'America/New_York' },
  SF: { name: "Levi's Stadium", city: 'Santa Clara', lat: 37.403, lon: -121.97, roof: 'outdoor', tz: 'America/Los_Angeles' },
  SEA: { name: 'Lumen Field', city: 'Seattle', lat: 47.5952, lon: -122.3316, roof: 'outdoor', tz: 'America/Los_Angeles' },
  TB: { name: 'Raymond James Stadium', city: 'Tampa', lat: 27.9759, lon: -82.5033, roof: 'outdoor', tz: 'America/New_York' },
  TEN: { name: 'Nissan Stadium', city: 'Nashville', lat: 36.1665, lon: -86.7713, roof: 'outdoor', tz: 'America/Chicago' },
  WAS: { name: 'Northwest Stadium', city: 'Landover', lat: 38.9077, lon: -76.8645, roof: 'outdoor', tz: 'America/New_York' },
};

export type Condition = 'clear' | 'cold' | 'wind_15' | 'wind_20' | 'rain' | 'heavy_rain' | 'snow' | 'wet_and_windy';
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

export interface GameWeather {
  game: string; // "KC @ BUF"
  home: string;
  away: string;
  kickoff: string | null; // ISO
  kickoff_confirmed: boolean;
  venue: string;
  city: string;
  roof: Roof | 'international';
  status: 'forecast' | 'indoors' | 'roof' | 'too_early' | 'unavailable';
  condition: Condition;
  severity: 'none' | 'watch' | 'moderate' | 'high';
  headline: string;
  details: string | null; // "80% chance, 0.6 in during the game · wind 18 mph, gusts 30 · 44°F"
  impact: string | null; // what it does to the game script
  factors: Record<string, number>; // expected multiplier on projections by position (1 = no change)
  chance: number | null; // precip probability 0-1
  wind_mph: number | null;
  gust_mph: number | null;
  temp_f: number | null;
  precip_in: number | null;
  snow_in: number | null;
}

interface Effects {
  buckets: Record<string, { games: number; avg_total_points: number | null; by_position: Record<string, { factor: number; n: number }> }>;
}
let effects: Effects | null = null;
function fx(): Effects {
  if (!effects) {
    try {
      effects = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data', 'weather-effects.json'), 'utf8'));
    } catch {
      effects = { buckets: {} };
    }
  }
  return effects!;
}

/** Measured multipliers for a condition. Heavy rain has too few logged games, so it borrows the wet-and-windy numbers. */
function baseFactors(c: Condition): Record<string, number> {
  const b = fx().buckets;
  const row = b[c === 'heavy_rain' ? 'wet_and_windy' : c];
  const clearTotal = b.clear?.avg_total_points || 45.6;
  const out: Record<string, number> = {};
  for (const pos of POSITIONS) {
    if (pos === 'DEF') {
      // Defenses gain when fewer points are scored.
      const t = row?.avg_total_points;
      out.DEF = t ? Math.min(1.15, Math.max(1, clearTotal / t)) : 1;
      continue;
    }
    // Shrink small samples toward "no effect" (25 player-games of prior weight), and make worse weather at least
    // as bad as its milder version (strong wind vs wind, downpour vs rain).
    const shrunk = (bucket: string) => {
      const r = b[bucket]?.by_position?.[pos];
      return r ? 1 + (r.factor - 1) * (r.n / (r.n + 25)) : 1;
    };
    let f = shrunk(c === 'heavy_rain' ? 'wet_and_windy' : c);
    if (c === 'wind_20' && pos !== 'RB') f = Math.min(f, shrunk('wind_15'));
    if ((c === 'heavy_rain' || c === 'wet_and_windy') && pos !== 'RB') f = Math.min(f, shrunk('rain'));
    if (pos === 'RB') f = Math.min(1.05, Math.max(0.9, f)); // RB samples are noisy; keep the effect modest
    out[pos] = Math.max(0.6, Math.min(1.1, f));
  }
  return out;
}

// ---------- schedule ----------
interface Game {
  home: string;
  away: string;
  kickoff: string | null;
  confirmed: boolean;
  venue?: string;
  city?: string;
  indoor?: boolean;
  international?: boolean;
}
const schedCache = new Map<string, { at: number; games: Game[] }>();

async function espnGames(season: number, week: number): Promise<Game[]> {
  const d = await fetchJson<any>(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`, { timeoutMs: 12000 });
  const games: Game[] = [];
  for (const e of d?.events || []) {
    const c = e.competitions?.[0];
    const home = c?.competitors?.find((x: any) => x.homeAway === 'home')?.team?.abbreviation;
    const away = c?.competitors?.find((x: any) => x.homeAway === 'away')?.team?.abbreviation;
    if (!home || !away) continue;
    const country = c?.venue?.address?.country;
    games.push({
      home: sleeperTeam(home)!,
      away: sleeperTeam(away)!,
      kickoff: e.date || c?.date || null,
      confirmed: !!(e.date || c?.date) && c?.timeValid !== false,
      venue: c?.venue?.fullName,
      city: c?.venue?.address?.city,
      indoor: typeof c?.venue?.indoor === 'boolean' ? c.venue.indoor : undefined,
      international: !!country && !/^(USA|United States)$/i.test(country),
    });
  }
  return games;
}

async function sleeperGames(season: number, week: number): Promise<Game[]> {
  const all = await fetchJson<any[]>(`https://api.sleeper.app/schedule/nfl/regular/${season}`);
  return (all || [])
    .filter((g) => Number(g.week) === week)
    .map((g) => {
      // No kickoff time from Sleeper: assume 1:00 PM ET Sunday, 8:15 PM ET Thursday/Monday, 4:30 PM ET Saturday.
      const day = new Date(`${g.date}T12:00:00Z`).getUTCDay();
      const etHour = day === 0 ? '17:00' : day === 6 ? '20:30' : '00:15';
      const date = day === 4 || day === 1 ? new Date(new Date(`${g.date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : g.date;
      return { home: sleeperTeam(g.home)!, away: sleeperTeam(g.away)!, kickoff: `${date}T${etHour}:00Z`, confirmed: false };
    });
}

async function weekGames(season: number, week: number): Promise<Game[]> {
  const key = `${season}-${week}`;
  const hit = schedCache.get(key);
  if (hit && Date.now() - hit.at < 3 * 3600_000) return hit.games;
  let games: Game[] = [];
  try {
    games = await espnGames(season, week);
  } catch {
    /* fall back */
  }
  if (!games.length) games = await sleeperGames(season, week).catch(() => []);
  schedCache.set(key, { at: Date.now(), games });
  return games;
}

// ---------- forecast (NWS) ----------
const NWS = 'https://api.weather.gov';
const NWS_HEADERS = { Accept: 'application/geo+json', 'User-Agent': 'DynastyFutures (https://dynasty-futures.onrender.com)' };
const gridUrl = new Map<string, string>();
const gridCache = new Map<string, { at: number; data: any }>();

async function gridFor(lat: number, lon: number): Promise<any> {
  const k = `${lat},${lon}`;
  let url = gridUrl.get(k);
  if (!url) {
    const pt = await fetchJson<any>(`${NWS}/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: NWS_HEADERS, timeoutMs: 12000 });
    url = pt?.properties?.forecastGridData;
    if (!url) throw new Error('no grid');
    gridUrl.set(k, url);
  }
  const hit = gridCache.get(url);
  if (hit && Date.now() - hit.at < 60 * 60_000) return hit.data;
  const data = (await fetchJson<any>(url, { headers: NWS_HEADERS, timeoutMs: 15000 }))?.properties;
  gridCache.set(url, { at: Date.now(), data });
  return data;
}

/** NWS validTime "2026-11-08T18:00:00+00:00/PT6H" -> [start, end] ms. */
function span(validTime: string): [number, number] {
  const [startS, dur] = validTime.split('/');
  const start = Date.parse(startS);
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(dur || '');
  const ms = ((Number(m?.[1]) || 0) * 24 + (Number(m?.[2]) || 0)) * 3600_000 + (Number(m?.[3]) || 0) * 60_000;
  return [start, start + (ms || 3600_000)];
}
/** Values overlapping [a, b], each with the share of its period that falls inside the window. */
function overlap(series: any, a: number, b: number): { v: number; share: number; hours: number }[] {
  const out: { v: number; share: number; hours: number }[] = [];
  for (const row of series?.values || []) {
    if (row.value == null) continue;
    const [s, e] = span(row.validTime);
    const inside = Math.min(e, b) - Math.max(s, a);
    if (inside <= 0) continue;
    out.push({ v: Number(row.value), share: inside / (e - s), hours: inside / 3600_000 });
  }
  return out;
}
const kmhToMph = (v: number) => v * 0.621371;
const mmToIn = (v: number) => v / 25.4;
const cToF = (v: number) => (v * 9) / 5 + 32;

const LABEL: Record<Condition, string> = {
  clear: 'No weather concerns',
  cold: 'Bitter cold',
  wind_15: 'Windy',
  wind_20: 'Strong wind',
  rain: 'Rain',
  heavy_rain: 'Heavy rain',
  snow: 'Snow',
  wet_and_windy: 'Rain and wind',
};
const IMPACT: Record<Condition, string> = {
  clear: '',
  cold: 'Cold games run lower-scoring; passers lose the most, and kicking distance drops.',
  wind_15: 'Wind cuts into deep passing and long field goals; teams lean on short throws and the run.',
  wind_20: 'Strong wind wrecks the deep ball and long kicks. Expect a run-first script; tight ends and kickers take the biggest hit.',
  rain: 'Wet balls mean more drops and fumbles and a more conservative, run-leaning script. Passing numbers dip.',
  heavy_rain: 'A downpour usually turns the game into a ground game: fewer pass attempts, sloppy footing, fewer points. Lower your expectations for QBs, WRs, TEs and kickers; defenses gain.',
  snow: 'Snow slows passing and receivers but running backs tend to hold up or even gain volume.',
  wet_and_windy: 'Rain plus wind is the worst combination for passing and kicking: historically about a quarter fewer QB and WR points and far fewer kicker points.',
};

function classify(w: { chance: number; precipIn: number; snowIn: number; wind: number; temp: number; heavy: boolean; snowWx: boolean }): { c: Condition; p: number } {
  const wet = w.chance >= 0.4 && (w.precipIn >= 0.05 || w.heavy);
  const snowy = w.snowIn >= 0.5 || (w.snowWx && w.chance >= 0.4);
  if (snowy) return { c: 'snow', p: Math.max(w.chance, 0.6) };
  if (wet && (w.heavy || w.precipIn >= 0.3)) return { c: w.wind >= 15 ? 'wet_and_windy' : 'heavy_rain', p: w.chance };
  if (wet && w.wind >= 15) return { c: 'wet_and_windy', p: w.chance };
  if (wet) return { c: 'rain', p: w.chance };
  if (w.wind >= 20) return { c: 'wind_20', p: 1 };
  if (w.wind >= 15) return { c: 'wind_15', p: 1 };
  if (w.temp <= 25) return { c: 'cold', p: 1 };
  return { c: 'clear', p: 1 };
}

async function forecastGame(g: Game): Promise<GameWeather> {
  const st = STADIUMS[g.home];
  const base: GameWeather = {
    game: `${g.away} @ ${g.home}`,
    home: g.home,
    away: g.away,
    kickoff: g.kickoff,
    kickoff_confirmed: g.confirmed,
    venue: g.venue || st?.name || '',
    city: g.city || st?.city || '',
    roof: g.international ? 'international' : st?.roof ?? 'outdoor',
    status: 'unavailable',
    condition: 'clear',
    severity: 'none',
    headline: '',
    details: null,
    impact: null,
    factors: {},
    chance: null,
    wind_mph: null,
    gust_mph: null,
    temp_f: null,
    precip_in: null,
    snow_in: null,
  };
  if (g.indoor === true || st?.roof === 'dome') return { ...base, status: 'indoors', headline: 'Indoors' };
  if (g.international || !st) return { ...base, headline: 'No forecast for this venue' };
  if (!g.kickoff) return base;
  const a = Date.parse(g.kickoff);
  const b = a + 3.5 * 3600_000;
  if (a - Date.now() > 7 * 86400_000) return { ...base, status: 'too_early', headline: 'Forecast available within 7 days of kickoff' };
  if (b < Date.now()) return { ...base, headline: 'Game played' };

  let grid: any;
  try {
    grid = await gridFor(st.lat, st.lon);
  } catch {
    return { ...base, headline: 'Forecast unavailable right now' };
  }
  const max = (xs: { v: number }[]) => (xs.length ? Math.max(...xs.map((x) => x.v)) : null);
  const avg = (xs: { v: number; hours: number }[]) => {
    const h = xs.reduce((t, x) => t + x.hours, 0);
    return h ? xs.reduce((t, x) => t + x.v * x.hours, 0) / h : null;
  };
  const windS = overlap(grid.windSpeed, a, b);
  if (!windS.length) return { ...base, status: 'too_early', headline: 'Forecast not out yet for kickoff' };
  const wind = kmhToMph(avg(windS) ?? 0);
  const gust = kmhToMph(max(overlap(grid.windGust, a, b)) ?? 0);
  const temp = cToF(avg(overlap(grid.temperature, a, b)) ?? 15);
  const chance = (max(overlap(grid.probabilityOfPrecipitation, a, b)) ?? 0) / 100;
  const precipIn = mmToIn(overlap(grid.quantitativePrecipitation, a, b).reduce((t, x) => t + x.v * x.share, 0));
  const snowIn = mmToIn(overlap(grid.snowfallAmount, a, b).reduce((t, x) => t + x.v * x.share, 0));
  let heavy = false;
  let snowWx = false;
  for (const row of grid.weather?.values || []) {
    const [s, e] = span(row.validTime);
    if (Math.min(e, b) <= Math.max(s, a)) continue;
    for (const w of row.value || []) {
      if (!w?.weather) continue;
      if (/thunder/.test(w.weather) || (w.intensity === 'heavy' && /rain/.test(w.weather))) heavy = true;
      if (/snow|sleet|freezing/.test(w.weather)) snowWx = true;
    }
  }
  const { c, p } = classify({ chance, precipIn, snowIn, wind, temp, heavy, snowWx });
  const full = baseFactors(c);
  // Expected effect: scale by how likely the weather is.
  const factors: Record<string, number> = {};
  for (const pos of POSITIONS) factors[pos] = Math.round((1 + ((full[pos] ?? 1) - 1) * p) * 1000) / 1000;
  const worst = Math.min(...Object.values(factors));
  const severity: GameWeather['severity'] =
    c === 'clear' ? (chance >= 0.3 || gust >= 30 ? 'watch' : 'none') : worst <= 0.88 ? 'high' : worst <= 0.96 ? 'moderate' : 'watch';
  const bits: string[] = [];
  if (chance >= 0.2) bits.push(`${Math.round(chance * 100)}% chance of ${snowWx || snowIn > 0 ? 'snow' : 'rain'}${precipIn >= 0.05 ? `, ~${precipIn.toFixed(1)} in during the game` : ''}${snowIn >= 0.5 ? `, ${snowIn.toFixed(1)} in of snow` : ''}`);
  bits.push(`wind ${Math.round(wind)} mph${gust >= wind + 5 ? `, gusts ${Math.round(gust)}` : ''}`);
  bits.push(`${Math.round(temp)}°F`);
  const roofNote = st.roof === 'retractable';
  return {
    ...base,
    status: roofNote ? 'roof' : 'forecast',
    condition: roofNote ? 'clear' : c,
    severity: roofNote ? 'none' : severity,
    headline: roofNote ? (c === 'clear' ? 'Retractable roof' : `${LABEL[c]} outside; roof likely closed`) : c === 'clear' ? (severity === 'watch' ? 'Keep an eye on it' : 'Good conditions') : LABEL[c],
    details: bits.join(' · '),
    impact: roofNote || c === 'clear' ? null : IMPACT[c],
    factors: roofNote ? {} : factors,
    chance,
    wind_mph: Math.round(wind),
    gust_mph: Math.round(gust),
    temp_f: Math.round(temp),
    precip_in: Math.round(precipIn * 100) / 100,
    snow_in: Math.round(snowIn * 10) / 10,
  };
}

/** Weather for every game this week involving the given NFL teams, keyed by team. */
export async function weatherForTeams(season: number, week: number, teams: string[]): Promise<Record<string, GameWeather>> {
  const want = new Set(teams.map((t) => sleeperTeam(t)).filter(Boolean) as string[]);
  const games = (await weekGames(season, week)).filter((g) => want.has(g.home) || want.has(g.away));
  const results = await Promise.all(games.map((g) => forecastGame(g).catch(() => null)));
  const out: Record<string, GameWeather> = {};
  results.forEach((w) => {
    if (!w) return;
    out[w.home] = w;
    out[w.away] = w;
  });
  return out;
}

export const _test = { classify, baseFactors, span, overlap, STADIUMS };
