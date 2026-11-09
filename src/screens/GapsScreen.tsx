import React, { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { useLeagueUniverse, useReference } from '../lib/useReference';
import { gapOf, SOURCE_LABEL } from '../lib/referenceValues';
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

/** The values your league mates trade on. Only the FantasyCalc trade market for now (imported lists like KTC were
 *  removed 9 Nov 2026: KTC's terms don't allow its data in other apps, and we have our own trade data). */
export const ReferencePicker: React.FC<{ compact?: boolean }> = () => (
  <p className="text-[13px] text-muted flex items-center gap-1.5">
    <Lock className="w-3 h-3" aria-label="Private" /> Compared with the values most leagues trade on: {SOURCE_LABEL.market}.
  </p>
);

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
