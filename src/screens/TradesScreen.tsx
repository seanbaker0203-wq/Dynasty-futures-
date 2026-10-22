import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { fmt } from '../lib/leagueStats';
import { ManagerProfileNote } from '../components/ManagerProfile';
import type { TradeReport } from '../types';

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** League → Trades: every trade graded on today's values, plus who trades best. */
export const TradesScreen: React.FC = () => {
  const { evaluation, history, historyLoading, historyError, loadHistory, isDemo } = useRoster();
  const [scope, setScope] = useState<string>('all');
  const [season, setSeason] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!isDemo) loadHistory();
  }, [isDemo]);

  const me = evaluation?.roster.franchise_id;
  const trades = useMemo(() => {
    if (!history) return [];
    return history.trades.filter(
      (t) =>
        (scope === 'all' || t.sides.some((s) => s.team_id === (scope === 'mine' ? me : scope))) &&
        (season === 'all' || String(t.season) === season)
    );
  }, [history, scope, season, me]);

  if (isDemo) return <p className="text-muted">Trade history needs a real league. Connect yours to see every trade graded.</p>;
  if (historyError)
    return (
      <p role="alert" className="text-down">
        {historyError}
      </p>
    );
  if (historyLoading || !history)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading three seasons of trades
      </p>
    );
  if (!history.trades.length) return <p className="text-muted">No trades in this league over the last three seasons.</p>;

  const board = [...history.profiles].filter((p) => p.trades > 0).sort((a, b) => b.value_net - a.value_net);
  const shown = showAll ? trades : trades.slice(0, 25);

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="display text-[24px] text-ink">Who wins their trades</h2>
        <p className="text-[14px] text-muted">
          Value each manager has gained or lost across all their trades since {history.seasons[0]}, using today’s Futures Values.
          Hindsight, not a judgement of the deal at the time.
        </p>
        <ol className="divide-y divide-line border-y border-line">
          {board.map((p, i) => (
            <li key={p.team_id} className={`py-3 ${p.team_id === me ? 'bg-ink-soft -mx-4 px-4 sm:mx-0 sm:px-3 sm:rounded-lg' : ''}`}>
              <div className="flex items-baseline gap-3">
                <span className="display text-[24px] w-7 text-right shrink-0 text-ink">{i + 1}</span>
                <span className="flex-1 min-w-0 font-semibold truncate">
                  {p.team_name}
                  {p.team_id === me && <span className="text-gold"> (you)</span>}
                </span>
                <span className="text-right shrink-0">
                  <span className={`block font-semibold ${p.value_net >= 0 ? 'text-up' : 'text-down'}`}>
                    {p.value_net >= 0 ? '+' : '−'}
                    {fmt(Math.abs(p.value_net))}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {p.record.won}-{p.record.lost}-{p.record.even} in {p.trades}
                  </span>
                </span>
              </div>
              <div className="pl-10 pt-1">
                <ManagerProfileNote profile={p} compact />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="display text-[24px] text-ink">Report cards</h2>
        <div className="flex flex-wrap gap-2">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="field !w-auto" aria-label="Which teams">
            <option value="all">All teams</option>
            <option value="mine">My trades</option>
            {history.profiles
              .filter((p) => p.team_id !== me)
              .map((p) => (
                <option key={p.team_id} value={p.team_id}>
                  {p.team_name}
                </option>
              ))}
          </select>
          <select value={season} onChange={(e) => setSeason(e.target.value)} className="field !w-auto" aria-label="Season">
            <option value="all">All seasons</option>
            {[...history.seasons].reverse().map((s) => (
              <option key={s} value={String(s)}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[13px] text-muted">
          Picks already used are valued like a pick in the same round of the next draft. Within 10% counts as even.
        </p>
        {trades.length === 0 ? (
          <p className="text-muted">No trades match.</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((t) => (
              <TradeCard key={t.id} t={t} me={me} />
            ))}
          </ul>
        )}
        {trades.length > shown.length && (
          <button type="button" className="btn-quiet w-full justify-center" onClick={() => setShowAll(true)}>
            Show all {trades.length} trades
          </button>
        )}
      </section>
    </div>
  );
};

const TradeCard: React.FC<{ t: TradeReport; me?: string }> = ({ t, me }) => {
  const winner = t.sides.find((s) => s.team_id === t.winner_team_id);
  return (
    <li className="rounded-xl bg-card border border-line p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted">{fmtDate(t.date)}</span>
        <span className={`text-[13px] font-semibold ${winner ? (winner.team_id === me ? 'text-up' : 'text-ink') : 'text-muted'}`}>
          {winner ? `${winner.team_id === me ? 'You' : winner.team_name} won by ${fmt(t.margin)}` : 'Even'}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {t.sides.map((s) => {
          const won = s.team_id === t.winner_team_id;
          return (
            <div key={s.team_id} className={`rounded-lg p-3 ${won ? 'bg-up/8' : 'bg-ink-soft/60'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold truncate">
                  {s.team_name}
                  {s.team_id === me && <span className="text-gold"> (you)</span>}
                </span>
                <span className="font-semibold shrink-0">{fmt(s.value_now)}</span>
              </div>
              <div className="text-[12px] text-muted mb-1">received</div>
              <ul className="space-y-0.5 text-[14px]">
                {s.received.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {i.position && <span className="text-[12px] font-semibold text-muted mr-1.5">{i.position}</span>}
                      {i.label}
                    </span>
                    <span className="text-muted shrink-0">{i.value ? fmt(i.value) : '–'}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </li>
  );
};
