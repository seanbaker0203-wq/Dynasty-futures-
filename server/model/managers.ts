/**
 * Trade report cards (every trade graded with today's Futures Values) and manager profiles
 * (how each manager actually trades: activity, picks vs players, age, positions, results).
 */
import type { LeagueHistory, ManagerProfile, TradeItem, TradeReport } from '../../src/types';
import { getSeasonContext } from '../../src/lib/season';
import type { Board } from './futures';
import type { NormalizedLeague } from '../leagues/types';
import type { RawTrade } from '../leagues/history';
import { playerDirectory } from '../players';

const ORD: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };
const ord = (n: number) => ORD[n] ?? `${n}th`;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

export function buildHistory(
  raw: RawTrade[],
  league: NormalizedLeague,
  board: Board,
  extraNames: Map<string, { name: string; position: string }> = new Map()
): LeagueHistory {
  const { upcomingDraftYear } = getSeasonContext();
  const teamName = new Map(league.teams.map((t) => [t.team_id, t.name]));
  const nameOf = (id: string) => teamName.get(id) ?? `Team ${id}`;
  const now = Date.now();

  const valuePlayer = (id: string, ts: number): TradeItem => {
    const bp = league.platform === 'mfl' ? board.byMfl.get(id) : board.bySleeper.get(id);
    const lp = league.players.get(id);
    const dir = league.platform === 'sleeper' ? playerDirectory.get(id) : undefined;
    const extra = extraNames.get(id);
    const age = bp?.age ?? lp?.age ?? dir?.age ?? null;
    return {
      kind: 'player',
      id,
      label: bp?.name ?? lp?.name ?? dir?.full_name ?? extra?.name ?? `Player ${id}`,
      position: bp?.position ?? lp?.position ?? dir?.position ?? extra?.position,
      value: bp?.value ?? 0,
      age_then: age != null ? Math.round((age - (now - ts) / YEAR_MS) * 10) / 10 : null,
    };
  };
  const valuePick = (p: { year: number; round: number; original_team_id: string | null }, receiver: string): TradeItem => {
    const used = p.year < upcomingDraftYear;
    const from = p.original_team_id && p.original_team_id !== receiver ? `, from ${nameOf(p.original_team_id)}` : '';
    return {
      kind: 'pick',
      id: `${p.year}-${p.round}-${p.original_team_id ?? ''}`,
      label: `${p.year} ${ord(p.round)}${from}${used ? ' (used)' : ''}`,
      // A used pick is valued like an equivalent next-draft pick today: we don't know who was drafted with it.
      value: board.pickValue(used ? upcomingDraftYear : p.year, p.round),
    };
  };

  const trades: TradeReport[] = raw.map((t) => {
    const sides = t.sides.map((s) => {
      const received = s.received.map((a) => (a.kind === 'player' ? valuePlayer(a.id, t.timestamp) : valuePick(a, s.team_id)));
      return { team_id: s.team_id, team_name: nameOf(s.team_id), received, value_now: received.reduce((x, i) => x + i.value, 0) };
    });
    const [a, b] = sides;
    const margin = Math.abs(a.value_now - b.value_now);
    const big = Math.max(a.value_now, b.value_now, 1);
    const pct = margin / big;
    return {
      id: t.id,
      date: new Date(t.timestamp).toISOString().slice(0, 10),
      season: t.season,
      sides,
      winner_team_id: pct < 0.1 ? null : a.value_now > b.value_now ? a.team_id : b.team_id,
      margin: Math.round(margin),
      margin_pct: Math.round(pct * 1000) / 1000,
    };
  });

  // ---- Profiles ----------------------------------------------------------------------------------------
  const profiles: ManagerProfile[] = league.teams.map((team) => {
    const mine = trades.filter((t) => t.sides.some((s) => s.team_id === team.team_id));
    const partners = new Map<string, number>();
    let picksIn = 0, picksOut = 0, firstsIn = 0, firstsOut = 0, valueNet = 0;
    const agesIn: number[] = [], agesOut: number[] = [];
    const posIn: Record<string, number> = {};
    const record = { won: 0, lost: 0, even: 0 };
    for (const t of mine) {
      const me = t.sides.find((s) => s.team_id === team.team_id)!;
      const them = t.sides.find((s) => s.team_id !== team.team_id)!;
      partners.set(them.team_id, (partners.get(them.team_id) || 0) + 1);
      for (const i of me.received) {
        if (i.kind === 'pick') {
          picksIn++;
          if (i.label.includes(' 1st')) firstsIn++;
        } else {
          if (i.age_then != null) agesIn.push(i.age_then);
          if (i.position) posIn[i.position] = (posIn[i.position] || 0) + 1;
        }
      }
      for (const i of them.received) {
        if (i.kind === 'pick') {
          picksOut++;
          if (i.label.includes(' 1st')) firstsOut++;
        } else if (i.age_then != null) agesOut.push(i.age_then);
      }
      valueNet += me.value_now - them.value_now;
      if (!t.winner_team_id) record.even++;
      else if (t.winner_team_id === team.team_id) record.won++;
      else record.lost++;
    }
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const lastYear = mine.filter((t) => now - new Date(t.date).getTime() < YEAR_MS).length;
    return {
      team_id: team.team_id,
      team_name: team.name,
      trades: mine.length,
      trades_last_12m: lastYear,
      partners: [...partners.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ team_id: id, team_name: nameOf(id), count })),
      picks_net: picksIn - picksOut,
      firsts_net: firstsIn - firstsOut,
      avg_age_received: avg(agesIn),
      avg_age_sent: avg(agesOut),
      value_net: Math.round(valueNet),
      record,
      positions_bought: posIn,
      tags: [],
      summary: '',
    };
  });

  // Tags relative to the league.
  const since = raw.length ? Math.min(...raw.map((t) => t.season)) : getSeasonContext().seasonYear;
  const counts = profiles.map((p) => p.trades).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)] || 0;
  for (const p of profiles) {
    const tags: string[] = [];
    if (p.trades >= Math.max(4, median * 1.5)) tags.push('Trades a lot');
    if (p.trades_last_12m === 0) tags.push('Hasn’t traded in a year');
    if (p.trades >= 2 && (p.firsts_net >= 2 || p.picks_net >= 4)) tags.push('Collects picks');
    if (p.firsts_net <= -2 || p.picks_net <= -4) tags.push('Spends picks');
    if (p.trades >= 3 && p.avg_age_received != null && p.avg_age_sent != null) {
      if (p.avg_age_received - p.avg_age_sent >= 1.5) tags.push('Buys veterans');
      if (p.avg_age_sent - p.avg_age_received >= 1.5) tags.push('Buys youth');
    }
    const decided = p.record.won + p.record.lost;
    if (decided >= 3 && p.record.won / decided >= 0.65) tags.push('Usually wins trades');
    if (decided >= 3 && p.record.lost / decided >= 0.65) tags.push('Often overpays');
    const bought = Object.entries(p.positions_bought).sort((a, b) => b[1] - a[1]);
    const totalBought = bought.reduce((s, [, n]) => s + n, 0);
    if (bought.length && totalBought >= 4 && bought[0][1] / totalBought >= 0.4) tags.push(`Targets ${bought[0][0]}s`);
    p.tags = tags;

    const bits: string[] = [];
    bits.push(`${p.trades} trade${p.trades === 1 ? '' : 's'} since ${since} (${p.trades_last_12m} in the last year)`);
    if (p.partners[0]) bits.push(`most often with ${p.partners[0].team_name} (${p.partners[0].count})`);
    if (p.picks_net) bits.push(`${p.picks_net > 0 ? 'gained' : 'gave up'} ${Math.abs(p.picks_net)} pick${Math.abs(p.picks_net) === 1 ? '' : 's'} net`);
    if (p.trades) bits.push(`record ${p.record.won}-${p.record.lost}-${p.record.even} on today's values`);
    p.summary = bits.join(', ') + '.';
  }

  const seasons = [...new Set(raw.map((t) => t.season))].sort();
  return { trades, profiles, seasons };
}
