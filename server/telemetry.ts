/**
 * First-party usage analytics and in-app feedback, stored in our own Supabase tables (usage_events, feedback).
 * No third-party trackers, no cookies, no league ids or usernames: a random device id, the screen, the platform
 * type (sleeper/mfl/...) and a few counts. Without Supabase configured, events are logged to the console.
 */
import { supabaseUrl } from './security';
import { LeagueSyncError } from './leagues/types';

const key = () => process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const clip = (x: unknown, n: number) => (x == null ? null : String(x).slice(0, n));
const EVENT = /^[a-z0-9_]{1,40}$/;

async function insert(table: string, rows: Record<string, unknown>[]) {
  const url = supabaseUrl();
  if (!url || !key()) {
    console.log(`[${table}]`, JSON.stringify(rows).slice(0, 500));
    return;
  }
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table} insert failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Keep only small, known fields from a props object (numbers, short strings, booleans). */
function cleanProps(p: unknown): Record<string, unknown> | null {
  if (!p || typeof p !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>).slice(0, 10)) {
    if (!/^[a-z0-9_]{1,30}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 40);
  }
  return Object.keys(out).length ? out : null;
}

export async function trackEvents(body: any, userId: string | null) {
  const events = (Array.isArray(body?.events) ? body.events : []).slice(0, 25);
  const rows = events
    .filter((e: any) => EVENT.test(String(e?.event || '')))
    .map((e: any) => ({
      device: clip(body.device, 40),
      user_id: userId,
      event: String(e.event),
      view: clip(e.view, 30),
      platform: clip(e.platform, 12),
      props: cleanProps(e.props),
      at: typeof e.at === 'string' && !Number.isNaN(Date.parse(e.at)) && Math.abs(Date.now() - Date.parse(e.at)) < 86400000 ? e.at : new Date().toISOString(),
    }));
  if (rows.length) await insert('usage_events', rows);
  return rows.length;
}

export async function saveFeedback(body: any, userId: string | null, userAgent: string | undefined) {
  const message = String(body?.message || '').trim();
  if (message.length < 2) throw new LeagueSyncError('Write a little more first.');
  const email = String(body?.email || '').trim();
  await insert('feedback', [
    {
      device: clip(body?.device, 40),
      user_id: userId,
      email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email) ? email : null,
      message: message.slice(0, 4000),
      view: clip(body?.view, 30),
      platform: clip(body?.platform, 12),
      user_agent: clip(userAgent, 200),
    },
  ]);
}
