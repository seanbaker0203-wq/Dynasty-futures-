import React from 'react';
import { useRoster } from '../context/RosterContext';
import { fmt, median, ordinal, POSITION_ORDER } from '../lib/leagueStats';
import { SignalTag, TIER_STYLE } from '../components/ValueBits';
import type { MasterPlayer, ProjectionTier } from '../types';

interface Move {
  when: 'now' | 'offseason' | 'later';
  title: string;
  detail: string;
}

const useful = (t?: ProjectionTier) => t === 'Starter' || t === 'Flex';

export const PlanScreen: React.FC = () => {
  const { evaluation } = useRoster();
  if (!evaluation) return null;

  const me = evaluation.roster.franchise_id;
  const teams = evaluation.league_teams || [];
  const outlook = evaluation.season_outlook || [];
  const seasons = outlook.map((o) => o.season);
  const thisSeason = seasons[0];
  const slots = evaluation.settings?.slots;
  const players = evaluation.players.filter((p) => p.futures && p.futures.projection.length);

  // ---- Lineup by season vs the league --------------------------------------------------------
  const perSeason = seasons.map((season, i) => {
    const all = teams.map((t) => t.season_outlook?.[i]?.points ?? 0);
    return { season, mine: outlook[i], max: Math.max(...all, 1), med: median(all) };
  });
  const scaleMax = Math.max(...perSeason.map((s) => s.max));

  // ---- Moves ----------------------------------------------------------------------------------
  const moves: Move[] = [];
  const name = (p: MasterPlayer) => `${p.full_name} (${p.position}, ${Math.floor(p.age)})`;

  // Sell before they fall off: value is still there a year ahead of the drop.
  for (const p of [...players].sort((a, b) => b.market_value - a.market_value)) {
    const f = p.futures!;
    if (!f.falloff_season || p.market_value < 1200) continue;
    const lastGood = f.falloff_season - 1;
    const when: Move['when'] = f.falloff_season <= thisSeason + 1 ? 'now' : f.falloff_season === thisSeason + 2 ? 'offseason' : 'later';
    moves.push({
      when,
      title: `Sell ${name(p)} before ${f.falloff_season}`,
      detail: `Projected useful through ${lastGood}, then below a starter. Worth ${fmt(p.market_value)} today; that price falls as the cliff gets closer.`,
    });
  }

  // Value signals on your own players.
  for (const p of players) {
    const s = p.futures!.signal;
    if (s === 'SELL_HIGH' || s === 'SELL')
      moves.push({
        when: 'now',
        title: `${s === 'SELL_HIGH' ? 'Sell high' : 'Shop'}: ${name(p)}`,
        detail: `The market pays ${fmt(p.futures!.market ?? 0)}; we value him at ${fmt(p.market_value)}.`,
      });
  }

  // Positional holes by season: starters you'll have vs starters you need.
  if (slots) {
    const need: Record<string, number> = { QB: slots.QB + (slots.SUPER_FLEX ? 1 : 0), RB: slots.RB, WR: slots.WR, TE: slots.TE };
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      for (let i = 0; i < seasons.length; i++) {
        const have = players.filter((p) => p.position === pos && useful(p.futures!.projection[i]?.tier)).length;
        if (have < need[pos]) {
          const season = seasons[i];
          const when: Move['when'] = i === 0 ? 'now' : i === 1 ? 'offseason' : 'later';
          // Buy-low or undervalued players on other teams at that position who are still useful then.
          const targets = teams
            .filter((t) => t.franchise_id !== me)
            .flatMap((t) => [...t.starters, ...t.bench].map((p) => ({ p, team: t.franchise_name })))
            .filter(({ p }) => p.position === pos && (p.futures?.signal === 'BUY_LOW' || p.futures?.signal === 'BUY') && useful(p.futures?.projection[i]?.tier))
            .sort((a, b) => b.p.market_value - a.p.market_value)
            .slice(0, 2);
          moves.push({
            when,
            title: `${pos} gets thin in ${season}`,
            detail:
              `You're projected to have ${have} starting-calibre ${pos}${have === 1 ? '' : 's'}; you start ${need[pos]}.` +
              (targets.length ? ` Targets we like more than the market: ${targets.map(({ p, team }) => `${p.full_name} (${team})`).join(', ')}.` : ''),
          });
          break; // first season it happens is enough
        }
      }
    }
  }

  // Picks you hold to restock.
  const firsts = (evaluation.draft_picks || []).filter((p) => p.round === 1);
  if (firsts.length) {
    const byYear = new Map<number, number>();
    firsts.forEach((p) => byYear.set(p.year, (byYear.get(p.year) || 0) + 1));
    moves.push({
      when: 'offseason',
      title: `${firsts.length} first-round pick${firsts.length === 1 ? '' : 's'} to restock with`,
      detail: [...byYear.entries()].sort().map(([y, n]) => `${n} in ${y}`).join(', ') + '. Use them on the positions that thin out first, or as trade currency.',
    });
  }

  const buckets: { key: Move['when']; label: string }[] = [
    { key: 'now', label: `This season (${thisSeason})` },
    { key: 'offseason', label: `Next off-season (${thisSeason + 1})` },
    { key: 'later', label: 'Later' },
  ];

  // ---- Roster grid --------------------------------------------------------------------------
  const grid = [...players].sort(
    (a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.market_value - a.market_value
  );

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="display text-[26px] text-ink">Your lineup, season by season</h2>
        <p className="text-[14px] text-muted">
          Projected starting lineup points per week from today's roster, aged forward. Future rookies and trades aren't in it, so every
          team trends down; your rank is what matters.
        </p>
        <ul className="space-y-3">
          {perSeason.map((s) => (
            <li key={s.season} className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3">
              <span className="font-semibold">{s.season}</span>
              <span className="relative h-3 rounded-full bg-line overflow-hidden" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${(s.mine.points / scaleMax) * 100}%` }} />
                <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(s.med / scaleMax) * 100}%` }} title="League median" />
              </span>
              <span className="text-right text-[14px] w-[7.5rem]">
                <span className="font-semibold">{s.mine.points}</span> pts,{' '}
                <span className={s.mine.rank <= 3 ? 'text-gold font-semibold' : 'font-semibold'}>{ordinal(s.mine.rank)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted">The dark tick on each bar is the league median.</p>
      </section>

      <section className="space-y-5">
        <h2 className="display text-[26px] text-ink">Moves to plan</h2>
        {moves.length === 0 && <p className="text-muted">No fall-offs or holes in the next five seasons. Nice roster.</p>}
        {buckets.map((b) => {
          const list = moves.filter((m) => m.when === b.key);
          if (!list.length) return null;
          return (
            <div key={b.key}>
              <h3 className="font-semibold text-gold">{b.label}</h3>
              <ul className="divide-y divide-line">
                {list.map((m, i) => (
                  <li key={i} className="py-3">
                    <div className="font-semibold text-ink">{m.title}</div>
                    <div className="text-[14px] text-muted">{m.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="display text-[26px] text-ink">Roster timeline</h2>
        <div className="flex flex-wrap gap-3 text-[12px] text-muted">
          {(['Starter', 'Flex', 'Depth', 'Fading'] as ProjectionTier[]).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`inline-block w-4 h-3 rounded-sm ${TIER_STYLE[t]}`} /> {t}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[22rem] border-separate border-spacing-y-1 text-[13px]">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-semibold pb-1">Player</th>
                {seasons.map((s) => (
                  <th key={s} className="font-semibold pb-1 w-[14%]">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((p) => (
                <tr key={p.id}>
                  <td className="pr-2">
                    <span className="block font-semibold text-text truncate max-w-[9rem] sm:max-w-none">{p.full_name}</span>
                    <span className="block text-[12px] text-muted">
                      {p.position}, {Math.floor(p.age)}
                      <SignalTag signal={p.futures?.signal} className="ml-1.5" />
                    </span>
                  </td>
                  {p.futures!.projection.map((s) => (
                    <td key={s.season} className="px-0.5">
                      <div
                        className={`rounded-md text-center py-1.5 ${TIER_STYLE[s.tier]} ${p.futures!.falloff_season === s.season ? 'ring-2 ring-down' : ''}`}
                        title={`${s.season}: ${s.tier}, ${s.ppg} pts per game`}
                      >
                        {s.ppg}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">Numbers are projected points per game. A red ring marks the season a player falls off.</p>
      </section>
    </div>
  );
};
