/**
 * Dynasty AI Evaluator - Roster DNA Mathematical Processing Engine (Slice 2 + Lineup-Aware Rules & Remediation)
 * TypeScript implementation of Gross Liquidity, Asset Half-Life, Structural Integrity,
 * Lineup-Slot-Aware Starters/Bench Allocation, Championship Window Analytics,
 * and Diagnostic Roster Remediation.
 */

import {
  MasterPlayer,
  RosterRecord,
  RosterDNAMetrics,
  PositionalBreakdown,
  RosterEvaluationResult,
  Position,
  ClassificationType,
  LeagueSettings,
  ChampionshipWindow,
  RosterRemediationAdvice,
} from '../types';
import { SEASON } from './season';

export class RosterDNAMathEngine {
  // Peak-performance dropoff thresholds in fractional years by position
  public static readonly DROPOFF_THRESHOLDS: Record<Position, number> = {
    QB: 33.0,
    RB: 26.5,
    WR: 29.5,
    TE: 30.5,
    K: 34.0,
    DEF: 28.0,
    PICK: 23.0,
  };

  // Standard 10-team / 12-team starting lineup baseline
  public static readonly DEFAULT_LEAGUE_BASELINE_VALUE: number = 22500;
  public static readonly DEFAULT_STARTER_SLOTS: number = 11;

  public static readonly DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
    league_size: 10,
    roster_size: 28,
    starter_count: 11,
    slots: {
      QB: 1,
      RB: 2,
      WR: 3,
      TE: 1,
      FLEX: 2,
      SUPER_FLEX: 0,
      K: 1,
      DEF: 1,
    },
    scoring_type: 'PPR',
  };

  /**
   * Calculates remaining prime years relative to position dropoff thresholds
   */
  public static calculateRemainingPrime(player: MasterPlayer): number {
    const pos = (player.position as Position) || 'WR';
    const threshold = this.DROPOFF_THRESHOLDS[pos] ?? 29.0;
    const age = player.age > 0 ? player.age : 24.0;

    if (age <= threshold) {
      return Math.round((threshold - age) * 100) / 100;
    } else {
      const decay = 1.0 / (1.0 + (age - threshold) * 1.5);
      return Math.round(Math.max(0.1, decay) * 100) / 100;
    }
  }

  /**
   * Calculates value-weighted mean age relative to position peak-performance dropoff thresholds
   */
  public static calculateAssetHalfLife(players: MasterPlayer[]): number {
    if (!players || players.length === 0) return 0.0;

    const totalValue = players.reduce((sum, p) => sum + p.market_value, 0);
    if (totalValue <= 0) {
      const avgPrime = players.reduce((sum, p) => sum + this.calculateRemainingPrime(p), 0) / players.length;
      return Math.round(avgPrime * 10) / 10;
    }

    const weightedPrime = players.reduce((sum, p) => {
      return sum + p.market_value * this.calculateRemainingPrime(p);
    }, 0);

    const halfLife = weightedPrime / totalValue;
    return Math.round(Math.max(0.1, halfLife) * 10) / 10;
  }

  /**
   * Partitions roster into Starters and Bench using EXACT league lineup slots.
   * Prevents putting 4 starting QBs in a 1-QB league and ensures elite WRs start.
   */
  public static splitStartersAndBench(
    players: MasterPlayer[],
    starterIds?: string[],
    settings?: LeagueSettings
  ): { starters: MasterPlayer[]; bench: MasterPlayer[] } {
    if (!players || players.length === 0) return { starters: [], bench: [] };

    const slots = settings?.slots || this.DEFAULT_LEAGUE_SETTINGS.slots;
    
    // CRITICAL: Starters can ONLY be picked from players on the ACTIVE roster (never IR or TAXI)
    const activeCandidates = players.filter((p) => p.roster_designation !== 'IR' && p.roster_designation !== 'TAXI');
    const available = [...(activeCandidates.length > 0 ? activeCandidates : players)].sort((a, b) => b.market_value - a.market_value);

    // If explicit starterIds were submitted and adhere to positional validity
    if (starterIds && starterIds.length >= 8) {
      const idSet = new Set(starterIds);
      const explicitStarters = available.filter((p) => idSet.has(p.id));
      const explicitBench = available.filter((p) => !idSet.has(p.id));

      const qbCount = explicitStarters.filter((p) => p.position === 'QB').length;
      // If explicit starters has <= max allowed QBs, accept it
      const maxAllowedQBs = (slots.QB ?? 1) + (slots.SUPER_FLEX || 0);
      if (qbCount <= maxAllowedQBs && explicitStarters.length >= 8) {
        return { starters: explicitStarters, bench: explicitBench };
      }
    }

    // Lineup-slot allocation engine
    const chosenStarters: MasterPlayer[] = [];
    const usedIds = new Set<string>();

    const pickForSlot = (posFilter: (p: MasterPlayer) => boolean, count: number) => {
      let picked = 0;
      for (const p of available) {
        if (picked >= count) break;
        if (!usedIds.has(p.id) && posFilter(p)) {
          chosenStarters.push(p);
          usedIds.add(p.id);
          picked++;
        }
      }
    };

    // 1. Core Mandatory Positional Slots
    pickForSlot((p) => p.position === 'QB', slots.QB ?? 1);
    pickForSlot((p) => p.position === 'RB', slots.RB ?? 2);
    pickForSlot((p) => p.position === 'WR', slots.WR ?? 3);
    pickForSlot((p) => p.position === 'TE', slots.TE ?? 1);

    // 2. Regular Flex Slots (RB / WR / TE)
    if (slots.FLEX && slots.FLEX > 0) {
      pickForSlot((p) => p.position === 'RB' || p.position === 'WR' || p.position === 'TE', slots.FLEX);
    }

    // 3. Superflex Slots (QB / RB / WR / TE)
    if (slots.SUPER_FLEX && slots.SUPER_FLEX > 0) {
      pickForSlot((p) => p.position === 'QB' || p.position === 'RB' || p.position === 'WR' || p.position === 'TE', slots.SUPER_FLEX);
    }

    // 4. Kicker Slot
    if (slots.K && slots.K > 0) {
      pickForSlot((p) => p.position === 'K' || (p.position as any) === 'PK', slots.K);
    }

    // 5. Defense Slot
    if (slots.DEF && slots.DEF > 0) {
      pickForSlot((p) => p.position === 'DEF' || (p.position as any) === 'Def', slots.DEF);
    }

    // If still short of total starter count, backfill with top remaining flex assets
    const targetCount = settings?.starter_count || this.DEFAULT_STARTER_SLOTS;
    if (chosenStarters.length < targetCount) {
      const remainingNeeded = targetCount - chosenStarters.length;
      pickForSlot((p) => p.position !== 'DEF' && p.position !== 'K', remainingNeeded);
    }

    const bench = available.filter((p) => !usedIds.has(p.id));
    return { starters: chosenStarters, bench };
  }

  /**
   * Calculates Gross Liquidity:
   * Sum of starting asset values normalized against league baseline (0.0 to 150.0+)
   */
  public static calculateGrossLiquidity(
    starters: MasterPlayer[],
    baselineValue: number = this.DEFAULT_LEAGUE_BASELINE_VALUE
  ): number {
    if (!starters || starters.length === 0 || baselineValue <= 0) return 0;
    const starterSum = starters.reduce((acc, p) => acc + p.market_value, 0);
    const liquidity = (starterSum / baselineValue) * 100;
    return Math.round(liquidity * 10) / 10;
  }

  /**
   * Calculates Structural Integrity (0 - 100%):
   * Quantifies starting lineup strength vs bench depth variance and roster balance
   */
  public static calculateStructuralIntegrity(
    starters: MasterPlayer[],
    bench: MasterPlayer[],
    baselineValue: number = this.DEFAULT_LEAGUE_BASELINE_VALUE
  ): number {
    const starterValue = starters.reduce((acc, p) => acc + p.market_value, 0);
    const benchValue = bench.reduce((acc, p) => acc + p.market_value, 0);
    const totalValue = starterValue + benchValue;

    if (totalValue <= 0) return 0;

    const starterEquity = starterValue / totalValue;

    // 1. Starting Lineup Power component (0 to 55 pts)
    const powerRatio = Math.min(1.3, starterValue / Math.max(1, baselineValue));
    const powerScore = (powerRatio / 1.3) * 55;

    // 2. Bench Insulation component (0 to 35 pts)
    const targetBench = starterValue * 0.42;
    const depthRatio = targetBench > 0 ? Math.min(1.2, benchValue / targetBench) : 0;
    const depthScore = (depthRatio / 1.2) * 35;

    // 3. Balance distribution penalty / bonus (0 to 10 pts)
    const idealEquity = 0.65;
    const equityDelta = Math.abs(starterEquity - idealEquity);
    const balanceBonus = Math.max(0, 10 - equityDelta * 30);

    const rawScore = powerScore + depthScore + balanceBonus;
    return Math.round(Math.max(5, Math.min(99, rawScore)) * 10) / 10;
  }

  /**
   * Assigns classification archetype based on DNA metrics
   */
  public static classifyRoster(
    liquidity: number,
    halfLife: number,
    integrity: number
  ): ClassificationType {
    if (liquidity >= 110 && integrity >= 68 && halfLife >= 2.5) {
      return 'Juggernaut';
    } else if (liquidity >= 95 && integrity >= 54 && halfLife >= 2.0) {
      return 'Contender';
    } else if (liquidity >= 88 && (halfLife < 2.0 || integrity < 52)) {
      return 'Fraudulent Contender';
    } else if (halfLife >= 3.6 && liquidity < 92) {
      return 'Productive Struggle';
    } else if (liquidity < 72 && integrity < 46) {
      return 'Total Rebuild';
    } else {
      return 'Middle of the Pack';
    }
  }

  /**
   * Computes the Championship Window projection
   */
  public static calculateChampionshipWindow(
    halfLife: number,
    liquidity: number,
    classification: ClassificationType,
    starters: MasterPlayer[]
  ): ChampionshipWindow {
    const currentYear = SEASON.seasonYear;
    const yearsRemaining = Math.max(0.5, Math.round(halfLife * 10) / 10);
    const peakEndYear = currentYear + Math.min(5, Math.max(1, Math.round(yearsRemaining)));

    let status: ChampionshipWindow['status'] = 'Strong Contender';
    let urgency: ChampionshipWindow['urgency_level'] = 'Moderate';
    let verdict = '';
    const targets: string[] = [];

    if (classification === 'Juggernaut') {
      status = 'Win-Now Peak';
      urgency = 'Moderate';
      verdict = `Elite multi-year championship window open through ${peakEndYear}. You possess dominant top-end firepower coupled with high insulation. Hold core cornerstones and acquire veteran depth for championship pushes.`;
      targets.push('High-volume target WRs', 'Win-now veteran RB1 handcuffs', 'Consolidate bench QBs for elite flex pieces');
    } else if (classification === 'Contender') {
      status = 'Strong Contender';
      urgency = yearsRemaining < 2.5 ? 'Critical' : 'Moderate';
      verdict = `Primary championship window active through ${peakEndYear}. Starting equity is competitive. Protect against mid-season injury attrition with depth flex acquisitions.`;
      targets.push('Tier-up WR flex targets', '2027-2028 draft capital hedges', 'Backup RB handcuffs');
    } else if (classification === 'Fraudulent Contender') {
      status = '2-Year Horizon';
      urgency = 'Critical';
      verdict = `High starter reliance with severe age-cliff exposure. Your window closes by ${peakEndYear} unless aging veterans are liquidated for youthful prime producers.`;
      targets.push('Execute "Flex for a First": Sell hot flex producers for 2027/2028 1sts', 'Sell aging RBs (>28) to desperate contenders', 'Pivot to 2027 priority 1st round picks');
    } else if (classification === 'Middle of the Pack') {
      status = '2-Year Horizon';
      urgency = 'Moderate';
      verdict = `Mid-table roster: not good enough to be a favourite, not bad enough to tank. Pick a direction. Consolidate depth into one or two difference-makers to push in, or sell veterans for picks before their value fades.`;
      targets.push('Consolidate 2-for-1 into a top starter', 'Or sell aging starters to contenders for picks', 'Avoid lateral moves');
    } else if (classification === 'Productive Struggle') {
      status = 'Productive Youth';
      urgency = 'Low';
      verdict = `Ascending youth portfolio. Championship window projected to open in ${currentYear + 2} as young assets enter prime longevity thresholds.`;
      targets.push('Multi-Year Capital: Hoard 2028 & 2029 1sts at market discounts', 'Execute "Flex for a First" rule on depth assets', 'Patience over short-term rentals');
    } else {
      status = 'Rebuild Horizon';
      urgency = 'Rebuilding';
      verdict = `Portfolio in reconstruction. Liquidate all assets over age 26 for future draft capital and young wide receiver foundations.`;
      targets.push('Dynasty Rule: "Flex for a First" on all non-cornerstone starters', 'Accumulate 2027 priority 1sts + 2028/2029 multi-year 1sts', 'Ascending WR foundations');
    }

    return {
      status,
      years_remaining: yearsRemaining,
      peak_start_year: currentYear,
      peak_end_year: peakEndYear,
      verdict,
      urgency_level: urgency,
      target_acquisitions: targets,
    };
  }

  /**
   * Diagnostic Roster Optimization & Remediation Engine
   * Evaluates thresholds and prescribes concrete trade blueprints and actionable advice.
   */
  public static generateRemediations(
    metrics: { gross_liquidity: number; asset_half_life: number; structural_integrity: number; classification: ClassificationType },
    starters: MasterPlayer[],
    bench: MasterPlayer[],
    settings?: LeagueSettings
  ): RosterRemediationAdvice[] {
    const remediations: RosterRemediationAdvice[] = [];
    const is1QB = (settings?.slots?.QB ?? 1) <= 1 && (settings?.slots?.SUPER_FLEX || 0) === 0;
    const next = SEASON.upcomingDraftYear;
    const contending = ['Juggernaut', 'Contender', 'Fraudulent Contender'].includes(metrics.classification);
    const list = (ps: MasterPlayer[]) => ps.map((p) => p.full_name).join(', ');

    // 1. Extra QBs in a 1QB league, judged against how this league plays. A first backup covers byes and injuries
    //    (worth more when the league leaves nothing on waivers); only QBs beyond the league's usual count are surplus.
    if (is1QB) {
      const norms = settings?.league_norms;
      const qbs = [...starters, ...bench].filter((p) => p.position === 'QB' && p.roster_designation !== 'TAXI' && p.roster_designation !== 'IR').sort((a, b) => b.market_value - a.market_value);
      const usual = Math.max(2, norms?.qb_per_team ?? 2);
      const extra = qbs.slice(usual).filter((p) => p.market_value >= 1000);
      const thinMarket = norms?.qb_trade_share != null && norms.qb_trade_share < 0.15;
      const cheapSales = norms?.qb_sale_ratio != null && norms.qb_sale_ratio < 0.8;
      if (extra.length) {
        const value = extra.reduce((s, p) => s + p.market_value, 0);
        const marketNote =
          thinMarket || cheapSales
            ? ` QBs rarely move in your league${norms?.qb_trade_share != null ? ` (${Math.round(norms.qb_trade_share * 100)}% of trades)` : ''}${
                cheapSales ? ` and sellers have gotten about ${Math.round(norms!.qb_sale_ratio! * 100)}% of the QB's value back` : ''
              }, so don't sell one on its own.`
            : '';
        remediations.push({
          category: 'Surplus Capital',
          severity: 'opportunity',
          metric_name: 'Extra QBs',
          current_value: `${qbs.length} QBs (league norm ${usual})`,
          threshold: `${usual} QBs, what teams in your league usually carry`,
          issue: `You carry ${qbs.length} active QBs; most teams here carry ${usual}. Beyond the ${usual} you'd keep for byes and injuries, ${list(extra)} ${
            extra.length === 1 ? 'adds' : 'add'
          } little.${marketNote}`,
          actionable_step:
            thinMarket || cheapSales
              ? `Use ${extra.length === 1 ? extra[0].full_name : 'an extra QB'} as the second piece in a bigger deal, or to a team whose starter just got hurt.`
              : `Turn ${extra.length === 1 ? extra[0].full_name : 'an extra QB'} into help at a position where you're thin.`,
          recommended_moves: [
            `Keep your top backup: he covers byes and injuries${norms?.waiver_qb_ppg?.[0] != null ? ` (best free-agent QB projects ${norms.waiver_qb_ppg[0]} points a game)` : ''}`,
            `Offer ${extra[extra.length - 1].full_name} when a starting QB goes down somewhere`,
            'Package extras with a pick to consolidate into a better starter',
          ],
        });
      }
    }

    // 2. Lineup below the league median.
    if (metrics.gross_liquidity < 100) {
      remediations.push({
        category: 'Asset Liquidity',
        severity: metrics.gross_liquidity < 85 ? 'critical' : 'warning',
        metric_name: 'Lineup strength',
        current_value: `${Math.round(metrics.gross_liquidity)}`,
        threshold: '100, the league median',
        issue: 'Your starting lineup is weaker than most of your league.',
        actionable_step: contending
          ? 'Combine two depth pieces into one better starter.'
          : 'Decide: buy starters now, or lean into a rebuild and sell veterans for picks.',
        recommended_moves: [
          'Two-for-one trades that upgrade a starting spot',
          'Buy injured or slumping starters while their price is down',
          'Skip sideways swaps that don’t raise your weekly lineup',
        ],
      });
    }

    // 3. Old roster.
    if (metrics.asset_half_life < 3.2) {
      const aging = [...starters, ...bench]
        .filter((p) => (p.position === 'RB' && p.age >= 27) || (p.position === 'WR' && p.age >= 29) || (p.position === 'TE' && p.age >= 30))
        .sort((a, b) => b.market_value - a.market_value)
        .slice(0, 3);
      remediations.push({
        category: 'Age Cliff Warning',
        severity: metrics.asset_half_life < 2.2 ? 'critical' : 'warning',
        metric_name: 'Prime years left',
        current_value: `${metrics.asset_half_life} yrs`,
        threshold: '3.5 yrs or more',
        issue: `A lot of your value is in players near their age cliff${aging.length ? `: ${list(aging)}` : ''}.`,
        actionable_step: contending
          ? 'Keep competing, but sell one aging starter a year before their value drops.'
          : 'Sell aging starters to contenders now, while they still bring a good return.',
        recommended_moves: [
          'Running backs lose value fastest after 27; sell on a big game',
          `Swap a veteran for a younger player plus a ${next} pick`,
        ],
      });
    }

    // 4. Depth vs top-heaviness.
    if (metrics.structural_integrity < 68) {
      const starterVal = starters.reduce((acc, p) => acc + p.market_value, 0);
      const benchVal = bench.reduce((acc, p) => acc + p.market_value, 0);
      const isTopHeavy = starterVal > benchVal * 2.8;
      remediations.push({
        category: 'Structural Imbalance',
        severity: metrics.structural_integrity < 50 ? 'critical' : 'warning',
        metric_name: 'Depth',
        current_value: `${Math.round(metrics.structural_integrity)}%`,
        threshold: '70% or more',
        issue: isTopHeavy
          ? 'Almost all your value is in your starters. One injury leaves a hole you can’t fill.'
          : 'You have plenty of depth but few players who win weeks on their own.',
        actionable_step: isTopHeavy
          ? 'Add reliable backups at RB and WR, cheaply.'
          : 'Package bench players into one difference-maker.',
        recommended_moves: isTopHeavy
          ? ['Pick up backup RBs who would start if the starter got hurt', 'Use late picks, not starters, to buy depth']
          : ['Offer two or three bench players for one top-24 starter'],
      });
    }

    // 5. Thin at running back.
    const benchRBs = bench.filter((p) => p.position === 'RB').length;
    if (starters.filter((p) => p.position === 'RB').length >= 2 && benchRBs < 2) {
      remediations.push({
        category: 'Depth Deficit',
        severity: 'warning',
        metric_name: 'RB depth',
        current_value: `${benchRBs} on the bench`,
        threshold: '2 or more',
        issue: 'Running backs get hurt more than any position, and you have little cover.',
        actionable_step: 'Add a backup running back with a path to touches.',
        recommended_moves: ['Look at the free-agent list first', 'A late-round pick can buy a handcuff'],
      });
    }

    // 6. Non-contenders holding mid-value flex players: sell them for picks.
    const flexAssets = [...starters, ...bench]
      .filter((p) => ['WR', 'RB', 'TE'].includes(p.position) && p.market_value >= 1400 && p.market_value <= 3900)
      .filter((p) => p.position !== 'RB' || p.age >= 25)
      .sort((a, b) => b.market_value - a.market_value);
    if (!contending && flexAssets.length >= 2) {
      remediations.push({
        category: 'Surplus Capital',
        severity: 'opportunity',
        metric_name: 'Sell flex players for picks',
        current_value: `${flexAssets.length} candidates`,
        threshold: 'convert while contenders are buying',
        issue: `${list(flexAssets.slice(0, 3))} help a contender more than they help you.`,
        actionable_step: `Sell one to a contender for a ${next} or ${next + 1} first-round pick.`,
        recommended_moves: [
          'Contenders with an injured starter pay the most',
          `Picks further out (${next + 1}, ${next + 2}) are often cheaper to get thrown in`,
        ],
      });
    }

    return remediations;
  }

  /**
   * Calculates positional capital distribution and average age
   */
  public static calculatePositionalBreakdown(
    players: MasterPlayer[]
  ): Record<string, PositionalBreakdown> {
    const breakdown: Record<string, { count: number; total_value: number; ages: number[] }> = {
      QB: { count: 0, total_value: 0, ages: [] },
      RB: { count: 0, total_value: 0, ages: [] },
      WR: { count: 0, total_value: 0, ages: [] },
      TE: { count: 0, total_value: 0, ages: [] },
      K: { count: 0, total_value: 0, ages: [] },
      DEF: { count: 0, total_value: 0, ages: [] },
      Def: { count: 0, total_value: 0, ages: [] },
      PK: { count: 0, total_value: 0, ages: [] },
      PICK: { count: 0, total_value: 0, ages: [] },
    };

    const totalRosterValue = players.reduce((acc, p) => acc + p.market_value, 0);

    for (const p of players) {
      const pos = p.position || 'WR';
      if (!breakdown[pos]) {
        breakdown[pos] = { count: 0, total_value: 0, ages: [] };
      }
      breakdown[pos].count += 1;
      breakdown[pos].total_value += p.market_value;
      if (p.age > 0) {
        breakdown[pos].ages.push(p.age);
      }
    }

    const result: Record<string, PositionalBreakdown> = {};
    for (const [pos, data] of Object.entries(breakdown)) {
      if (data.count === 0 && pos !== 'QB' && pos !== 'RB' && pos !== 'WR' && pos !== 'TE') continue;
      const share = totalRosterValue > 0 ? (data.total_value / totalRosterValue) * 100 : 0;
      const avgAge = data.ages.length > 0 ? data.ages.reduce((a, b) => a + b, 0) / data.ages.length : 0;
      result[pos] = {
        count: data.count,
        total_value: Math.round(data.total_value * 10) / 10,
        share_of_roster: Math.round(share * 10) / 10,
        avg_age: Math.round(avgAge * 10) / 10,
      };
    }

    return result;
  }

  /**
   * Complete evaluation pipeline
   */
  public static evaluateRoster(
    roster: RosterRecord,
    masterPlayers: MasterPlayer[],
    baselineValue: number = this.DEFAULT_LEAGUE_BASELINE_VALUE
  ): RosterEvaluationResult {
    const playerMap = new Map<string, MasterPlayer>();
    for (const p of masterPlayers) {
      playerMap.set(p.id, p);
    }

    const rosterPlayers: MasterPlayer[] = [];
    const unmatchedNames: string[] = [];

    const taxiSet = new Set((roster.taxi_ids || []).map(String));
    const reserveSet = new Set((roster.reserve_ids || []).map(String));

    for (const pid of roster.player_ids) {
      const player = playerMap.get(pid);
      if (player) {
        const cloned = { ...player };
        if (!cloned.roster_designation || cloned.roster_designation === 'ACTIVE') {
          if (reserveSet.has(pid)) cloned.roster_designation = 'IR';
          else if (taxiSet.has(pid)) cloned.roster_designation = 'TAXI';
        }
        rosterPlayers.push(cloned);
      } else {
        unmatchedNames.push(pid);
      }
    }

    const settings = roster.settings || this.DEFAULT_LEAGUE_SETTINGS;

    const { starters, bench } = this.splitStartersAndBench(
      rosterPlayers,
      roster.starters,
      settings
    );

    const starterIdSet = new Set(starters.map((p) => p.id));
    rosterPlayers.forEach((p) => {
      p.is_starter = starterIdSet.has(p.id);
    });

    const activeRoster = rosterPlayers.filter((p) => p.roster_designation !== 'IR' && p.roster_designation !== 'TAXI');
    const injuredReserve = rosterPlayers.filter((p) => p.roster_designation === 'IR');
    const taxiSquad = rosterPlayers.filter((p) => p.roster_designation === 'TAXI');

    const starterValue = starters.reduce((acc, p) => acc + p.market_value, 0);
    const benchValue = bench.reduce((acc, p) => acc + p.market_value, 0);
    const totalValue = starterValue + benchValue;

    const grossLiquidity = this.calculateGrossLiquidity(starters, baselineValue);
    const assetHalfLife = this.calculateAssetHalfLife(rosterPlayers);
    const structuralIntegrity = this.calculateStructuralIntegrity(starters, bench, baselineValue);
    const classification = this.classifyRoster(grossLiquidity, assetHalfLife, structuralIntegrity);

    const meanAge =
      rosterPlayers.length > 0
        ? Math.round((rosterPlayers.reduce((acc, p) => acc + p.age, 0) / rosterPlayers.length) * 10) / 10
        : 0;

    const starterEquity = totalValue > 0 ? Math.round((starterValue / totalValue) * 1000) / 10 : 0;

    const championshipWindow = this.calculateChampionshipWindow(
      assetHalfLife,
      grossLiquidity,
      classification,
      starters
    );

    const remediations = this.generateRemediations(
      { gross_liquidity: grossLiquidity, asset_half_life: assetHalfLife, structural_integrity: structuralIntegrity, classification },
      starters,
      bench,
      settings
    );

    const draftCapitalVal = (roster.draft_picks || []).reduce((sum, p) => sum + (p.market_value || 0), 0);

    const metrics: RosterDNAMetrics = {
      classification,
      gross_liquidity: grossLiquidity,
      asset_half_life: assetHalfLife,
      structural_integrity: structuralIntegrity,
      total_roster_value: Math.round((totalValue + draftCapitalVal) * 10) / 10,
      starter_value: Math.round(starterValue * 10) / 10,
      bench_value: Math.round(benchValue * 10) / 10,
      draft_capital_value: draftCapitalVal,
      starter_equity_ratio: starterEquity,
      mean_roster_age: meanAge,
      peak_window_years: championshipWindow.years_remaining,
      championship_window: championshipWindow,
    };

    const positionalBreakdown = this.calculatePositionalBreakdown(rosterPlayers);

    const warnings: string[] = [];
    if (unmatchedNames.length > 0) {
      warnings.push(`${unmatchedNames.length} player(s) could not be resolved against Master Database.`);
    }
    if (starterEquity > 82) {
      warnings.push('High Fragility Warning: Starters represent over 82% of total portfolio valuation.');
    }
    if (assetHalfLife < 2.0) {
      warnings.push('Age Cliff Alert: Asset half-life indicates roster is within 24 months of peak dropoff.');
    }

    return {
      roster,
      metrics,
      players: rosterPlayers,
      starters,
      bench,
      active_roster: activeRoster,
      injured_reserve: injuredReserve,
      taxi_squad: taxiSquad,
      draft_picks: roster.draft_picks || [],
      positional_breakdown: positionalBreakdown,
      settings,
      championship_window: championshipWindow,
      remediations,
      warnings,
      unmatched_names: unmatchedNames,
    };
  }
}
