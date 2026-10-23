/** Browser Supabase client, configured from the server (/api/config) so keys aren't baked into the build. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) =>
        cfg?.supabase_url && cfg?.supabase_anon_key
          ? createClient(cfg.supabase_url, cfg.supabase_anon_key, { auth: { persistSession: true, detectSessionInUrl: true } })
          : null
      )
      .catch(() => null);
  }
  return clientPromise;
}
