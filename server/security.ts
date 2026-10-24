/**
 * Who is calling, and how often. Signed-in users are identified from their Supabase access token; everyone else by
 * IP address. Limits are per user (or per IP) in a sliding window, kept in memory (one server instance).
 */
import type { NextFunction, Request, Response } from 'express';

export interface Caller {
  userId: string | null;
  email: string | null;
  key: string; // "u:<id>" or "ip:<addr>"
}

declare module 'express-serve-static-core' {
  interface Request {
    caller?: Caller;
  }
}

export const accountsEnabled = () => !!(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY));

const tokenCache = new Map<string, { at: number; user: { id: string; email: string | null } | null }>();

async function userForToken(token: string) {
  const hit = tokenCache.get(token);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.user;
  let user: { id: string; email: string | null } | null = null;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY), Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const u: any = await r.json();
      if (u?.id) user = { id: String(u.id), email: u.email ?? null };
    }
  } catch {
    // Treat as signed out if Supabase can't be reached.
  }
  if (tokenCache.size > 5000) tokenCache.clear();
  tokenCache.set(token, { at: Date.now(), user });
  return user;
}

/** Attaches req.caller. Never rejects: routes decide what signed-out callers may do. */
export async function identify(req: Request, _res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const user = token && accountsEnabled() ? await userForToken(token) : null;
  req.caller = { userId: user?.id ?? null, email: user?.email ?? null, key: user ? `u:${user.id}` : `ip:${ip}` };
  next();
}

const hits = new Map<string, number[]>();
setInterval(() => {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [k, ts] of hits) {
    const kept = ts.filter((t) => t > cutoff);
    if (kept.length) hits.set(k, kept);
    else hits.delete(k);
  }
}, 5 * 60_000).unref();

/** Sliding-window limit: `anon` requests per window when signed out, `user` when signed in. */
export function rateLimit(name: string, opts: { anon: number; user: number; windowMs?: number }) {
  const windowMs = opts.windowMs ?? 10 * 60_000;
  return (req: Request, res: Response, next: NextFunction) => {
    const caller = req.caller ?? { key: `ip:${req.ip}`, userId: null, email: null };
    const limit = caller.userId ? opts.user : opts.anon;
    const k = `${name}|${caller.key}`;
    const now = Date.now();
    const ts = (hits.get(k) || []).filter((t) => t > now - windowMs);
    if (ts.length >= limit) {
      const retry = Math.ceil((ts[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({
        error: caller.userId
          ? `You're going a bit fast. Try again in ${Math.ceil(retry / 60)} min.`
          : `Too many requests. Sign in for higher limits, or try again in ${Math.ceil(retry / 60)} min.`,
      });
      return;
    }
    ts.push(now);
    hits.set(k, ts);
    res.setHeader('RateLimit-Remaining', String(limit - ts.length));
    next();
  };
}
