import React, { useState } from 'react';
import { AlertCircle, ChevronDown, History, KeyRound, Loader2, Lock, RefreshCw, Zap } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import type { Platform } from '../types';

const inputCls =
  'w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-100 text-sm rounded-lg px-3.5 py-2.5 outline-none focus:border-cyan-500 transition-colors';
const labelCls = 'block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5';

export const LiveSyncCard: React.FC = () => {
  const { syncRoster, loadDemoRoster, isLoading, error, syncHistory } = useRoster();

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
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-5 md:p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-emerald-500 to-amber-500 opacity-80" />

      <div className="flex items-center gap-3 pb-5 border-b border-zinc-800/80">
        <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">Connect your league</h2>
          <p className="text-xs text-zinc-400">Pulls every roster and pick in your league and values them with today's market.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {syncHistory.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <History className="w-3.5 h-3.5 text-zinc-500" />
          {syncHistory.map((h) => (
            <button
              key={`${h.platform}-${h.league_id}`}
              type="button"
              disabled={isLoading}
              onClick={() => {
                setPlatform(h.platform);
                setLeagueId(h.league_id);
                syncRoster(h);
              }}
              className="px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 hover:border-cyan-600 text-xs text-zinc-300 font-mono disabled:opacity-50"
            >
              {h.platform === 'mfl' ? 'MFL' : 'Sleeper'} · {h.league_id}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className={labelCls}>Platform</span>
            <div className="grid grid-cols-2 rounded-lg bg-zinc-950 p-1 border border-zinc-800 text-sm font-medium">
              {(['mfl', 'sleeper'] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={platform === p}
                  onClick={() => setPlatform(p)}
                  className={`py-1.5 rounded-md transition-all ${
                    platform === p ? 'bg-zinc-800 text-cyan-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {p === 'mfl' ? 'MyFantasyLeague' : 'Sleeper'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="league-id" className={labelCls}>League ID</label>
            <input
              id="league-id"
              inputMode="numeric"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder={platform === 'sleeper' ? 'e.g. 1048475294829375488' : 'e.g. 37804'}
              required
              className={`${inputCls} font-mono`}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              {platform === 'sleeper' ? 'The long number in your league link on sleeper.com' : 'The number after /home/ in your MFL league link'}
            </p>
          </div>

          {platform === 'sleeper' ? (
            <div>
              <label htmlFor="sleeper-user" className={labelCls}>Your Sleeper username</label>
              <input
                id="sleeper-user"
                value={sleeperUser}
                onChange={(e) => setSleeperUser(e.target.value)}
                placeholder="optional — finds your team"
                autoCapitalize="none"
                className={inputCls}
              />
              <p className="text-[11px] text-zinc-500 mt-1">You can also pick your team after syncing.</p>
            </div>
          ) : (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowPrivate(!showPrivate)}
                aria-expanded={showPrivate}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-sm text-zinc-300"
              >
                <span className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-400" /> Private league?
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showPrivate ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {platform === 'mfl' && showPrivate && (
          <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
            <p className="text-xs text-zinc-400">
              Public leagues need nothing here. For a private league, use the league's read-only API key
              (commissioner: League → Developer's API), or log in with your MFL account. Your password is sent once
              to MFL over HTTPS and never saved.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="mfl-key" className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                  <KeyRound className="inline w-3 h-3 mr-1" />League API key
                </label>
                <input id="mfl-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" className={`${inputCls} font-mono text-xs`} />
              </div>
              <div>
                <label htmlFor="mfl-user" className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">or MFL username</label>
                <input id="mfl-user" value={mflUser} onChange={(e) => setMflUser(e.target.value)} autoComplete="username" autoCapitalize="none" className={`${inputCls} text-xs`} />
              </div>
              <div>
                <label htmlFor="mfl-pass" className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">MFL password</label>
                <input id="mfl-pass" type="password" value={mflPass} onChange={(e) => setMflPass(e.target.value)} autoComplete="current-password" className={`${inputCls} text-xs`} />
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => loadDemoRoster('contender')}
            className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-4"
          >
            No league handy? Explore with sample data
          </button>
          <button
            type="submit"
            disabled={isLoading || !leagueId.trim()}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isLoading ? 'Syncing league…' : 'Sync league'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LiveSyncCard;
