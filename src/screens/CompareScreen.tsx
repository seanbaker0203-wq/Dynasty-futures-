import React from 'react';
import { useRoster } from '../context/RosterContext';
import { fmt, labelFor, ordinal } from '../lib/leagueStats';
import type { LeagueTeamSummary } from '../types';

const room = (t: LeagueTeamSummary, pos: string) =>
  [...(t.starters || []), ...(t.bench || [])].filter((p) => p.position === pos).reduce((s, p) => s + p.market_value, 0);

export const CompareScreen: React.FC = () => {
  const { evaluation, partnerId, setPartnerId, setActiveView } = useRoster();
  if (!evaluation) return null;

  const me = evaluation.roster.franchise_id;
  const teams = [...(evaluation.league_teams || [])].sort((a, b) => a.power_rank - b.power_rank);
  const mine = teams.find((t) => t.franchise_id === me);
  const others = teams.filter((t) => t.franchise_id !== me);
  const them = others.find((t) => t.franchise_id === partnerId) || others[0];
  if (!mine || !them) return <p className="text-muted">Load a league with at least two teams to compare.</p>;

  const rows: { name: string; a: number; b: number; show: (v: number) => string; higherIsBetter?: boolean }[] = [
    { name: 'Power rank', a: mine.power_rank, b: them.power_rank, show: (v) => ordinal(v), higherIsBetter: false },
    { name: 'Lineup strength', a: mine.gross_liquidity, b: them.gross_liquidity, show: (v) => `${Math.round(v)}` },
    { name: 'Prime years left', a: mine.asset_half_life, b: them.asset_half_life, show: (v) => `${v.toFixed(1)} yrs` },
    { name: 'Bench value', a: mine.bench_value, b: them.bench_value, show: fmt },
    { name: 'Draft capital', a: mine.draft_capital_value, b: them.draft_capital_value, show: fmt },
    ...['QB', 'RB', 'WR', 'TE'].map((pos) => ({ name: `${pos} room`, a: room(mine, pos), b: room(them, pos), show: fmt })),
  ];

  // Where they're deep and you're thin: natural trade conversations.
  const fits = ['QB', 'RB', 'WR', 'TE'].filter((pos) => room(them, pos) > room(mine, pos) * 1.25);
  const theyNeed = ['QB', 'RB', 'WR', 'TE'].filter((pos) => room(mine, pos) > room(them, pos) * 1.25);

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-muted shrink-0">Compare with</span>
        <select value={them.franchise_id} onChange={(e) => setPartnerId(e.target.value)} className="field min-w-0 sm:max-w-sm">
          {others.map((t) => (
            <option key={t.franchise_id} value={t.franchise_id}>
              {t.power_rank}. {t.franchise_name}
            </option>
          ))}
        </select>
      </label>

      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line align-bottom">
            <th className="py-2 font-normal text-[13px] text-muted" />
            <th className="py-2 pr-2 text-right">
              <span className="block text-[13px] text-gold font-semibold">You</span>
              <span className="block display text-[18px] text-ink truncate max-w-[7.5rem] sm:max-w-none ml-auto">{mine.franchise_name}</span>
              <span className="block text-[12px] text-muted font-normal">{labelFor(mine.classification)}</span>
            </th>
            <th className="py-2 text-right">
              <span className="block text-[13px] text-muted font-semibold">Them</span>
              <span className="block display text-[18px] text-ink truncate max-w-[7.5rem] sm:max-w-none ml-auto">{them.franchise_name}</span>
              <span className="block text-[12px] text-muted font-normal">{labelFor(them.classification)}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const better = r.higherIsBetter === false ? r.a < r.b : r.a > r.b;
            const worse = r.higherIsBetter === false ? r.a > r.b : r.a < r.b;
            return (
              <tr key={r.name}>
                <th scope="row" className="py-2.5 pr-3 font-normal text-muted text-[14px] whitespace-nowrap">
                  {r.name}
                </th>
                <td className={`py-2.5 pr-2 text-right font-semibold ${better ? 'text-up' : worse ? 'text-down' : ''}`}>{r.show(r.a)}</td>
                <td className="py-2.5 text-right font-semibold">{r.show(r.b)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(fits.length > 0 || theyNeed.length > 0) && (
        <div className="rounded-xl bg-card border border-line p-4 space-y-2">
          <h2 className="display text-[22px] text-ink">Trade fit</h2>
          {fits.length > 0 && (
            <p>
              They're deeper at <strong>{fits.join(', ')}</strong>.
            </p>
          )}
          {theyNeed.length > 0 && (
            <p>
              You're deeper at <strong>{theyNeed.join(', ')}</strong>.
            </p>
          )}
          <p className="text-muted text-[14px]">{them.stance_description}</p>
          <button type="button" className="btn-primary" onClick={() => setActiveView('trade')}>
            Build a trade with them
          </button>
        </div>
      )}
    </div>
  );
};
