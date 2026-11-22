import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { apiPost } from '../lib/api';

interface Side {
  name: string;
  pos: string;
  pts: number;
  proj: number;
}
interface Report {
  season: number;
  weeks: number[];
  me: string;
  mine: { week: number; actual: number; ours: number; optimal: number; swaps: { ours: Side; yours: Side | null }[] }[];
  teams: { team: string; name: string; actual: number; ours: number; optimal: number; weeks: number; ours_better: number; you_better: number }[];
  league: { actual_pct: number; ours_pct: number; ours_better: number; you_better: number; ties: number; team_weeks: number };
  notes: string[];
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');
const diff = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;

/** My team → Report card: your lineups vs our start/sit tool vs the best possible lineup, week by week. */
export const LineupReportScreen: React.FC = () => {
  const { leagueRequest } = useRoster();
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lr = leagueRequest();
  const lrKey = lr ? `${lr.platform}:${lr.league_id}:${lr.franchise_id}` : '';

  useEffect(() => {
    if (!lr) return;
    const ac = new AbortController();
    setData(null);
    setError(null);
    apiPost<Report>('/api/lineup/report', lr, ac.signal)
      .then(setData)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lrKey]);

  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Replaying every week of your season
      </p>
    );
  if (!data.weeks.length) return <p className="text-muted">No completed weeks yet this season.</p>;

  const me = data.teams.find((t) => t.team === data.me);
  const myRank = data.teams.findIndex((t) => t.team === data.me) + 1;
  const range = data.weeks.length > 1 ? `weeks ${data.weeks[0]}–${data.weeks[data.weeks.length - 1]}` : `week ${data.weeks[0]}`;

  return (
    <div className="space-y-8">
      <p className="text-[14px] text-muted">
        Every completed week ({range}): what you scored, what our <b>This week</b> lineup would have scored from the same roster, and the best
        possible lineup in hindsight.
      </p>

      {me && (
        <section className="grid grid-cols-3 gap-2" aria-label="Your season">
          {[
            ['Your lineups', pct(me.actual, me.optimal), `${(me.actual / me.weeks).toFixed(1)} pts/wk`],
            ['Our tool', pct(me.ours, me.optimal), `${diff((me.ours - me.actual) / me.weeks)} pts/wk vs you`],
            ['Weeks', `${me.you_better}–${me.ours_better}`, 'you beat it – it beat you'],
          ].map(([k, v, sub]) => (
            <div key={k} className="rounded-lg border border-line bg-card px-3 py-2.5">
              <div className="text-[12px] text-muted">{k}</div>
              <div className="display text-[26px] text-ink leading-tight">{v}</div>
              <div className="text-[11px] text-muted">{sub}</div>
            </div>
          ))}
        </section>
      )}
      {me && (
        <p className="text-[14px]">
          You’re <b>#{myRank} of {data.teams.length}</b> at setting lineups in your league ({pct(me.actual, me.optimal)} of the best possible).
          {me.ours > me.actual + me.weeks * 1
            ? ' Following our lineup would have added about ' + ((me.ours - me.actual) / me.weeks).toFixed(1) + ' points a week.'
            : me.actual > me.ours + me.weeks * 1
              ? ' You’ve out-picked our tool so far.'
              : ' You and our tool are about even.'}
        </p>
      )}

      <section>
        <h2 className="display text-[24px] text-ink">Week by week</h2>
        <ul className="divide-y divide-line border-y border-line mt-2">
          {data.mine.map((w) => {
            const d = w.ours - w.actual;
            return (
              <li key={w.week} className="py-3 text-[14px] space-y-1">
                <div className="flex items-baseline gap-3">
                  <span className="w-16 font-semibold">Week {w.week}</span>
                  <span className="flex-1 text-muted text-[13px]">
                    You {w.actual.toFixed(1)} · ours {w.ours.toFixed(1)} · best {w.optimal.toFixed(1)}
                  </span>
                  <span className={`font-semibold ${d > 0.05 ? 'text-down' : d < -0.05 ? 'text-up' : 'text-muted'}`}>
                    {Math.abs(d) < 0.05 ? 'Same' : d > 0 ? `Ours ${diff(d)}` : `You ${diff(-d)}`}
                  </span>
                </div>
                {w.swaps.map((s, i) => (
                  <p key={i} className="text-[13px] text-muted pl-16">
                    We’d have started <span className="text-text font-semibold">{s.ours.name}</span> ({s.ours.pts})
                    {s.yours ? (
                      <>
                        {' '}
                        over <span className="text-text font-semibold">{s.yours.name}</span> ({s.yours.pts})
                      </>
                    ) : null}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="display text-[24px] text-ink">Your league</h2>
        <p className="text-[13px] text-muted mt-1">
          Share of the best possible score. Across the league, managers got {data.league.actual_pct}% and our tool would have got{' '}
          {data.league.ours_pct}%; it beat the manager in {data.league.ours_better} of {data.league.team_weeks} team-weeks and lost{' '}
          {data.league.you_better}.
        </p>
        <table className="w-full text-[13px] mt-2">
          <thead>
            <tr className="text-muted text-left border-b border-line">
              <th className="py-1.5 font-semibold">Team</th>
              <th className="font-semibold text-right">Manager</th>
              <th className="font-semibold text-right">Our tool</th>
              <th className="font-semibold text-right">Pts/wk</th>
            </tr>
          </thead>
          <tbody>
            {data.teams.map((t) => (
              <tr key={t.team} className={`border-b border-line ${t.team === data.me ? 'bg-gold/10' : ''}`}>
                <td className="py-2 pr-2 font-semibold max-w-[150px] truncate">{t.name.trim()}</td>
                <td className="text-right">{pct(t.actual, t.optimal)}</td>
                <td className="text-right">{pct(t.ours, t.optimal)}</td>
                <td className="text-right">{diff((t.ours - t.actual) / t.weeks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[12px] text-muted mt-2">“Pts/wk” is what our lineup would have added (or cost) each week.</p>
      </section>

      <p className="text-[12px] text-muted">{data.notes.join(' ')}</p>
    </div>
  );
};
