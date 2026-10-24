import React, { useMemo, useState } from 'react';
import { useRoster } from '../context/RosterContext';
import { fmt, fmtShort, pickName } from '../lib/leagueStats';
import type { DraftPick } from '../types';

const ABBR_KEY = 'df_team_initials';

/** Two-letter initials from a team name, made unique within the league. */
function defaultInitials(teams: { id: string; name: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const t of teams) {
    const words = t.name.normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const letters = (words.length > 1 ? words.map((w) => w[0]).join('') : words[0] || t.id).toUpperCase();
    let a = letters.slice(0, 2);
    for (let i = 2; used.has(a) && i <= letters.length; i++) a = letters.slice(0, 1) + letters[i] ;
    for (let n = 2; used.has(a); n++) a = `${letters[0]}${n}`;
    used.add(a);
    out[t.id] = a;
  }
  return out;
}

const readInitials = (league: string): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(`${ABBR_KEY}:${league}`) || '{}');
  } catch {
    return {};
  }
};

/** League → Picks: who owns every pick, laid out like a draft-pick spreadsheet. */
export const PicksBoardScreen: React.FC = () => {
  const { evaluation } = useRoster();
  const me = evaluation?.roster.franchise_id ?? '';
  const leagueKey = evaluation?.roster.external_league_id ?? 'league';
  const teams = useMemo(
    () =>
      [...(evaluation?.league_teams || [])]
        .map((t) => ({ id: t.franchise_id, name: t.franchise_name.trim() }))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [evaluation]
  );
  const [custom, setCustom] = useState<Record<string, string>>(() => readInitials(leagueKey));
  const initials = useMemo(() => ({ ...defaultInitials(teams), ...custom }), [teams, custom]);
  const [highlight, setHighlight] = useState<string>('');
  const [editing, setEditing] = useState(false);

  const picks: DraftPick[] = useMemo(() => (evaluation?.league_teams || []).flatMap((t) => t.draft_picks), [evaluation]);
  const years = useMemo(() => [...new Set(picks.map((p) => p.year))].sort(), [picks]);
  const rounds = useMemo(() => Math.max(0, ...picks.map((p) => p.round)), [picks]);
  const [year, setYear] = useState<number | 'all'>(() => years[0] ?? 'all');

  if (!evaluation) return null;
  if (!picks.length) return <p className="text-muted">No future picks found for this league.</p>;

  const cellOf = (orig: string, y: number, r: number) => picks.find((p) => p.original_owner_id === orig && p.year === y && p.round === r);
  const owned = (team: string, y?: number) => picks.filter((p) => p.current_owner_id === team && (y == null || p.year === y));
  const tone = (owner: string, orig: string) =>
    owner === me
      ? 'bg-gold/25 text-ink font-bold'
      : owner === highlight
        ? 'bg-ink text-paper font-bold'
        : owner === orig
          ? 'text-muted'
          : 'text-text font-semibold';
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? id;

  const saveInitial = (id: string, v: string) => {
    const next = { ...custom, [id]: v.toUpperCase().slice(0, 3) };
    if (!v) delete next[id];
    setCustom(next);
    try {
      localStorage.setItem(`${ABBR_KEY}:${leagueKey}`, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Year">
        {[...years, 'all' as const].map((y) => (
          <button
            key={y}
            type="button"
            aria-pressed={year === y}
            onClick={() => setYear(y)}
            className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold border ${year === y ? 'bg-ink text-paper border-ink' : 'border-line text-muted'}`}
          >
            {y === 'all' ? 'Totals' : y}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-muted shrink-0">Highlight</span>
        <select value={highlight} onChange={(e) => setHighlight(e.target.value)} className="field min-w-0 sm:max-w-sm">
          <option value="">Just my picks</option>
          {teams
            .filter((t) => t.id !== me)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {initials[t.id]} · {t.name}
              </option>
            ))}
        </select>
      </label>

      {year === 'all' ? (
        <table className="w-full text-[14px] tabular-nums">
          <thead>
            <tr className="text-muted text-[12px] border-b border-line">
              <th className="text-left font-semibold py-1.5">Team</th>
              {years.map((y) => (
                <th key={y} className="text-right font-semibold py-1.5">
                  {String(y).slice(2)}
                </th>
              ))}
              <th className="text-right font-semibold py-1.5">1sts</th>
              <th className="text-right font-semibold py-1.5">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...teams]
              .sort((a, b) => owned(b.id).reduce((s, p) => s + p.market_value, 0) - owned(a.id).reduce((s, p) => s + p.market_value, 0))
              .map((t) => {
                const all = owned(t.id);
                const val = all.reduce((s, p) => s + p.market_value, 0);
                const maxVal = Math.max(...teams.map((x) => owned(x.id).reduce((s, p) => s + p.market_value, 0)), 1);
                return (
                  <tr key={t.id} className={t.id === me ? 'bg-gold/10' : t.id === highlight ? 'bg-ink-soft' : ''}>
                    <td className="py-2 font-semibold" title={t.name}>
                      {initials[t.id]}
                    </td>
                    {years.map((y) => {
                      const n = owned(t.id, y).length;
                      return (
                        <td key={y} className={`py-2 text-right ${n > rounds ? 'text-up font-semibold' : n < rounds ? 'text-down' : 'text-muted'}`}>
                          {n}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right font-semibold">{all.filter((p) => p.round === 1).length}</td>
                    <td className="py-2 pl-2 w-[30%]">
                      <span className="flex items-center gap-2 justify-end">
                        <span className="h-1.5 flex-1 rounded-full bg-line overflow-hidden max-w-[5rem]" aria-hidden>
                          <span className={`block h-full rounded-full ${t.id === me ? 'bg-gold' : 'bg-ink'}`} style={{ width: `${(val / maxVal) * 100}%` }} />
                        </span>
                        <span className="font-semibold w-11 text-right">{fmtShort(val)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-[14px] tabular-nums table-fixed">
          <thead>
            <tr className="text-muted text-[12px] border-b border-line">
              <th className="text-left font-semibold py-1.5 w-12">From</th>
              {Array.from({ length: rounds }, (_, i) => (
                <th key={i} className="text-center font-semibold py-1.5">
                  Rd {i + 1}
                </th>
              ))}
              <th className="text-right font-semibold py-1.5 w-12">Owns</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-b border-line/60">
                <td className="py-1 font-semibold" title={t.name}>
                  {initials[t.id]}
                </td>
                {Array.from({ length: rounds }, (_, i) => {
                  const p = cellOf(t.id, year, i + 1);
                  return (
                    <td key={i} className="p-0.5">
                      {p ? (
                        <span
                          className={`block rounded text-center py-1 text-[13px] ${tone(p.current_owner_id, t.id)}`}
                          title={`${pickName(p)}: owned by ${name(p.current_owner_id)} · ${fmt(p.market_value)}`}
                        >
                          {initials[p.current_owner_id] ?? '?'}
                        </span>
                      ) : (
                        <span className="block text-center text-muted">–</span>
                      )}
                    </td>
                  );
                })}
                <td className={`py-1 text-right font-semibold ${t.id === me ? 'text-gold' : ''}`}>{owned(t.id, year).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-gold/25" /> Yours
        </span>
        {highlight && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-ink" /> {initials[highlight]}
          </span>
        )}
        <span>Grey = still with the original team</span>
        {year === 'all' && <span>Green / red = more / fewer picks than rounds</span>}
      </div>

      <div>
        <button type="button" className="text-[13px] underline underline-offset-2 text-muted" onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Edit team initials'}
        </button>
        {editing && (
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <input
                  value={custom[t.id] ?? ''}
                  placeholder={defaultInitials(teams)[t.id]}
                  onChange={(e) => saveInitial(t.id, e.target.value)}
                  className="field !w-16 text-center font-semibold uppercase"
                  aria-label={`Initials for ${t.name}`}
                />
                <span className="text-[14px] truncate">{t.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
