/**
 * Season calendar derived from today's date, so nothing in the app goes stale
 * when the calendar rolls over.
 *
 * - seasonYear: the fantasy season leagues are currently filed under. Sleeper and
 *   MFL roll leagues forward around March, so Jan–Feb still belong to last season.
 * - upcomingDraftYear: the next rookie draft. Rookie drafts finish by early June,
 *   so from June onward the next draft is next calendar year.
 */
export interface SeasonContext {
  seasonYear: number;
  upcomingDraftYear: number;
}

export function getSeasonContext(now: Date = new Date()): SeasonContext {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan
  return {
    seasonYear: month >= 2 ? year : year - 1,
    upcomingDraftYear: month >= 5 ? year + 1 : year,
  };
}

export const SEASON = getSeasonContext();
