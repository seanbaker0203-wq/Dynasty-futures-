/**
 * Redraft season tools: each team's best projected lineup by week, playoff odds (simulated rest of the regular
 * season on the real schedule), playoff-week strength, and waiver ideas with FAAB guidance.
 */
import { RosterDNAMathEngine } from '../../src/lib/rosterMath';
import type { LeagueSettings, MasterPlayer, RedraftInfo, RedraftTeam, WaiverIdea } from '../../src/types';
import type { NormalizedLeague } from '../leagues/types';
import { playoffWeeks } from './ros';

const SIMS = 4000;

/** Best legal lineup points for one week from each player's projected points that week. */
function lineupPoints(players: MasterPlayer[], week: number, settings: LeagueSettings): { points: number; starters: MasterPlayer[] } {
  const asPts = players
    .filter((p) => p.roster_designation !== 'IR' && p.roster_designation !== 'TAXI')
    .map((p) => ({ ...p, roster_designation: 'ACTIVE' as const, market_value: p.futures?.ros?.weeks.find((w) => w.week === week)?.points ?? 0 }));
  const { starters } = RosterDNAMathEngine.splitStartersAndBench(asPts, [], settings);
  return { points: starters.reduce((s, p) => s + p.market_value, 0), starters };
}

// Box-Muller normal draw.
function normal(mean: number, sd: number) {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function buildRedraft(
  league: NormalizedLeague,
  rosterOf: (teamId: string) => MasterPlayer[],
  userTeamId: string,
  freeAgents: MasterPlayer[],
  currentWeek: number
): RedraftInfo {
  const s = league.settings;
  const { start, end } = playoffWeeks(s);
  const week = Math.min(currentWeek, end);
  const weeks = Array.from({ length: Math.max(0, end - week + 1) }, (_, i) => week + i);
  const regWeeks = weeks.filter((w) => w < start);
  const poWeeks = weeks.filter((w) => w >= start);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const teams: RedraftTeam[] = league.teams.map((t) => {
    const roster = rosterOf(t.team_id);
    const weekly = weeks.map((w) => ({ week: w, points: Math.round(lineupPoints(roster, w, s).points * 10) / 10 }));
    return {
      team_id: t.team_id,
      name: t.name,
      record: t.record ?? { wins: 0, losses: 0, ties: 0, points_for: 0 },
      weekly,
      ros_avg: Math.round(avg(weekly.filter((x) => x.week < start).map((x) => x.points)) * 10) / 10,
      playoff_avg: Math.round(avg(weekly.filter((x) => x.week >= start).map((x) => x.points)) * 10) / 10,
      playoff_odds: 0,
      bye_odds: 0,
      projected_wins: 0,
    };
  });

  // ---- playoff odds ---------------------------------------------------------------------------------------
  const byId = new Map(teams.map((t) => [t.team_id, t]));
  const nPlayoff = Math.min(teams.length, s.playoffs?.teams ?? 6);
  const sched = (league.schedule || []).filter((m) => m.week >= week && m.week < start);
  const weekPts = (t: RedraftTeam, w: number) => t.weekly.find((x) => x.week === w)?.points ?? t.ros_avg;
  const made = new Map<string, number>(), bye = new Map<string, number>(), wins = new Map<string, number>();
  for (let sim = 0; sim < SIMS; sim++) {
    const W = new Map(teams.map((t) => [t.team_id, t.record.wins + 0.5 * t.record.ties]));
    const PF = new Map(teams.map((t) => [t.team_id, t.record.points_for]));
    for (const w of regWeeks) {
      let games = sched.filter((m) => m.week === w).map((m) => [m.a, m.b] as [string, string]);
      if (!games.length) {
        // No schedule from the platform: random pairings.
        const ids = teams.map((t) => t.team_id).sort(() => Math.random() - 0.5);
        games = [];
        for (let i = 0; i + 1 < ids.length; i += 2) games.push([ids[i], ids[i + 1]]);
      }
      const scores = new Map<string, number>();
      for (const t of teams) scores.set(t.team_id, normal(weekPts(t, w), Math.max(12, 0.17 * weekPts(t, w))));
      for (const [a, b] of games) {
        const pa = scores.get(a), pb = scores.get(b);
        if (pa == null || pb == null) continue;
        PF.set(a, PF.get(a)! + pa);
        PF.set(b, PF.get(b)! + pb);
        W.set(pa >= pb ? a : b, W.get(pa >= pb ? a : b)! + 1);
      }
      if (s.median_game) {
        // Extra game each week against the league median.
        const sorted = [...scores.values()].sort((x, y) => x - y);
        const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
        for (const [id, sc] of scores) if (sc > median) W.set(id, W.get(id)! + 1);
      }
    }
    const order = [...teams].sort((x, y) => W.get(y.team_id)! - W.get(x.team_id)! || PF.get(y.team_id)! - PF.get(x.team_id)!);
    order.forEach((t, i) => {
      if (i < nPlayoff) made.set(t.team_id, (made.get(t.team_id) || 0) + 1);
      if (i < 2 && nPlayoff >= 6) bye.set(t.team_id, (bye.get(t.team_id) || 0) + 1);
      wins.set(t.team_id, (wins.get(t.team_id) || 0) + W.get(t.team_id)!);
    });
  }
  for (const t of teams) {
    t.playoff_odds = Math.round(((made.get(t.team_id) || 0) / SIMS) * 1000) / 1000;
    t.bye_odds = Math.round(((bye.get(t.team_id) || 0) / SIMS) * 1000) / 1000;
    t.projected_wins = Math.round(((wins.get(t.team_id) || 0) / SIMS) * 10) / 10;
  }

  // ---- waivers ---------------------------------------------------------------------------------------------
  const mine = rosterOf(userTeamId);
  const myTeam = league.teams.find((t) => t.team_id === userTeamId);
  const budget = s.faab_budget ?? null;
  const remaining = myTeam?.faab_remaining ?? budget;
  const weight = (w: number) => (w >= start ? 1.5 : 1);
  const totalW = weeks.reduce((a, w) => a + weight(w), 0) || 1;
  const base = new Map(weeks.map((w) => [w, lineupPoints(mine, w, s)]));
  const ideas: WaiverIdea[] = [];
  for (const fa of freeAgents.slice(0, 90)) {
    if (!fa.futures?.ros) continue;
    let gain = 0;
    const replaced = new Map<string, number>();
    for (const w of weeks) {
      const before = base.get(w)!;
      const after = lineupPoints([...mine, { ...fa, roster_designation: 'ACTIVE' }], w, s);
      const g = after.points - before.points;
      if (g > 0.05) {
        gain += g * weight(w);
        const out = before.starters.find((p) => !after.starters.some((q) => q.id === p.id));
        if (out) replaced.set(out.full_name, (replaced.get(out.full_name) || 0) + 1);
      }
    }
    const upgradeRos = gain / totalW;
    const upgradeWeek = Math.max(0, lineupPoints([...mine, { ...fa, roster_designation: 'ACTIVE' }], week, s).points - base.get(week)!.points);
    if (upgradeRos < 0.1 && upgradeWeek < 0.5) continue;
    const top = [...replaced.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const streamer = fa.position === 'K' || fa.position === 'DEF';
    // FAAB guide: share of what you have left, by how much he helps every week.
    let pct: [number, number] = upgradeRos >= 3 ? [0.25, 0.35] : upgradeRos >= 1.5 ? [0.1, 0.2] : upgradeRos >= 0.5 ? [0.03, 0.08] : [0.01, 0.02];
    if (streamer) pct = [0, 0.01];
    const faab = remaining != null ? { low: Math.round(remaining * pct[0]), high: Math.max(1, Math.round(remaining * pct[1])) } : null;
    const note = streamer
      ? `Stream for week ${week}${upgradeWeek ? ` (+${upgradeWeek.toFixed(1)} pts)` : ''}.`
      : upgradeRos >= 1.5
        ? `Starts for you most weeks${top ? `, over ${top}` : ''}.`
        : upgradeWeek >= 1
          ? `Helps this week${top ? ` over ${top}` : ''}; depth after that.`
          : 'Bench depth with some upside.';
    ideas.push({ player: fa, upgrade_ros: Math.round(upgradeRos * 10) / 10, upgrade_week: Math.round(upgradeWeek * 10) / 10, replaces: top, faab, note });
  }
  ideas.sort((a, b) => b.upgrade_ros - a.upgrade_ros || b.upgrade_week - a.upgrade_week);

  return {
    week,
    playoffs: { start_week: start, end_week: end, teams: nPlayoff },
    faab_budget: budget,
    faab_remaining: remaining ?? null,
    teams,
    waivers: ideas.slice(0, 25),
  };
}
