/**
 * Dynasty AI Evaluator - League Simulation & Mock Ecosystem
 * Provides realistic 10-team full league rankings, draft capital, and free agents
 * when running demo modes, CSV uploads, or mock environments.
 */

import { LeagueTeamSummary, MasterPlayer, DraftPick, RosterRecord } from '../types/index';
import { SEED_PLAYERS } from '../data/seedPlayers';
import { DraftPickEngine } from './draftPicks';

export function generateDemoLeagueTeams(userFranchiseName = 'Gotham Iron Men'): {
  league_teams: LeagueTeamSummary[];
  free_agents: MasterPlayer[];
  user_draft_picks: DraftPick[];
} {
  const currentSeason = 2026;
  const startDraftYear = 2027; // 2026 Rookie Draft is complete; 2027 is the priority upcoming class

  // Franchise Definitions
  interface FranchiseConfig {
    id: string;
    name: string;
    owner: string;
    classification: 'Juggernaut' | 'Contender' | 'Productive Struggle' | 'Fraudulent Contender' | 'Total Rebuild' | 'Middle of the Pack';
    window: string;
    stance: 'WIN_NOW_BUYER' | 'BALANCED_CONTENDER' | 'REBUILD_SELLER' | 'YOUTH_ACCUMULATOR';
    starterIds: string[];
    benchIds: string[];
    tradedAwayFirsts: number[];
  }

  const franchiseConfigs: FranchiseConfig[] = [
    {
      id: 'demo-f1',
      name: 'Metropolis Apex Predator',
      owner: 'Clark K.',
      classification: 'Juggernaut' as const,
      window: 'Win-Now Peak (2026-2029)',
      stance: 'WIN_NOW_BUYER' as const,
      starterIds: ['sleeper_4046', 'sleeper_4881', 'sleeper_6797', 'sleeper_7564', 'sleeper_6794', 'sleeper_7525', 'sleeper_9221', 'sleeper_8155', 'sleeper_11635'],
      benchIds: ['sleeper_9220', 'sleeper_8138', 'sleeper_8130', 'sleeper_9224'],
      tradedAwayFirsts: [2027, 2028], // Sold future 1sts to buy elite win-now studs
    },
    {
      id: 'demo-f2',
      name: userFranchiseName,
      owner: 'Sean B. (You)',
      classification: 'Contender' as const,
      window: 'Strong Contender (2026-2028)',
      stance: 'BALANCED_CONTENDER' as const,
      starterIds: ['sleeper_4866', 'sleeper_6801', 'sleeper_5859', 'sleeper_4039', 'sleeper_8144', 'sleeper_6803', 'sleeper_4034', 'sleeper_4981', 'sleeper_4984'],
      benchIds: ['sleeper_5857', 'sleeper_4017', 'sleeper_3198', 'sleeper_4035', 'sleeper_1466'],
      tradedAwayFirsts: [],
    },
    {
      id: 'demo-f3',
      name: 'Steel City Dynasty',
      owner: 'Mike T.',
      classification: 'Contender' as const,
      window: 'Win-Now Peak (2026-2027)',
      stance: 'WIN_NOW_BUYER' as const,
      starterIds: ['sleeper_4034', 'sleeper_4017', 'sleeper_3198', 'sleeper_1466', 'sleeper_4866', 'sleeper_4039', 'sleeper_5859'],
      benchIds: ['sleeper_4981', 'sleeper_6803'],
      tradedAwayFirsts: [2027],
    },
    {
      id: 'demo-f4',
      name: 'Motor City Lions',
      owner: 'Dan C.',
      classification: 'Contender' as const,
      window: 'Active Contender (2026-2028)',
      stance: 'BALANCED_CONTENDER' as const,
      starterIds: ['sleeper_7525', 'sleeper_9220', 'sleeper_9509', 'sleeper_6801', 'sleeper_9224'],
      benchIds: ['sleeper_9500', 'sleeper_8130'],
      tradedAwayFirsts: [],
    },
    {
      id: 'demo-f5',
      name: 'Lone Star Outlaws',
      owner: 'Jerry J.',
      classification: 'Fraudulent Contender' as const,
      window: '2-Year Horizon (Fragile)',
      stance: 'WIN_NOW_BUYER' as const,
      starterIds: ['sleeper_6794', 'sleeper_4035', 'sleeper_3198', 'sleeper_1466'],
      benchIds: ['sleeper_4017'],
      tradedAwayFirsts: [2027, 2028, 2029], // Liquidated all future 1sts for aging veterans
    },
    {
      id: 'demo-f6',
      name: 'Bay Area Blitz',
      owner: 'Kyle S.',
      classification: 'Middle of the Pack' as const,
      window: 'Playoff Hopeful (2026)',
      stance: 'BALANCED_CONTENDER' as const,
      starterIds: ['sleeper_4034', 'sleeper_5857', 'sleeper_4984', 'sleeper_8144'],
      benchIds: ['sleeper_9224'],
      tradedAwayFirsts: [],
    },
    {
      id: 'demo-f7',
      name: 'Emerald City Hawks',
      owner: 'Pete C.',
      classification: 'Productive Struggle' as const,
      window: 'Ascending Youth (2027+)',
      stance: 'YOUTH_ACCUMULATOR' as const,
      starterIds: ['sleeper_5857', 'sleeper_9500', 'sleeper_8138'],
      benchIds: ['sleeper_11638', 'sleeper_11640'],
      tradedAwayFirsts: [],
    },
    {
      id: 'demo-f8',
      name: 'South Beach Sharks',
      owner: 'Mike M.',
      classification: 'Productive Struggle' as const,
      window: 'Ascending Youth (2027+)',
      stance: 'YOUTH_ACCUMULATOR' as const,
      starterIds: ['sleeper_4039', 'sleeper_9224', 'sleeper_11637', 'sleeper_11639'],
      benchIds: ['sleeper_11638'],
      tradedAwayFirsts: [],
    },
    {
      id: 'demo-f9',
      name: 'Mile High Altitude',
      owner: 'Sean P.',
      classification: 'Total Rebuild' as const,
      window: 'Rebuild Horizon (2028+)',
      stance: 'REBUILD_SELLER' as const,
      starterIds: ['sleeper_4017', 'sleeper_4035', 'sleeper_3198'],
      benchIds: ['sleeper_11640', 'sleeper_11638'],
      tradedAwayFirsts: [],
    },
    {
      id: 'demo-f10',
      name: 'Future First Rounders',
      owner: 'Sam H.',
      classification: 'Total Rebuild' as const,
      window: 'Deep Rebuild (Pick Hoarder)',
      stance: 'REBUILD_SELLER' as const,
      starterIds: ['sleeper_11631', 'sleeper_11634', 'sleeper_11632', 'sleeper_11628', 'sleeper_11633', 'sleeper_11629', 'sleeper_9509'],
      benchIds: ['sleeper_11637', 'sleeper_11639', 'sleeper_11638', 'sleeper_11640', 'sleeper_9228'],
      tradedAwayFirsts: [], // Has 6 future 1st round picks!
    },
  ];

  const playerMap = new Map<string, MasterPlayer>();
  SEED_PLAYERS.forEach((p) => playerMap.set(p.id, p));

  const allRosteredIds = new Set<string>();
  const teams: LeagueTeamSummary[] = [];

  for (const cfg of franchiseConfigs) {
    const starters = cfg.starterIds
      .map((id) => playerMap.get(id))
      .filter((p): p is MasterPlayer => Boolean(p));
    const bench = cfg.benchIds
      .map((id) => playerMap.get(id))
      .filter((p): p is MasterPlayer => Boolean(p));

    starters.forEach((p) => allRosteredIds.add(p.id));
    bench.forEach((p) => allRosteredIds.add(p.id));

    // Generate draft picks starting at 2027 (2026 rookie draft concluded)
    const picks: DraftPick[] = [];
    for (let y = startDraftYear; y <= startDraftYear + 2; y++) {
      for (let r = 1; r <= 3; r++) {
        // Skip if traded away
        if (r === 1 && cfg.tradedAwayFirsts.includes(y)) {
          continue;
        }
        const pickVal = DraftPickEngine.calculatePickValue(y, r, 'Mid');
        picks.push({
          id: `pick-${y}-${r}-${cfg.id}`,
          year: y,
          round: r,
          original_owner_id: cfg.id,
          original_owner_name: cfg.name,
          current_owner_id: cfg.id,
          description: `${y} Round ${r} (Own)`,
          market_value: pickVal,
          is_priority_class: y === 2027,
          years_out: y - 2027,
        });
      }
    }

    // If rebuild hoarder (f10), add acquired multi-year draft equity (2027, 2028, 2029 1sts)
    if (cfg.id === 'demo-f10') {
      picks.push({
        id: `pick-2027-1-f1-f10`,
        year: 2027,
        round: 1,
        original_owner_id: 'demo-f1',
        original_owner_name: 'Metropolis Apex Predator',
        current_owner_id: 'demo-f10',
        description: '2027 Round 1 (via Metropolis Apex Predator)',
        market_value: 5600,
        is_priority_class: true,
        years_out: 0,
      });
      picks.push({
        id: `pick-2027-1-f5-f10`,
        year: 2027,
        round: 1,
        original_owner_id: 'demo-f5',
        original_owner_name: 'Lone Star Outlaws',
        current_owner_id: 'demo-f10',
        description: '2027 Round 1 (via Lone Star Outlaws)',
        market_value: 6800, // Early 1st!
        is_priority_class: true,
        years_out: 0,
      });
      picks.push({
        id: `pick-2028-1-f1-f10`,
        year: 2028,
        round: 1,
        original_owner_id: 'demo-f1',
        original_owner_name: 'Metropolis Apex Predator',
        current_owner_id: 'demo-f10',
        description: '2028 Round 1 (via Metropolis Apex Predator)',
        market_value: 5100, // Multi-year compounding equity
        is_priority_class: false,
        years_out: 1,
      });
      picks.push({
        id: `pick-2029-1-f5-f10`,
        year: 2029,
        round: 1,
        original_owner_id: 'demo-f5',
        original_owner_name: 'Lone Star Outlaws',
        current_owner_id: 'demo-f10',
        description: '2029 Round 1 (via Lone Star Outlaws)',
        market_value: 4700, // 3-year out arbitrage pick
        is_priority_class: false,
        years_out: 2,
      });
    }

    const starterVal = starters.reduce((acc, p) => acc + p.market_value, 0);
    const benchVal = bench.reduce((acc, p) => acc + p.market_value, 0);
    const pickVal = picks.reduce((acc, p) => acc + p.market_value, 0);
    const totalVal = starterVal + benchVal + pickVal;

    let liquidity = Math.round((starterVal / 38000) * 100);
    if (cfg.classification === 'Juggernaut') liquidity = 138;
    else if (cfg.classification === 'Contender') liquidity = 114;
    else if (cfg.classification === 'Total Rebuild') liquidity = 68;

    let halfLife = 3.2;
    if (cfg.classification === 'Juggernaut') halfLife = 3.8;
    else if (cfg.classification === 'Total Rebuild') halfLife = 4.9;
    else if (cfg.classification === 'Fraudulent Contender') halfLife = 1.9;

    const integrity = Math.round((starterVal / Math.max(1, starterVal + benchVal)) * 100);

    const stanceData = DraftPickEngine.determineTradeStance(cfg.classification, liquidity, halfLife, integrity);

    teams.push({
      franchise_id: cfg.id,
      franchise_name: cfg.name,
      owner_name: cfg.owner,
      power_rank: 1,
      classification: cfg.classification,
      championship_window_status: cfg.window,
      total_value: totalVal,
      starter_value: starterVal,
      bench_value: benchVal,
      draft_capital_value: pickVal,
      gross_liquidity: liquidity,
      asset_half_life: halfLife,
      structural_integrity: integrity,
      player_count: starters.length + bench.length,
      trade_stance: cfg.stance,
      stance_label: stanceData.label,
      stance_description: stanceData.description,
      top_players: starters.slice(0, 4),
      starters,
      bench,
      draft_picks: picks,
      target_assets_for_user: [],
    });
  }

  // Sort teams by composite power score: Starter value * 0.55 + Bench value * 0.3 + Draft capital * 0.15
  teams.sort((a, b) => {
    const scoreA = a.starter_value * 0.55 + a.bench_value * 0.3 + a.draft_capital_value * 0.15;
    const scoreB = b.starter_value * 0.55 + b.bench_value * 0.3 + b.draft_capital_value * 0.15;
    return scoreB - scoreA;
  });

  teams.forEach((t, idx) => {
    t.power_rank = idx + 1;
  });

  // Calculate unrostered free agents
  const freeAgents = SEED_PLAYERS.filter((p) => !allRosteredIds.has(p.id) && p.market_value >= 400)
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 50);

  const userTeam = teams.find((t) => t.franchise_name === userFranchiseName) || teams[1];

  return {
    league_teams: teams,
    free_agents: freeAgents,
    user_draft_picks: userTeam?.draft_picks || [],
  };
}
