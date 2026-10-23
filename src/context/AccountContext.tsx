/**
 * Account + private data (rules notebook, personal value adjustments).
 * Signed in: stored in Supabase, visible only to you (row-level security). Signed out: saved on this device only.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { DEFAULT_ADJUSTMENTS, type DynastyRule, type ValueAdjustments } from '../types';

const LOCAL_RULES = 'df_private_rules';
const LOCAL_ADJ = 'df_private_adjustments';

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
};
const dropLocal = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const normalizeAdj = (a: Partial<ValueAdjustments> | null | undefined): ValueAdjustments => {
  const merged = { ...DEFAULT_ADJUSTMENTS, ...(a || {}) };
  const pp = [...(merged.pick_premium || [])];
  while (pp.length < DEFAULT_ADJUSTMENTS.pick_premium.length) pp.push(0);
  return { ...merged, pick_premium: pp };
};

interface AccountContextType {
  available: boolean; // Supabase configured on this server
  session: Session | null;
  email: string | null;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  rules: DynastyRule[];
  saveRule: (rule: Partial<DynastyRule> & { title: string }) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  adjustments: ValueAdjustments;
  saveAdjustments: (a: ValueAdjustments) => Promise<void>;
  storage: 'cloud' | 'device';
  error: string | null;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

const missingTables = (msg: string) =>
  /relation .* does not exist|Could not find the table|schema cache/i.test(msg)
    ? 'Your database isn’t set up yet: run supabase/schema.sql in the Supabase SQL Editor.'
    : msg;

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sb, setSb] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [rules, setRules] = useState<DynastyRule[]>(() => readLocal<DynastyRule[]>(LOCAL_RULES, []));
  const [adjustments, setAdjustments] = useState<ValueAdjustments>(() => normalizeAdj(readLocal(LOCAL_ADJ, null)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    getSupabase().then((client) => {
      if (!client) return;
      setSb(client);
      client.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s));
      unsub = () => data.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, []);

  const userId = session?.user.id;

  // On sign-in: load cloud data; move anything saved on this device up to the account once.
  const load = useCallback(async () => {
    if (!sb || !userId) return;
    setError(null);
    try {
      const localRules = readLocal<DynastyRule[]>(LOCAL_RULES, []);
      if (localRules.length) {
        const { error: e } = await sb.from('user_rules').insert(
          localRules.map((r) => ({ user_id: userId, title: r.title, body: r.body, tags: r.tags, pinned: r.pinned, created_at: r.created_at, updated_at: r.updated_at }))
        );
        if (e) throw e;
        dropLocal(LOCAL_RULES);
      }
      const { data: rows, error: e1 } = await sb.from('user_rules').select('*').order('pinned', { ascending: false }).order('updated_at', { ascending: false });
      if (e1) throw e1;
      setRules((rows || []) as DynastyRule[]);

      const { data: st, error: e2 } = await sb.from('user_settings').select('value_adjustments').eq('user_id', userId).maybeSingle();
      if (e2) throw e2;
      const localAdj = readLocal<ValueAdjustments | null>(LOCAL_ADJ, null);
      if (st?.value_adjustments) setAdjustments(normalizeAdj(st.value_adjustments));
      else if (localAdj) {
        await sb.from('user_settings').upsert({ user_id: userId, value_adjustments: localAdj, updated_at: new Date().toISOString() });
        setAdjustments(normalizeAdj(localAdj));
      }
      dropLocal(LOCAL_ADJ);
    } catch (e: any) {
      setError(missingTables(e?.message || 'Couldn’t load your saved data.'));
    }
  }, [sb, userId]);

  useEffect(() => {
    if (userId) load();
    else {
      setRules(readLocal<DynastyRule[]>(LOCAL_RULES, []));
      setAdjustments(normalizeAdj(readLocal(LOCAL_ADJ, null)));
    }
  }, [userId, load]);

  const sortRules = (rs: DynastyRule[]) =>
    [...rs].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));

  const saveRule: AccountContextType['saveRule'] = async (rule) => {
    setError(null);
    const now = new Date().toISOString();
    const clean = { title: rule.title.trim(), body: (rule.body || '').trim(), tags: rule.tags || [], pinned: !!rule.pinned };
    if (sb && userId) {
      const q = rule.id
        ? sb.from('user_rules').update({ ...clean, updated_at: now }).eq('id', rule.id).select().single()
        : sb.from('user_rules').insert({ ...clean, user_id: userId }).select().single();
      const { data, error: e } = await q;
      if (e) return setError(missingTables(e.message));
      setRules((rs) => sortRules([data as DynastyRule, ...rs.filter((r) => r.id !== (data as DynastyRule).id)]));
    } else {
      setRules((rs) => {
        const existing = rs.find((r) => r.id === rule.id);
        const next: DynastyRule = existing
          ? { ...existing, ...clean, updated_at: now }
          : { id: crypto.randomUUID(), ...clean, created_at: now, updated_at: now };
        const out = sortRules([next, ...rs.filter((r) => r.id !== next.id)]);
        writeLocal(LOCAL_RULES, out);
        return out;
      });
    }
  };

  const deleteRule = async (id: string) => {
    setError(null);
    if (sb && userId) {
      const { error: e } = await sb.from('user_rules').delete().eq('id', id);
      if (e) return setError(missingTables(e.message));
    }
    setRules((rs) => {
      const out = rs.filter((r) => r.id !== id);
      if (!userId) writeLocal(LOCAL_RULES, out);
      return out;
    });
  };

  const saveAdjustments = async (a: ValueAdjustments) => {
    setError(null);
    setAdjustments(a);
    if (sb && userId) {
      const { error: e } = await sb.from('user_settings').upsert({ user_id: userId, value_adjustments: a, updated_at: new Date().toISOString() });
      if (e) setError(missingTables(e.message));
    } else writeLocal(LOCAL_ADJ, a);
  };

  const signIn = async (email: string) => {
    if (!sb) throw new Error('Accounts aren’t set up on this server yet.');
    const { error: e } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    if (e) throw new Error(e.message);
  };
  const signOut = async () => {
    await sb?.auth.signOut();
    setSession(null);
  };

  return (
    <AccountContext.Provider
      value={{
        available: !!sb,
        session,
        email: session?.user.email ?? null,
        signIn,
        signOut,
        rules,
        saveRule,
        deleteRule,
        adjustments,
        saveAdjustments,
        storage: userId ? 'cloud' : 'device',
        error,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = (): AccountContextType => {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within an AccountProvider');
  return ctx;
};
