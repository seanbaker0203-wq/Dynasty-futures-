import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { PlayerRow } from '../components/PlayerRow';
import { fmt, fmtShort, labelFor, pickName } from '../lib/leagueStats';
import type { LeagueTeamSummary } from '../types';

export const LeagueScreen: React.FC = () => {
  const { evaluation, setActiveView, setPartnerId } = useRoster();
  const [open, setOpen] = useState<string | null>(null);
  if (!evaluation) return null;

  const me = evaluation.roster.franchise_id;
  const teams = [...(evaluation.league_teams || [])].sort((a, b) => a.power_rank - b.power_rank);
  const maxPower = Math.max(...teams.map((t) => t.starter_value * 0.55 + t.bench_value * 0.3 + t.draft_capital_value * 0.15), 1);

  const act = (t: LeagueTeamSummary, view: 'trade' | 'compare') => {
    setPartnerId(t.franchise_id);
    setActiveView(view);
  };

  return (
    <div className="space-y-3">
      <p className="text-[14px] text-muted">
        Ranked by starting lineup, then depth and picks. Tap a team to see its core and picks.
      </p>
      <ol className="divide-y divide-line border-y border-line">
        {teams.map((t) => {
          const isMe = t.franchise_id === me;
          const expanded = open === t.franchise_id;
          const power = t.starter_value * 0.55 + t.bench_value * 0.3 + t.draft_capital_value * 0.15;
          const firsts = t.draft_picks.filter((p) => p.round === 1).length;
          return (
            <li key={t.franchise_id} className={`sm:px-3 sm:rounded-lg ${isMe ? 'bg-ink-soft -mx-4 px-4 sm:mx-0' : ''}`}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : t.franchise_id)}
                aria-expanded={expanded}
                className="w-full flex items-center gap-3 sm:gap-4 py-3 text-left"
              >
                <span className={`display text-[30px] w-9 text-right shrink-0 ${isMe ? 'text-gold' : 'text-ink'}`}>{t.power_rank}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">
                    {t.franchise_name}
                    {isMe && <span className="text-gold font-semibold"> (you)</span>}
                  </span>
                  <span className="block text-[13px] text-muted truncate">
                    {labelFor(t.classification)}, {t.stance_label.toLowerCase()}
                  </span>
                  <span className="mt-1.5 block h-1 rounded-full bg-line overflow-hidden" aria-hidden>
                    <span className={`block h-full rounded-full ${isMe ? 'bg-gold' : 'bg-ink'}`} style={{ width: `${(power / maxPower) * 100}%` }} />
                  </span>
                </span>
                <span className="hidden sm:grid grid-cols-3 gap-6 text-right text-[13px] text-muted shrink-0">
                  <span>
                    <span className="block font-semibold text-text text-[15px]">{Math.round(t.gross_liquidity)}</span>lineup
                  </span>
                  <span>
                    <span className="block font-semibold text-text text-[15px]">{t.asset_half_life.toFixed(1)}</span>prime yrs
                  </span>
                  <span>
                    <span className="block font-semibold text-text text-[15px]">{fmtShort(t.draft_capital_value)}</span>picks
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>

              {expanded && (
                <div className="pb-4 sm:pl-[3.25rem] space-y-4">
                  <div className="grid grid-cols-3 gap-3 sm:hidden text-[13px] text-muted">
                    <span>
                      <span className="block font-semibold text-text text-[15px]">{Math.round(t.gross_liquidity)}</span>lineup
                    </span>
                    <span>
                      <span className="block font-semibold text-text text-[15px]">{t.asset_half_life.toFixed(1)} yrs</span>prime left
                    </span>
                    <span>
                      <span className="block font-semibold text-text text-[15px]">{fmtShort(t.draft_capital_value)}</span>picks
                    </span>
                  </div>
                  <p className="text-[14px] text-muted">{t.stance_description}</p>
                  <div>
                    <div className="text-[13px] font-semibold">Core players</div>
                    <div className="divide-y divide-line">
                      {t.top_players.map((p) => (
                        <PlayerRow key={p.id} player={p} />
                      ))}
                    </div>
                  </div>
                  <div className="text-[14px]">
                    <span className="font-semibold">Picks: </span>
                    <span className="text-muted">
                      {t.draft_picks.length} total, {firsts} first-rounder{firsts === 1 ? '' : 's'}
                      {t.draft_picks.length > 0 &&
                        `. Best: ${pickName([...t.draft_picks].sort((a, b) => b.market_value - a.market_value)[0], t.franchise_id)} (${fmt(
                          Math.max(...t.draft_picks.map((p) => p.market_value))
                        )})`}
                    </span>
                  </div>
                  {!isMe && (
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary" onClick={() => act(t, 'trade')}>
                        Build a trade
                      </button>
                      <button type="button" className="btn-quiet" onClick={() => act(t, 'compare')}>
                        Compare with my team
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
