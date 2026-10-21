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
      const maxAllowedQBs = (slots.QB || 1) + (slots.SUPER_FLEX || 0);
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
    pickForSlot((p) => p.position === 'QB', slots.QB || 1);
    pickForSlot((p) => p.position === 'RB', slots.RB || 2);
    pickForSlot((p) => p.position === 'WR', slots.WR || 3);
    pickForSlot((p) => p.position === 'TE', slots.TE || 1);

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
    const currentYear = 2026;
    const yearsRemaining = Math.max(0.5, Math.round(halfLife * 10) / 10);
    const peakEndYear = currentYear + Math.min(5, Math.max(1, Math.round(yearsRemaining)));

    let status: ChampionshipWindow['status'] = 'Strong Contender';
    let urgency: ChampionshipWindow['urgency_level'] = 'Moderate';
    let verdict = '';
    const targets: string[] = [];

    if (classification === 'Juggernaut' || (liquidity >= 115 && yearsRemaining >= 3.0)) {
      status = 'Win-Now Peak';
      urgency = 'Moderate';
      verdict = `Elite multi-year championship window open through ${peakEndYear}. You possess dominant top-end firepower coupled with high insulation. Hold core cornerstones and acquire veteran depth for championship pushes.`;
      targets.push('High-volume target WRs', 'Win-now veteran RB1 handcuffs', 'Consolidate bench QBs for elite flex pieces');
    } else if (classification === 'Contender' || liquidity >= 95) {
      status = 'Strong Contender';
      urgency = yearsRemaining < 2.5 ? 'Critical' : 'Moderate';
      verdict = `Primary championship window active through ${peakEndYear}. Starting equity is competitive. Protect against mid-season injury attrition with depth flex acquisitions.`;
      targets.push('Tier-up WR flex targets', '2027-2028 draft capital hedges', 'Backup RB handcuffs');
    } else if (classification === 'Fraudulent Contender') {
      status = '2-Year Horizon';
      urgency = 'Critical';
      verdict = `High starter reliance with severe age-cliff exposure. Your window closes by ${peakEndYear} unless aging veterans are liquidated for youthful prime producers.`;
      targets.push('Execute "Flex for a First": Sell hot flex producers for 2027/2028 1sts', 'Sell aging RBs (>28) to desperate contenders', 'Pivot to 2027 priority 1st round picks');
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
    const is1QB = (settings?.slots?.QB || 1) === 1 && (settings?.slots?.SUPER_FLEX || 0) === 0;

    // 1. Surplus QB Capital in 1-QB League Check
    if (is1QB) {
      const allQBs = [...starters, ...bench].filter((p) => p.position === 'QB' && p.market_value >= 3500);
      if (allQBs.length >= 3) {
        const benchQBs = bench.filter((p) => p.position === 'QB' && p.market_value >= 3500);
        const benchQbValue = benchQBs.reduce((sum, p) => sum + p.market_value, 0);
        const names = benchQBs.map((p) => p.full_name).join(', ');

        remediations.push({
          category: 'Surplus Capital',
          severity: 'opportunity',
          metric_name: 'QB Capital Inefficiency',
          current_value: `${allQBs.length} Top-Tier QBs (${benchQBs.length} on bench)`,
          threshold: 'Max 2 QBs in 1-QB League',
          issue: `You are holding ${names} on your bench (${benchQbValue.toLocaleString()} pts idle market value) in a 1-QB league.`,
          actionable_step: `Package one or two elite backup QBs to QB-needy rivals to acquire a top-tier WR1 or RB1 to start every week.`,
          recommended_moves: [
            `Package ${benchQBs[0]?.full_name || 'backup QB'} + 2nd round pick for a top-8 dynasty WR (e.g. Garrett Wilson, Marvin Harrison Jr.)`,
            `Offer ${benchQBs[1]?.full_name || 'QB2'} to a contender with a weak QB for high-leverage 2027 1st round draft capital`,
            `Streamline to 2 active QBs max to free up roster spots for running back handcuffs and rookie stashes`,
          ],
        });
      }
    }

    // 2. Gross Liquidity Threshold Check (< 100)
    if (metrics.gross_liquidity < 100) {
      remediations.push({
        category: 'Asset Liquidity',
        severity: metrics.gross_liquidity < 85 ? 'critical' : 'warning',
        metric_name: 'Gross Liquidity',
        current_value: `${metrics.gross_liquidity} Index`,
        threshold: '100.0 Baseline Target',
        issue: `Starting lineup power is below league baseline, creating a weekly scoring handicap against high-end rosters.`,
        actionable_step: `Execute consolidation trades (2-for-1 or 3-for-1 packages) to upgrade good depth players into an elite, game-breaking cornerstone.`,
        recommended_moves: [
          'Trade two WR2/WR3 depth assets for one elite WR1 tier anchor',
          'Target buy-low elite performers experiencing temporary injuries or offensive scheme changes',
          'Avoid lateral tier-for-tier trades that do not raise your weekly ceiling',
        ],
      });
    }

    // 3. Asset Half-Life / Age Cliff Check (< 3.0 years)
    if (metrics.asset_half_life < 3.2) {
      const agingRBs = starters.filter((p) => p.position === 'RB' && p.age >= 28);
      const names = agingRBs.map((p) => `${p.full_name} (${p.age})`).join(', ');

      remediations.push({
        category: 'Age Cliff Warning',
        severity: metrics.asset_half_life < 2.2 ? 'critical' : 'warning',
        metric_name: 'Asset Half-Life',
        current_value: `${metrics.asset_half_life} Years`,
        threshold: '3.5+ Years Longevity',
        issue: `Portfolio is within 2-3 years of steep depreciation cliff, driven by aging veterans${names ? ` such as ${names}` : ''}.`,
        actionable_step: `Begin phased liquidation of high-risk veterans aged 28+ to contending rivals before performance dropoff occurs.`,
        recommended_moves: [
          'Sell veteran RBs during hot early-season scoring streaks',
          'Tier down from an aging veteran to a 2nd-year upside player plus an early draft pick',
          'Prioritize rookie WR drafts to extend core franchise longevity into 2028-2030',
        ],
      });
    }

    // 4. Structural Integrity Threshold Check (< 68%)
    if (metrics.structural_integrity < 68) {
      const starterVal = starters.reduce((acc, p) => acc + p.market_value, 0);
      const benchVal = bench.reduce((acc, p) => acc + p.market_value, 0);
      const isTopHeavy = starterVal > benchVal * 2.8;

      remediations.push({
        category: 'Structural Imbalance',
        severity: metrics.structural_integrity < 50 ? 'critical' : 'warning',
        metric_name: 'Structural Integrity',
        current_value: `${metrics.structural_integrity}%`,
        threshold: '70%+ Insulation Target',
        issue: isTopHeavy
          ? 'Roster is dangerously top-heavy: a single injury to a starter will catastrophically collapse weekly lineup output.'
          : 'Roster has bloated depth but lacks the true elite studs required to win playoff matchups.',
        actionable_step: isTopHeavy
          ? 'Tier down one elite asset into two productive high-floor starters to insulate weekly lineup floor.'
          : 'Package depth players (3-for-1) to acquire an elite alpha superstar.',
        recommended_moves: [
          isTopHeavy
            ? 'Acquire immediate starting handcuffs for your RB1/RB2'
            : 'Consolidate bench WRs into a top-15 consensus starter',
          'Ensure every starting position has at least one dependable, high-snap reserve backup',
        ],
      });
    }

    // 5. Positional Depth Deficit Checks
    const starterPosCounts: Record<string, number> = {};
    starters.forEach((p) => {
      starterPosCounts[p.position] = (starterPosCounts[p.position] || 0) + 1;
    });

    const benchPosCounts: Record<string, number> = {};
    bench.forEach((p) => {
      benchPosCounts[p.position] = (benchPosCounts[p.position] || 0) + 1;
    });

    if ((starterPosCounts['RB'] || 0) >= 2 && (benchPosCounts['RB'] || 0) < 3) {
      remediations.push({
        category: 'Depth Deficit',
        severity: 'warning',
        metric_name: 'RB Depth Reserve',
        current_value: `${benchPosCounts['RB'] || 0} Bench RBs`,
        threshold: 'Minimum 3 Bench RBs',
        issue: 'Running back positions have high attrition rates. Insufficient backup depth creates catastrophic injury vulnerability.',
        actionable_step: 'Target backup running backs on high-scoring offenses through waivers or cheap pick swaps.',
        recommended_moves: [
          'Stash high-upside backup running backs with standalone passing-down roles',
          'Use 3rd round rookie draft picks on athletic rookie running backs with path to touches',
        ],
      });
    }

    // 6. Cardinal Dynasty Rule: "Flex for a First" Liquidation Check
    const flexAssets = [...starters, ...bench].filter(
      (p) => (p.position === 'WR' || p.position === 'RB' || p.position === 'TE') && p.market_value >= 1400 && p.market_value <= 3900
    );
    if (flexAssets.length >= 2 && metrics.classification !== 'Juggernaut') {
      const names = flexAssets.slice(0, 3).map((p) => p.full_name).join(', ');
      remediations.push({
        category: 'Surplus Capital',
        severity: 'opportunity',
        metric_name: 'Dynasty Rule: "Flex for a First"',
        current_value: `${flexAssets.length} Tradable Flex Producers`,
        threshold: 'Convert Depth to 2027/2028 1sts',
        issue: `You hold high-liquidity flex producers (${names}). In-season contender urgency makes this the optimal window to flip secondary producers for future firsts.`,
        actionable_step: `Execute the cardinal dynasty rule: "Flex for a First". Flex points are replaceable through depth and waivers; 2027 & 2028 first-round picks appreciate 25%+ into the off-season.`,
        recommended_moves: [
          'Target playoff-bound contenders suffering injury attrition in the Flex spot',
          'Offer your hot flex producer for their 2027 1st round pick (or 2028 1st multi-year)',
          'Multi-Year Arbitrage: Collect distant picks (2028/2029) at steep market discounts',
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
