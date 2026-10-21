import React, { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import type { Platform } from '../types';

export const ConnectScreen: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const { syncRoster, loadDemoRoster, isLoading, error, syncHistory, evaluation, isDemo } = useRoster();

  const [platform, setPlatform] = useState<Platform>(syncHistory[0]?.platform === 'sleeper' ? 'sleeper' : 'mfl');
  const [leagueId, setLeagueId] = useState(syncHistory[0]?.league_id || '');
  const [sleeperUser, setSleeperUser] = useState(syncHistory[0]?.username || '');
  const [showPrivate, setShowPrivate] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [mflUser, setMflUser] = useState('');
  const [mflPass, setMflPass] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueId.trim() || isLoading) return;
    const remembered = syncHistory.find((h) => h.platform === platform && h.league_id === leagueId.trim());
    syncRoster({
      platform,
      league_id: leagueId.trim(),
      franchise_id: remembered?.franchise_id,
      username: platform === 'sleeper' ? sleeperUser.trim() || undefined : mflUser.trim() || undefined,
      password: platform === 'mfl' ? mflPass || undefined : undefined,
      mfl_api_key: platform === 'mfl' ? apiKey.trim() || undefined : undefined,
    });
  };

  return (
    <div className="space-y-8 pt-2">
      <div className="space-y-2">
        <h1 className="display text-[44px] sm:text-[56px] text-ink uppercase">Where does your team stand?</h1>
        <p className="text-[17px] text-muted max-w-[34rem]">
          Connect your dynasty league. We value every roster and pick with today's market and rank your team against the rest
          of your league.
        </p>
      </div>

      {evaluation && !isDemo && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
          <span>
            Loaded: <strong className="text-ink">{evaluation.roster.franchise_name}</strong>
          </span>
          <button type="button" className="btn-quiet" onClick={onDone}>
            Back to my team
          </button>
        </div>
      )}

      {syncHistory.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[13px] font-semibold text-muted">Your leagues</h2>
          <div className="flex flex-wrap gap-2">
            {syncHistory.map((h) => (
              <button
                key={`${h.platform}-${h.league_id}`}
                type="button"
                disabled={isLoading}
                onClick={() => syncRoster(h)}
                className="btn-quiet disabled:opacity-50"
              >
                {h.platform === 'mfl' ? 'MFL' : 'Sleeper'} {h.league_id}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={submit} className="rounded-xl bg-card border border-line p-5 space-y-5">
        {error && (
          <p role="alert" className="text-down font-medium">
            {error}
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-muted mb-2">Where is your league?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['mfl', 'sleeper'] as Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                onClick={() => setPlatform(p)}
                className={`rounded-lg border py-2.5 font-semibold transition-colors ${
                  platform === p ? 'border-ink bg-ink-soft text-ink' : 'border-line text-muted hover:text-text'
                }`}
              >
                {p === 'mfl' ? 'MyFantasyLeague' : 'Sleeper'}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="league-id" className="block text-[13px] font-semibold text-muted">
            League ID
          </label>
          <input
            id="league-id"
            inputMode="numeric"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder={platform === 'sleeper' ? '1048475294829375488' : '37804'}
            required
            className="field text-[17px]"
          />
          <p className="text-[13px] text-muted">
            {platform === 'sleeper'
              ? 'The long number in your league link on sleeper.com.'
              : 'The number after /home/ in your MFL league link.'}
          </p>
        </div>

        {platform === 'sleeper' ? (
          <div className="space-y-1.5">
            <label htmlFor="sleeper-user" className="block text-[13px] font-semibold text-muted">
              Your Sleeper username <span className="font-normal">(optional, finds your team)</span>
            </label>
            <input id="sleeper-user" value={sleeperUser} onChange={(e) => setSleeperUser(e.target.value)} autoCapitalize="none" className="field" />
          </div>
        ) : (
          <div className="border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowPrivate(!showPrivate)}
              aria-expanded={showPrivate}
              className="w-full flex items-center justify-between font-semibold text-ink"
            >
              Private league?
              <ChevronDown className={`w-4 h-4 transition-transform ${showPrivate ? 'rotate-180' : ''}`} />
            </button>
            {showPrivate && (
              <div className="mt-3 space-y-3">
                <p className="text-[14px] text-muted">
                  Public leagues need nothing here. For a private league, use its read-only API key (your commissioner finds it under
                  League, Developer's API), or log in with your MFL account. Your password goes to MFL once and is never saved.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="mfl-key" className="block text-[13px] font-semibold text-muted">League API key</label>
                  <input id="mfl-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" className="field" />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="mfl-user" className="block text-[13px] font-semibold text-muted">or MFL username</label>
                    <input id="mfl-user" value={mflUser} onChange={(e) => setMflUser(e.target.value)} autoComplete="username" autoCapitalize="none" className="field" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="mfl-pass" className="block text-[13px] font-semibold text-muted">MFL password</label>
                    <input id="mfl-pass" type="password" value={mflPass} onChange={(e) => setMflPass(e.target.value)} autoComplete="current-password" className="field" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={isLoading || !leagueId.trim()} className="btn-primary w-full text-[16px] py-3">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? 'Loading your league' : 'Load my league'}
        </button>
      </form>

      <p className="text-[14px] text-muted">
        No league handy?{' '}
        <button type="button" onClick={() => loadDemoRoster('contender')} className="font-semibold text-ink underline underline-offset-4">
          Look around with sample data
        </button>
      </p>
    </div>
  );
};
