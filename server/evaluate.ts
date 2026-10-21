/**
 * Turns a platform-neutral league into Roster DNA evaluations for every team.
 *
 * - Player values come from the ValueStore on the right scale for the league (1QB vs Superflex).
 * - Gross Liquidity is measured against THIS league's median starting lineup, so 100 = league median.
 * - Players without a market value count as 0 and are reported, never guessed.
 */
import { RosterDNAMathEngine } from '../src/lib/rosterMath';
import { DraftPickEngine } from '../src/lib/draftPicks';
import { getSeasonContext } from '../src/lib/season';
import type {
  ClassificationType,
  DraftPick,
  LeagueTeamSummary,
  MasterPlayer,
  Position,
  RosterEvaluationResult,
  RosterRecord,
} from '../src/types';
import { valueStore } from './values';
import type { NormalizedLeague } from './leagues/types';

/** Applied to TE values in leagues that pay a TE reception bonus. Market feeds are not TEP-adjusted. */
export const TE_PREMIUM_MULTIPLIER = 1.15;

const normalizePosition = (pos: string): Position => {
  const p = (pos || '').toUpperCase();
  if (p === 'PK') return 'K';
  if (p === 'DEF' || p === 'DST' || p === 'D/ST') return 'DEF';
  return (['QB', 'RB', 'WR', 'TE', 'K'].includes(p) ? p : p || 'WR') as Position;
};

export function buildPlayerPool(league: NormalizedLeague): Map<string, MasterPlayer> {
  const sf = !!league.settings.superflex;
  const pool = new Map<string, MasterPlayer>();
  for (const lp of league.players.values()) {
    const valued = lp.value_key ? valueStore.byValueKey(lp.value_key) : undefined;
    const position = normalizePosition(lp.position || valued?.position || '');
    let value = valued ? (sf ? valued.value_sf : valued.value_1qb) : 0;
    if (position === 'TE' && league.settings.te_premium) value = Math.round(value * TE_PREMIUM_MULTIPLIER);
    pool.set(lp.id, {
      id: lp.id,
      full_name: lp.name,
      position,
      nfl_team: lp.team || 'FA',
      age: lp.age ?? valued?.age ?? 0,
      consensus_rank: Math.round((sf ? valued?.ecr_sf : valued?.ecr_1qb) ?? 999),
      market_value: value,
    });
  }
  return pool;
}

export function evaluateLeague(league: NormalizedLeague, requestedTeamId?: string | null) {
  const sf = !!league.settings.superflex;
  const pool = buildPlayerPool(league);
  const teamById = new Map(league.teams.map((t) => [t.team_id, t]));
  const userTeamId =
    (requestedTeamId && teamById.has(requestedTeamId) ? requestedTeamId : null) ||
    league.user_team_id ||
    league.teams[0]?.team_id;
  if (!userTeamId) throw new Error('This league has no teams yet.');

  const rosterPlayers = (teamId: string): MasterPlayer[] => {
    const out: MasterPlayer[] = [];
    for (const pid of teamById.get(teamId)?.player_ids || []) {
      const p = pool.get(pid);
      if (p) out.push({ ...p, roster_designation: teamById.get(teamId)?.designations[pid] || 'ACTIVE' });
    }
    return out;
  };

  // Pass 1: value-optimal starters per team -> league baseline and pick tiers.
  const starterValue = new Map<string, number>();
  for (const t of league.teams) {
    const { starters } = RosterDNAMathEngine.splitStartersAndBench(rosterPlayers(t.team_id), [], league.settings);
    starterValue.set(t.team_id, starters.reduce((s, p) => s + p.market_value, 0));
  }
  // Median, so one tanking or stacked team doesn't skew everyone else's score.
  const sorted = [...starterValue.values()].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const baseline = Math.max(1, sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 || 1);

  // Next draft: the earliest pick year anyone holds (platforms only list undrafted picks).
  const { upcomingDraftYear } = getSeasonContext();
  const allPickYears = league.teams.flatMap((t) => t.picks.map((p) => p.year));
  const firstDraftYear = allPickYears.length ? Math.min(...allPickYears) : upcomingDraftYear;

  // Next-draft pick tier from the original team's current strength (weakest third pick early).
  const strengthOrder = [...starterValue.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const tierFor = (originalTeamId: string): 'Early' | 'Mid' | 'Late' => {
    const i = strengthOrder.indexOf(originalTeamId);
    if (i < 0) return 'Mid';
    const third = strengthOrder.length / 3;
    return i < third ? 'Early' : i >= 2 * third ? 'Late' : 'Mid';
  };

  const picksFor = (teamId: string): DraftPick[] =>
    (teamById.get(teamId)?.picks || []).map((p) => {
      const offset = p.year - firstDraftYear;
      const tier = offset === 0 ? tierFor(p.original_team_id) : undefined;
      const own = p.original_team_id === teamId;
      const origName = teamById.get(p.original_team_id)?.name || `Team ${p.original_team_id}`;
      return {
        id: `pick-${p.year}-${p.round}-${p.original_team_id}`,
        year: p.year,
        round: p.round,
        tier,
        original_owner_id: p.original_team_id,
        original_owner_name: origName,
        current_owner_id: teamId,
        description: `${p.year} Round ${p.round}${tier ? ` (${tier})` : ''}${own ? '' : ` via ${origName}`}`,
        market_value: valueStore.pickValue(upcomingDraftYear + offset, p.round, sf, tier),
        is_priority_class: offset === 0,
        years_out: offset,
      };
    });

  const poolList = [...pool.values()];
  const recordFor = (teamId: string): RosterRecord => {
    const t = teamById.get(teamId)!;
    return {
      roster_id: teamId,
      platform: league.platform,
      external_league_id: league.league_id,
      franchise_id: teamId,
      player_ids: t.player_ids,
      valuation_mode: 'auction_desc',
      league_name: league.name,
      franchise_name: t.name,
      starters: [], // value-optimal lineup, not this week's
      taxi_ids: Object.entries(t.designations).filter(([, d]) => d === 'TAXI').map(([id]) => id),
      reserve_ids: Object.entries(t.designations).filter(([, d]) => d === 'IR').map(([id]) => id),
      draft_picks: picksFor(teamId),
      settings: league.settings,
    };
  };

  // Pass 2: full evaluation of every team against the league baseline.
  const evaluations = new Map<string, RosterEvaluationResult>();
  for (const t of league.teams) {
    evaluations.set(t.team_id, RosterDNAMathEngine.evaluateRoster(recordFor(t.team_id), poolList, baseline));
  }

  const userEval = evaluations.get(userTeamId)!;
  const userStance = DraftPickEngine.determineTradeStance(
    userEval.metrics.classification as ClassificationType,
    userEval.metrics.gross_liquidity,
    userEval.metrics.asset_half_life,
    userEval.metrics.structural_integrity
  );

  const leagueTeams: LeagueTeamSummary[] = league.teams.map((t) => {
    const ev = evaluations.get(t.team_id)!;
    const picks = ev.draft_picks || [];
    const draftCapital = picks.reduce((s, p) => s + p.market_value, 0);
    const stance = DraftPickEngine.determineTradeStance(
      ev.metrics.classification as ClassificationType,
      ev.metrics.gross_liquidity,
      ev.metrics.asset_half_life,
      ev.metrics.structural_integrity
    );
    return {
      franchise_id: t.team_id,
      franchise_name: t.name,
      owner_name: t.owner_name,
      power_rank: 0,
      classification: ev.metrics.classification as ClassificationType,
      championship_window_status: ev.championship_window?.status || 'Strong Contender',
      total_value: ev.metrics.total_roster_value ?? 0,
      starter_value: ev.metrics.starter_value ?? 0,
      bench_value: ev.metrics.bench_value ?? 0,
      draft_capital_value: draftCapital,
      gross_liquidity: ev.metrics.gross_liquidity,
      asset_half_life: ev.metrics.asset_half_life,
      structural_integrity: ev.metrics.structural_integrity,
      player_count: ev.players.length,
      trade_stance: stance.stance,
      stance_label: stance.label,
      stance_description: stance.description,
      top_players: [...ev.starters].sort((a, b) => b.market_value - a.market_value).slice(0, 4),
      starters: ev.starters,
      bench: ev.bench,
      draft_picks: picks,
      target_assets_for_user: DraftPickEngine.generateTargetAssetsForUser(userStance.stance, stance.stance, ev.players, picks),
    };
  });

  // Power score: starters win now, bench is depth, picks are future value.
  const power = (t: LeagueTeamSummary) => t.starter_value * 0.55 + t.bench_value * 0.3 + t.draft_capital_value * 0.15;
  leagueTeams.sort((a, b) => power(b) - power(a)).forEach((t, i) => (t.power_rank = i + 1));

  // Free agents: valued players nobody in this league rosters.
  const rostered = new Set(league.teams.flatMap((t) => t.player_ids));
  const idKey = league.platform === 'mfl' ? 'mfl_id' : 'sleeper_id';
  const freeAgents: MasterPlayer[] = valueStore.allPlayers
    .filter((v) => v[idKey] && !rostered.has(v[idKey]!))
    .map((v) => ({
      id: v[idKey]!,
      full_name: v.name,
      position: normalizePosition(v.position),
      nfl_team: v.team || 'FA',
      age: v.age ?? 0,
      consensus_rank: Math.round((sf ? v.ecr_sf : v.ecr_1qb) ?? 999),
      market_value: Math.round((sf ? v.value_sf : v.value_1qb) * (v.position === 'TE' && league.settings.te_premium ? TE_PREMIUM_MULTIPLIER : 1)),
    }))
    .filter((p) => p.market_value > 0)
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 50);

  const unvalued = userEval.players.filter((p) => p.market_value === 0 && !['K', 'DEF'].includes(p.position));
  const warnings = [...(userEval.warnings || [])];
  if (unvalued.length) {
    warnings.push(`${unvalued.length} player(s) have no market value yet (deep stashes or very new players) and count as 0.`);
  }

  return {
    ...userEval,
    warnings,
    unmatched_names: unvalued.map((p) => p.full_name),
    draft_picks: userEval.draft_picks,
    league_teams: leagueTeams,
    free_agents: freeAgents,
    values_meta: valueStore.meta,
    league_franchises: league.teams.map((t) => ({ franchise_id: t.team_id, franchise_name: t.name, owner_name: t.owner_name })),
  } satisfies RosterEvaluationResult;
}
