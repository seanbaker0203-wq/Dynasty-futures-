import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { RosterDNAMathEngine } from '../lib/rosterMath';
import { fmt, fmtShort, pickName } from '../lib/leagueStats';
import { PlayerRow } from '../components/PlayerRow';
import type { DraftPick, LeagueSettings, MasterPlayer } from '../types';

type Asset = { kind: 'player'; item: MasterPlayer } | { kind: 'pick'; item: DraftPick };
const assetId = (a: Asset) => `${a.kind}:${a.item.id}`;
const assetValue = (a: Asset) => a.item.market_value;

interface Side {
  players: MasterPlayer[]; // whole roster incl. taxi / IR
  picks: DraftPick[];
}

/** Lineup strength (vs league median), prime years and pick value for a roster. */
function measure(side: Side, settings: LeagueSettings | undefined, baseline: number) {
  const active = side.players.filter((p) => p.roster_designation !== 'TAXI' && p.roster_designation !== 'IR');
  const { starters } = RosterDNAMathEngine.splitStartersAndBench(active, [], settings);
  return {
    lineup: RosterDNAMathEngine.calculateGrossLiquidity(starters, baseline),
    prime: RosterDNAMathEngine.calculateAssetHalfLife(side.players),
    picks: side.picks.reduce((s, p) => s + p.market_value, 0),
  };
}

function applyTrade(side: Side, out: Asset[], incoming: Asset[]): Side {
  const outIds = new Set(out.map(assetId));
  return {
    players: [
      ...side.players.filter((p) => !outIds.has(`player:${p.id}`)),
      ...incoming.filter((a) => a.kind === 'player').map((a) => ({ ...(a.item as MasterPlayer), roster_designation: 'ACTIVE' as const })),
    ],
    picks: [...side.picks.filter((p) => !outIds.has(`pick:${p.id}`)), ...incoming.filter((a) => a.kind === 'pick').map((a) => a.item as DraftPick)],
  };
}

const Delta: React.FC<{ before: number; after: number; show: (v: number) => string }> = ({ before, after, show }) => {
  const d = after - before;
  const zero = Math.abs(d) < 0.05;
  return (
    <span className="text-right">
      <span className="font-semibold">{show(after)}</span>{' '}
      <span className={`text-[13px] ${zero ? 'text-muted' : d > 0 ? 'text-up' : 'text-down'}`}>
        {zero ? 'no change' : `${d > 0 ? '+' : ''}${show(d)}`}
      </span>
    </span>
  );
};

/** One side of the deal: chosen assets plus a searchable picker for the rest of that roster. */
const AssetColumn: React.FC<{
  title: string;
  ownerId: string;
  roster: Side;
  chosen: Asset[];
  toggle: (a: Asset) => void;
}> = ({ title, ownerId, roster, chosen, toggle }) => {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const chosenIds = new Set(chosen.map(assetId));
  const total = chosen.reduce((s, a) => s + assetValue(a), 0);

  const options: Asset[] = [
    ...[...roster.players].sort((a, b) => b.market_value - a.market_value).map((p) => ({ kind: 'player' as const, item: p })),
    ...[...roster.picks].sort((a, b) => a.year - b.year || a.round - b.round).map((p) => ({ kind: 'pick' as const, item: p })),
  ].filter((a) => {
    if (!q.trim()) return true;
    const name = a.kind === 'player' ? a.item.full_name : pickName(a.item, ownerId);
    return name.toLowerCase().includes(q.trim().toLowerCase());
  });

  return (
    <section className="rounded-xl bg-card border border-line p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[22px] text-ink">{title}</h2>
        <span className="font-semibold">{fmt(total)}</span>
      </div>

      {chosen.length === 0 ? (
        <p className="text-muted text-[14px]">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {chosen.map((a) => (
            <li key={assetId(a)} className="flex items-center gap-2">
              {a.kind === 'player' ? (
                <div className="flex-1 min-w-0">
                  <PlayerRow player={a.item} />
                </div>
              ) : (
                <div className="flex-1 py-2.5 flex items-center gap-3">
                  <span className="w-8 shrink-0 text-[12px] font-semibold text-muted">Pick</span>
                  <span className="flex-1 font-semibold">{pickName(a.item, ownerId)}</span>
                  <span className="font-semibold">{fmt(a.item.market_value)}</span>
                </div>
              )}
              <button type="button" onClick={() => toggle(a)} aria-label="Remove" className="p-1.5 rounded-md text-muted hover:text-down">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!picking ? (
        <button type="button" className="btn-quiet w-full justify-center" onClick={() => setPicking(true)}>
          <Plus className="w-4 h-4" /> Add player or pick
        </button>
      ) : (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search players and picks"
                className="field !pl-9"
                aria-label={`Search ${title.toLowerCase()}`}
              />
            </div>
            <button type="button" className="btn-quiet" onClick={() => { setPicking(false); setQ(''); }}>
              Done
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-line">
            {options.map((a) =>
              a.kind === 'player' ? (
                <PlayerRow key={assetId(a)} player={a.item} onClick={() => toggle(a)} selected={chosenIds.has(assetId(a))} />
              ) : (
                <button
                  key={assetId(a)}
                  type="button"
                  aria-pressed={chosenIds.has(assetId(a))}
                  onClick={() => toggle(a)}
                  className={`w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left hover:bg-ink-soft ${chosenIds.has(assetId(a)) ? 'bg-ink-soft' : ''}`}
                >
                  <span className="w-8 shrink-0 text-[12px] font-semibold text-muted">Pick</span>
                  <span className="flex-1 font-semibold">{pickName(a.item, ownerId)}</span>
                  <span className="font-semibold">{fmt(a.item.market_value)}</span>
                </button>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export const TradeScreen: React.FC = () => {
  const { evaluation, partnerId, setPartnerId } = useRoster();
  const [give, setGive] = useState<Asset[]>([]);
  const [get, setGet] = useState<Asset[]>([]);

  const ctx = useMemo(() => {
    if (!evaluation) return null;
    const me = evaluation.roster.franchise_id;
    const teams = [...(evaluation.league_teams || [])].sort((a, b) => a.power_rank - b.power_rank);
    const mineSummary = teams.find((t) => t.franchise_id === me);
    const baseline =
      mineSummary && mineSummary.gross_liquidity > 0 ? (mineSummary.starter_value / mineSummary.gross_liquidity) * 100 : RosterDNAMathEngine.DEFAULT_LEAGUE_BASELINE_VALUE;
    return { me, teams, baseline };
  }, [evaluation]);

  if (!evaluation || !ctx) return null;
  const { me, teams, baseline } = ctx;
  const others = teams.filter((t) => t.franchise_id !== me);
  const partner = others.find((t) => t.franchise_id === partnerId) || others[0];
  if (!partner) return <p className="text-muted">Load a league with at least two teams to build trades.</p>;

  const mySide: Side = { players: evaluation.players, picks: evaluation.draft_picks || [] };
  const theirSide: Side = {
    players: [...partner.starters, ...partner.bench, ...(partner.reserves || [])],
    picks: partner.draft_picks,
  };

  const toggle = (list: Asset[], set: (a: Asset[]) => void) => (a: Asset) =>
    set(list.some((x) => assetId(x) === assetId(a)) ? list.filter((x) => assetId(x) !== assetId(a)) : [...list, a]);

  const giveTotal = give.reduce((s, a) => s + assetValue(a), 0);
  const getTotal = get.reduce((s, a) => s + assetValue(a), 0);
  const diff = getTotal - giveTotal;
  const bigger = Math.max(giveTotal, getTotal);
  const pct = bigger ? Math.abs(diff) / bigger : 0;
  const best = (list: Asset[]) => Math.max(0, ...list.filter((a) => a.kind === 'player').map(assetValue));

  let verdict = '';
  if (give.length && get.length) {
    if (pct <= 0.05) verdict = 'Even on value.';
    else if (diff > 0) verdict = pct <= 0.15 ? 'Slightly in your favour.' : 'Clearly in your favour. Expect pushback.';
    else verdict = pct <= 0.15 ? 'Slightly in their favour.' : 'Clearly in their favour.';
    const consolidating = (give.length > get.length && best(get) > best(give)) || (get.length > give.length && best(give) > best(get));
    if (consolidating) verdict += ' The side getting the best player in a 2-for-1 usually pays a premium beyond raw value.';
  }

  const settings = evaluation.settings;
  const meBefore = measure(mySide, settings, baseline);
  const meAfter = measure(applyTrade(mySide, give, get), settings, baseline);
  const themBefore = measure(theirSide, settings, baseline);
  const themAfter = measure(applyTrade(theirSide, get, give), settings, baseline);
  const hasTrade = give.length > 0 || get.length > 0;

  const impactRows = (b: typeof meBefore, a: typeof meAfter) => [
    { name: 'Lineup strength', b: b.lineup, a: a.lineup, show: (v: number) => `${Math.round(v)}` },
    { name: 'Prime years left', b: b.prime, a: a.prime, show: (v: number) => `${v.toFixed(1)} yrs` },
    { name: 'Draft capital', b: b.picks, a: a.picks, show: (v: number) => fmtShort(v) },
  ];

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-muted shrink-0">Trade with</span>
        <select
          value={partner.franchise_id}
          onChange={(e) => {
            setPartnerId(e.target.value);
            setGet([]);
          }}
          className="field min-w-0 sm:max-w-sm"
        >
          {others.map((t) => (
            <option key={t.franchise_id} value={t.franchise_id}>
              {t.power_rank}. {t.franchise_name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[14px] text-muted -mt-2">
        {partner.stance_label}. {partner.stance_description}
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <AssetColumn title="You give" ownerId={me} roster={mySide} chosen={give} toggle={toggle(give, setGive)} />
        <AssetColumn title="You get" ownerId={partner.franchise_id} roster={theirSide} chosen={get} toggle={toggle(get, setGet)} />
      </div>

      {hasTrade && (
        <section className="space-y-4" aria-live="polite">
          {verdict && (
            <div className="border-y border-line py-3">
              <div className="display text-[26px] text-ink">
                {diff === 0 ? 'Even' : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}`}
                <span className="text-[16px] text-muted font-sans font-medium"> value for you</span>
              </div>
              <p>{verdict}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: 'Your team after', rows: impactRows(meBefore, meAfter) },
              { title: `${partner.franchise_name} after`, rows: impactRows(themBefore, themAfter) },
            ].map((block) => (
              <div key={block.title}>
                <h3 className="font-semibold text-ink truncate">{block.title}</h3>
                <dl className="divide-y divide-line">
                  {block.rows.map((r) => (
                    <div key={r.name} className="py-2 flex items-baseline justify-between gap-3">
                      <dt className="text-muted text-[14px]">{r.name}</dt>
                      <dd>
                        <Delta before={r.b} after={r.a} show={r.show} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <button type="button" className="btn-quiet" onClick={() => { setGive([]); setGet([]); }}>
            Clear trade
          </button>
        </section>
      )}
    </div>
  );
};
