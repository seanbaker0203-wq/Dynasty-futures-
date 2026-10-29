/**
 * Dynasty AI Evaluator - TypeScript Interfaces (Slice 1)
 * Roster DNA Platform Data Models & Enums
 */

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'PICK';

export type Platform = 'sleeper' | 'mfl' | 'espn' | 'yahoo' | 'fleaflicker' | 'csv' | 'manual';

export type ValuationMode = 'rankings_asc' | 'auction_desc';

export type ClassificationType =
  | 'Juggernaut'
  | 'Contender'
  | 'Productive Struggle'
  | 'Fraudulent Contender'
  | 'Total Rebuild'
  | 'Middle of the Pack';

export type RosterDesignation = 'ACTIVE' | 'IR' | 'TAXI';

export interface MasterPlayer {
  id: string;
  full_name: string;
  position: Position;
  nfl_team: string;
  age: number;
  consensus_rank: number;
  market_value: number;
  tier?: number;
  is_starter?: boolean;
  normalized_name?: string;
  roster_designation?: RosterDesignation;
  salary?: string | number;
  contract_year?: string | number;
  fantasy_points_ppr?: number;
  points?: number;
  projected_points?: number;
  adp?: number;
  /** Futures Value breakdown; market_value above is the Futures Value itself */
  futures?: FuturesInfo;
  /** Salary-cap leagues only */
  contract?: ContractValue;
}

export type ProjectionTier = 'Starter' | 'Flex' | 'Depth' | 'Fading';
export type ValueSignal = 'BUY_LOW' | 'SELL_HIGH' | 'BUY' | 'SELL' | 'HOLD';

export interface SeasonProjection {
  season: number;
  ppg: number;
  tier: ProjectionTier;
}

export interface FuturesInfo {
  value: number;
  market: number | null; // FantasyCalc trade market, on the shared scale
  experts: number | null; // FantasyPros-based (DynastyProcess), mapped to the shared scale
  model: number | null; // our production + age model, mapped to the shared scale
  edge: number | null; // (value - market) / market
  signal: ValueSignal;
  market_trend_30d: number | null; // fraction, e.g. -0.08
  expert_trend_4w: number | null; // fraction
  ppg: number | null; // recent points per game under league scoring
  games: number | null;
  projection: SeasonProjection[];
  falloff_season: number | null; // first season projected below starter/flex after being one
  rank: number;
  position_rank: number;
  ktc_url: string | null;
  /** NFL contract: when it ends, first season he can be cut cheaply, and the risk applied to projections */
  nfl_contract?: NflContract | null;
  /** Redraft only: rest-of-season projection */
  ros?: RosInfo | null;
  /** Other sites' player ids, for links */
  ext_ids?: PlayerExternalIds | null;
}

export interface BoardPlayer extends FuturesInfo {
  id: string; // sleeper id when known
  sleeper_id: string | null;
  mfl_id: string | null;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  expert_history: { date: string; value: number }[];
}

export interface SeasonOutlook {
  season: number;
  points: number; // projected starting-lineup points per week from today's roster
  pick_points: number; // expected extra points per week from rookie picks drafted by this season
  total: number; // points + pick_points
  rank: number; // within the league, counting picks
  rank_roster: number; // within the league, roster only
}

/** One draft pick's expected outlook (Plan page). */
export interface PickPlan {
  pick_id: string;
  year: number;
  round: number;
  tier?: 'Early' | 'Mid' | 'Late';
  value_now: number;
  value_at_draft: number; // what the same pick is worth once it's the next draft's pick
  hit_rates: number[]; // chance of a starter-level season, rookie year first
  ppg_if_hit: number[];
}

export interface HistoricalValuePoint {
  date: string;
  market_value: number;
  rank: number;
}

export type TradeSignalType = 'SELL_HIGH' | 'BUY_LOW' | 'STRONG_BUY' | 'HOLD_CORNERSTONE';

export interface PlayerMarketTrend {
  player: MasterPlayer;
  current_value: number;
  previous_value_30d: number;
  previous_value_90d: number;
  change_30d_points: number;
  change_30d_pct: number;
  change_90d_points: number;
  change_90d_pct: number;
  rank_change_30d: number;
  history: HistoricalValuePoint[];
  trade_signal: TradeSignalType;
  signal_rationale: string;
}

export interface LeagueSettings {
  league_size: number;
  roster_size?: number;
  starter_count: number;
  slots: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    FLEX: number; // RB/WR/TE
    SUPER_FLEX?: number; // QB/RB/WR/TE
    K?: number;
    DEF?: number;
  };
  scoring_type?: string;
  /** Superflex or 2QB: QBs valued on the Superflex scale */
  superflex?: boolean;
  /** League gives a bonus per TE reception */
  te_premium?: boolean;
  /** Salary-cap leagues (MFL) */
  salary_cap?: { cap: number; taxi_pct: number; ir_pct: number };
  /** League type: dynasty (default), keeper or redraft. Decides which tools and values the app shows. */
  format?: LeagueFormat;
  /** Where the format came from: the platform's own setting, or the user's choice */
  format_source?: 'platform' | 'user' | 'default';
  /** Fantasy playoffs: first week and number of teams */
  playoffs?: { start_week: number; teams: number; weeks: number } | null;
  /** Each week also counts as a game against the league median score */
  median_game?: boolean;
  /** FAAB budget per team (null = rolling/priority waivers) */
  faab_budget?: number | null;
}

export type LeagueFormat = 'dynasty' | 'keeper' | 'redraft';

export interface CapOutlook {
  season: number;
  committed: number; // salaries under contract that season
  space: number; // cap - committed
}

export interface TeamCap {
  hit: number; // this season's cap hit (taxi / IR discounted)
  space: number;
  by_season: CapOutlook[];
  expiring: number; // salary coming off after this season
}

export interface ContractValue {
  salary: number;
  years_left: number | null; // 1 = final season is this one
  fair_salary: number; // what a player of this value costs in this league
  surplus: number; // fair_salary - salary (positive = bargain)
}

/** Where the market values came from and how fresh they are */
export interface ValuesMeta {
  source: string;
  scrape_date: string | null;
  player_count: number;
}

export interface ChampionshipWindow {
  status: 'Win-Now Peak' | 'Strong Contender' | '2-Year Horizon' | 'Productive Youth' | 'Rebuild Horizon';
  years_remaining: number;
  peak_start_year: number;
  peak_end_year: number;
  verdict: string;
  urgency_level: 'Critical' | 'Moderate' | 'Low' | 'Rebuilding';
  target_acquisitions: string[];
}

export interface RosterRemediationAdvice {
  category: 'Asset Liquidity' | 'Age Cliff Warning' | 'Structural Imbalance' | 'Surplus Capital' | 'Depth Deficit';
  severity: 'critical' | 'warning' | 'opportunity';
  metric_name: string;
  current_value: string;
  threshold: string;
  issue: string;
  actionable_step: string;
  recommended_moves: string[];
}

export type ProjectionSourceKey =
  | 'espn'
  | 'yahoo'
  | 'footballguys'
  | 'ktc'
  | 'fantasypros'
  | 'ballers';

export interface SourceProjection {
  source_key: ProjectionSourceKey;
  source_name: string;
  url: string;
  projected_points: number;
  rank_in_pos: number;
  sentiment?: string;
}

export interface MultiSourceWeeklyProjection {
  player: MasterPlayer;
  opponent: string;
  is_home: boolean;
  matchup_rating: 'Smash Spot' | 'Favorable' | 'Neutral' | 'Tough' | 'Shadow Coverage';
  matchup_rank_vs_pos: number;
  source_projections: Record<ProjectionSourceKey, SourceProjection>;
  composite_average: number;
  high_projection: { source: string; points: number };
  low_projection: { source: string; points: number };
  spread: number;
  sit_start_status: 'MUST_START' | 'START' | 'TOSS_UP' | 'SIT';
  rationale: string;
  floor: number;
  ceiling: number;
  expert_notes?: string;
  external_links: {
    footballguys: string;
    thefantasyfootballers: string;
    keeptradecut: string;
    fantasypros: string;
    yahoo: string;
    espn: string;
  };
}

export interface WeeklyMatchup {
  opponent: string;
  is_home: boolean;
  projected_points: number;
  matchup_rating: 'Smash Spot' | 'Favorable' | 'Neutral' | 'Tough' | 'Shadow Coverage';
  matchup_rank_vs_pos: number; // 1 to 32 (32 = easiest matchup)
  confidence: number; // 0-100%
  sit_start_status: 'MUST_START' | 'START' | 'TOSS_UP' | 'SIT';
  rationale: string;
  floor: number;
  ceiling: number;
  source_breakdown?: Record<ProjectionSourceKey, SourceProjection>;
}

export interface WeeklySitStartRecommendation {
  player: MasterPlayer;
  slot: string; // 'QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'TE', 'FLEX1', 'FLEX2', 'K', 'DEF', 'BENCH'
  is_recommended_starter: boolean;
  matchup: WeeklyMatchup;
}

export interface DraftPick {
  id: string;
  year: number;
  round: number;
  original_owner_id: string;
  original_owner_name?: string;
  current_owner_id: string;
  description: string;
  market_value: number;
  /** Trade-market and expert values for this pick (Futures Value blends them) */
  sources?: { market: number | null; experts: number | null };
  tier?: 'Early' | 'Mid' | 'Late';
  /** Chance of a starter-level season, rookie year first (measured from past drafts at this slot) */
  hit_rates?: number[];
  /** Points per game a hit produces, by season after the draft */
  ppg_if_hit?: number[];
  is_priority_class?: boolean; // True for 2027 upcoming draft class
  years_out?: number; // 0 for 2027 (next draft), 1 for 2028, 2 for 2029
}

export type TradeStance = 'WIN_NOW_BUYER' | 'BALANCED_CONTENDER' | 'REBUILD_SELLER' | 'YOUTH_ACCUMULATOR';

export type StrategyGoal = 'WIN_NOW' | 'REBUILD' | 'FLEX_FOR_FIRST';

export interface StrategicTarget {
  id: string;
  type: 'VETERAN' | 'PICK' | 'YOUTH' | 'MULTI_YEAR_PICK' | 'FLEX_FOR_FIRST';
  name: string;
  position?: Position | string;
  age?: number;
  market_value: number;
  owner_franchise_id: string;
  owner_franchise_name: string;
  owner_trade_stance: TradeStance;
  rationale: string;
  suggested_offer: string;
  player?: MasterPlayer;
  pick?: DraftPick;
  multi_year_bonus?: string;
}

export interface FlexForFirstOpportunity {
  id: string;
  flex_player: MasterPlayer;
  target_team: LeagueTeamSummary;
  target_pick: DraftPick;
  urgency: 'HIGH' | 'MEDIUM';
  timing_window: 'In-Season Sweet Spot (Weeks 3-10)' | 'Contender Injury Attrition' | 'Peak Trade Leverage';
  rationale: string;
  suggested_offer: string;
  contender_vulnerability: string;
  equity_gain_summary: string;
}

export type DashboardViewMode =
  | 'ingest'
  | 'single'
  | 'sitstart'
  | 'optimization'
  | 'league'
  | 'compare'
  | 'trade'
  | 'market';

export interface LeagueTeamSummary {
  franchise_id: string;
  franchise_name: string;
  owner_name?: string;
  power_rank: number;
  classification: ClassificationType;
  championship_window_status: string;
  total_value: number;
  starter_value: number;
  bench_value: number;
  draft_capital_value: number;
  gross_liquidity: number;
  asset_half_life: number;
  structural_integrity: number;
  player_count: number;
  trade_stance: TradeStance;
  stance_label: string;
  stance_description: string;
  top_players: MasterPlayer[];
  starters: MasterPlayer[];
  bench: MasterPlayer[];
  /** Taxi squad and IR players (not counted in starter/bench value) */
  reserves?: MasterPlayer[];
  /** Projected starting-lineup points per week for this and the next seasons */
  season_outlook?: SeasonOutlook[];
  cap?: TeamCap;
  draft_picks: DraftPick[];
  target_assets_for_user: string[];
}

export interface RosterRecord {
  roster_id: string;
  platform: Platform;
  external_league_id: string;
  franchise_id: string;
  player_ids: string[];
  valuation_mode: ValuationMode;
  league_name?: string;
  franchise_name?: string;
  starters?: string[];
  taxi_ids?: string[];
  reserve_ids?: string[];
  draft_picks?: DraftPick[];
  settings?: LeagueSettings;
}

export interface RosterDNAMetrics {
  classification: string;
  gross_liquidity: number;
  asset_half_life: number;
  structural_integrity: number;
  total_roster_value?: number;
  starter_value?: number;
  bench_value?: number;
  draft_capital_value?: number;
  starter_equity_ratio?: number;
  mean_roster_age?: number;
  peak_window_years?: number;
  championship_window?: ChampionshipWindow;
}

export interface PositionalBreakdown {
  count: number;
  total_value: number;
  share_of_roster: number;
  avg_age: number;
}

export interface RosterEvaluationResult {
  roster: RosterRecord;
  metrics: RosterDNAMetrics;
  players: MasterPlayer[];
  starters: MasterPlayer[];
  bench: MasterPlayer[];
  active_roster?: MasterPlayer[];
  injured_reserve?: MasterPlayer[];
  taxi_squad?: MasterPlayer[];
  draft_picks?: DraftPick[];
  league_teams?: LeagueTeamSummary[];
  free_agents?: MasterPlayer[];
  positional_breakdown: Record<string, PositionalBreakdown>;
  settings?: LeagueSettings;
  championship_window?: ChampionshipWindow;
  remediations?: RosterRemediationAdvice[];
  warnings?: string[];
  unmatched_names?: string[];
  values_meta?: ValuesMeta;
  season_outlook?: SeasonOutlook[];
  pick_plan?: PickPlan[];
  cap?: TeamCap;
  /** Redraft leagues: standings, weekly projections, playoff odds, waiver ideas */
  redraft?: RedraftInfo;
  /** League name as the platform shows it */
  league_name?: string;
  /** All teams in the league, for switching "my team" without re-syncing */
  league_franchises?: { franchise_id: string; franchise_name: string; owner_name?: string }[];
}

export interface SyncRequest {
  platform: Platform;
  league_id: string;
  username?: string;
  password?: string; // MFL password (private leagues). Sent once over HTTPS, never stored.
  mfl_api_key?: string; // MFL per-league API key (private leagues, read-only)
  franchise_id?: string;
  year?: string; // MFL season year (e.g. 2024, 2025)
  valuation_mode?: ValuationMode;
  /** User's choice of league type (overrides the platform) */
  format?: LeagueFormat;
  /** ESPN private leagues: cookies from the user's browser (sent per request, never stored on the server) */
  espn_s2?: string;
  swid?: string;
  /** Yahoo: league key like 461.l.12345 (signed in with Yahoo) */
  league_name?: string;
}

export interface MFLLinkedLeague {
  league_id: string;
  name: string;
  franchise_id?: string;
  url?: string;
}

export interface MFLAuthState {
  isAuthenticated: boolean;
  username: string;
  token: string;
  year: string;
  leagues: MFLLinkedLeague[];
  linkedAt?: string;
}

export interface FuzzyMatchCandidate {
  raw_input: string;
  normalized_input: string;
  matched_player_id?: string;
  matched_player_name?: string;
  similarity_score: number;
  is_match: boolean;
}

export interface LeagueFranchise {
  roster_id: string;
  owner_id?: string;
  display_name: string;
  team_name: string;
  avatar?: string;
  player_ids: string[];
  starters: string[];
}

export interface WeeklyAssetPerformance {
  week_number: number;
  label: string;
  incoming_fantasy_pts: number;
  outgoing_fantasy_pts: number;
  net_points_delta: number;
  incoming_market_value: number;
  outgoing_market_value: number;
  net_value_delta: number;
  realized_gross_liquidity: number;
  notes?: string;
}

export interface LoggedTradeRecord {
  id: string;
  timestamp: string;
  executed_week: number;
  strategy_tag: 'FLEX_FOR_FIRST' | 'WIN_NOW' | 'REBUILD' | 'MULTI_YEAR_PICK' | 'BALANCED';
  partner_franchise_id: string;
  partner_franchise_name: string;

  // Sent assets
  sent_players: MasterPlayer[];
  sent_picks: DraftPick[];
  total_sent_market_value: number;

  // Received assets
  received_players: MasterPlayer[];
  received_picks: DraftPick[];
  total_received_market_value: number;

  // Predictions at execution time
  pre_trade_gross_liquidity: number;
  predicted_gross_liquidity: number;
  predicted_liquidity_delta: number;
  predicted_structural_integrity_delta: number;
  prediction_rationale: string;

  // Tracking over subsequent weeks
  tracking_weeks: WeeklyAssetPerformance[];

  // Realized evaluation
  latest_realized_gross_liquidity: number;
  latest_realized_liquidity_delta: number;
  liquidity_prediction_variance: number; // realized - predicted
  accuracy_percentage: number;
  accuracy_verdict: 'OUTPERFORMED' | 'ACCURATE' | 'UNDERPERFORMED';
  verdict_analysis: string;
}

export interface AITradeProposal {
  id: string;
  title: string;
  blueprint_type: 'FAIR_EQUILIBRIUM' | 'TIER_UP_SWEETENER' | 'FLEX_FOR_FIRST' | 'REBUILD_PIVOT' | 'WIN_NOW_BOOST';
  summary: string;
  partner_franchise_id: string;
  partner_franchise_name: string;
  send_players: MasterPlayer[];
  send_picks: DraftPick[];
  receive_players: MasterPlayer[];
  receive_picks: DraftPick[];
  total_ktc_sent: number;
  total_ktc_received: number;
  ktc_difference: number;
  fairness_verdict: 'FAIR' | 'SLIGHT_FAVOR_YOU' | 'SLIGHT_FAVOR_THEM' | 'OVERPAY';
  fairness_score_pct: number;
  predicted_gross_liquidity_delta: number;
  rationale_for_you: string;
  rationale_for_partner: string;
}

export interface AITradeRequest {
  shop_player_id?: string;
  target_player_id?: string;
  target_partner_id?: string;
  strategy_mode?: 'BALANCED' | 'WIN_NOW' | 'REBUILD' | 'FLEX_FOR_FIRST';
}



// ---- League trade history, report cards and manager profiles -----------------------------------
export interface TradeItem {
  kind: 'player' | 'pick';
  id: string; // player id, or pick key
  label: string; // "Ja'Marr Chase" / "2027 1st (from Team X)"
  position?: string;
  value: number; // Futures Value today (used picks: an equivalent pick today)
  age_then?: number | null;
}

export interface TradeReport {
  id: string;
  date: string; // YYYY-MM-DD
  season: number;
  sides: { team_id: string; team_name: string; received: TradeItem[]; value_now: number }[];
  winner_team_id: string | null; // null = within 10%
  margin: number; // value difference today
  margin_pct: number; // margin / larger side
}

export interface ManagerProfile {
  team_id: string;
  team_name: string;
  trades: number; // up to the last 3 seasons
  trades_last_12m: number;
  partners: { team_id: string; team_name: string; count: number }[];
  picks_net: number; // picks received minus sent
  firsts_net: number;
  avg_age_received: number | null;
  avg_age_sent: number | null;
  value_net: number; // today's value received minus sent, all trades
  record: { won: number; lost: number; even: number };
  positions_bought: Record<string, number>;
  tags: string[];
  summary: string;
}

export interface LeagueHistory {
  trades: TradeReport[];
  profiles: ManagerProfile[];
  seasons: number[];
}

// ---- Private notebook and personal value adjustments ----------------------------------------------
export interface DynastyRule {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** The signed-in user's own valuation tweaks. Never shared, never applied to anyone else's numbers. */
export interface ValueAdjustments {
  enabled: boolean;
  /** Extra value on draft picks by years until that draft (index 0 = next draft). 0.3 = +30%. */
  pick_premium: number[];
  /** Discount on your own players who aren't projected to start for you. 0.2 = value them 20% lower. */
  bench_discount: number;
  /** "Won't start" = not in your best lineup in any of the next N seasons. */
  bench_seasons: number;
  /** Ideas: only suggest picks at least this many drafts away. */
  ideas_min_years_out: number;
}

export const DEFAULT_ADJUSTMENTS: ValueAdjustments = {
  enabled: false,
  pick_premium: [0, 0, 0, 0, 0, 0],
  bench_discount: 0,
  bench_seasons: 2,
  ideas_min_years_out: 3,
};

// ---- NFL contracts -----------------------------------------------------------------------------------
export interface ContractEvent {
  season: number;
  kind: 'free_agent' | 'released';
  /** Chance the player is on a different team (or released) that season */
  probability: number;
}
export interface NflContract {
  team: string | null;
  type: string | null; // Drafted (rookie deal), UFA, Extension, Franchise, ...
  signed: number;
  years: number;
  through: number;
  apy: number; // $M per year
  guaranteed: number; // $M
  free_agent_year: number;
  /** Fifth-year team option season (first-round rookie deals) */
  option_year?: number | null;
  /** First season the team saves at least half his cap hit by cutting him */
  out_year: number | null;
  by_season: { season: number; cap: number; dead_if_cut: number; savings_if_cut: number }[];
  events: ContractEvent[];
}

// ---- Redraft ---------------------------------------------------------------------------------------
export interface RosInfo {
  /** Projected points for the rest of the season (regular + playoff weeks), league scoring */
  points: number;
  /** Average per scheduled game */
  ppg: number;
  /** Projected points per playoff week (average) */
  playoff_ppg: number;
  /** Projected points per week, from this week to the last playoff week (0 = bye or no projection) */
  weeks: { week: number; points: number; opponent: string | null }[];
}

export interface RedraftTeam {
  team_id: string;
  name: string;
  record: { wins: number; losses: number; ties: number; points_for: number };
  /** Best-lineup projected points by week, this week through the last playoff week */
  weekly: { week: number; points: number }[];
  /** Average projected points per week for the rest of the regular season */
  ros_avg: number;
  /** Average projected points per playoff week */
  playoff_avg: number;
  playoff_odds: number; // 0..1
  bye_odds: number; // top-2 seed, 0..1
  projected_wins: number;
}

export interface WaiverIdea {
  player: MasterPlayer;
  /** Projected points per week added to your best lineup, rest of season (incl. playoffs) */
  upgrade_ros: number;
  /** Points added to this week's best lineup */
  upgrade_week: number;
  /** Who he'd replace in your lineup most weeks */
  replaces: string | null;
  /** Suggested FAAB bid range in dollars (FAAB leagues) */
  faab: { low: number; high: number } | null;
  note: string;
}

export interface RedraftInfo {
  week: number;
  playoffs: { start_week: number; end_week: number; teams: number };
  faab_budget: number | null;
  faab_remaining: number | null;
  teams: RedraftTeam[];
  waivers: WaiverIdea[];
  /** Your remaining regular-season games: projections and win chance */
  my_schedule: { week: number; opponent_id: string; opponent: string; my_points: number; opp_points: number; win_prob: number }[];
}

export interface PlayerExternalIds {
  espn: string | null;
  yahoo: string | null;
  cbs: string | null;
  pfr: string | null;
}
