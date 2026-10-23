import React, { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { useAccount } from '../context/AccountContext';
import { useLeagueUniverse, useReference } from '../lib/useReference';
import { gapOf, parseImported, SOURCE_LABEL, type ImportedValues, type ReferenceSource } from '../lib/referenceValues';
import { fmt, pickName } from '../lib/leagueStats';

interface GapRow {
  key: string;
  name: string;
  pos: string;
  owner: string;
  ownerId: string;
  ours: number;
  theirs: number;
  gap: number;
}

/** Choose which values your league mates use; import a list privately. */
export const ReferencePicker: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { reference, saveReference } = useAccount();
  const universe = useLeagueUniverse();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [label, setLabel] = useState(reference.imported?.label ?? 'KTC');
  const [msg, setMsg] = useState<string | null>(null);
  const imp = reference.imported;

  const doImport = (merge: boolean) => {
    const known = universe.players.map((p) => p.full_name);
    const parsed = parseImported(text, known, label.trim() || 'Imported');
    if (!parsed.players.length && !parsed.picks.length) {
      setMsg('Couldn’t find any players from your league with values in that text.');
      return;
    }
    let next: ImportedValues = parsed;
    if (merge && imp) {
      const players = new Map(imp.players.map((p) => [p.key, p]));
      parsed.players.forEach((p) => players.set(p.key, p));
      const picks = new Map(imp.picks.map((p) => [`${p.year}-${p.round}-${p.tier}`, p]));
      parsed.picks.forEach((p) => picks.set(`${p.year}-${p.round}-${p.tier}`, p));
      next = { ...parsed, players: [...players.values()], picks: [...picks.values()] };
    }
    saveReference({ source: 'imported', imported: next });
    setMsg(`Imported ${parsed.players.length} players and ${parsed.picks.length} picks${merge && imp ? ` (now ${next.players.length} and ${next.picks.length} in total)` : ''}.`);
    setText('');
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[13px] font-semibold text-muted flex items-center gap-1.5">
          Values my league uses <Lock className="w-3 h-3" aria-label="Private" />
        </span>
        <select
          value={reference.source}
          onChange={(e) => {
            const s = e.target.value as ReferenceSource;
            if (s === 'imported' && !imp) setOpen(true);
            saveReference({ ...reference, source: s });
          }}
          className="field mt-1"
        >
          <option value="market">{SOURCE_LABEL.market}</option>
          <option value="experts">{SOURCE_LABEL.experts}</option>
          <option value="imported">{imp ? `${imp.label} (imported ${new Date(imp.imported_at).toLocaleDateString()})` : 'KTC or another list (import)'}</option>
        </select>
      </label>
      {reference.source === 'imported' && (
        <button type="button" className="text-[13px] underline underline-offset-2 text-muted" onClick={() => setOpen(!open)}>
          {imp ? 'Update imported values' : 'Import values'}
        </button>
      )}
      {msg && <p className="text-[13px] text-up">{msg}</p>}
      {open && (
        <div className="space-y-2 rounded-lg border border-line p-3">
          {!compact && (
            <p className="text-[13px] text-muted">
              Open the KTC dynasty rankings in your league’s format (1QB or Superflex), select the whole page, copy, and paste it here. If the
              rankings span several pages, paste each one with “Add to list”. A simple “name, value” list works too. Saved privately; never
              shared or published.
            </p>
          )}
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="field" aria-label="Name of this list" placeholder="List name, e.g. KTC" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="field font-mono text-[12px]" placeholder="Paste rankings here" aria-label="Pasted rankings" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!text.trim()} onClick={() => doImport(false)}>
              Replace list
            </button>
            {imp && (
              <button type="button" className="btn-quiet" disabled={!text.trim()} onClick={() => doImport(true)}>
                Add to list
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const GapsScreen: React.FC = () => {
  const { evaluation } = useRoster();
  const ref = useReference();
  const [minGap, setMinGap] = useState(0.1);

  const rows = useMemo(() => {
    if (!evaluation || !ref) return null;
    const me = evaluation.roster.franchise_id;
    const out: GapRow[] = [];
    const add = (key: string, name: string, pos: string, ownerId: string, owner: string, ours: number, theirs: number | null) => {
      const g = gapOf(ours, theirs);
      if (g == null || ours < 500) return;
      out.push({ key, name, pos, owner, ownerId, ours, theirs: theirs!, gap: g });
    };
    for (const p of evaluation.players) add(`p${p.id}`, p.full_name, p.position, me, 'You', p.market_value, ref.player(p));
    for (const k of evaluation.draft_picks || []) add(`k${k.id}`, pickName(k, me), 'Pick', me, 'You', k.market_value, ref.pick(k));
    for (const t of evaluation.league_teams || []) {
      if (t.franchise_id === me) continue;
      for (const p of [...t.starters, ...t.bench, ...(t.reserves || [])]) add(`p${p.id}`, p.full_name, p.position, t.franchise_id, t.franchise_name, p.market_value, ref.player(p));
      for (const k of t.draft_picks) add(`k${t.franchise_id}${k.id}`, pickName(k, t.franchise_id), 'Pick', t.franchise_id, t.franchise_name, k.market_value, ref.pick(k));
    }
    const diff = (r: GapRow) => r.theirs - r.ours;
    return {
      sell: out.filter((r) => r.ownerId === me && r.gap >= minGap).sort((a, b) => diff(b) - diff(a)).slice(0, 15),
      buy: out.filter((r) => r.ownerId !== me && r.gap <= -minGap).sort((a, b) => diff(a) - diff(b)).slice(0, 20),
      keep: out.filter((r) => r.ownerId === me && r.gap <= -minGap).sort((a, b) => diff(a) - diff(b)).slice(0, 10),
    };
  }, [evaluation, ref, minGap]);

  const table = (list: GapRow[], showOwner: boolean) =>
    list.length === 0 ? (
      <p className="py-3 text-muted">Nothing past the threshold.</p>
    ) : (
      <ol className="divide-y divide-line border-y border-line">
        {list.map((r) => (
          <li key={r.key} className="flex items-center gap-3 py-2.5">
            <span className="w-9 shrink-0 text-[12px] font-semibold text-muted">{r.pos}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">{r.name}</span>
              <span className="block text-[13px] text-muted truncate">
                Ours {fmt(r.ours)} · theirs {fmt(r.theirs)}
                {showOwner ? ` · ${r.owner}` : ''}
              </span>
            </span>
            <span className={`shrink-0 text-right font-semibold ${r.gap > 0 ? 'text-up' : 'text-down'}`}>
              {r.gap > 0 ? '+' : '−'}
              {Math.round(Math.abs(r.gap) * 100)}%
              <span className="block text-[12px] font-normal text-muted">
                {r.theirs - r.ours > 0 ? '+' : '−'}
                {fmt(Math.abs(r.theirs - r.ours))}
              </span>
            </span>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="space-y-6">
      <p className="text-[14px] text-muted">
        Where the values your league mates trade on disagree with Futures Value. Sell what they overvalue, buy what they undervalue, and use
        “Looks fair on” in Ideas to build deals that seem even to them.
      </p>
      <section className="rounded-xl bg-card border border-line p-4 space-y-3">
        <ReferencePicker />
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted">Show gaps of at least</span>
          <select value={minGap} onChange={(e) => setMinGap(Number(e.target.value))} className="field !w-auto">
            {[0.05, 0.1, 0.15, 0.25].map((g) => (
              <option key={g} value={g}>
                {Math.round(g * 100)}%
              </option>
            ))}
          </select>
        </label>
      </section>

      {!ref ? (
        <p className="text-muted">Import a list to compare against it.</p>
      ) : (
        rows && (
          <>
            <section className="space-y-1">
              <h2 className="display text-[24px] text-ink">Sell: they value yours higher</h2>
              <p className="text-[14px] text-muted">Your players and picks worth more on {ref.label} than on Futures Value.</p>
              {table(rows.sell, false)}
            </section>
            <section className="space-y-1">
              <h2 className="display text-[24px] text-ink">Buy: cheaper on their values</h2>
              <p className="text-[14px] text-muted">Other teams’ players and picks that {ref.label} rates below Futures Value.</p>
              {table(rows.buy, true)}
            </section>
            <section className="space-y-1">
              <h2 className="display text-[24px] text-ink">Hold: they’d lowball you</h2>
              <p className="text-[14px] text-muted">Yours that {ref.label} undervalues. Don’t sell these at their price.</p>
              {table(rows.keep, false)}
            </section>
            <p className="text-[12px] text-muted">
              {ref.source === 'imported'
                ? 'Imported values are put on our scale by rank: the 20th-ranked asset on their list gets the value of our 20th-ranked asset.'
                : 'Shown on the shared Futures Value scale.'}{' '}
              Assets under 500 on our values, or under 300 on theirs (usually not tracked), are hidden.
            </p>
          </>
        )
      )}
    </div>
  );
};
