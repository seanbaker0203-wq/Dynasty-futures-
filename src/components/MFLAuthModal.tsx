/**
 * Dynasty AI Evaluator - MFL OAuth2 & Account Linking Modal
 * Follows the AI Studio 3P OAuth integration guidelines:
 * - Uses popup-based OAuth authorization flow opening provider URL directly
 * - Listens for cross-origin postMessage events (OAUTH_AUTH_SUCCESS)
 * - Provides formal credential token generation with automatic myleagues discovery
 * - Displays exact callback URLs for OAuth client configuration
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  User,
  Calendar,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Sparkles,
  Link2,
  Copy,
  Check,
} from 'lucide-react';
import { MFLAuthState, MFLLinkedLeague } from '../types';

interface MFLAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authState: MFLAuthState | null;
  onAuthSuccess: (newAuthState: MFLAuthState) => void;
}

export const MFLAuthModal: React.FC<MFLAuthModalProps> = ({
  isOpen,
  onClose,
  authState,
  onAuthSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'credentials' | 'oauth'>('credentials');
  const [username, setUsername] = useState<string>('seanbaker0203@gmail.com');
  const [password, setPassword] = useState<string>('stb1989');
  const [year, setYear] = useState<string>('2026');
  const [manualToken, setManualToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const devCallbackUrl = 'https://ais-dev-4xoy73mixkbjdzrxabwpit-131497397430.us-east1.run.app/auth/mfl/callback';
  const sharedCallbackUrl = 'https://ais-pre-4xoy73mixkbjdzrxabwpit-131497397430.us-east1.run.app/auth/mfl/callback';

  // Listen for popup postMessage events
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'mfl') {
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch('/api/auth/mfl/link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: event.data.token || event.data.code,
              year,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to complete OAuth linking');

          onAuthSuccess({
            isAuthenticated: true,
            username: data.username,
            token: data.token,
            year: data.year || year,
            leagues: data.leagues || [],
            linkedAt: data.linkedAt,
          });
          onClose();
        } catch (err: any) {
          setError(err.message || 'OAuth authorization failed');
        } finally {
          setIsLoading(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [year, onAuthSuccess, onClose]);

  if (!isOpen) return null;

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please provide your MFL username and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/mfl/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          year,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate MFL account');
      }

      const newAuth: MFLAuthState = {
        isAuthenticated: true,
        username: data.username,
        token: data.token,
        year: data.year || year,
        leagues: data.leagues || [],
        linkedAt: data.linkedAt,
      };

      onAuthSuccess(newAuth);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/mfl/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: manualToken.trim(),
          year,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid session token');

      const newAuth: MFLAuthState = {
        isAuthenticated: true,
        username: data.username || 'MFL User',
        token: data.token,
        year: data.year || year,
        leagues: data.leagues || [],
        linkedAt: data.linkedAt,
      };

      onAuthSuccess(newAuth);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to verify MFL token');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunchOAuthPopup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/mfl/url');
      if (!res.ok) throw new Error('Failed to retrieve OAuth authorization URL');
      const { url } = await res.json();

      const popup = window.open(
        url,
        'mfl_oauth_popup',
        'width=600,height=700,status=no,resizable=yes,scrollbars=yes'
      );

      if (!popup) {
        setError('Popup blocked by browser. Please allow popups for this site.');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to open OAuth authorization window');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 pb-4 border-b border-zinc-800">
          <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-800/80 text-amber-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              MyFantasyLeague (MFL) Account Linking
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60 font-semibold">
                OAUTH2 / SESSION TOKEN
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Link your MFL credentials to generate a secure session token and auto-discover private leagues.
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 mt-4 p-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`flex-1 py-1.5 rounded-md transition-all font-semibold cursor-pointer ${
              activeTab === 'credentials'
                ? 'bg-zinc-800 text-amber-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Formal Credentials Handshake
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('oauth')}
            className={`flex-1 py-1.5 rounded-md transition-all font-semibold cursor-pointer ${
              activeTab === 'oauth'
                ? 'bg-zinc-800 text-cyan-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            OAuth2 Popup & Token Import
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Formal Credentials */}
        {activeTab === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="mt-4 space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-zinc-400" />
                  <span>MFL Username / Email</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. seanbaker0203@gmail.com"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1 flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-zinc-400" />
                  <span>MFL Password</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your MFL password"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-zinc-400" />
                <span>Season Year</span>
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500 font-mono"
              >
                <option value="2026">2026 Season (Current)</option>
                <option value="2025">2025 Season</option>
                <option value="2024">2024 Season</option>
                <option value="2023">2023 Season</option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
              When submitted, the server performs the official MFL XML authentication handshake to acquire your verified session token and queries <code className="text-amber-400 font-mono text-[10px]">export?TYPE=myleagues</code> to automatically discover your franchises.
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Authenticating with MFL...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authorize & Link MFL Account</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Tab 2: OAuth2 Popup & Token Import */}
        {activeTab === 'oauth' && (
          <div className="mt-4 space-y-4">
            {/* OAuth Provider Popup Button */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-cyan-900/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  Official OAuth2 Popup Authorization
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  POPUP FLOW
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Launches a secure popup window directly to the MyFantasyLeague authorization provider. When authorized, the popup sends a cross-origin handshake (<code className="text-cyan-400 font-mono text-[10px]">postMessage</code>) to complete linking.
              </p>
              <button
                type="button"
                onClick={handleLaunchOAuthPopup}
                disabled={isLoading}
                className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Launching Popup...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    <span>Launch MFL OAuth2 Popup</span>
                  </>
                )}
              </button>
            </div>

            {/* Manual Session Token Paste */}
            <form onSubmit={handleManualTokenSubmit} className="space-y-2">
              <label className="block text-[11px] font-mono uppercase text-zinc-400">
                Or Import Existing Session Token (<code className="text-amber-400">MFL_USER_ID</code>)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="e.g. aRJr2M2RvqL6i1vpaQKUIzIBFQ=="
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={isLoading || !manualToken.trim()}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  Verify Token
                </button>
              </div>
            </form>

            {/* Exact OAuth Callback URLs (Mandatory per Skill) */}
            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <span className="text-[11px] font-mono uppercase font-bold text-zinc-400 block">
                Registered OAuth Callback URLs:
              </span>

              <div className="space-y-1.5 text-[11px] font-mono">
                <div className="flex items-center justify-between bg-zinc-950 p-2 rounded border border-zinc-800">
                  <span className="text-zinc-400 truncate mr-2">Dev: {devCallbackUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(devCallbackUrl, 'dev')}
                    className="text-cyan-400 hover:text-cyan-300 p-1"
                    title="Copy development callback URL"
                  >
                    {copiedUrl === 'dev' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between bg-zinc-950 p-2 rounded border border-zinc-800">
                  <span className="text-zinc-400 truncate mr-2">Shared: {sharedCallbackUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(sharedCallbackUrl, 'shared')}
                    className="text-cyan-400 hover:text-cyan-300 p-1"
                    title="Copy shared callback URL"
                  >
                    {copiedUrl === 'shared' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
