/**
 * Turns a platform-neutral league into Roster DNA evaluations for every team.
 *
 * - Player and pick values are Futures Values (server/model/futures.ts) for this league's format.
 * - Gross Liquidity is measured against THIS league's median starting lineup, so 100 = league median.
 * - Players without any value count as 0 and are reported, never guessed.
 * - Each team also gets a season-by-season outlook: projected starting-lineup points per week.
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
  SeasonOutlook,
} from '../src/types';
import { getBoard, WEIGHTS, type Board } from './model/futures';
import { valueStore } from './values';
import { gradeLeague } from './classify';
import type { NormalizedLeague } from './leagues/types';

const normalizePosition = (pos: string): Position => {
  const p = (pos || '').toUpperCase();
  if (p === 'PK') return 'K';
  if (p === 'DEF' || p === 'DST' || p === 'D/ST') return 'DEF';
  return (['QB', 'RB', 'WR', 'TE', 'K'].includes(p) ? p : p || 'WR') as Position;
};

/** Board entry -> the per-player Futures breakdown we attach to MasterPlayer. */
function futuresOf(bp: Board['players'][number]) {
  const { id, sleeper_id, mfl_id, name, position, team, age, expert_history, ...info } = bp;
  return info;
}

export function buildPlayerPool(league: NormalizedLeague, board: Board): Map<string, MasterPlayer> {
  const pool = new Map<string, MasterPlayer>();
  for (const lp of league.players.values()) {
    const bp = league.platform === 'mfl' ? board.byMfl.get(lp.id) : board.bySleeper.get(lp.id);
    const position = normalizePosition(lp.position || bp?.position || '');
    pool.set(lp.id, {
      id: lp.id,
      full_name: lp.name,
      position,
      nfl_team: lp.team || bp?.team || 'FA',
      age: lp.age ?? bp?.age ?? 0,
      consensus_rank: bp?.rank ?? 999,
      market_value: bp?.value ?? 0,
      futures: bp ? futuresOf(bp) : undefined,
    });
  }
  return pool;
}

export async function evaluateLeague(league: NormalizedLeague, requestedTeamId?: string | null) {
  const board = await getBoard(league.settings);
  const pool = buildPlayerPool(league, board);
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

  // Next rookie draft comes from the calendar (adapters drop picks from drafts already held).
  const { upcomingDraftYear } = getSeasonContext();
  const firstDraftYear = upcomingDraftYear;

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
        market_value: board.pickValue(upcomingDraftYear + offset, p.round, tier),
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

  // Pass 3: grade every team against its own league and re-derive labels, window and advice.
  const grades = gradeLeague(
    league.teams.map((t) => {
      const ev = evaluations.get(t.team_id)!;
      return {
        id: t.team_id,
        starterValue: ev.metrics.starter_value ?? 0,
        halfLife: ev.metrics.asset_half_life,
        pickValue: ev.metrics.draft_capital_value ?? 0,
        grossLiquidity: ev.metrics.gross_liquidity,
      };
    })
  );
  const equities = [...evaluations.values()].map((e) => e.metrics.starter_equity_ratio ?? 0).sort((a, b) => a - b);
  const fragileCutoff = equities[Math.floor(equities.length * 0.8)] ?? 100; // top 20% most top-heavy
  for (const [teamId, ev] of evaluations) {
    const grade = grades.get(teamId)!;
    const m = ev.metrics;
    m.classification = grade.classification;
    const window = RosterDNAMathEngine.calculateChampionshipWindow(m.asset_half_life, m.gross_liquidity, grade.classification, ev.starters);
    m.championship_window = window;
    m.peak_window_years = window.years_remaining;
    ev.championship_window = window;
    ev.remediations = RosterDNAMathEngine.generateRemediations(
      { gross_liquidity: m.gross_liquidity, asset_half_life: m.asset_half_life, structural_integrity: m.structural_integrity, classification: grade.classification },
      ev.starters,
      ev.bench,
      league.settings
    );
    ev.warnings = (ev.warnings || []).filter((w) => !w.startsWith('High Fragility Warning'));
    if ((m.starter_equity_ratio ?? 0) >= fragileCutoff && (m.starter_equity_ratio ?? 0) >= 85) {
      ev.warnings.push(
        `Top-heavy: starters hold ${m.starter_equity_ratio}% of your player value, among the highest in the league. One injury hurts more than usual.`
      );
    }
  }

  const userEval = evaluations.get(userTeamId)!;
  const userStance = DraftPickEngine.stanceInfo(grades.get(userTeamId)!.stance);

  const leagueTeams: LeagueTeamSummary[] = league.teams.map((t) => {
    const ev = evaluations.get(t.team_id)!;
    const picks = ev.draft_picks || [];
    const draftCapital = picks.reduce((s, p) => s + p.market_value, 0);
    const stance = DraftPickEngine.stanceInfo(grades.get(t.team_id)!.stance);
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
      reserves: [...(ev.injured_reserve || []), ...(ev.taxi_squad || [])],
      draft_picks: picks,
      target_assets_for_user: DraftPickEngine.generateTargetAssetsForUser(userStance.stance, stance.stance, ev.players, picks),
    };
  });

  // Power score: starters win now, bench is depth, picks are future value.
  const power = (t: LeagueTeamSummary) => t.starter_value * 0.55 + t.bench_value * 0.3 + t.draft_capital_value * 0.15;
  leagueTeams.sort((a, b) => power(b) - power(a)).forEach((t, i) => (t.power_rank = i + 1));

  // Season outlook: best projected lineup (points per week) for each of the next seasons, ranked in the league.
  // Everyone on the roster counts (taxi and IR players are back in future years); future rookies are not included.
  const seasons = board.players[0]?.projection.map((p) => p.season) ?? [];
  const outlook = new Map<string, SeasonOutlook[]>();
  for (const t of league.teams) {
    const players = rosterPlayers(t.team_id);
    outlook.set(
      t.team_id,
      seasons.map((season, i) => {
        const asPoints = players.map((p) => ({ ...p, roster_designation: 'ACTIVE' as const, market_value: p.futures?.projection[i]?.ppg ?? 0 }));
        const { starters } = RosterDNAMathEngine.splitStartersAndBench(asPoints, [], league.settings);
        return { season, points: Math.round(starters.reduce((s, p) => s + p.market_value, 0) * 10) / 10, rank: 0 };
      })
    );
  }
  seasons.forEach((_, i) => {
    [...outlook.entries()]
      .sort((a, b) => b[1][i].points - a[1][i].points)
      .forEach(([, o], r) => (o[i].rank = r + 1));
  });
  for (const lt of leagueTeams) lt.season_outlook = outlook.get(lt.franchise_id);

  // Free agents: valued players nobody in this league rosters.
  const rostered = new Set(league.teams.flatMap((t) => t.player_ids));
  const idKey = league.platform === 'mfl' ? 'mfl_id' : 'sleeper_id';
  const freeAgents: MasterPlayer[] = board.players
    .filter((bp) => bp[idKey] && !rostered.has(bp[idKey]!) && bp.value > 0)
    .slice(0, 60)
    .map((bp) => ({
      id: bp[idKey]!,
      full_name: bp.name,
      position: normalizePosition(bp.position),
      nfl_team: bp.team || 'FA',
      age: bp.age ?? 0,
      consensus_rank: bp.rank,
      market_value: bp.value,
      futures: futuresOf(bp),
    }));

  const unvalued = userEval.players.filter((p) => p.market_value === 0 && !['K', 'DEF'].includes(p.position));
  const warnings = [...(userEval.warnings || [])];
  if (unvalued.length) {
    warnings.push(
      unvalued.length === 1
        ? `${unvalued[0].full_name} has no market value yet, so counts as 0.`
        : `${unvalued.length} players have no market value yet (deep stashes or very new players), so count as 0.`
    );
  }

  return {
    ...userEval,
    warnings,
    unmatched_names: unvalued.map((p) => p.full_name),
    draft_picks: userEval.draft_picks,
    league_teams: leagueTeams,
    free_agents: freeAgents,
    values_meta: {
      source: `Futures Value: ${WEIGHTS.model * 100}% our projection model, ${WEIGHTS.market * 100}% FantasyCalc trade market, ${WEIGHTS.experts * 100}% FantasyPros experts (via DynastyProcess)`,
      scrape_date: valueStore.meta.scrape_date,
      player_count: board.players.length,
    },
    season_outlook: outlook.get(userTeamId),
    league_franchises: league.teams.map((t) => ({ franchise_id: t.team_id, franchise_name: t.name, owner_name: t.owner_name })),
  } satisfies RosterEvaluationResult;
}
