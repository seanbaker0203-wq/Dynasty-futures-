/** League trade histories built recently (shared by the history route, trade tools and league-norm advice). */
import type { LeagueHistory } from '../../src/types';

export const historyCache = new Map<string, { at: number; data: LeagueHistory }>();
export const historyFor = (platform: string, leagueId: string) => historyCache.get(`${platform}:${leagueId}`)?.data ?? null;
