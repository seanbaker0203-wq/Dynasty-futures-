import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useRoster, type SavedLeague } from '../context/RosterContext';
import type { LeagueFormat } from '../types';

const shortDate = (iso?: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

const FORMAT_LABEL: Record<LeagueFormat, string> = { dynasty: 'Dynasty', keeper: 'Keeper', redraft: 'Redraft' };
const PLATFORM_LABEL: Record<string, string> = { sleeper: 'Sleeper', mfl: 'MFL', espn: 'ESPN', yahoo: 'Yahoo', fleaflicker: 'Fleaflicker' };
const keyOf = (l: { platform: string; league_id: string }) => `${l.platform}:${l.league_id}`;

/** Which league (and so which mode) you're in, which team you're viewing as, and how fresh the values are. */
export const LeagueBar: React.FC = () => {
  const { evaluation, isDemo, isLoading, selectMyTeam, setActiveView, error, syncHistory, switchLeague, setLeagueFormat, format, activePlatform } =
    useRoster();
  if (!evaluation) return null;

  if (isDemo) {
    return (
      <div className="rounded-xl border border-gold/40 bg-card px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span>You're looking at sample data, not a real league.</span>
        <button type="button" onClick={() => setActiveView('ingest')} className="font-semibold text-ink underline underline-offset-4">
          Connect your league
        </button>
      </div>
    );
  }

  const s = evaluation.settings;
  const details = [
    s?.league_size ? `${s.league_size} teams` : null,
    s?.superflex ? 'Superflex' : '1QB',
    s?.scoring_type?.replace('Half PPR', 'half PPR'),
    s?.te_premium ? 'TE premium' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const valuesDate = format === 'redraft' ? null : shortDate(evaluation.values_meta?.scrape_date);
  const franchises = evaluation.league_franchises || [];
  const currentKey = keyOf({ platform: activePlatform, league_id: evaluation.roster.external_league_id || '' });
  const name = evaluation.league_name || evaluation.roster.league_name;

  // Saved leagues grouped by type; the open league always listed.
  const saved: SavedLeague[] = syncHistory.some((h) => keyOf(h) === currentKey)
    ? syncHistory
    : [{ platform: activePlatform, league_id: evaluation.roster.external_league_id || '', league_name: name, format }, ...syncHistory];
  const groups: LeagueFormat[] = ['dynasty', 'keeper', 'redraft'];
  const formatOf = (l: SavedLeague) => (keyOf(l) === currentKey ? format : l.format || 'dynasty');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="League"
          value={currentKey}
          disabled={isLoading}
          onChange={(e) => {
            if (e.target.value === '__add') return setActiveView('ingest');
            const l = saved.find((x) => keyOf(x) === e.target.value);
            if (l) switchLeague(l);
          }}
          className="field !py-1.5 min-w-0 flex-1 font-semibold text-ink text-[15px]"
        >
          {groups.map((g) => {
            const list = saved.filter((l) => formatOf(l) === g);
            if (!list.length) return null;
            return (
              <optgroup key={g} label={FORMAT_LABEL[g]}>
                {list.map((l) => (
                  <option key={keyOf(l)} value={keyOf(l)}>
                    {l.league_name || `${PLATFORM_LABEL[l.platform] ?? l.platform} league ${l.league_id}`}
                  </option>
                ))}
              </optgroup>
            );
          })}
          <option value="__add">+ Connect another league</option>
        </select>
        <select
          aria-label="League type"
          title={s?.format_source === 'platform' ? 'From your league settings' : 'You can change this'}
          value={format}
          disabled={isLoading}
          onChange={(e) => setLeagueFormat(e.target.value as LeagueFormat)}
          className={`field !w-auto !py-1.5 text-[13px] font-semibold ${format === 'redraft' ? 'text-gold' : 'text-ink'}`}
        >
          {groups.map((g) => (
            <option key={g} value={g}>
              {FORMAT_LABEL[g]}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Refresh league"
          title="Refresh league"
          disabled={isLoading}
          onClick={() => selectMyTeam(evaluation.roster.franchise_id)}
          className="p-2 rounded-lg border border-line bg-card text-ink disabled:opacity-50 shrink-0"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-[13px] text-muted">
          {PLATFORM_LABEL[activePlatform] ?? activePlatform}, {details}
          {format === 'redraft' && evaluation.redraft ? `. Week ${evaluation.redraft.week}.` : valuesDate ? `. Values from ${valuesDate}.` : '.'}
        </div>
        {franchises.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <span className="shrink-0">Viewing as</span>
            <select
              value={evaluation.roster.franchise_id}
              disabled={isLoading}
              onChange={(e) => selectMyTeam(e.target.value)}
              className="field !py-1.5 min-w-0 flex-1 sm:max-w-[15rem] text-text text-[14px]"
            >
              {franchises.map((f) => (
                <option key={f.franchise_id} value={f.franchise_id}>
                  {f.franchise_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <div role="alert" className="text-[13px] text-down">
          {error}
        </div>
      )}
    </div>
  );
};
