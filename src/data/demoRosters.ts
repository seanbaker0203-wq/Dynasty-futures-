import { RosterRecord } from '../types';

export const DEMO_ROSTERS: Record<'juggernaut' | 'contender' | 'rebuild', RosterRecord> = {
  juggernaut: {
    roster_id: 'demo-juggernaut',
    platform: 'sleeper',
    external_league_id: '999901',
    franchise_id: 'apex_dynasty',
    franchise_name: 'Metropolis Apex Predator',
    league_name: 'Apex Superflex Empire (Demo)',
    valuation_mode: 'auction_desc',
    player_ids: [
      'sleeper_4046', // Patrick Mahomes (QB, 7400)
      'sleeper_4881', // Josh Allen (QB, 7650)
      'sleeper_6797', // Justin Jefferson (WR, 8900)
      'sleeper_7564', // Ja'Marr Chase (WR, 8750)
      'sleeper_6794', // CeeDee Lamb (WR, 8600)
      'sleeper_7525', // Amon-Ra St. Brown (WR, 7800)
      'sleeper_9221', // Bijan Robinson (RB, 7100)
      'sleeper_8155', // Breece Hall (RB, 6950)
      'sleeper_11635', // Brock Bowers (TE, 6100)
      'sleeper_9220', // Jahmyr Gibbs (RB, 6800) - Bench
      'sleeper_8138', // Garrett Wilson (WR, 5950) - Bench
      'sleeper_8130', // Trey McBride (TE, 5500) - Bench
      'sleeper_9224', // De'Von Achane (RB, 4100) - Bench
      'sleeper_9500', // Jayden Reed (WR, 1900) - Bench
    ],
    starters: [
      'sleeper_4046',
      'sleeper_4881',
      'sleeper_6797',
      'sleeper_7564',
      'sleeper_6794',
      'sleeper_7525',
      'sleeper_9221',
      'sleeper_8155',
      'sleeper_11635',
    ],
  },
  contender: {
    roster_id: 'demo-contender',
    platform: 'sleeper',
    external_league_id: '999902',
    franchise_id: 'win_now_dynasty',
    franchise_name: 'Gotham Iron Men',
    league_name: 'High Stakes 12T SF (Demo)',
    valuation_mode: 'auction_desc',
    player_ids: [
      'sleeper_4866', // Lamar Jackson (QB, 7250)
      'sleeper_6801', // Jalen Hurts (QB, 6200)
      'sleeper_5859', // A.J. Brown (WR, 4600)
      'sleeper_4039', // Tyreek Hill (WR, 4500)
      'sleeper_8144', // Drake London (WR, 4900)
      'sleeper_6803', // Jonathan Taylor (RB, 4800)
      'sleeper_4034', // Christian McCaffrey (RB, 4700)
      'sleeper_4981', // Saquon Barkley (RB, 2400)
      'sleeper_4984', // Mark Andrews (TE, 3700)
      'sleeper_5857', // DK Metcalf (WR, 2900) - Bench
      'sleeper_4017', // Derrick Henry (RB, 1850) - Bench
      'sleeper_3198', // Mike Evans (WR, 1750) - Bench
      'sleeper_4035', // Alvin Kamara (RB, 1500) - Bench
      'sleeper_1466', // Travis Kelce (TE, 1900) - Bench
    ],
    starters: [
      'sleeper_4866',
      'sleeper_6801',
      'sleeper_5859',
      'sleeper_4039',
      'sleeper_8144',
      'sleeper_6803',
      'sleeper_4034',
      'sleeper_4981',
      'sleeper_4984',
    ],
  },
  rebuild: {
    roster_id: 'demo-rebuild',
    platform: 'sleeper',
    external_league_id: '999903',
    franchise_id: 'trust_the_process',
    franchise_name: 'Future First Rounders',
    league_name: 'Dynasty Revival 12T (Demo)',
    valuation_mode: 'auction_desc',
    player_ids: [
      'sleeper_11631', // Caleb Williams (QB, 5700)
      'sleeper_11634', // Jayden Daniels (QB, 5600)
      'sleeper_11632', // Marvin Harrison Jr. (WR, 6650)
      'sleeper_11628', // Malik Nabers (WR, 6500)
      'sleeper_11633', // Rome Odunze (WR, 4300)
      'sleeper_11629', // Brian Thomas Jr. (WR, 4200)
      'sleeper_11637', // Xavier Worthy (WR, 3500)
      'sleeper_11639', // Jonathon Brooks (RB, 2600)
      'sleeper_9509', // Sam LaPorta (TE, 5400)
      'sleeper_11638', // Ladd McConkey (WR, 3400) - Bench
      'sleeper_11640', // Keon Coleman (WR, 1800) - Bench
      'sleeper_9228', // Anthony Richardson (QB, 5300) - Bench
    ],
    starters: [
      'sleeper_11631',
      'sleeper_11634',
      'sleeper_11632',
      'sleeper_11628',
      'sleeper_11633',
      'sleeper_11629',
      'sleeper_11637',
      'sleeper_11639',
      'sleeper_9509',
    ],
  },
};
