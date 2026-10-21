/**
 * Dynasty AI Evaluator - Draft Pick Valuation & Trade Matchmaking Engine
 * Temporal Calibration: In-Season 2026 (September 2026).
 * The 2026 Rookie Draft has already occurred; rookies are active on NFL rosters.
 * Priority Draft Capital is 2027 (Upcoming Class).
 * Multi-Year Pick Strategy (2028, 2029) provides high-leverage compounding equity.
 * Implements the Dynasty Golden Rule: "Flex for a First" (trading flex producers to contenders for future 1sts).
 */

import {
  DraftPick,
  TradeStance,
  ClassificationType,
  MasterPlayer,
  LeagueTeamSummary,
  StrategicTarget,
  FlexForFirstOpportunity,
} from '../types';
import { SEASON } from './season';

export class DraftPickEngine {
  public static readonly CURRENT_SEASON = SEASON.seasonYear;
  public static readonly UPCOMING_DRAFT_YEAR = SEASON.upcomingDraftYear; // The next rookie draft to occur

  /**
   * Calculates consensus market value for a future draft pick.
   * Calibrated with 2027 as the premier upcoming draft class,
   * with multi-year picks (2028, 2029, 2030) reflecting both time-discount and long-term equity upside.
   */
  public static calculatePickValue(year: number, round: number, tier: 'Early' | 'Mid' | 'Late' = 'Mid'): number {
    // If a pick is 2026 or earlier, the rookie draft has already concluded!
    if (year < this.UPCOMING_DRAFT_YEAR) {
      return 0; // Historical / already drafted
    }

    const yearsOut = Math.max(0, year - this.UPCOMING_DRAFT_YEAR);

    // Base values for 2027 (Upcoming Rookie Class)
    let base = 350;
    if (round === 1) {
      base = tier === 'Early' ? 6800 : tier === 'Late' ? 4400 : 5600;
    } else if (round === 2) {
      base = tier === 'Early' ? 3400 : tier === 'Late' ? 2000 : 2700;
    } else if (round === 3) {
      base = 1250;
    } else if (round === 4) {
      base = 600;
    } else if (round === 5) {
      base = 350;
    }

    // Multi-year discounting (approx 7-8% per year), but future 1sts retain high structural floor
    if (yearsOut >= 1) {
      const discount = Math.pow(0.92, yearsOut);
      base = Math.round(base * discount);
    }

    return base;
  }

  /**
   * Generates standard baseline draft picks for a team.
   * Starts at 2027 (the upcoming rookie draft) through 2029/2030.
   */
  public static generateStandardPicks(
    franchiseId: string,
    franchiseName: string,
    startYear = 2027,
    yearsAhead = 3,
    maxRounds = 4
  ): DraftPick[] {
    const picks: DraftPick[] = [];
    for (let y = startYear; y < startYear + yearsAhead; y++) {
      const yearsOut = y - this.UPCOMING_DRAFT_YEAR;
      for (let r = 1; r <= maxRounds; r++) {
        picks.push({
          id: `pick-${y}-${r}-${franchiseId}-${franchiseId}`,
          year: y,
          round: r,
          original_owner_id: franchiseId,
          original_owner_name: franchiseName,
          current_owner_id: franchiseId,
          description: `${y} Round ${r} (Own)`,
          market_value: this.calculatePickValue(y, r, 'Mid'),
          is_priority_class: y === this.UPCOMING_DRAFT_YEAR,
          years_out: yearsOut,
        });
      }
    }
    return picks;
  }

  /**
   * Determines trade stance based on DNA classification and metrics
   */
  public static determineTradeStance(
    classification: ClassificationType,
    grossLiquidity: number,
    assetHalfLife: number,
    structuralIntegrity: number
  ): { stance: TradeStance; label: string; description: string } {
    if (classification === 'Juggernaut' || (grossLiquidity >= 105 && assetHalfLife < 3.2)) {
      return {
        stance: 'WIN_NOW_BUYER',
        label: 'Win-Now Buyer',
        description: 'Pushing all-in for a championship in 2026. Actively buying veteran starters & flex depth in exchange for 2027/2028 future picks.',
      };
    } else if (classification === 'Contender') {
      return {
        stance: 'BALANCED_CONTENDER',
        label: 'Balanced Contender',
        description: 'Strong playoff roster. Looking for selective high-leverage flex upgrades without sacrificing long-term core.',
      };
    } else if (classification === 'Total Rebuild' || (grossLiquidity < 75 && assetHalfLife < 3.0)) {
      return {
        stance: 'REBUILD_SELLER',
        label: 'Rebuilding Seller',
        description: 'Liquidating veterans and flex players to hoard 2027 priority 1sts and multi-year 2028/2029 draft capital.',
      };
    } else {
      return {
        stance: 'YOUTH_ACCUMULATOR',
        label: 'Youth Accumulator',
        description: 'Patiently building through 2027 draft capital, multi-year picks, and ascending assets under age 24. Selling short-term rentals.',
      };
    }
  }

  /**
   * Generates specialized target group for a CONTENDER in "Win Now" mode:
   * Contenders want to target high-scoring productive veterans from Rebuilders/Youth Accumulators.
   */
  public static getContenderVeteranTargets(
    allTeams: LeagueTeamSummary[],
    userFranchiseId?: string
  ): StrategicTarget[] {
    const targets: StrategicTarget[] = [];

    // Filter to teams that are sellers or non-contenders
    const sellerTeams = allTeams.filter(
      (t) =>
        t.franchise_id !== userFranchiseId &&
        (t.trade_stance === 'REBUILD_SELLER' ||
          t.trade_stance === 'YOUTH_ACCUMULATOR' ||
          t.power_rank >= Math.floor(allTeams.length * 0.5))
    );

    for (const team of sellerTeams) {
      // Find veteran producers (age >= 26.5, high value or high weekly starter score)
      const allTeamPlayers = [...team.starters, ...team.bench];
      const vets = allTeamPlayers
        .filter((p) => p.age >= 26.5 && p.market_value >= 1400)
        .sort((a, b) => b.market_value - a.market_value);

      for (const vet of vets.slice(0, 2)) {
        let offer = 'Package a 2027/2028 2nd Round Pick + young developmental bench piece';
        if (vet.market_value >= 3500) {
          offer = 'Offer your 2027 1st Round Pick + upside developmental prospect';
        } else if (vet.market_value <= 1800) {
          offer = 'Offer your 2027 2nd or a 2028 pick package + backup flex piece';
        }

        targets.push({
          id: `target-vet-${team.franchise_id}-${vet.id}`,
          type: 'VETERAN',
          name: vet.full_name,
          position: vet.position,
          age: vet.age,
          market_value: vet.market_value,
          owner_franchise_id: team.franchise_id,
          owner_franchise_name: team.franchise_name,
          owner_trade_stance: team.trade_stance,
          rationale: `${team.franchise_name} is in ${team.stance_label} mode. They need future 2027/2028 capital and cannot capitalize on ${vet.full_name}'s remaining prime.`,
          suggested_offer: offer,
          player: vet,
        });
      }
    }

    targets.sort((a, b) => b.market_value - a.market_value);
    return targets;
  }

  /**
   * Generates specialized target group for a REBUILDER in "Rebuild" mode:
   * Rebuilders want to target:
   * 1. 2027 1st & 2nd Round Draft Picks (Immediate Priority)
   * 2. Multi-Year Draft Picks (2028 & 2029 1sts) from aging contenders (Compounding Arbitrage)
   * 3. Ascending young cornerstones (age <= 24)
   */
  public static getRebuilderPickAndYouthTargets(
    allTeams: LeagueTeamSummary[],
    userFranchiseId?: string
  ): StrategicTarget[] {
    const targets: StrategicTarget[] = [];

    // Filter to contender teams (buyers)
    const buyerTeams = allTeams.filter(
      (t) =>
        t.franchise_id !== userFranchiseId &&
        (t.trade_stance === 'WIN_NOW_BUYER' ||
          t.trade_stance === 'BALANCED_CONTENDER' ||
          t.power_rank <= Math.ceil(allTeams.length * 0.6))
    );

    for (const team of buyerTeams) {
      // 1. Target their 2027 Priority Picks (Next upcoming rookie class)
      const priorityPicks = (team.draft_picks || [])
        .filter((p) => p.year === this.UPCOMING_DRAFT_YEAR && p.round <= 2)
        .sort((a, b) => a.round - b.round);

      for (const pick of priorityPicks.slice(0, 1)) {
        targets.push({
          id: `target-pick-2027-${team.franchise_id}-${pick.id}`,
          type: 'PICK',
          name: pick.description,
          position: 'PICK',
          market_value: pick.market_value,
          owner_franchise_id: team.franchise_id,
          owner_franchise_name: team.franchise_name,
          owner_trade_stance: team.trade_stance,
          rationale: `2027 PRIORITY CLASS: Immediate draft capital currency. ${team.franchise_name} is pushing for a championship and motivated to spend 2027 picks to win now.`,
          suggested_offer: `Send a veteran starter or exploit "Flex for a First" to lock in this premier 2027 pick.`,
          pick,
        });
      }

      // 2. Multi-Year Picks (2028 & 2029 1sts/2nds) - The Dynasty Arbitrage Play!
      const multiYearPicks = (team.draft_picks || [])
        .filter((p) => p.year > this.UPCOMING_DRAFT_YEAR && p.round === 1)
        .sort((a, b) => a.year - b.year);

      for (const pick of multiYearPicks.slice(0, 1)) {
        const isAgingContender = team.asset_half_life < 2.8;
        targets.push({
          id: `target-multiyear-${team.franchise_id}-${pick.id}`,
          type: 'MULTI_YEAR_PICK',
          name: pick.description,
          position: 'PICK',
          market_value: pick.market_value,
          owner_franchise_id: team.franchise_id,
          owner_franchise_name: team.franchise_name,
          owner_trade_stance: team.trade_stance,
          rationale: `MULTI-YEAR ARBITRAGE: Contenders heavily discount picks 2+ years out (${pick.year}). ${
            isAgingContender
              ? `Their roster has a short half-life (${team.asset_half_life} yrs)—this pick has high odds of becoming an early top-3 pick by ${pick.year}!`
              : `Picks never suffer injuries or age-cliffs and compound in value 25%+ annually.`
          }`,
          suggested_offer: `Offer a productive flex player or secondary veteran. Contenders gladly trade ${pick.year} 1sts for in-season wins!`,
          pick,
          multi_year_bonus: 'Compounding Equity • Low Cost Acquisition',
        });
      }

      // 3. Target their ascending youth assets (age <= 24, high ceiling)
      const allTeamPlayers = [...team.starters, ...team.bench];
      const youth = allTeamPlayers
        .filter((p) => p.age <= 24.5 && p.market_value >= 2500)
        .sort((a, b) => b.market_value - a.market_value);

      for (const youngPlayer of youth.slice(0, 1)) {
        targets.push({
          id: `target-youth-${team.franchise_id}-${youngPlayer.id}`,
          type: 'YOUTH',
          name: youngPlayer.full_name,
          position: youngPlayer.position,
          age: youngPlayer.age,
          market_value: youngPlayer.market_value,
          owner_franchise_id: team.franchise_id,
          owner_franchise_name: team.franchise_name,
          owner_trade_stance: team.trade_stance,
          rationale: `Foundation dynasty asset with 5+ years of prime longevity. Perfect centerpiece for your rebuild core.`,
          suggested_offer: `Offer multiple productive starters or a high-scoring veteran + pick package.`,
          player: youngPlayer,
        });
      }
    }

    // Sort by value descending
    targets.sort((a, b) => b.market_value - a.market_value);
    return targets;
  }

  /**
   * DYNASTY RULE TO LIVE BY: "FLEX FOR A FIRST"
   * Detects opportunities where the user can trade a productive flex asset (WR3, RB2, depth producer)
   * to a contending team in exchange for a 2027 or 2028 1st Round Pick!
   *
   * Why: Flex points are transient and easily replaced on waivers or through depth;
   * future 1sts are appreciating blue-chip equity tickets that never get hurt.
   * Timing: Right now in-season (Weeks 3-10, September-November 2026), contenders are
   * battling injuries, bye weeks, and playoff urgency, creating peak leverage to extract 1st round picks!
   */
  public static findFlexForFirstOpportunities(
    userPlayers: MasterPlayer[],
    allTeams: LeagueTeamSummary[],
    userFranchiseId?: string
  ): FlexForFirstOpportunity[] {
    const opportunities: FlexForFirstOpportunity[] = [];

    // 1. Identify "Flex for a 1st" candidates on user's roster
    // Typical flex candidates: WR or RB (or TE), age 23-29, market value 1,400 to 3,800
    // (Solid weekly contributors, not irreplaceable top-tier cornerstones)
    const flexCandidates = userPlayers
      .filter((p) => {
        const isEligiblePos = p.position === 'WR' || p.position === 'RB' || p.position === 'TE';
        const inValueWindow = p.market_value >= 1400 && p.market_value <= 3900;
        return isEligiblePos && inValueWindow;
      })
      .sort((a, b) => b.market_value - a.market_value);

    if (flexCandidates.length === 0) return opportunities;

    // 2. Identify Contenders holding 2027 or 2028 1st Round Picks
    const targetContenders = allTeams.filter((t) => {
      if (t.franchise_id === userFranchiseId) return false;
      const isContender =
        t.trade_stance === 'WIN_NOW_BUYER' ||
        t.trade_stance === 'BALANCED_CONTENDER' ||
        t.power_rank <= Math.ceil(allTeams.length * 0.6);
      const hasFirsts = (t.draft_picks || []).some(
        (p) => (p.year === 2027 || p.year === 2028) && p.round === 1
      );
      return isContender && hasFirsts;
    });

    for (const contender of targetContenders) {
      // Find contender's available 1st round picks (prioritize 2027, then 2028)
      const availableFirsts = (contender.draft_picks || [])
        .filter((p) => (p.year === 2027 || p.year === 2028) && p.round === 1)
        .sort((a, b) => a.year - b.year);

      for (const pick of availableFirsts) {
        // Find best matched flex candidate
        // If pick is 2027 1st (val ~5600), package flex (~2500-3500) + minor sweetener,
        // or straight up if flex is in peak demand (e.g. RB starter or hot WR2).
        for (const flex of flexCandidates.slice(0, 3)) {
          const valueDiff = pick.market_value - flex.market_value;
          let offer = `Send ${flex.full_name} for ${contender.franchise_name}'s ${pick.description}`;
          if (valueDiff > 1800) {
            offer = `Package ${flex.full_name} + a future 3rd or developmental piece for ${contender.franchise_name}'s ${pick.description}`;
          }

          opportunities.push({
            id: `fff-${flex.id}-${contender.franchise_id}-${pick.id}`,
            flex_player: flex,
            target_team: contender,
            target_pick: pick,
            urgency: contender.trade_stance === 'WIN_NOW_BUYER' ? 'HIGH' : 'MEDIUM',
            timing_window: 'In-Season Sweet Spot (Weeks 3-10)',
            rationale: `Flex for a First Doctrine: ${flex.full_name} provides immediate starting points that ${contender.franchise_name} needs to chase the 2026 title. Transmute their urgent win-now pressure into an appreciating ${pick.year} 1st Round Pick!`,
            suggested_offer: offer,
            contender_vulnerability: `${contender.franchise_name} is in ${contender.stance_label} mode. Their championship window is active, making them prone to trade future draft equity for dependable weekly production.`,
            equity_gain_summary: `Acquiring a ${pick.year} 1st gives you permanent, injury-proof draft capital that appreciates 25%+ into the off-season.`,
          });
        }
      }
    }

    // Limit to top high-quality opportunities
    return opportunities.slice(0, 8);
  }

  /**
   * Generates target trade recommendations for the user depending on their championship window
   */
  public static generateTargetAssetsForUser(
    userStance: TradeStance,
    targetTeamStance: TradeStance,
    targetTeamPlayers: MasterPlayer[],
    targetTeamPicks: DraftPick[]
  ): string[] {
    const targets: string[] = [];

    // Scenario A: User is a Win-Now Buyer
    if (userStance === 'WIN_NOW_BUYER' || userStance === 'BALANCED_CONTENDER') {
      if (targetTeamStance === 'REBUILD_SELLER' || targetTeamStance === 'YOUTH_ACCUMULATOR') {
        const valuableVets = targetTeamPlayers.filter((p) => p.age >= 26.5 && p.market_value >= 1800);
        valuableVets.slice(0, 3).forEach((p) => {
          targets.push(`Acquire ${p.full_name} (${p.position}, Age ${p.age}) to bolster weekly starting firepower`);
        });
      }
    }

    // Scenario B: User is a Rebuilding Seller
    if (userStance === 'REBUILD_SELLER' || userStance === 'YOUTH_ACCUMULATOR') {
      if (targetTeamStance === 'WIN_NOW_BUYER' || targetTeamStance === 'BALANCED_CONTENDER') {
        // Prioritize 2027 picks first
        const top2027Picks = (targetTeamPicks || []).filter((p) => p.year === 2027 && p.round <= 2);
        top2027Picks.slice(0, 2).forEach((pick) => {
          targets.push(`Priority: Target 2027 ${pick.description} (${pick.market_value.toLocaleString()} value)`);
        });

        // Highlight Multi-Year Picks (2028/2029)
        const multiYear1sts = (targetTeamPicks || []).filter((p) => p.year >= 2028 && p.round === 1);
        multiYear1sts.slice(0, 1).forEach((pick) => {
          targets.push(`Multi-Year Arbitrage: Target ${pick.description} before contender roster ages`);
        });

        const youngWRs = targetTeamPlayers.filter((p) => p.position === 'WR' && p.age <= 24);
        youngWRs.slice(0, 1).forEach((p) => {
          targets.push(`Acquire ascending youth ${p.full_name} (Age ${p.age})`);
        });
      }
    }

    if (targets.length === 0) {
      const topAsset = targetTeamPlayers[0];
      if (topAsset) {
        targets.push(`Explore swap package for ${topAsset.full_name} (${topAsset.position})`);
      }
    }

    return targets;
  }
}

