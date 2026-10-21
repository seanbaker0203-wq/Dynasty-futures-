import React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useRoster } from '../context/RosterContext';

/** League context strip: which league, which team is "mine", how fresh the values are. */
export const LeagueBar: React.FC = () => {
  const { evaluation, isDemo, isLoading, selectMyTeam, setActiveView, error } = useRoster();
  if (!evaluation) return null;

  if (isDemo) {
    return (
      <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Sample data: not a real league, and not current market values.
        </span>
        <button type="button" onClick={() => setActiveView('ingest')} className="text-xs font-semibold underline underline-offset-4">
          Connect your league
        </button>
      </div>
    );
  }

  const franchises = evaluation.league_franchises || [];
  const myId = evaluation.roster.franchise_id;
  const settings = evaluation.settings;
  const format = [
    settings?.superflex ? 'Superflex' : '1QB',
    settings?.scoring_type,
    settings?.te_premium ? 'TE premium' : null,
    settings?.league_size ? `${settings.league_size} teams` : null,
  ].filter(Boolean);

  return (
    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <div className="font-semibold text-white truncate">{evaluation.roster.league_name}</div>
        <div className="text-xs text-zinc-400">
          {format.join(' · ')}
          {evaluation.values_meta?.scrape_date && <> · values from {evaluation.values_meta.scrape_date}</>}
        </div>
        {error && <div role="alert" className="text-xs text-red-400 mt-1">{error}</div>}
      </div>
      <div className="flex items-center gap-2">
        {franchises.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            My team
            <select
              value={myId}
              disabled={isLoading}
              onChange={(e) => selectMyTeam(e.target.value)}
              className="max-w-[16rem] bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-cyan-500"
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
          title="Re-sync league"
          aria-label="Re-sync league"
          disabled={isLoading}
          onClick={() => selectMyTeam(myId)}
          className="p-2 rounded-lg bg-zinc-950 border border-zinc-700 hover:border-cyan-600 text-zinc-300 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
