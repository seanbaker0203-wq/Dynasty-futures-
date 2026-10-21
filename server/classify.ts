/**
 * League-relative team labels.
 *
 * Market values are steep (a top player ~10,000, a mid 1st ~1,900), so fixed thresholds
 * over-fire. Instead every team is graded against the rest of its own league:
 *   - lineup:  starting-lineup value rank
 *   - runway:  value-weighted years of prime left (Asset Half-Life) rank
 *   - picks:   draft capital rank
 */
import type { ClassificationType, TradeStance } from '../src/types';

export interface TeamStanding {
  id: string;
  starterValue: number;
  halfLife: number;
  pickValue: number;
  grossLiquidity: number;
}

export interface TeamGrade {
  classification: ClassificationType;
  stance: TradeStance;
  /** 0 = best in league, 1 = worst */
  lineupPct: number;
  /** 0 = youngest / longest runway, 1 = oldest */
  agePct: number;
  /** 0 = most draft capital, 1 = least */
  picksPct: number;
}

/** Percentile position (0 = first) of each id when sorted best-first by `score`. */
function percentiles(teams: TeamStanding[], score: (t: TeamStanding) => number): Map<string, number> {
  const sorted = [...teams].sort((a, b) => score(b) - score(a));
  const denom = Math.max(1, sorted.length - 1);
  return new Map(sorted.map((t, i) => [t.id, i / denom]));
}

export function gradeLeague(teams: TeamStanding[]): Map<string, TeamGrade> {
  const lineup = percentiles(teams, (t) => t.starterValue);
  const age = percentiles(teams, (t) => t.halfLife);
  const picks = percentiles(teams, (t) => t.pickValue);
  const n = teams.length;
  const top = 1 / Math.max(1, n - 1) + 1e-9; // percentile of the #2 team

  const grades = new Map<string, TeamGrade>();
  for (const t of teams) {
    const lineupPct = lineup.get(t.id)!;
    const agePct = age.get(t.id)!;
    const picksPct = picks.get(t.id)!;

    let classification: ClassificationType;
    if (lineupPct < top && t.grossLiquidity >= 125 && (n < 12 ? lineupPct === 0 : true)) {
      classification = 'Juggernaut'; // clear #1 (or top two in big leagues), far above the median
    } else if (lineupPct <= 0.34) {
      classification = agePct >= 0.67 ? 'Fraudulent Contender' : 'Contender'; // contending but among the oldest
    } else if (lineupPct >= 0.66) {
      classification = agePct <= 0.34 || picksPct <= 0.34 ? 'Productive Struggle' : 'Total Rebuild';
    } else {
      classification = 'Middle of the Pack';
    }

    let stance: TradeStance;
    switch (classification) {
      case 'Juggernaut':
      case 'Fraudulent Contender':
        stance = 'WIN_NOW_BUYER';
        break;
      case 'Contender':
        stance = agePct >= 0.5 ? 'WIN_NOW_BUYER' : 'BALANCED_CONTENDER';
        break;
      case 'Total Rebuild':
        stance = 'REBUILD_SELLER';
        break;
      case 'Productive Struggle':
        stance = 'YOUTH_ACCUMULATOR';
        break;
      default:
        stance = lineupPct < 0.5 ? 'BALANCED_CONTENDER' : 'YOUTH_ACCUMULATOR';
    }

    grades.set(t.id, { classification, stance, lineupPct, agePct, picksPct });
  }
  return grades;
}
