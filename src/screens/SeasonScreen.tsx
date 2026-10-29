import React from 'react';
import { useRoster } from '../context/RosterContext';
import { ordinal } from '../lib/leagueStats';

const pct = (x: number) => (x >= 0.995 ? '>99%' : x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`);

/** Redraft → Season: standings with playoff odds, your remaining schedule, and playoff-week strength. */
export const SeasonScreen: React.FC = () => {
  const { evaluation } = useRoster();
  const r = evaluation?.redraft;
  if (!evaluation || !r) return <p className="text-muted">Season tools are for redraft leagues.</p>;
  const me = evaluation.roster.franchise_id;
  const teams = [...r.teams].sort((a, b) => b.playoff_odds - a.playoff_odds || b.projected_wins - a.projected_wins);
  const mine = r.teams.find((t) => t.team_id === me);
  const poRank = [...r.teams].sort((a, b) => b.playoff_avg - a.playoff_avg).findIndex((t) => t.team_id === me) + 1;
  const maxPo = Math.max(...r.teams.map((t) => t.playoff_avg), 1);

  return (
    <div className="space-y-8">
      {mine && (
        <section className="grid grid-cols-3 gap-3">
          {[
            { k: 'Playoff odds', v: pct(mine.playoff_odds) },
            { k: 'Projected wins', v: mine.projected_wins.toFixed(1) },
            { k: 'Playoff weeks', v: ordinal(poRank) },
          ].map((x) => (
            <div key={x.k} className="rounded-xl bg-card border border-line p-3">
              <div className="text-[12px] text-muted">{x.k}</div>
              <div className="display text-[28px] text-ink leading-tight">{x.v}</div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-1">
        <h2 className="display text-[24px] text-ink">Playoff race</h2>
        <p className="text-[14px] text-muted">
          {r.playoffs.teams} teams make the playoffs (weeks {r.playoffs.start_week}–{r.playoffs.end_week}). Odds come from simulating the rest of the
          regular season {evaluation.settings?.median_game ? 'on your real schedule, including the weekly game against the median' : 'on your real schedule'}, using each
          team's best projected lineup.
        </p>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[22rem] text-[14px] tabular-nums">
            <thead>
              <tr className="text-muted text-[12px] border-b border-line">
                <th className="text-left font-semibold py-1.5">Team</th>
                <th className="text-right font-semibold py-1.5">Record</th>
                <th className="text-right font-semibold py-1.5 whitespace-nowrap pl-2">Proj W</th>
                <th className="text-right font-semibold py-1.5 whitespace-nowrap pl-2">Pts/wk</th>
                <th className="text-right font-semibold py-1.5 w-[28%]">Playoffs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {teams.map((t, i) => (
                <tr key={t.team_id} className={t.team_id === me ? 'bg-gold/10' : ''}>
                  <td className={`py-2 pr-2 ${i === r.playoffs.teams - 1 ? 'border-b-2 border-ink/40' : ''}`}>
                    <span className="block font-semibold truncate max-w-[9rem] sm:max-w-none">{t.name}</span>
                  </td>
                  <td className="py-2 text-right">
                    {t.record.wins}-{t.record.losses}
                    {t.record.ties ? `-${t.record.ties}` : ''}
                  </td>
                  <td className="py-2 text-right">{t.projected_wins.toFixed(1)}</td>
                  <td className="py-2 text-right">{t.ros_avg.toFixed(0)}</td>
                  <td className="py-2 pl-2">
                    <span className="flex items-center gap-2 justify-end">
                      <span className="h-1.5 flex-1 max-w-[4rem] rounded-full bg-line overflow-hidden" aria-hidden>
                        <span className={`block h-full rounded-full ${t.team_id === me ? 'bg-gold' : 'bg-ink'}`} style={{ width: `${t.playoff_odds * 100}%` }} />
                      </span>
                      <span className="font-semibold w-10 text-right">{pct(t.playoff_odds)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {r.my_schedule.length > 0 && (
        <section className="space-y-1">
          <h2 className="display text-[24px] text-ink">Your remaining games</h2>
          <ul className="divide-y divide-line border-y border-line">
            {r.my_schedule.map((g) => (
              <li key={g.week} className="flex items-center gap-3 py-2.5">
                <span className="w-10 shrink-0 text-[12px] font-semibold text-muted">Wk {g.week}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">vs {g.opponent}</span>
                  <span className="block text-[13px] text-muted">
                    {g.my_points.toFixed(0)} to {g.opp_points.toFixed(0)} projected
                  </span>
                </span>
                <span className={`font-semibold shrink-0 ${g.win_prob >= 0.6 ? 'text-up' : g.win_prob <= 0.4 ? 'text-down' : ''}`}>{pct(g.win_prob)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-1">
        <h2 className="display text-[24px] text-ink">Playoff weeks</h2>
        <p className="text-[14px] text-muted">
          Each team's best projected lineup in weeks {r.playoffs.start_week}–{r.playoffs.end_week}, with byes and matchups. Strong now and weak then?
          Trade for playoff-week points.
        </p>
        <ol className="divide-y divide-line border-y border-line">
          {[...r.teams]
            .sort((a, b) => b.playoff_avg - a.playoff_avg)
            .map((t, i) => (
              <li key={t.team_id} className={`flex items-center gap-3 py-2 ${t.team_id === me ? 'bg-gold/10 -mx-4 px-4 sm:mx-0 sm:px-2 sm:rounded' : ''}`}>
                <span className="w-6 text-right display text-[20px] text-ink">{i + 1}</span>
                <span className="flex-1 min-w-0 font-semibold truncate">{t.name}</span>
                <span className="h-1.5 w-20 rounded-full bg-line overflow-hidden" aria-hidden>
                  <span className={`block h-full rounded-full ${t.team_id === me ? 'bg-gold' : 'bg-ink'}`} style={{ width: `${(t.playoff_avg / maxPo) * 100}%` }} />
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">{t.playoff_avg.toFixed(0)}</span>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
};
