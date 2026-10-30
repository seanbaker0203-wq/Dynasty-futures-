import React, { useEffect, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import type { Platform } from '../types';

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'sleeper', label: 'Sleeper' },
  { id: 'espn', label: 'ESPN' },
  { id: 'yahoo', label: 'Yahoo' },
  { id: 'mfl', label: 'MyFantasyLeague' },
  { id: 'fleaflicker', label: 'Fleaflicker' },
];
const SHORT: Record<string, string> = { sleeper: 'Sleeper', espn: 'ESPN', yahoo: 'Yahoo', mfl: 'MFL', fleaflicker: 'Fleaflicker' };

const HELP: Record<string, { placeholder: string; hint: string }> = {
  sleeper: { placeholder: '1048475294829375488', hint: 'The long number in your league link on sleeper.com.' },
  espn: { placeholder: '12345678', hint: 'The leagueId=… number in your ESPN league link.' },
  mfl: { placeholder: '37804', hint: 'The number after /home/ in your MFL league link.' },
  fleaflicker: { placeholder: '311194', hint: 'The number after /leagues/ in your Fleaflicker league link.' },
};

export const ConnectScreen: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const { syncRoster, switchLeague, loadDemoRoster, isLoading, error, syncHistory, evaluation, isDemo } = useRoster();
  const fromYahoo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('yahoo');

  const [platform, setPlatform] = useState<Platform>(fromYahoo ? 'yahoo' : syncHistory[0]?.platform || 'sleeper');
  const [leagueId, setLeagueId] = useState(fromYahoo ? '' : syncHistory[0]?.league_id || '');
  const [sleeperUser, setSleeperUser] = useState(syncHistory.find((h) => h.platform === 'sleeper')?.username || '');
  const [showPrivate, setShowPrivate] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [mflUser, setMflUser] = useState('');
  const [mflPass, setMflPass] = useState('');
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [yahoo, setYahoo] = useState<{ enabled: boolean; signed_in: boolean } | null>(null);
  const [yahooLeagues, setYahooLeagues] = useState<{ league_key: string; name: string; season: number }[] | null>(null);
  const [yahooErr, setYahooErr] = useState<string | null>(fromYahoo === 'failed' ? 'Yahoo sign-in didn’t finish. Try again.' : null);

  useEffect(() => {
    if (fromYahoo) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (platform !== 'yahoo') return;
    fetch('/api/yahoo/status')
      .then((r) => r.json())
      .then((s) => {
        setYahoo(s);
        if (s.signed_in && !yahooLeagues)
          fetch('/api/yahoo/leagues')
            .then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setYahooLeagues(d.leagues);
              if (d.leagues[0] && !leagueId) setLeagueId(d.leagues[0].league_key);
            })
            .catch((e) => setYahooErr(e.message));
      })
      .catch(() => setYahoo({ enabled: false, signed_in: false }));
  }, [platform]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueId.trim() || isLoading) return;
    const remembered = syncHistory.find((h) => h.platform === platform && h.league_id === leagueId.trim());
    syncRoster({
      platform,
      league_id: leagueId.trim(),
      franchise_id: remembered?.franchise_id,
      format: remembered?.format,
      username: platform === 'sleeper' ? sleeperUser.trim() || undefined : platform === 'mfl' ? mflUser.trim() || undefined : undefined,
      password: platform === 'mfl' ? mflPass || undefined : undefined,
      mfl_api_key: platform === 'mfl' ? apiKey.trim() || undefined : undefined,
      espn_s2: platform === 'espn' ? espnS2.trim() || undefined : undefined,
      swid: platform === 'espn' ? swid.trim() || undefined : undefined,
    });
  };

  const help = HELP[platform];

  return (
    <div className="space-y-8 pt-2">
      <div className="space-y-2">
        <h1 className="display text-[44px] sm:text-[56px] text-ink uppercase">Where does your team stand?</h1>
        <p className="text-[17px] text-muted max-w-[34rem]">
          Connect a dynasty, keeper or redraft league. Dynasty leagues get long-term values and plans; redraft leagues get this week’s
          lineup, playoff odds and waiver targets. Add as many leagues as you like and switch between them at the top.
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
              <button key={`${h.platform}-${h.league_id}`} type="button" disabled={isLoading} onClick={() => switchLeague(h)} className="btn-quiet disabled:opacity-50">
                {h.league_name || `${SHORT[h.platform] ?? h.platform} ${h.league_id}`}
                <span className="text-muted font-normal ml-1">
                  {SHORT[h.platform]}
                  {h.format ? `, ${h.format}` : ''}
                </span>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={platform === p.id}
                onClick={() => {
                  setPlatform(p.id);
                  if (p.id !== platform) setLeagueId(syncHistory.find((h) => h.platform === p.id)?.league_id || '');
                }}
                className={`rounded-lg border py-2.5 font-semibold transition-colors ${
                  platform === p.id ? 'border-ink bg-ink-soft text-ink' : 'border-line text-muted hover:text-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        {platform === 'yahoo' ? (
          <div className="space-y-3">
            {yahooErr && (
              <div className="space-y-2">
                <p className="text-down text-[14px]">{yahooErr}</p>
                <div className="flex flex-wrap gap-2">
                  <a href="/api/auth/yahoo/start" className="btn-quiet">
                    Sign in with Yahoo again
                  </a>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={async () => {
                      await fetch('/api/auth/yahoo/disconnect', { method: 'POST' }).catch(() => null);
                      setYahooErr(null);
                      setYahooLeagues(null);
                      setYahoo((y) => (y ? { ...y, signed_in: false } : y));
                    }}
                  >
                    Disconnect Yahoo
                  </button>
                </div>
              </div>
            )}
            {!yahoo ? (
              <p className="flex items-center gap-2 text-muted">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking Yahoo
              </p>
            ) : !yahoo.enabled ? (
              <p className="text-[14px] text-muted">Yahoo leagues are coming soon on this server.</p>
            ) : !yahoo.signed_in ? (
              <>
                <p className="text-[14px] text-muted">
                  Yahoo shares leagues only after you sign in with Yahoo and approve read-only access. We never see your Yahoo password.
                </p>
                <a href="/api/auth/yahoo/start" className="btn-primary w-full justify-center text-[16px] py-3">
                  Sign in with Yahoo
                </a>
              </>
            ) : !yahooLeagues ? (
              yahooErr ? null : <p className="flex items-center gap-2 text-muted">
                <Loader2 className="w-4 h-4 animate-spin" /> Finding your Yahoo leagues
              </p>
            ) : yahooLeagues.length === 0 ? (
              <p className="text-[14px] text-muted">No Yahoo football leagues found on this account.</p>
            ) : (
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-semibold text-muted">Your Yahoo leagues</span>
                <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)} className="field">
                  {yahooLeagues.map((l) => (
                    <option key={l.league_key} value={l.league_key}>
                      {l.name} ({l.season})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="league-id" className="block text-[13px] font-semibold text-muted">
              League ID
            </label>
            <input
              id="league-id"
              inputMode="numeric"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder={help.placeholder}
              required
              className="field text-[17px]"
            />
            <p className="text-[13px] text-muted">{help.hint}</p>
          </div>
        )}

        {platform === 'sleeper' && (
          <div className="space-y-1.5">
            <label htmlFor="sleeper-user" className="block text-[13px] font-semibold text-muted">
              Your Sleeper username <span className="font-normal">(optional, finds your team)</span>
            </label>
            <input id="sleeper-user" value={sleeperUser} onChange={(e) => setSleeperUser(e.target.value)} autoCapitalize="none" className="field" />
          </div>
        )}

        {(platform === 'mfl' || platform === 'espn') && (
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
            {showPrivate && platform === 'mfl' && (
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
            {showPrivate && platform === 'espn' && (
              <div className="mt-3 space-y-3">
                <p className="text-[14px] text-muted">
                  Public ESPN leagues need nothing here. Private leagues need two codes from your browser while you’re logged in to
                  ESPN: on a computer, open fantasy.espn.com, then Developer Tools → Application (Chrome) or Storage (Firefox) →
                  Cookies → espn.com, and copy <span className="font-semibold">espn_s2</span> and <span className="font-semibold">SWID</span>.
                  They’re used for this request only and never saved.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="espn-s2" className="block text-[13px] font-semibold text-muted">espn_s2</label>
                  <input id="espn-s2" value={espnS2} onChange={(e) => setEspnS2(e.target.value)} autoComplete="off" className="field font-mono text-[12px]" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="espn-swid" className="block text-[13px] font-semibold text-muted">SWID</label>
                  <input id="espn-swid" value={swid} onChange={(e) => setSwid(e.target.value)} autoComplete="off" placeholder="{XXXXXXXX-XXXX-…}" className="field font-mono text-[12px]" />
                </div>
              </div>
            )}
          </div>
        )}

        {!(platform === 'yahoo' && !yahooLeagues?.length) && (
          <button type="submit" disabled={isLoading || !leagueId.trim()} className="btn-primary w-full text-[16px] py-3">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Loading your league' : 'Load my league'}
          </button>
        )}
        <p className="text-[12px] text-muted text-center">By loading a league you agree to the Terms of Service and Privacy Policy.</p>
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
