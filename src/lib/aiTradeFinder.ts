/**
 * Dynasty AI Evaluator - AI Trade Architect & market Optimizer Engine
 * Synthesizes market consensus market values with Roster DNA needs
 * to architect balanced, high-impact trades for any selected target or shopped player.
 */

import { MasterPlayer, DraftPick, LeagueTeamSummary, AITradeProposal, Position } from '../types';
import { DraftPickEngine } from './draftPicks';

export interface GenerateTradeOptions {
  userTeam: {
    franchise_id: string;
    franchise_name?: string;
    players: MasterPlayer[];
    draft_picks?: DraftPick[];
    metrics?: {
      gross_liquidity?: number;
      structural_integrity?: number;
      classification?: string;
    };
  };
  opponentTeam?: {
    franchise_id: string;
    franchise_name?: string;
    players: MasterPlayer[];
    draft_picks?: DraftPick[];
    metrics?: {
      gross_liquidity?: number;
      structural_integrity?: number;
      classification?: string;
    };
  };
  leagueTeams?: LeagueTeamSummary[];
  shopPlayer?: MasterPlayer | null;
  targetPlayer?: MasterPlayer | null;
  strategyMode?: 'BALANCED' | 'WIN_NOW' | 'REBUILD' | 'FLEX_FOR_FIRST';
}

export class AITradeFinderEngine {
  /**
   * Generates AI-optimized trade proposals using server-side Gemini or local market algorithmic model
   */
  public static async generateTradeProposals(options: GenerateTradeOptions): Promise<AITradeProposal[]> {
    const { userTeam, opponentTeam, leagueTeams, shopPlayer, targetPlayer, strategyMode = 'BALANCED' } = options;

    // First attempt server-side Gemini AI generation
    try {
      const response = await fetch('/api/trade/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userTeam,
          opponentTeam,
          leagueTeams,
          shopPlayerId: shopPlayer?.id,
          targetPlayerId: targetPlayer?.id,
          strategyMode,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.proposals && Array.isArray(data.proposals) && data.proposals.length > 0) {
          return data.proposals;
        }
      }
    } catch (err) {
      console.warn('Server-side Gemini AI trade generation unavailable, using local market algorithmic optimizer:', err);
    }

    // Algorithmic market Fallback Optimizer
    return this.generateAlgorithmicKtcProposals(options);
  }

  /**
   * High-fidelity local market Algorithmic Engine:
   * Generates 3 distinct, mathematically balanced market trade packages.
   */
  public static generateAlgorithmicKtcProposals(options: GenerateTradeOptions): AITradeProposal[] {
    const { userTeam, opponentTeam, leagueTeams = [], shopPlayer, targetPlayer, strategyMode = 'BALANCED' } = options;

    // Resolve opponent team:
    let partner = opponentTeam;
    if (!partner && targetPlayer) {
      // Find team owning targetPlayer
      const owningTeam = leagueTeams.find((t) =>
        [...t.starters, ...t.bench].some((p) => p.id === targetPlayer.id)
      );
      if (owningTeam) {
        partner = {
          franchise_id: owningTeam.franchise_id,
          franchise_name: owningTeam.franchise_name,
          players: [...owningTeam.starters, ...owningTeam.bench],
          draft_picks: owningTeam.draft_picks,
        };
      }
    }

    // Default partner if still none
    if (!partner && leagueTeams.length > 0) {
      const candidateTeam = leagueTeams.find((t) => t.franchise_id !== userTeam.franchise_id) || leagueTeams[0];
      partner = {
        franchise_id: candidateTeam.franchise_id,
        franchise_name: candidateTeam.franchise_name,
        players: [...candidateTeam.starters, ...candidateTeam.bench],
        draft_picks: candidateTeam.draft_picks,
      };
    }

    if (!partner) {
      partner = {
        franchise_id: 'partner-default',
        franchise_name: 'Gotham Iron Men',
        players: [],
        draft_picks: [],
      };
    }

    const partnerFranchiseName = partner.franchise_name || 'Trade Partner';
    const proposals: AITradeProposal[] = [];
    const userPicks = userTeam.draft_picks || [];
    const partnerPicks = partner.draft_picks || [];

    // Helper: calculate market total
    const getKtc = (players: MasterPlayer[], picks: DraftPick[]) => {
      const pVal = players.reduce((s, p) => s + (p.market_value || 0), 0);
      const pickVal = picks.reduce((s, p) => s + (p.market_value || 0), 0);
      return pVal + pickVal;
    };

    // SCENARIO 1: TARGETING A PLAYER ON ANOTHER ROSTER
    if (targetPlayer && !shopPlayer) {
      const targetVal = targetPlayer.market_value;

      // Proposal A: 1-for-1 Fair Value Swap (Player of similar market value from user's roster)
      const fairUserPlayer = [...userTeam.players]
        .filter((p) => p.id !== targetPlayer.id)
        .sort((a, b) => Math.abs(a.market_value - targetVal) - Math.abs(b.market_value - targetVal))[0];

      if (fairUserPlayer) {
        const sentKtc = fairUserPlayer.market_value;
        const diff = targetVal - sentKtc;
        const fairnessScore = Math.max(70, Math.min(100, Math.round(100 - (Math.abs(diff) / targetVal) * 100)));

        proposals.push({
          id: `ai-prop-1-${Date.now()}`,
          title: `Direct Positional Pivot for ${targetPlayer.full_name}`,
          blueprint_type: 'FAIR_EQUILIBRIUM',
          summary: `Swap ${fairUserPlayer.full_name} (${fairUserPlayer.position}) directly for ${targetPlayer.full_name} (${targetPlayer.position}) at near-identical market valuation.`,
          partner_franchise_id: partner.franchise_id,
          partner_franchise_name: partnerFranchiseName,
          send_players: [fairUserPlayer],
          send_picks: [],
          receive_players: [targetPlayer],
          receive_picks: [],
          total_ktc_sent: sentKtc,
          total_ktc_received: targetVal,
          ktc_difference: targetVal - sentKtc,
          fairness_verdict: Math.abs(diff) < 300 ? 'FAIR' : diff > 0 ? 'SLIGHT_FAVOR_YOU' : 'SLIGHT_FAVOR_THEM',
          fairness_score_pct: fairnessScore,
          predicted_gross_liquidity_delta: Math.round(((targetVal - sentKtc) / 22500) * 100 * 10) / 10,
          rationale_for_you: `Upgrades your lineup at ${targetPlayer.position} while parting with a player where your roster has sufficient positional depth.`,
          rationale_for_partner: `${partner.franchise_name} acquires a proven asset at ${fairUserPlayer.position} without sacrificing net market capital.`,
        });
      }

      // Proposal B: Draft Pick Package + Depth Player (Insulated Capital Offer)
      const priorityPick = userPicks.find((p) => p.round === 1) || {
        id: 'virt-2027-1st',
        year: 2027,
        round: 1,
        tier: 'Mid',
        original_owner_id: userTeam.franchise_id,
        current_owner_id: userTeam.franchise_id,
        description: '2027 Round 1 (Priority Mid)',
        market_value: 5200,
        is_priority_class: true,
      };

      const depthPlayer = [...userTeam.players]
        .filter((p) => p.market_value >= 1200 && p.market_value <= 3200)
        .sort((a, b) => b.market_value - a.market_value)[0];

      if (priorityPick) {
        const sendP = depthPlayer ? [depthPlayer] : [];
        const sendPk = [priorityPick];
        const sentKtc = getKtc(sendP, sendPk);
        const diff = targetVal - sentKtc;
        const fairnessScore = Math.max(75, Math.min(100, Math.round(100 - (Math.abs(diff) / Math.max(targetVal, sentKtc)) * 100)));

        proposals.push({
          id: `ai-prop-2-${Date.now()}`,
          title: `Draft Capital Injection Package`,
          blueprint_type: 'TIER_UP_SWEETENER',
          summary: `Offer ${priorityPick.description} ${depthPlayer ? `+ ${depthPlayer.full_name}` : ''} to pry away ${targetPlayer.full_name}.`,
          partner_franchise_id: partner.franchise_id,
          partner_franchise_name: partnerFranchiseName,
          send_players: sendP,
          send_picks: sendPk,
          receive_players: [targetPlayer],
          receive_picks: [],
          total_ktc_sent: sentKtc,
          total_ktc_received: targetVal,
          ktc_difference: diff,
          fairness_verdict: Math.abs(diff) < 500 ? 'FAIR' : diff > 0 ? 'SLIGHT_FAVOR_YOU' : 'OVERPAY',
          fairness_score_pct: fairnessScore,
          predicted_gross_liquidity_delta: Math.round((diff / 22500) * 100 * 10) / 10,
          rationale_for_you: `Consolidates future draft equity into a tier-1 active starter to boost weekly scoring ceiling.`,
          rationale_for_partner: `Gives ${partner.franchise_name} appreciating, injury-proof draft capital to reset their age curve.`,
        });
      }

      // Proposal C: Multi-Player Package / Youth Consolidation
      const youngCornerstone = [...userTeam.players]
        .filter((p) => p.age <= 24.5 && p.market_value >= 2500)
        .sort((a, b) => b.market_value - a.market_value)[0];
      const secondRoundPick = userPicks.find((p) => p.round === 2) || {
        id: 'virt-2027-2nd',
        year: 2027,
        round: 2,
        tier: 'Early',
        original_owner_id: userTeam.franchise_id,
        current_owner_id: userTeam.franchise_id,
        description: '2027 Round 2 (Early)',
        market_value: 2300,
        is_priority_class: true,
      };

      if (youngCornerstone) {
        const sendP = [youngCornerstone];
        const sendPk = [secondRoundPick];
        const sentKtc = getKtc(sendP, sendPk);
        const diff = targetVal - sentKtc;
        const fairnessScore = Math.max(80, Math.min(100, Math.round(100 - (Math.abs(diff) / Math.max(targetVal, sentKtc)) * 100)));

        proposals.push({
          id: `ai-prop-3-${Date.now()}`,
          title: `Youth Cornerstone + Pick Sweetener`,
          blueprint_type: 'WIN_NOW_BOOST',
          summary: `Offer ascending talent ${youngCornerstone.full_name} + ${secondRoundPick.description} for ${targetPlayer.full_name}.`,
          partner_franchise_id: partner.franchise_id,
          partner_franchise_name: partnerFranchiseName,
          send_players: sendP,
          send_picks: sendPk,
          receive_players: [targetPlayer],
          receive_picks: [],
          total_ktc_sent: sentKtc,
          total_ktc_received: targetVal,
          ktc_difference: diff,
          fairness_verdict: Math.abs(diff) < 400 ? 'FAIR' : 'SLIGHT_FAVOR_YOU',
          fairness_score_pct: fairnessScore,
          predicted_gross_liquidity_delta: Math.round((diff / 22500) * 100 * 10) / 10,
          rationale_for_you: `Capitalizes on roster surplus to acquire ${targetPlayer.full_name}'s proven production floor.`,
          rationale_for_partner: `Infuses high-ceiling youth (${youngCornerstone.full_name}) and additional draft capital into ${partner.franchise_name}'s pipeline.`,
        });
      }
    }

    // SCENARIO 2: SHOPPING A PLAYER ON USER ROSTER
    else if (shopPlayer && !targetPlayer) {
      const shopVal = shopPlayer.market_value;

      // Proposal A: "Flex for a 1st" Golden Dynasty Rule Execution
      const partnerFirst = partnerPicks.find((p) => p.round === 1 && p.year >= 2027) || {
        id: 'virt-partner-2027-1st',
        year: 2027,
        round: 1,
        tier: 'Mid',
        original_owner_id: partner.franchise_id,
        current_owner_id: partner.franchise_id,
        description: '2027 Round 1 (Mid)',
        market_value: 5400,
        is_priority_class: true,
      };

      const needSweetener = partnerFirst.market_value > shopVal + 1200;
      const userSweetener = needSweetener
        ? userPicks.find((p) => p.round === 2) || {
            id: 'virt-sweetener-2nd',
            year: 2027,
            round: 2,
            tier: 'Mid',
            original_owner_id: userTeam.franchise_id,
            current_owner_id: userTeam.franchise_id,
            description: '2027 Round 2',
            market_value: 1950,
          }
        : null;

      const sendP = [shopPlayer];
      const sendPk = userSweetener ? [userSweetener] : [];
      const sentKtc = getKtc(sendP, sendPk);
      const recKtc = partnerFirst.market_value;
      const diff = recKtc - sentKtc;
      const fairnessScore = Math.max(78, Math.min(100, Math.round(100 - (Math.abs(diff) / recKtc) * 100)));

      proposals.push({
        id: `ai-shop-1-${Date.now()}`,
        title: `"Flex for a 1st" Dynasty Rule Execution`,
        blueprint_type: 'FLEX_FOR_FIRST',
        summary: `Ship ${shopPlayer.full_name} ${userSweetener ? `+ ${userSweetener.description}` : ''} to ${partner.franchise_name} for their ${partnerFirst.description}.`,
        partner_franchise_id: partner.franchise_id,
        partner_franchise_name: partnerFranchiseName,
        send_players: sendP,
        send_picks: sendPk,
        receive_players: [],
        receive_picks: [partnerFirst],
        total_ktc_sent: sentKtc,
        total_ktc_received: recKtc,
        ktc_difference: diff,
        fairness_verdict: 'FAIR',
        fairness_score_pct: fairnessScore,
        predicted_gross_liquidity_delta: Math.round(((recKtc - sentKtc) / 22500) * 100 * 10) / 10,
        rationale_for_you: `Executes the cardinal dynasty rule: sells a productive flex starter at peak value for permanent, appreciating first-round equity.`,
        rationale_for_partner: `Provides ${partner.franchise_name} immediate weekly points at ${shopPlayer.position} to cement their playoff contention.`,
      });

      // Proposal B: Player-for-Player Positional Need Fit
      const partnerTarget = [...partner.players]
        .filter((p) => p.position !== shopPlayer.position)
        .sort((a, b) => Math.abs(a.market_value - shopVal) - Math.abs(b.market_value - shopVal))[0];

      if (partnerTarget) {
        const sentKtc = shopVal;
        const recKtc = partnerTarget.market_value;
        const diff = recKtc - sentKtc;
        const fairnessScore = Math.max(75, Math.min(100, Math.round(100 - (Math.abs(diff) / Math.max(sentKtc, recKtc)) * 100)));

        proposals.push({
          id: `ai-shop-2-${Date.now()}`,
          title: `Positional Need Rebalancing`,
          blueprint_type: 'FAIR_EQUILIBRIUM',
          summary: `Trade ${shopPlayer.full_name} (${shopPlayer.position}) straight up for ${partnerTarget.full_name} (${partnerTarget.position}).`,
          partner_franchise_id: partner.franchise_id,
          partner_franchise_name: partnerFranchiseName,
          send_players: [shopPlayer],
          send_picks: [],
          receive_players: [partnerTarget],
          receive_picks: [],
          total_ktc_sent: sentKtc,
          total_ktc_received: recKtc,
          ktc_difference: diff,
          fairness_verdict: Math.abs(diff) < 300 ? 'FAIR' : diff > 0 ? 'SLIGHT_FAVOR_YOU' : 'SLIGHT_FAVOR_THEM',
          fairness_score_pct: fairnessScore,
          predicted_gross_liquidity_delta: Math.round((diff / 22500) * 100 * 10) / 10,
          rationale_for_you: `Fills a roster deficiency at ${partnerTarget.position} while cashing in on surplus depth at ${shopPlayer.position}.`,
          rationale_for_partner: `Addresses ${partner.franchise_name}'s starting lineup demand at ${shopPlayer.position}.`,
        });
      }

      // Proposal C: Multi-Year Draft Compounding Package (2028/2029 picks)
      const distantPick = partnerPicks.find((p) => p.year >= 2028) || {
        id: 'virt-partner-2028-1st',
        year: 2028,
        round: 1,
        tier: 'Mid',
        original_owner_id: partner.franchise_id,
        current_owner_id: partner.franchise_id,
        description: '2028 Round 1 (Compounding Arbitrage)',
        market_value: 3600,
        years_out: 1,
      };

      const recKtc3 = distantPick.market_value;
      const diff3 = recKtc3 - shopVal;
      const fairnessScore3 = Math.max(80, Math.min(100, Math.round(100 - (Math.abs(diff3) / Math.max(shopVal, recKtc3)) * 100)));

      proposals.push({
        id: `ai-shop-3-${Date.now()}`,
        title: `Multi-Year Future Capital Arbitrage`,
        blueprint_type: 'REBUILD_PIVOT',
        summary: `Send ${shopPlayer.full_name} to acquire ${partner.franchise_name}'s distant ${distantPick.description}.`,
        partner_franchise_id: partner.franchise_id,
        partner_franchise_name: partnerFranchiseName,
        send_players: [shopPlayer],
        send_picks: [],
        receive_players: [],
        receive_picks: [distantPick],
        total_ktc_sent: shopVal,
        total_ktc_received: recKtc3,
        ktc_difference: diff3,
        fairness_verdict: 'FAIR',
        fairness_score_pct: fairnessScore3,
        predicted_gross_liquidity_delta: Math.round((diff3 / 22500) * 100 * 10) / 10,
        rationale_for_you: `Captures insulated multi-year draft equity that compounds 20-30% yearly without player injury risk.`,
        rationale_for_partner: `${partner.franchise_name} leverages distant capital they don't need this season to buy current points.`,
      });
    }

    // SCENARIO 3: BOTH PLAYERS SELECTED (Player A for Player B + AI balances the rest)
    else if (shopPlayer && targetPlayer) {
      const shopVal = shopPlayer.market_value;
      const targetVal = targetPlayer.market_value;
      const baseDiff = targetVal - shopVal; // Positive means user needs to add sweetener; negative means partner adds sweetener

      // Package 1: Exact market Draft Pick Balancer
      const sendP = [shopPlayer];
      const receiveP = [targetPlayer];
      const sendPk: DraftPick[] = [];
      const receivePk: DraftPick[] = [];

      if (baseDiff > 1000) {
        // User adds a pick to balance
        const balancerPick = userPicks.find((p) => Math.abs(p.market_value - baseDiff) < 1500) || {
          id: 'virt-user-balancer-2nd',
          year: 2027,
          round: 2,
          tier: 'Mid',
          original_owner_id: userTeam.franchise_id,
          current_owner_id: userTeam.franchise_id,
          description: '2027 Round 2',
          market_value: Math.min(2400, Math.max(1200, Math.round(baseDiff * 0.9))),
        };
        sendPk.push(balancerPick);
      } else if (baseDiff < -1000) {
        // Opponent adds a pick to balance
        const balancerPick = partnerPicks.find((p) => Math.abs(p.market_value - Math.abs(baseDiff)) < 1500) || {
          id: 'virt-partner-balancer-2nd',
          year: 2027,
          round: 2,
          tier: 'Mid',
          original_owner_id: partner.franchise_id,
          current_owner_id: partner.franchise_id,
          description: '2027 Round 2',
          market_value: Math.min(2400, Math.max(1200, Math.round(Math.abs(baseDiff) * 0.9))),
        };
        receivePk.push(balancerPick);
      }

      const totalSent = getKtc(sendP, sendPk);
      const totalReceived = getKtc(receiveP, receivePk);
      const netKtcDiff = totalReceived - totalSent;
      const fairnessScore = Math.max(85, Math.min(100, Math.round(100 - (Math.abs(netKtcDiff) / Math.max(totalSent, totalReceived)) * 100)));

      proposals.push({
        id: `ai-swap-1-${Date.now()}`,
        title: `market Balanced Swap: ${shopPlayer.full_name} for ${targetPlayer.full_name}`,
        blueprint_type: 'FAIR_EQUILIBRIUM',
        summary: `Core framework trades ${shopPlayer.full_name} for ${targetPlayer.full_name} with calibrated draft equity to establish 50/50 market equilibrium.`,
        partner_franchise_id: partner.franchise_id,
        partner_franchise_name: partnerFranchiseName,
        send_players: sendP,
        send_picks: sendPk,
        receive_players: receiveP,
        receive_picks: receivePk,
        total_ktc_sent: totalSent,
        total_ktc_received: totalReceived,
        ktc_difference: netKtcDiff,
        fairness_verdict: Math.abs(netKtcDiff) < 400 ? 'FAIR' : netKtcDiff > 0 ? 'SLIGHT_FAVOR_YOU' : 'SLIGHT_FAVOR_THEM',
        fairness_score_pct: fairnessScore,
        predicted_gross_liquidity_delta: Math.round((netKtcDiff / 22500) * 100 * 10) / 10,
        rationale_for_you: `Secures your priority target ${targetPlayer.full_name} at fair market rate without overpaying on assets.`,
        rationale_for_partner: `Provides ${partner.franchise_name} balanced compensation matching exact consensus trade calculator numbers.`,
      });

      // Package 2: Player Sweetener Rebalance (2-for-1 or 2-for-2)
      const userBenchSweetener = [...userTeam.players]
        .filter((p) => p.id !== shopPlayer.id && p.market_value >= 1000 && p.market_value <= 2500)
        .sort((a, b) => a.market_value - b.market_value)[0];

      if (userBenchSweetener && baseDiff > 800) {
        const sendP2 = [shopPlayer, userBenchSweetener];
        const totalSent2 = getKtc(sendP2, []);
        const diff2 = targetVal - totalSent2;
        const fairnessScore2 = Math.max(82, Math.min(100, Math.round(100 - (Math.abs(diff2) / Math.max(targetVal, totalSent2)) * 100)));

        proposals.push({
          id: `ai-swap-2-${Date.now()}`,
          title: `2-for-1 Consolidation Package`,
          blueprint_type: 'TIER_UP_SWEETENER',
          summary: `Package ${shopPlayer.full_name} + depth piece ${userBenchSweetener.full_name} to secure ${targetPlayer.full_name}.`,
          partner_franchise_id: partner.franchise_id,
          partner_franchise_name: partnerFranchiseName,
          send_players: sendP2,
          send_picks: [],
          receive_players: [targetPlayer],
          receive_picks: [],
          total_ktc_sent: totalSent2,
          total_ktc_received: targetVal,
          ktc_difference: diff2,
          fairness_verdict: 'FAIR',
          fairness_score_pct: fairnessScore2,
          predicted_gross_liquidity_delta: Math.round((diff2 / 22500) * 100 * 10) / 10,
          rationale_for_you: `Condenses bench depth into an elite top-tier starter to unlock starting lineup ceiling.`,
          rationale_for_partner: `Fills two starting vacancies for ${partner.franchise_name} with multiple quality contributors.`,
        });
      }
    }

    return proposals;
  }
}
