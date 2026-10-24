/** Calls our API with the signed-in user's token (when there is one) and friendly errors. */
import { getSupabase } from './supabase';

async function authHeader(): Promise<Record<string, string>> {
  try {
    const sb = await getSupabase();
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  } catch {
    return {};
  }
}

export async function apiPost<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error || `Request failed (${r.status}).`);
  return data as T;
}
