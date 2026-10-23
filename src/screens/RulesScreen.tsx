import React, { useMemo, useState } from 'react';
import { Lock, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { useRoster } from '../context/RosterContext';
import { benchIds, pickCurve } from '../lib/personalValues';
import { fmtShort } from '../lib/leagueStats';
import { SEASON } from '../lib/season';
import type { DynastyRule, ValueAdjustments } from '../types';

const pct = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.round(Math.abs(x) * 100)}%`;

/** Sign in with an emailed link, so rules follow you across devices. */
const AccountBox: React.FC = () => {
  const { available, email, signIn, signOut, storage } = useAccount();
  const [addr, setAddr] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!available)
    return <p className="text-[13px] text-muted">Saved on this device only. Accounts aren’t switched on for this server yet.</p>;
  if (email)
    return (
      <p className="text-[13px] text-muted flex flex-wrap items-center gap-x-3">
        <span>
          Signed in as <span className="font-semibold text-text">{email}</span>. Saved to your account, visible only to you.
        </span>
        <button type="button" className="underline underline-offset-2" onClick={signOut}>
          Sign out
        </button>
      </p>
    );
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await signIn(addr);
          setSent(true);
        } catch (x: any) {
          setErr(x.message);
        }
      }}
    >
      <p className="text-[13px] text-muted">
        {storage === 'device' ? 'Saved on this device only. ' : ''}Sign in to keep your rules private and on every device. We’ll email you a sign-in link.
      </p>
      {sent ? (
        <p className="text-[14px] font-semibold text-up">Check your email for the sign-in link.</p>
      ) : (
        <div className="flex gap-2">
          <input type="email" required value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="you@email.com" className="field" aria-label="Email" />
          <button type="submit" className="btn-primary shrink-0">
            Email link
          </button>
        </div>
      )}
      {err && <p role="alert" className="text-[13px] text-down">{err}</p>}
    </form>
  );
};

const RuleEditor: React.FC<{ rule?: DynastyRule; onDone: () => void }> = ({ rule, onDone }) => {
  const { saveRule } = useAccount();
  const [title, setTitle] = useState(rule?.title ?? '');
  const [body, setBody] = useState(rule?.body ?? '');
  const [tags, setTags] = useState((rule?.tags ?? []).join(', '));
  return (
    <form
      className="rounded-xl bg-card border border-line p-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await saveRule({
          id: rule?.id,
          title,
          body,
          pinned: rule?.pinned ?? false,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        });
        onDone();
      }}
    >
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The rule, in one line" className="field font-semibold" aria-label="Rule" />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Why it works, when to use it, examples from your league"
        rows={4}
        className="field"
        aria-label="Details"
      />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated (picks, trades, rookies)" className="field" aria-label="Tags" />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary">
          Save rule
        </button>
        <button type="button" className="btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
};

const Slider: React.FC<{ label: string; note?: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }> = ({
  label,
  note,
  value,
  min,
  max,
  step,
  show,
  onChange,
}) => (
  <label className="block py-2">
    <span className="flex items-baseline justify-between gap-3">
      <span className="font-semibold text-[14px]">{label}</span>
      <span className="font-semibold">{show(value)}</span>
    </span>
    {note && <span className="block text-[12px] text-muted">{note}</span>}
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-ink)]" />
  </label>
);

const Adjustments: React.FC = () => {
  const { adjustments: adj, saveAdjustments } = useAccount();
  const { evaluation } = useRoster();
  const set = (patch: Partial<ValueAdjustments>) => saveAdjustments({ ...adj, ...patch });
  const curve = useMemo(() => (evaluation?.league_teams?.length ? pickCurve(evaluation.league_teams) : null), [evaluation]);
  const bench = useMemo(
    () => (evaluation ? benchIds(evaluation.players, evaluation.settings, adj.bench_seasons) : new Set<string>()),
    [evaluation, adj.bench_seasons]
  );
  const benchPlayers = (evaluation?.players || []).filter((p) => bench.has(p.id) && p.market_value >= 400).sort((a, b) => b.market_value - a.market_value);
  const first = curve?.find((c) => c.round === 1);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="display text-[24px] text-ink">My value adjustments</h2>
        <p className="text-[14px] text-muted">
          Your own view of value, used only on your screens: the trade builder shows “on your values” next to market value, and Trade → Ideas adds
          deals built from these settings. League values and other managers never see them.
        </p>
      </div>
      <label className="flex items-center gap-3 py-1">
        <input type="checkbox" checked={adj.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="w-5 h-5 accent-[var(--color-ink)]" />
        <span className="font-semibold">Use my adjustments</span>
      </label>

      <div className={adj.enabled ? '' : 'opacity-50 pointer-events-none'}>
        <h3 className="font-semibold text-ink mt-2">Draft picks by how far away they are</h3>
        {first && (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-semibold">1st-round pick</th>
                  {first.byYear.map((y) => (
                    <th key={y.year} className="text-right font-semibold pl-3">
                      {y.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-muted">Market value now</td>
                  {first.byYear.map((y) => (
                    <td key={y.year} className="text-right font-semibold pl-3">
                      {fmtShort(y.value)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="text-muted">Gain by next draft</td>
                  {first.byYear.map((y) => (
                    <td key={y.year} className={`text-right pl-3 ${y.growth_to_next > 0 ? 'text-up' : 'text-muted'}`}>
                      {y.growth_to_next > 0 ? pct(y.growth_to_next) : '–'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <button
              type="button"
              className="btn-quiet mt-2"
              onClick={() =>
                set({
                  pick_premium: adj.pick_premium.map((_, i) => {
                    const y = first.byYear.find((b) => b.year === SEASON.upcomingDraftYear + i) ?? first.byYear[first.byYear.length - 1];
                    return Math.round((y?.growth_to_next ?? 0) * 20) / 20;
                  }),
                })
              }
            >
              Set premiums to the market’s discount
            </button>
          </div>
        )}
        {adj.pick_premium.map((v, i) => (
          <Slider
            key={i}
            label={i === 0 ? `Next draft (${SEASON.upcomingDraftYear})` : `${i} draft${i === 1 ? '' : 's'} out (${SEASON.upcomingDraftYear + i}${i === adj.pick_premium.length - 1 ? '+' : ''})`}
            value={v}
            min={-0.3}
            max={1}
            step={0.05}
            show={pct}
            onChange={(x) => set({ pick_premium: adj.pick_premium.map((y, j) => (j === i ? x : y)) })}
          />
        ))}

        <h3 className="font-semibold text-ink mt-4">Players who won’t start for you</h3>
        <Slider
          label="Value them lower by"
          note="Applies only to your own players outside your best projected lineup."
          value={adj.bench_discount}
          min={0}
          max={0.5}
          step={0.05}
          show={(x) => `${Math.round(x * 100)}%`}
          onChange={(x) => set({ bench_discount: x })}
        />
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="font-semibold text-[14px]">Not starting in any of the next</span>
          <select value={adj.bench_seasons} onChange={(e) => set({ bench_seasons: Number(e.target.value) })} className="field !w-auto">
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} season{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        {benchPlayers.length > 0 && (
          <p className="text-[13px] text-muted">
            On your roster now: {benchPlayers.slice(0, 12).map((p) => p.full_name).join(', ')}
            {benchPlayers.length > 12 ? ` and ${benchPlayers.length - 12} more` : ''}.
          </p>
        )}
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="font-semibold text-[14px]">Ideas: target picks at least</span>
          <select value={adj.ideas_min_years_out} onChange={(e) => set({ ideas_min_years_out: Number(e.target.value) })} className="field !w-auto">
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} draft{n === 1 ? '' : 's'} away
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
};

export const RulesScreen: React.FC = () => {
  const { rules, deleteRule, saveRule, error } = useAccount();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const tags = [...new Set(rules.flatMap((r) => r.tags))].sort();
  const shown = tag ? rules.filter((r) => r.tags.includes(tag)) : rules;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="display text-[28px] text-ink flex items-center gap-2">
            Rules to dynasty by <Lock className="w-4 h-4 text-muted" aria-label="Private" />
          </h2>
          <p className="text-[14px] text-muted">Your private playbook: what’s worked, what hasn’t, and why. Only you can see it.</p>
        </div>
        <AccountBox />
        {error && (
          <p role="alert" className="text-[14px] text-down">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[null, ...tags].map((t) => (
              <button
                key={t ?? 'all'}
                type="button"
                onClick={() => setTag(t)}
                aria-pressed={tag === t}
                className={`rounded-full px-3 py-1 text-[13px] font-semibold border ${tag === t ? 'bg-ink text-paper border-ink' : 'border-line text-muted'}`}
              >
                {t ?? 'All'}
              </button>
            ))}
          </div>
        )}
        {editing === 'new' ? (
          <RuleEditor onDone={() => setEditing(null)} />
        ) : (
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4" /> Add a rule
          </button>
        )}
        {rules.length === 0 && editing !== 'new' && <p className="text-muted">No rules yet. Write down the first thing you always do in a trade.</p>}
        <ul className="space-y-3">
          {shown.map((r, i) =>
            editing === r.id ? (
              <li key={r.id}>
                <RuleEditor rule={r} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className="rounded-xl bg-card border border-line p-4">
                <div className="flex items-start gap-3">
                  <span className="display text-[22px] text-gold w-6 shrink-0 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <h3 className="font-semibold text-ink text-[16px]">{r.title}</h3>
                    {r.body && <p className="text-[14px] whitespace-pre-line">{r.body}</p>}
                    {r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded px-1.5 py-px text-[12px] font-semibold bg-ink-soft text-ink">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 -mr-1">
                    <button type="button" className="p-1.5 text-muted hover:text-ink" aria-label={r.pinned ? 'Unpin' : 'Pin to top'} onClick={() => saveRule({ ...r, pinned: !r.pinned })}>
                      {r.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button type="button" className="p-1.5 text-muted hover:text-ink" aria-label="Edit" onClick={() => setEditing(r.id)}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 text-muted hover:text-down"
                      aria-label="Delete"
                      onClick={() => {
                        if (window.confirm(`Delete “${r.title}”?`)) deleteRule(r.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      </section>

      <Adjustments />
    </div>
  );
};
