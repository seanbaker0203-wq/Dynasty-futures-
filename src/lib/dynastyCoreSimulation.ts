/**
 * Dynasty AI Evaluator - Dynasty Core Health Score & 3-Season Evolution Engine
 * Models long-term trajectory of roster age, talent tier density, and composite
 * Dynasty Core health over a 3-season horizon (Status Quo vs Post-Trade).
 */

import { MasterPlayer, DraftPick, Position } from '../types';

export interface SeasonProjectionPoint {
  seasonIndex: number; // 0 = 2026 (Current), 1 = 2027 (+1 yr), 2 = 2028 (+2 yrs), 3 = 2029 (+3 yrs)
  seasonYear: number;
  seasonLabel: string;

  // Status Quo (Without Trade)
  statusQuoHealthScore: number;
  statusQuoRosterAge: number;
  statusQuoTalentTierScore: number;
  statusQuoAssetValue: number;

  // Post-Trade (With Accepted Trade)
  postTradeHealthScore: number;
  postTradeRosterAge: number;
  postTradeTalentTierScore: number;
  postTradeAssetValue: number;

  // Net Deltas (Post-Trade minus Status Quo)
  healthScoreDelta: number;
  rosterAgeDelta: number;
  talentTierScoreDelta: number;
  assetValueDelta: number;

  // Narrative highlight
  keyTrend: string;
}

export interface DynastyCoreSummary {
  currentHealthScore: number;
  postTradeHealthScore: number;
  healthScoreDelta: number;

  currentRosterAge: number;
  postTradeRosterAge: number;
  rosterAgeDelta: number;

  currentTalentTierScore: number;
  postTradeTalentTierScore: number;
  talentTierDelta: number;

  trajectoryVerdict: 'SURGING_CONTENDER' | 'EXTENDED_WINDOW' | 'WIN_NOW_SPIKE' | 'VALUE_EROSION' | 'BALANCED_STABILITY';
  verdictTitle: string;
  verdictDescription: string;
  championshipWindowDeltaYears: number;

  projections: SeasonProjectionPoint[];
}

export class DynastyCoreSimulationEngine {
  // Age cliff degradation rates by position per year
  private static readonly DEPRECIATION_CURVES: Record<Position, { primeThreshold: number; cliffThreshold: number; annualCliffDecay: number }> = {
    QB: { primeThreshold: 29, cliffThreshold: 33, annualCliffDecay: 0.12 },
    RB: { primeThreshold: 24.5, cliffThreshold: 26.5, annualCliffDecay: 0.28 },
    WR: { primeThreshold: 27, cliffThreshold: 29.5, annualCliffDecay: 0.16 },
    TE: { primeThreshold: 27.5, cliffThreshold: 30.5, annualCliffDecay: 0.15 },
    K: { primeThreshold: 30, cliffThreshold: 34, annualCliffDecay: 0.08 },
    DEF: { primeThreshold: 26, cliffThreshold: 28, annualCliffDecay: 0.18 },
    PICK: { primeThreshold: 22, cliffThreshold: 24, annualCliffDecay: 0.0 },
  };

  /**
   * Projects a player's market value and age forward by N seasons
   */
  public static projectPlayerValue(player: MasterPlayer, seasonsForward: number): { projectedValue: number; projectedAge: number } {
    const projectedAge = Math.round((player.age + seasonsForward) * 10) / 10;
    const pos = (player.position as Position) || 'WR';
    const curve = this.DEPRECIATION_CURVES[pos] || this.DEPRECIATION_CURVES.WR;

    let valueMultiplier = 1.0;

    for (let yr = 1; yr <= seasonsForward; yr++) {
      const ageAtYear = player.age + yr;

      if (ageAtYear < curve.primeThreshold) {
        // Ascending young player entering prime (appreciates +4% to +10%)
        valueMultiplier *= 1.05;
      } else if (ageAtYear <= curve.cliffThreshold) {
        // Peak prime plateau (stable ±2%)
        valueMultiplier *= 0.98;
      } else {
        // Past cliff: compounding steep decay
        const yearsPastCliff = ageAtYear - curve.cliffThreshold;
        const decayRate = Math.min(0.60, curve.annualCliffDecay * (1 + yearsPastCliff * 0.25));
        valueMultiplier *= (1 - decayRate);
      }
    }

    const projectedValue = Math.max(200, Math.round(player.market_value * valueMultiplier));
    return { projectedValue, projectedAge };
  }

  /**
   * Estimates draft pick equity maturation when advancing seasons forward
   * e.g. a 2027 1st round pick in 2027 becomes an active rookie asset worth 5,500+ pts
   */
  public static projectDraftPicks(picks: DraftPick[], currentYear: number, seasonsForward: number): { rookieAddedValue: number; rookieAvgAge: number; rookieCount: number } {
    const targetYear = currentYear + seasonsForward;
    let rookieAddedValue = 0;
    let rookieCount = 0;

    for (const pick of picks) {
      if (pick.year <= targetYear) {
        // Pick has converted into an active rookie/young player!
        rookieCount++;
        // Round 1 picks yield premium talent (~5,200-6,800), Round 2 (~2,400-3,200), etc.
        if (pick.round === 1) {
          const tierBonus = pick.tier === 'Early' ? 7000 : pick.tier === 'Mid' ? 5600 : 4400;
          rookieAddedValue += tierBonus;
        } else if (pick.round === 2) {
          rookieAddedValue += 2600;
        } else {
          rookieAddedValue += 1200;
        }
      }
    }

    return {
      rookieAddedValue,
      rookieAvgAge: 21.5,
      rookieCount,
    };
  }

  /**
   * Computes Talent Tier Score (0–100) based on asset density:
   * Tier 1 (market >= 7000): 25 pts each
   * Tier 2 (5000-6999): 16 pts each
   * Tier 3 (3200-4999): 9 pts each
   * Tier 4 (1600-3199): 4 pts each
   * Normalized against a league benchmark of ~100 max.
   */
  public static computeTalentTierScore(playerValues: number[]): number {
    if (!playerValues || playerValues.length === 0) return 20;

    let tierPoints = 0;
    for (const val of playerValues) {
      if (val >= 7000) {
        tierPoints += 22; // Elite anchor
      } else if (val >= 5000) {
        tierPoints += 15; // High-end starter
      } else if (val >= 3200) {
        tierPoints += 9;  // Solid contributor
      } else if (val >= 1600) {
        tierPoints += 4;  // Flex depth
      } else {
        tierPoints += 1;
      }
    }

    // Benchmark top 10 assets: a normal juggernaut has ~70-90 tier points
    const normalized = Math.min(100, Math.round((tierPoints / 85) * 100));
    return Math.max(15, normalized);
  }

  /**
   * Computes Roster Age / Longevity Score (0–100)
   * Average core age <= 23.5 -> 95-100
   * Average core age 25.0 -> 80
   * Average core age 27.5 -> 55
   * Average core age >= 29.5 -> 25
   */
  public static computeAgeScore(weightedAvgAge: number): number {
    if (weightedAvgAge <= 23.0) return 96;
    if (weightedAvgAge >= 30.0) return 25;
    // Linear regression from 23.0 (96) to 30.0 (25)
    const score = 96 - ((weightedAvgAge - 23.0) / 7.0) * 71;
    return Math.max(10, Math.min(99, Math.round(score * 10) / 10));
  }

  /**
   * Computes overall Dynasty Core Health Score (0–100)
   * Formula: (Talent Tier Score * 0.48) + (Age/Longevity Score * 0.36) + (Structural Depth * 0.16)
   */
  public static computeCompositeHealthScore(
    talentTierScore: number,
    ageScore: number,
    depthRatio: number = 0.5
  ): number {
    const depthScore = Math.min(100, Math.round(depthRatio * 100));
    const composite = talentTierScore * 0.48 + ageScore * 0.36 + depthScore * 0.16;
    return Math.max(10, Math.min(99, Math.round(composite * 10) / 10));
  }

  /**
   * Calculates weighted average roster age
   */
  public static calculateWeightedRosterAge(
    players: { age: number; value: number }[],
    rookies: { count: number; avgAge: number; value: number }
  ): number {
    let totalVal = 0;
    let weightedAgeSum = 0;

    for (const p of players) {
      const val = Math.max(100, p.value);
      totalVal += val;
      weightedAgeSum += p.age * val;
    }

    if (rookies.count > 0 && rookies.value > 0) {
      totalVal += rookies.value;
      weightedAgeSum += rookies.avgAge * rookies.value;
    }

    if (totalVal === 0) return 25.5;
    return Math.round((weightedAgeSum / totalVal) * 10) / 10;
  }

  /**
   * Main Simulation Engine:
   * Projects 3 seasons (2026, 2027, 2028, 2029) for both Status Quo and Post-Trade
   */
  public static simulateDynastyCoreTrajectory(params: {
    currentPlayers: MasterPlayer[];
    currentPicks: DraftPick[];
    sendPlayerIds: string[];
    sendPickIds: string[];
    receivePlayers: MasterPlayer[];
    receivePicks: DraftPick[];
    baseCurrentYear?: number;
  }): DynastyCoreSummary {
    const {
      currentPlayers,
      currentPicks,
      sendPlayerIds,
      sendPickIds,
      receivePlayers,
      receivePicks,
      baseCurrentYear = 2026,
    } = params;

    // 1. Post-Trade Player and Pick rosters
    const postTradePlayers = [
      ...currentPlayers.filter((p) => !sendPlayerIds.includes(p.id)),
      ...receivePlayers,
    ];

    const postTradePicks = [
      ...currentPicks.filter((pk) => !sendPickIds.includes(pk.id)),
      ...receivePicks,
    ];

    const seasonPoints: SeasonProjectionPoint[] = [];

    // Simulate for Season 0 (Now - 2026), Season 1 (+1 yr - 2027), Season 2 (+2 yrs - 2028), Season 3 (+3 yrs - 2029)
    for (let seasonIndex = 0; seasonIndex <= 3; seasonIndex++) {
      const seasonYear = baseCurrentYear + seasonIndex;
      const seasonLabel =
        seasonIndex === 0
          ? `${seasonYear} (Current)`
          : seasonIndex === 1
          ? `${seasonYear} (+1 Season)`
          : seasonIndex === 2
          ? `${seasonYear} (+2 Seasons)`
          : `${seasonYear} (+3 Seasons)`;

      // --- Status Quo Calculations ---
      const statusQuoProjectedPlayers = currentPlayers.map((p) => {
        const { projectedValue, projectedAge } = this.projectPlayerValue(p, seasonIndex);
        return { age: projectedAge, value: projectedValue };
      });
      const statusQuoRookies = this.projectDraftPicks(currentPicks, baseCurrentYear, seasonIndex);
      const statusQuoRosterAge = this.calculateWeightedRosterAge(statusQuoProjectedPlayers, {
        count: statusQuoRookies.rookieCount,
        avgAge: statusQuoRookies.rookieAvgAge,
        value: statusQuoRookies.rookieAddedValue,
      });

      const statusQuoAllValues = [
        ...statusQuoProjectedPlayers.map((p) => p.value),
        ...(statusQuoRookies.rookieCount > 0 ? [statusQuoRookies.rookieAddedValue / Math.max(1, statusQuoRookies.rookieCount)] : []),
      ];
      const statusQuoTalentTier = this.computeTalentTierScore(statusQuoAllValues);
      const statusQuoAgeScore = this.computeAgeScore(statusQuoRosterAge);
      const statusQuoHealth = this.computeCompositeHealthScore(statusQuoTalentTier, statusQuoAgeScore);
      const statusQuoAssetTotal = statusQuoProjectedPlayers.reduce((s, p) => s + p.value, 0) + statusQuoRookies.rookieAddedValue;

      // --- Post-Trade Calculations ---
      const postTradeProjectedPlayers = postTradePlayers.map((p) => {
        const { projectedValue, projectedAge } = this.projectPlayerValue(p, seasonIndex);
        return { age: projectedAge, value: projectedValue };
      });
      const postTradeRookies = this.projectDraftPicks(postTradePicks, baseCurrentYear, seasonIndex);
      const postTradeRosterAge = this.calculateWeightedRosterAge(postTradeProjectedPlayers, {
        count: postTradeRookies.rookieCount,
        avgAge: postTradeRookies.rookieAvgAge,
        value: postTradeRookies.rookieAddedValue,
      });

      const postTradeAllValues = [
        ...postTradeProjectedPlayers.map((p) => p.value),
        ...(postTradeRookies.rookieCount > 0 ? [postTradeRookies.rookieAddedValue / Math.max(1, postTradeRookies.rookieCount)] : []),
      ];
      const postTradeTalentTier = this.computeTalentTierScore(postTradeAllValues);
      const postTradeAgeScore = this.computeAgeScore(postTradeRosterAge);
      const postTradeHealth = this.computeCompositeHealthScore(postTradeTalentTier, postTradeAgeScore);
      const postTradeAssetTotal = postTradeProjectedPlayers.reduce((s, p) => s + p.value, 0) + postTradeRookies.rookieAddedValue;

      // Deltas
      const healthDelta = Math.round((postTradeHealth - statusQuoHealth) * 10) / 10;
      const ageDelta = Math.round((postTradeRosterAge - statusQuoRosterAge) * 10) / 10;
      const tierDelta = postTradeTalentTier - statusQuoTalentTier;
      const assetDelta = postTradeAssetTotal - statusQuoAssetTotal;

      // Narrative key trend
      let keyTrend = '';
      if (seasonIndex === 0) {
        keyTrend = healthDelta >= 0 ? 'Immediate core health upgrade' : 'Immediate short-term valuation reset';
      } else if (seasonIndex === 1) {
        keyTrend =
          healthDelta > 4
            ? 'Accelerated prime window with sustained talent tier'
            : healthDelta < -4
            ? 'Age cliff exposure reduces health trajectory'
            : 'Balanced year-over-year stability';
      } else if (seasonIndex === 2) {
        keyTrend =
          healthDelta > 6
            ? 'Draft capital and youth maturity surge'
            : ageDelta > 1.2
            ? 'Veteran cliff attrition requires active re-tooling'
            : 'Sustained competitive equity';
      } else {
        keyTrend =
          healthDelta >= 5
            ? 'Long-term dynasty apex achieved'
            : healthDelta <= -5
            ? 'Rebuild cycle required after championship push'
            : 'Core maintains parity with league baseline';
      }

      seasonPoints.push({
        seasonIndex,
        seasonYear,
        seasonLabel,
        statusQuoHealthScore: statusQuoHealth,
        statusQuoRosterAge,
        statusQuoTalentTierScore: statusQuoTalentTier,
        statusQuoAssetValue: statusQuoAssetTotal,

        postTradeHealthScore: postTradeHealth,
        postTradeRosterAge,
        postTradeTalentTierScore: postTradeTalentTier,
        postTradeAssetValue: postTradeAssetTotal,

        healthScoreDelta: healthDelta,
        rosterAgeDelta: ageDelta,
        talentTierScoreDelta: tierDelta,
        assetValueDelta: assetDelta,
        keyTrend,
      });
    }

    // Trajectory verdict analysis
    const year0 = seasonPoints[0];
    const year3 = seasonPoints[3];
    const healthShift3yr = year3.healthScoreDelta;
    const ageShift = year0.rosterAgeDelta;

    let verdict: DynastyCoreSummary['trajectoryVerdict'] = 'BALANCED_STABILITY';
    let verdictTitle = 'Balanced Timeline Equilibrium';
    let verdictDesc = 'This trade preserves your current timeline while exchanging lateral positional capital.';
    let windowDelta = 0;

    if (year0.healthScoreDelta > 2 && year3.healthScoreDelta >= 4) {
      verdict = 'SURGING_CONTENDER';
      verdictTitle = 'Dynasty Apex: Compounding Multi-Year Core Expansion';
      verdictDesc = 'Accepted trade improves immediate championship odds AND projects a higher health score in Year 3 through appreciating youth or draft capital.';
      windowDelta = +2.0;
    } else if (year3.healthScoreDelta >= 6 && ageShift < 0) {
      verdict = 'EXTENDED_WINDOW';
      verdictTitle = 'Youth Surge: Championship Horizon Extended';
      verdictDesc = 'By trimming weighted roster age and stacking high-tier future equity, your dynasty core health score accelerates past your baseline by Year 3.';
      windowDelta = +2.5;
    } else if (year0.healthScoreDelta > 3 && year3.healthScoreDelta < -3) {
      verdict = 'WIN_NOW_SPIKE';
      verdictTitle = 'Win-Now Peak with 3-Year Cliff Exposure';
      verdictDesc = 'The trade significantly elevates Year 1 firepower for a title run, but sacrifices Year 3 sustainability as acquired veterans approach the age cliff.';
      windowDelta = -1.0;
    } else if (year0.healthScoreDelta < -3 && year3.healthScoreDelta < 0) {
      verdict = 'VALUE_EROSION';
      verdictTitle = 'Dynasty Core Dilution: Negative Long-Term Trajectory';
      verdictDesc = 'This transaction degrades both near-term talent tiers and long-term health scores. Reconsider terms to preserve core equity.';
      windowDelta = -1.5;
    } else {
      verdict = 'BALANCED_STABILITY';
      verdictTitle = 'Core Longevity Maintained';
      verdictDesc = 'Roster age and talent tier curves remain aligned with your baseline championship trajectory.';
      windowDelta = 0;
    }

    return {
      currentHealthScore: year0.statusQuoHealthScore,
      postTradeHealthScore: year0.postTradeHealthScore,
      healthScoreDelta: year0.healthScoreDelta,

      currentRosterAge: year0.statusQuoRosterAge,
      postTradeRosterAge: year0.postTradeRosterAge,
      rosterAgeDelta: year0.rosterAgeDelta,

      currentTalentTierScore: year0.statusQuoTalentTierScore,
      postTradeTalentTierScore: year0.postTradeTalentTierScore,
      talentTierDelta: year0.talentTierScoreDelta,

      trajectoryVerdict: verdict,
      verdictTitle,
      verdictDescription: verdictDesc,
      championshipWindowDeltaYears: windowDelta,

      projections: seasonPoints,
    };
  }
}
