/**
 * Dynasty AI Evaluator - Market Momentum & Historical Value Engine
 * Computes 30-day and 90-day value and ranking deltas, historical curves,
 * and automated trade action signals (SELL_HIGH, BUY_LOW, STRONG_BUY, HOLD_CORNERSTONE).
 */

import { MasterPlayer, PlayerMarketTrend, TradeSignalType } from '../types';
import { SEED_PLAYERS } from '../data/seedPlayers';

// Seed curated historical velocity profiles to model real dynasty market dynamics
const PLAYER_HISTORICAL_OVERRIDE: Record<
  string,
  {
    change_30d_pct: number;
    change_90d_pct: number;
    rank_delta_30d: number;
    trade_signal: TradeSignalType;
    signal_rationale: string;
  }
> = {
  // Breakouts & Strong Buys
  sleeper_11628: {
    // Malik Nabers
    change_30d_pct: 18.5,
    change_90d_pct: 42.0,
    rank_delta_30d: 5,
    trade_signal: 'STRONG_BUY',
    signal_rationale: 'Alpha target-share rookie profile. Dominating air yards with elite multi-year WR1 trajectory.',
  },
  sleeper_11634: {
    // Jayden Daniels
    change_30d_pct: 22.0,
    change_90d_pct: 54.0,
    rank_delta_30d: 9,
    trade_signal: 'STRONG_BUY',
    signal_rationale: 'Rushing floor creates unmatched dynasty Superflex insulation. Value accelerating toward overall top-12.',
  },
  sleeper_11635: {
    // Brock Bowers
    change_30d_pct: 16.0,
    change_90d_pct: 38.0,
    rank_delta_30d: 6,
    trade_signal: 'STRONG_BUY',
    signal_rationale: 'Historic rookie tight end target earning rate. Insulates TE premium position for next 8 seasons.',
  },
  sleeper_11629: {
    // Brian Thomas Jr.
    change_30d_pct: 24.5,
    change_90d_pct: 58.0,
    rank_delta_30d: 11,
    trade_signal: 'STRONG_BUY',
    signal_rationale: 'Explosive separation metrics and downfield target consolidation. Market value still climbing.',
  },

  // Prime Sell-High Propositions (Veterans at peak value with impending age dropoff)
  sleeper_4039: {
    // Tyreek Hill
    change_30d_pct: 3.5,
    change_90d_pct: -8.0,
    rank_delta_30d: -2,
    trade_signal: 'SELL_HIGH',
    signal_rationale: 'Age 30.5 cliff threshold reached. Cash out before inevitable 40% market value liquidation drop.',
  },
  sleeper_4981: {
    // Saquon Barkley
    change_30d_pct: 14.0,
    change_90d_pct: 22.0,
    rank_delta_30d: 4,
    trade_signal: 'SELL_HIGH',
    signal_rationale: 'Short-term spike on elite touchdown volume. At age 27.6 with heavy career touch volume, optimal exit window is open.',
  },
  sleeper_4017: {
    // Derrick Henry
    change_30d_pct: 12.0,
    change_90d_pct: 18.0,
    rank_delta_30d: 5,
    trade_signal: 'SELL_HIGH',
    signal_rationale: 'Age 30.7 RB scoring flurry. Contenders will pay inflated 2nd-round draft capital—liquidate now.',
  },
  sleeper_4034: {
    // Christian McCaffrey
    change_30d_pct: -15.0,
    change_90d_pct: -28.0,
    rank_delta_30d: -8,
    trade_signal: 'SELL_HIGH',
    signal_rationale: 'Persistent soft-tissue recurrence past age 28. Sell to title-desperate contenders on any activation rumor.',
  },
  sleeper_3198: {
    // Mike Evans
    change_30d_pct: 6.0,
    change_90d_pct: -4.0,
    rank_delta_30d: 0,
    trade_signal: 'SELL_HIGH',
    signal_rationale: 'Age 31.1 WR. Reliable production, but terminal dynasty market depreciation begins within 6 months.',
  },

  // Prime Buy-Low Targets (Depressed prices with rebound upside)
  sleeper_11631: {
    // Caleb Williams
    change_30d_pct: -8.5,
    change_90d_pct: -14.0,
    rank_delta_30d: -4,
    trade_signal: 'BUY_LOW',
    signal_rationale: 'Rookie offensive line struggles creating temporary market depression. Generational arm talent remains untouched.',
  },
  sleeper_9228: {
    // Anthony Richardson
    change_30d_pct: -22.0,
    change_90d_pct: -35.0,
    rank_delta_30d: -9,
    trade_signal: 'BUY_LOW',
    signal_rationale: 'Accuracy skepticism and benching panic have cratered price. Konami-code ceiling offers highest ROI upside.',
  },
  sleeper_8126: {
    // Chris Olave
    change_30d_pct: -12.0,
    change_90d_pct: -19.0,
    rank_delta_30d: -5,
    trade_signal: 'BUY_LOW',
    signal_rationale: 'Concussion protocol discounts and quarterback volatility mask elite route-running underlying efficiency.',
  },
  sleeper_9509: {
    // Sam LaPorta
    change_30d_pct: -14.5,
    change_90d_pct: -24.0,
    rank_delta_30d: -6,
    trade_signal: 'BUY_LOW',
    signal_rationale: 'TD regression following historic rookie year has panicked managers. Still top-3 dynasty TE asset under age 24.',
  },
  sleeper_7547: {
    // Trevor Lawrence
    change_30d_pct: -9.0,
    change_90d_pct: -16.0,
    rank_delta_30d: -3,
    trade_signal: 'BUY_LOW',
    signal_rationale: 'Franchise QB contract secured. Offensive scheme limitations temporarily obscuring QB1 career trajectory.',
  },

  // Hold Core / Cornerstones
  sleeper_6797: {
    // Justin Jefferson
    change_30d_pct: 1.5,
    change_90d_pct: 3.0,
    rank_delta_30d: 0,
    trade_signal: 'HOLD_CORNERSTONE',
    signal_rationale: 'Consensus overall #1 non-QB asset. Immune to offensive changes; retain as untouchable anchor.',
  },
  sleeper_7564: {
    // Ja'Marr Chase
    change_30d_pct: 4.0,
    change_90d_pct: 6.5,
    rank_delta_30d: 0,
    trade_signal: 'HOLD_CORNERSTONE',
    signal_rationale: 'Peak prime WR tied to franchise quarterback. Foundation asset for any dynasty window.',
  },
};

export class MarketTrendsEngine {
  /**
   * Generates comprehensive trend analytics for all master players.
   */
  public static computeMarketTrends(players: MasterPlayer[] = SEED_PLAYERS): PlayerMarketTrend[] {
    return players.map((player) => {
      const override = PLAYER_HISTORICAL_OVERRIDE[player.id];

      // If no override, generate algorithmic deterministic trend based on player attributes
      let pct30 = override?.change_30d_pct;
      let pct90 = override?.change_90d_pct;
      let rankDelta = override?.rank_delta_30d;
      let signal = override?.trade_signal;
      let rationale = override?.signal_rationale;

      if (pct30 === undefined) {
        // Algorithmically calculate based on age and market value tier
        if (player.age < 23.5) {
          // Young ascending
          pct30 = Math.round((7.5 - (player.consensus_rank % 5)) * 10) / 10;
          pct90 = Math.round(pct30 * 2.2 * 10) / 10;
          rankDelta = pct30 > 0 ? Math.ceil(pct30 / 3) : -Math.ceil(Math.abs(pct30) / 3);
          signal = pct30 >= 8 ? 'STRONG_BUY' : 'HOLD_CORNERSTONE';
          rationale = `Age ${player.age.toFixed(1)} asset with positive market momentum and extended multi-year prime window.`;
        } else if (player.age >= 28.5) {
          // Veteran post-peak
          pct30 = Math.round((-4.0 - (player.consensus_rank % 4)) * 10) / 10;
          pct90 = Math.round(pct30 * 2.5 * 10) / 10;
          rankDelta = -Math.ceil(Math.abs(pct30) / 2);
          signal = player.market_value > 3000 ? 'SELL_HIGH' : 'BUY_LOW';
          rationale =
            player.market_value > 3000
              ? `Veteran production carrying peak market value near positional age dropoff threshold (${player.position}). Optimal sell-high liquidity window.`
              : `Depreciated veteran with cheap win-now scoring profile for immediate championship pushes.`;
        } else {
          // Mid prime
          pct30 = Math.round((2.0 - (player.consensus_rank % 6)) * 10) / 10;
          pct90 = Math.round(pct30 * 1.8 * 10) / 10;
          rankDelta = pct30 > 0 ? 1 : pct30 < 0 ? -1 : 0;
          signal = pct30 < -5 ? 'BUY_LOW' : 'HOLD_CORNERSTONE';
          rationale = `Stable prime asset operating within peak window (${player.age.toFixed(1)} yrs). Reliable foundation value.`;
        }
      }

      const valNow = player.market_value;
      const val30d = Math.round(valNow / (1 + pct30 / 100));
      const val90d = Math.round(valNow / (1 + pct90 / 100));
      const val60d = Math.round((val90d + val30d) / 2);
      const val14d = Math.round((val30d + valNow) / 2);

      const rankNow = player.consensus_rank;
      const rank30d = Math.max(1, rankNow + (rankDelta || 0));
      const rank60d = Math.max(1, rankNow + Math.round((rankDelta || 0) * 1.6));
      const rank90d = Math.max(1, rankNow + Math.round((rankDelta || 0) * 2.2));
      const rank14d = Math.max(1, rankNow + Math.round((rankDelta || 0) * 0.5));

      const history = [
        { date: '90d ago', market_value: val90d, rank: rank90d },
        { date: '60d ago', market_value: val60d, rank: rank60d },
        { date: '30d ago', market_value: val30d, rank: rank30d },
        { date: '14d ago', market_value: val14d, rank: rank14d },
        { date: 'Current', market_value: valNow, rank: rankNow },
      ];

      return {
        player,
        current_value: valNow,
        previous_value_30d: val30d,
        previous_value_90d: val90d,
        change_30d_points: valNow - val30d,
        change_30d_pct: pct30,
        change_90d_points: valNow - val90d,
        change_90d_pct: pct90,
        rank_change_30d: -(rankDelta || 0), // positive means rank improved (#12 to #7 is +5)
        history,
        trade_signal: signal as TradeSignalType,
        signal_rationale: rationale,
      };
    });
  }

  /**
   * Helper to filter top value risers
   */
  public static getTopRisers(trends: PlayerMarketTrend[], limit = 5): PlayerMarketTrend[] {
    return [...trends]
      .sort((a, b) => b.change_30d_pct - a.change_30d_pct)
      .slice(0, limit);
  }

  /**
   * Helper to filter top value fallers
   */
  public static getTopFallers(trends: PlayerMarketTrend[], limit = 5): PlayerMarketTrend[] {
    return [...trends]
      .sort((a, b) => a.change_30d_pct - b.change_30d_pct)
      .slice(0, limit);
  }

  /**
   * Helper to filter actionable sell-high propositions
   */
  public static getSellHighTargets(trends: PlayerMarketTrend[], limit = 5): PlayerMarketTrend[] {
    return [...trends]
      .filter((t) => t.trade_signal === 'SELL_HIGH')
      .sort((a, b) => b.player.market_value - a.player.market_value)
      .slice(0, limit);
  }

  /**
   * Helper to filter actionable buy-low propositions
   */
  public static getBuyLowTargets(trends: PlayerMarketTrend[], limit = 5): PlayerMarketTrend[] {
    return [...trends]
      .filter((t) => t.trade_signal === 'BUY_LOW')
      .sort((a, b) => b.player.market_value - a.player.market_value)
      .slice(0, limit);
  }
}
