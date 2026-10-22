import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { LeagueStrip } from '../components/LeagueStrip';
import { PlayerRow } from '../components/PlayerRow';
import {
  fmt,
  fmtShort,
  groupByPosition,
  labelFor,
  ordinal,
  pickName,
  picksByYear,
  rankBy,
} from '../lib/leagueStats';
import type { LeagueTeamSummary, MasterPlayer } from '../types';

const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="space-y-2">
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <h2 className="display text-[22px] text-ink">{title}</h2>
      {aside && <span className="text-[13px] text-muted">{aside}</span>}
    </div>
    {children}
  </section>
);

const roomValue = (t: LeagueTeamSummary, pos: string) =>
  [...(t.starters || []), ...(t.bench || [])].filter((p) => p.position === pos).reduce((s, p) => s + p.market_value, 0);

export const TeamScreen: React.FC = () => {
  const { evaluation, setActiveView } = useRoster();
  const [showReserves, setShowReserves] = useState(false);
  if (!evaluation) return null;

  const me = evaluation.roster.franchise_id;
  const teams = evaluation.league_teams || [];
  const mine = teams.find((t) => t.franchise_id === me);
  const m = evaluation.metrics;
  const n = teams.length;

  const starterIds = new Set(evaluation.starters.map((p) => p.id));
  const active = evaluation.players.filter((p) => p.roster_designation !== 'TAXI' && p.roster_designation !== 'IR');
  const reserves = evaluation.players.filter((p) => p.roster_designation === 'TAXI' || p.roster_designation === 'IR');

  const vitals = [
    {
      key: 'lineup',
      name: 'Lineup strength',
      value: `${Math.round(m.gross_liquidity)}`,
      unit: '',
      detail: 'Starting lineup value. 100 is the league median.',
      rank: rankBy(teams, me, (t) => t.starter_value),
      strip: teams.map((t) => ({ id: t.franchise_id, value: t.starter_value })),
    },
    {
      key: 'runway',
      name: 'Prime years left',
      value: m.asset_half_life.toFixed(1),
      unit: ' yrs',
      detail: 'Value-weighted years before your players pass their position’s age cliff.',
      rank: rankBy(teams, me, (t) => t.asset_half_life),
      strip: teams.map((t) => ({ id: t.franchise_id, value: t.asset_half_life })),
    },
    {
      key: 'picks',
      name: 'Draft capital',
      value: fmtShort(m.draft_capital_value),
      unit: '',
      detail: 'Market value of every future pick you own.',
      rank: rankBy(teams, me, (t) => t.draft_capital_value),
      strip: teams.map((t) => ({ id: t.franchise_id, value: t.draft_capital_value })),
    },
  ];

  const moves = evaluation.remediations || [];
  const outlook = evaluation.season_outlook || [];
  const top3 = outlook.filter((o) => o.rank <= 3).map((o) => o.season);
  const titleWindow = !outlook.length
    ? null
    : top3.length === 0
      ? 'Not in the next 5 years'
      : top3[0] === outlook[0].season
        ? `Through ${top3.filter((s, i) => s === outlook[0].season + i).pop()}`
        : `Opens ${top3[0]}`;

  const positionGroups = groupByPosition(active);
  const roomRank = (pos: string) => (mine ? rankBy(teams, me, (t) => roomValue(t, pos)) : 0);

  return (
    <div className="space-y-8">
      {/* Masthead: the one loud element on this screen */}
      <header className="space-y-3">
        <h1 className="display text-[40px] sm:text-[52px] text-ink uppercase break-words">{evaluation.roster.franchise_name}</h1>
        <p className="text-[17px]">
          {mine && (
            <span className="font-semibold text-gold">
              {ordinal(mine.power_rank)} of {n}
            </span>
          )}
          <span className="text-muted"> in power rankings. </span>
          <span className="font-semibold text-ink">{labelFor(m.classification)}</span>
          {mine && <span className="text-muted">, {mine.stance_label.toLowerCase()}.</span>}
        </p>
        {mine && <p className="text-muted max-w-[38rem]">{mine.stance_description}</p>}
      </header>

      {/* Vitals, each placed in the league */}
      <section aria-label="How your team compares" className="rounded-xl bg-card border border-line divide-y divide-line">
        {vitals.map((v) => (
          <div key={v.key} className="px-4 py-3.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-baseline">
            <div>
              <div className="font-semibold">{v.name}</div>
              <div className="text-[13px] text-muted">{v.detail}</div>
            </div>
            <div className="text-right">
              <span className="display text-[30px] text-ink">
                {v.value}
                <span className="text-[18px]">{v.unit}</span>
              </span>
              <div className="text-[13px] font-semibold text-gold">{ordinal(v.rank)} of {n}</div>
            </div>
            <div className="col-span-2">
              <LeagueStrip values={v.strip} mine={me} label={`${v.name}: ${ordinal(v.rank)} of ${n} in the league`} />
            </div>
          </div>
        ))}
        {titleWindow && (
          <button type="button" onClick={() => setActiveView('plan')} className="w-full px-4 py-3.5 flex items-baseline justify-between gap-4 text-left">
            <div>
              <div className="font-semibold">Title window</div>
              <div className="text-[13px] text-muted">Seasons your projected lineup ranks top 3. See the plan.</div>
            </div>
            <div className="text-right font-semibold text-ink">{titleWindow}</div>
          </button>
        )}
      </section>

      {/* What to do next */}
      {moves.length > 0 && (
        <Section title="Next moves" aside={moves.length > 2 ? `${moves.length} in total` : undefined}>
          <ul className="divide-y divide-line">
            {moves.slice(0, 2).map((mv, i) => (
              <li key={i} className="py-3 space-y-1">
                <div className="font-semibold text-ink">{mv.actionable_step}</div>
                <div className="text-[14px] text-muted">{mv.issue}</div>
              </li>
            ))}
          </ul>
          {moves.length > 2 && (
            <button type="button" className="btn-quiet" onClick={() => setActiveView('optimization')}>
              See all moves
            </button>
          )}
        </Section>
      )}

      {evaluation.warnings && evaluation.warnings.length > 0 && (
        <ul className="text-[14px] text-muted space-y-1">
          {evaluation.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {/* Roster */}
      <Section title="Roster" aside={`${evaluation.players.length} players, ${fmt(m.starter_value! + m.bench_value!)} value`}>
        <div className="space-y-5">
          {positionGroups.map(([pos, players]) => {
            const total = players.reduce((s, p) => s + p.market_value, 0);
            const r = ['QB', 'RB', 'WR', 'TE'].includes(pos) ? roomRank(pos) : 0;
            return (
              <div key={pos}>
                <div className="flex items-baseline justify-between text-[13px] text-muted pt-1">
                  <span className="font-semibold text-text">{pos}</span>
                  <span>
                    {fmt(total)}
                    {r > 0 && (
                      <span className={r <= 3 ? 'text-gold font-semibold' : ''}>
                        , {ordinal(r)} in league
                      </span>
                    )}
                  </span>
                </div>
                <div className="divide-y divide-line">
                  {players.map((p: MasterPlayer) => (
                    <PlayerRow key={p.id} player={p} starter={starterIds.has(p.id)} hidePosition />
                  ))}
                </div>
              </div>
            );
          })}

          {reserves.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowReserves(!showReserves)}
                aria-expanded={showReserves}
                className="w-full flex items-center justify-between text-[13px] font-semibold text-text pt-1"
              >
                Taxi squad and IR ({reserves.length})
                <ChevronDown className={`w-4 h-4 transition-transform ${showReserves ? 'rotate-180' : ''}`} />
              </button>
              {showReserves && (
                <div className="divide-y divide-line">
                  {[...reserves].sort((a, b) => b.market_value - a.market_value).map((p) => (
                    <PlayerRow key={p.id} player={p} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Picks */}
      <Section title="Draft picks" aside={`${(evaluation.draft_picks || []).length} picks, ${fmt(m.draft_capital_value)} value`}>
        {(evaluation.draft_picks || []).length === 0 ? (
          <p className="text-muted">No future picks.</p>
        ) : (
          <div className="space-y-3">
            {picksByYear(evaluation.draft_picks || []).map(([year, picks]) => (
              <div key={year}>
                <div className="text-[13px] font-semibold text-text pt-1">{year}</div>
                <ul className="divide-y divide-line">
                  {picks
                    .filter((p) => p.round <= 2)
                    .map((p) => (
                      <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">{pickName(p, me).replace(`${year} `, '')}</span>
                        <span className="font-semibold">{fmt(p.market_value)}</span>
                      </li>
                    ))}
                  {(() => {
                    const late = picks.filter((p) => p.round > 2);
                    if (!late.length) return null;
                    const traded = late.filter((p) => p.original_owner_id !== me).length;
                    return (
                      <li className="py-2 flex items-center justify-between gap-3 text-muted">
                        <span>
                          {late.length} later-round pick{late.length === 1 ? '' : 's'}
                          {traded ? `, ${traded} acquired` : ''}
                        </span>
                        <span className="font-semibold">{fmt(late.reduce((s, p) => s + p.market_value, 0))}</span>
                      </li>
                    );
                  })()}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};
