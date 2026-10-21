import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useRoster } from '../context/RosterContext';

const shortDate = (iso?: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

/** Which league and which team you're looking at, and how fresh the values are. */
export const LeagueBar: React.FC = () => {
  const { evaluation, isDemo, isLoading, selectMyTeam, setActiveView, error } = useRoster();
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
  const format = [
    s?.league_size ? `${s.league_size} teams` : null,
    s?.superflex ? 'Superflex' : '1QB',
    s?.scoring_type?.replace('Half PPR', 'half PPR'),
    s?.te_premium ? 'TE premium' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const valuesDate = shortDate(evaluation.values_meta?.scrape_date);
  const franchises = evaluation.league_franchises || [];

  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold text-ink truncate">{evaluation.roster.league_name}</div>
        <div className="text-[13px] text-muted">
          {format}
          {valuesDate && `. Values from ${valuesDate}.`}
        </div>
        {error && (
          <div role="alert" className="text-[13px] text-down mt-1">
            {error}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {franchises.length > 0 && (
          <label className="flex-1 sm:flex-none flex items-center gap-2 text-[13px] text-muted">
            <span className="shrink-0">Viewing as</span>
            <select
              value={evaluation.roster.franchise_id}
              disabled={isLoading}
              onChange={(e) => selectMyTeam(e.target.value)}
              className="field !py-1.5 min-w-0 sm:max-w-[15rem] text-text text-[14px]"
            >
              {franchises.map((f) => (
                <option key={f.franchise_id} value={f.franchise_id}>
                  {f.franchise_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          aria-label="Refresh league"
          title="Refresh league"
          disabled={isLoading}
          onClick={() => selectMyTeam(evaluation.roster.franchise_id)}
          className="p-2 rounded-lg border border-line bg-card text-ink disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
