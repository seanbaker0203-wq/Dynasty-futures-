import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { apiPost } from '../lib/api';

interface WeekScore {
  season: number;
  week: number;
  playoff: boolean;
  franchise_id: string;
  team_name: string;
  score: number;
  opponent_id: string | null;
  opponent_name: string | null;
  opponent_score: number | null;
  won: boolean | null;
}
interface FranchiseRecord {
  franchise_id: string;
  name: string;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  avg_score: number;
  best_score: number;
  titles: number[];
  runner_up: number[];
}
interface History {
  me: string | null;
  seasons: number[];
  missing: number[];
  champions: { season: number; franchise_id: string; team_name: string; runner_up_id: string | null; runner_up_name: string | null; score: string | null }[];
  franchises: FranchiseRecord[];
  h2h: Record<string, Record<string, { w: number; l: number; t: number }>>;
  top_scores: WeekScore[];
  low_scores: WeekScore[];
  blowouts: WeekScore[];
  notes: string[];
}

const pct = (w: number, l: number, t: number) => (w + l + t ? ((w + t / 2) / (w + l + t)).toFixed(3).replace(/^0/, '') : '–');
const rec = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ''}`;

/** League → History: champions, all-time standings, record weeks and head-to-head, from every season on the platform. */
export const RecordsScreen: React.FC = () => {
  const { evaluation, leagueRequest } = useRoster();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [h2hTeam, setH2hTeam] = useState('');
  const lr = leagueRequest();
  const lrKey = lr ? `${lr.platform}:${lr.league_id}:${lr.franchise_id}` : '';

  useEffect(() => {
    if (!lr) return;
    const ac = new AbortController();
    setData(null);
    setError(null);
    apiPost<History>('/api/league/records', { platform: lr.platform, league_id: lr.league_id, franchise_id: lr.franchise_id }, ac.signal)
      .then((d) => {
        setData(d);
        setH2hTeam(d.me ?? d.franchises[0]?.franchise_id ?? '');
      })
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lrKey]);

  const nameNow = useMemo(() => new Map((data?.franchises || []).map((f) => [f.franchise_id, f.name.trim()])), [data]);

  if (!evaluation) return null;
  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading every season of your league. The first time can take up to 30 seconds.
      </p>
    );
  if (!data.seasons.length) return <p className="text-muted">No past seasons found for this league.</p>;

  const me = data.me;
  const first = data.seasons[0];
  const last = data.seasons[data.seasons.length - 1];
  const mine = (id: string | null) => !!me && id === me;
  const NowName: React.FC<{ id: string; then: string }> = ({ id, then }) => {
    const now = nameNow.get(id);
    return now && now !== then.trim() ? <span className="block text-[12px] text-muted truncate">now {now}</span> : null;
  };
  const ScoreRow: React.FC<{ s: WeekScore; i: number; margin?: boolean }> = ({ s, i, margin }) => (
    <li className={`flex items-center gap-3 py-2 text-[14px] ${mine(s.franchise_id) ? 'bg-gold/10 -mx-2 px-2 rounded' : ''}`}>
      <span className="w-6 text-muted text-[12px]">{i + 1}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">{s.team_name.trim()}</span>
        <NowName id={s.franchise_id} then={s.team_name} />
        <span className="block text-[12px] text-muted truncate">
          {s.season} · Week {s.week}
          {s.playoff ? ' · playoffs' : ''}
          {s.opponent_name ? ` · vs ${s.opponent_name.trim()} (${s.opponent_score?.toFixed(2)})` : ''}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span className="block display text-[20px] text-ink">{margin && s.opponent_score != null ? `+${(s.score - s.opponent_score).toFixed(1)}` : s.score.toFixed(2)}</span>
        {margin && <span className="block text-[11px] text-muted">{s.score.toFixed(1)} to {s.opponent_score?.toFixed(1)}</span>}
      </span>
    </li>
  );

  const h2hRows = Object.entries(data.h2h[h2hTeam] || {})
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => b.w + b.l + b.t - (a.w + a.l + a.t));

  return (
    <div className="space-y-8">
      <p className="text-[14px] text-muted">
        {data.seasons.length} seasons, {first}–{last}. Records are regular season; champions come from the playoff bracket. Teams are
        followed through name changes{lr?.platform === 'sleeper' ? ' by owner' : ''}.
        {data.missing.length ? ` Couldn't read ${data.missing.join(', ')}.` : ''}
      </p>

      <section>
        <h2 className="display text-[24px] text-ink">Champions</h2>
        <ul className="divide-y divide-line border-y border-line mt-2">
          {data.champions.map((c) => (
            <li key={c.season} className={`flex items-center gap-3 py-2 text-[14px] ${mine(c.franchise_id) ? 'bg-gold/10 -mx-2 px-2 rounded' : ''}`}>
              <span className="w-11 font-semibold">{c.season}</span>
              <Trophy className="w-4 h-4 text-gold shrink-0" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{c.team_name.trim()}</span>
                <span className="block text-[12px] text-muted truncate">
                  {c.runner_up_name ? `over ${c.runner_up_name.trim()}` : ''}
                  {c.score ? `, ${c.score}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="display text-[24px] text-ink">All-time standings</h2>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mt-2">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-muted text-left border-b border-line">
                <th className="py-1.5 font-semibold">Team</th>
                <th className="font-semibold text-right">Titles</th>
                <th className="font-semibold text-right">Record</th>
                <th className="font-semibold text-right hidden sm:table-cell">Pct</th>
                <th className="font-semibold text-right">Avg</th>
                <th className="font-semibold text-right hidden sm:table-cell">Best</th>
              </tr>
            </thead>
            <tbody>
              {data.franchises.map((f) => (
                <tr key={f.franchise_id} className={`border-b border-line ${mine(f.franchise_id) ? 'bg-gold/10' : ''}`}>
                  <td className="py-2 pr-2 font-semibold max-w-[150px] truncate">{f.name.trim()}</td>
                  <td className="text-right" title={f.titles.length ? `Won ${f.titles.join(', ')}` : undefined}>
                    {f.titles.length || '–'}
                    {f.runner_up.length > 0 && <span className="block text-[11px] text-muted">{f.runner_up.length} runner-up</span>}
                  </td>
                  <td className="text-right">{rec(f.wins, f.losses, f.ties)}</td>
                  <td className="text-right hidden sm:table-cell">{pct(f.wins, f.losses, f.ties)}</td>
                  <td className="text-right">{f.avg_score.toFixed(1)}</td>
                  <td className="text-right hidden sm:table-cell">{f.best_score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="display text-[24px] text-ink">Highest weekly scores</h2>
        <ol className="divide-y divide-line border-y border-line mt-2">
          {data.top_scores.slice(0, showAll ? 25 : 10).map((s, i) => (
            <ScoreRow key={`${s.season}-${s.week}-${s.franchise_id}`} s={s} i={i} />
          ))}
        </ol>
        {!showAll && (
          <button type="button" className="btn-quiet mt-2" onClick={() => setShowAll(true)}>
            Show top 25
          </button>
        )}
        {data.notes.length > 0 && (
          <p className="text-[12px] text-muted mt-2">Scores across eras aren't equal: {data.notes.join(' ')}</p>
        )}
      </section>

      <section>
        <h2 className="display text-[24px] text-ink">Biggest blowouts</h2>
        <ol className="divide-y divide-line border-y border-line mt-2">
          {data.blowouts.slice(0, 5).map((s, i) => (
            <ScoreRow key={`${s.season}-${s.week}-${s.franchise_id}`} s={s} i={i} margin />
          ))}
        </ol>
      </section>

      <section>
        <h2 className="display text-[24px] text-ink">Lowest scores</h2>
        <ol className="divide-y divide-line border-y border-line mt-2">
          {data.low_scores.slice(0, 5).map((s, i) => (
            <ScoreRow key={`${s.season}-${s.week}-${s.franchise_id}`} s={s} i={i} />
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="display text-[24px] text-ink">Head to head</h2>
        <select value={h2hTeam} onChange={(e) => setH2hTeam(e.target.value)} className="field !w-auto" aria-label="Team">
          {data.franchises.map((f) => (
            <option key={f.franchise_id} value={f.franchise_id}>
              {f.name.trim()}
              {mine(f.franchise_id) ? ' (you)' : ''}
            </option>
          ))}
        </select>
        <ul className="divide-y divide-line border-y border-line">
          {h2hRows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 text-[14px]">
              <span className="flex-1 min-w-0 truncate">vs {nameNow.get(r.id) ?? 'Former team'}</span>
              <span className={`font-semibold ${r.w > r.l ? 'text-up' : r.w < r.l ? 'text-down' : ''}`}>{rec(r.w, r.l, r.t)}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-muted">Includes playoff games.</p>
      </section>
    </div>
  );
};
