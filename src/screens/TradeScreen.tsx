import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { RosterDNAMathEngine } from '../lib/rosterMath';
import { fmt, fmtShort, ordinal, pickName } from '../lib/leagueStats';
import { apiPost } from '../lib/api';
import type { TradeImpactRow } from '../lib/assets';
import { PlayerRow } from '../components/PlayerRow';
import { useAccount } from '../context/AccountContext';
import { benchIds, myAssetValue } from '../lib/personalValues';
import { useReference } from '../lib/useReference';
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
  const { evaluation, partnerId, setPartnerId, tradeDraft, clearTradeDraft, leagueRequest } = useRoster();
  const [fiveYear, setFiveYear] = useState<TradeImpactRow[]>([]);
  const [give, setGive] = useState<Asset[]>([]);
  const [get, setGet] = useState<Asset[]>([]);
  const { adjustments } = useAccount();
  const ref = useReference();
  const bench = useMemo(
    () => (evaluation && adjustments.enabled ? benchIds(evaluation.players, evaluation.settings, adjustments.bench_seasons) : new Set<string>()),
    [evaluation, adjustments.enabled, adjustments.bench_seasons]
  );

  // A trade opened from Ideas (or elsewhere): fill both sides once.
  useEffect(() => {
    if (!tradeDraft || !evaluation) return;
    const partnerTeam = evaluation.league_teams?.find((t) => t.franchise_id === tradeDraft.partnerId);
    if (!partnerTeam) return clearTradeDraft();
    const mine: Asset[] = [
      ...evaluation.players.map((p) => ({ kind: 'player' as const, item: p })),
      ...(evaluation.draft_picks || []).map((p) => ({ kind: 'pick' as const, item: p })),
    ];
    const theirs: Asset[] = [
      ...[...partnerTeam.starters, ...partnerTeam.bench, ...(partnerTeam.reserves || [])].map((p) => ({ kind: 'player' as const, item: p })),
      ...partnerTeam.draft_picks.map((p) => ({ kind: 'pick' as const, item: p })),
    ];
    setGive(mine.filter((a) => tradeDraft.give.includes(assetId(a))));
    setGet(theirs.filter((a) => tradeDraft.get.includes(assetId(a))));
    clearTradeDraft();
  }, [tradeDraft, evaluation]);

  // Five-season view (computed on the server): each team's projected lineup and league rank, before and after.
  const lr = leagueRequest();
  const impactPartner =
    partnerId ||
    [...(evaluation?.league_teams || [])].sort((a, b) => a.power_rank - b.power_rank).find((t) => t.franchise_id !== evaluation?.roster.franchise_id)
      ?.franchise_id ||
    '';
  const giveKey = give.map(assetId).join();
  const getKey = get.map(assetId).join();
  useEffect(() => {
    if (!lr || !impactPartner || (!give.length && !get.length)) return setFiveYear([]);
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      apiPost<{ rows: TradeImpactRow[] }>(
        '/api/trade/impact',
        { ...lr, partner_id: impactPartner, give: give.map(assetId), get: get.map(assetId) },
        ctl.signal
      )
        .then((d) => setFiveYear(d.rows))
        .catch(() => setFiveYear([]));
    }, 250);
    return () => {
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [lr?.league_id, lr?.franchise_id, impactPartner, giveKey, getKey]);

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
  const redraftMode = settings?.format === 'redraft';
  const meBefore = measure(mySide, settings, baseline);
  const meAfter = measure(applyTrade(mySide, give, get), settings, baseline);
  const themBefore = measure(theirSide, settings, baseline);
  const themAfter = measure(applyTrade(theirSide, get, give), settings, baseline);
  const hasTrade = give.length > 0 || get.length > 0;

  const impactRows = (b: typeof meBefore, a: typeof meAfter) => [
    { name: 'Lineup strength', b: b.lineup, a: a.lineup, show: (v: number) => `${Math.round(v)}` },
    ...(redraftMode
      ? []
      : [
          { name: 'Prime years left', b: b.prime, a: a.prime, show: (v: number) => `${v.toFixed(1)} yrs` },
          { name: 'Draft capital', b: b.picks, a: a.picks, show: (v: number) => fmtShort(v) },
        ]),
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
              {ref && (() => {
                const theirs = get.reduce((t, a) => t + ref.asset(a), 0) - give.reduce((t, a) => t + ref.asset(a), 0);
                return (
                  <p className="mt-1 text-[14px]">
                    <span className="font-semibold">On {ref.label.replace(/ \(.*\)$/, '')}: </span>
                    <span className={Math.abs(theirs) < Math.max(giveTotal, getTotal) * 0.05 ? 'font-semibold' : theirs > 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
                      {Math.abs(theirs) < Math.max(giveTotal, getTotal) * 0.05 ? 'about even' : `${theirs > 0 ? '+' : '−'}${fmt(Math.abs(theirs))} for you`}
                    </span>
                    <span className="text-muted"> (what your league mates will likely see)</span>
                  </p>
                );
              })()}
              {adjustments.enabled && (() => {
                const mine = get.reduce((t, a) => t + myAssetValue(a, false, bench, adjustments), 0) - give.reduce((t, a) => t + myAssetValue(a, true, bench, adjustments), 0);
                if (Math.round(mine) === Math.round(diff)) return null;
                return (
                  <p className="mt-1 text-[14px]">
                    <span className="font-semibold">On your values: </span>
                    <span className={mine >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
                      {mine >= 0 ? '+' : '−'}
                      {fmt(Math.abs(mine))}
                    </span>
                    <span className="text-muted"> (your private adjustments)</span>
                  </p>
                );
              })()}
            </div>
          )}

          {(() => {
            const watch = get
              .filter((a) => a.kind === 'player')
              .map((a) => ({ p: a.item as MasterPlayer, c: (a.item as MasterPlayer).futures?.nfl_contract }))
              .filter((x) => x.c && x.c.events.length);
            if (!watch.length) return null;
            return (
              <div className="rounded-lg bg-ink-soft px-3 py-2.5 text-[14px] space-y-1">
                <div className="font-semibold text-ink">Contract watch</div>
                {watch.map(({ p, c }) => {
                  const out = c!.by_season.find((r) => r.season === c!.out_year);
                  return (
                    <p key={p.id}>
                      <span className="font-semibold">{p.full_name}</span>:{' '}
                      {c!.out_year && out
                        ? `his team can cut him before ${c!.out_year} and save $${out.savings_if_cut}M. `
                        : `protected by guaranteed money through ${c!.through}. `}
                      Free agent in {c!.free_agent_year}
                      {c!.option_year ? ` (if the ${c!.option_year} option is picked up)` : ''}.{' '}
                      <span className="text-muted">
                        {c!.events.map((e) => `${Math.round(e.probability * 100)}% ${e.kind === 'free_agent' ? 'leaves' : 'cut'} by ${e.season}`).join(', ')}
                        , already in the projections.
                      </span>
                    </p>
                  );
                })}
              </div>
            );
          })()}

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

          {settings?.salary_cap && (() => {
            const sal = (list: Asset[]) => list.reduce((s, a) => s + (a.kind === 'player' ? a.item.contract?.salary ?? 0 : 0), 0);
            const cap = settings.salary_cap!.cap;
            const meAfterHit = (evaluation.cap?.hit ?? 0) - sal(give) + sal(get);
            const themAfterHit = (partner.cap?.hit ?? 0) - sal(get) + sal(give);
            const line = (label: string, hit: number) => (
              <div className="py-2 flex items-baseline justify-between gap-3">
                <span className="text-muted text-[14px]">{label}</span>
                <span className={`font-semibold ${hit > cap ? 'text-down' : ''}`}>
                  ${fmt(cap - hit)} {hit > cap ? 'over the cap' : 'cap space'}
                </span>
              </div>
            );
            return (
              <div className="divide-y divide-line">
                <h3 className="font-semibold text-ink pb-1">Cap after the trade</h3>
                {line('You', meAfterHit)}
                {line(partner.franchise_name, themAfterHit)}
              </div>
            );
          })()}

          {fiveYear.length > 0 && (
            <div className="space-y-2">
              <h3 className="display text-[22px] text-ink">{redraftMode ? 'Rest of this season' : 'Over the next five seasons'}</h3>
              <p className="text-[13px] text-muted">
                {redraftMode
                  ? 'Projected starting lineup points per week for the rest of the season and league rank.'
                  : 'Projected starting lineup points per week (including expected points from picks) and league rank.'}
              </p>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[20rem] text-[14px]">
                  <thead>
                    <tr className="text-muted text-[13px] border-b border-line">
                      <th className="text-left font-semibold py-1.5">Season</th>
                      <th className="text-right font-semibold py-1.5">You</th>
                      <th className="text-right font-semibold py-1.5 truncate max-w-[8rem]">{partner.franchise_name}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {fiveYear.map((r) => {
                      const cell = (v: { before: number; after: number }, rk: { before: number; after: number }) => {
                        const d = Math.round((v.after - v.before) * 10) / 10;
                        return (
                          <td className="py-2 text-right">
                            <span className="font-semibold">{ordinal(rk.after)}</span>
                            {rk.after !== rk.before && <span className="text-muted"> (was {ordinal(rk.before)})</span>}
                            <span className={`block text-[12px] ${d > 0 ? 'text-up' : d < 0 ? 'text-down' : 'text-muted'}`}>
                              {d === 0 ? 'no change' : `${d > 0 ? '+' : '−'}${Math.abs(d)} pts/wk`}
                            </span>
                          </td>
                        );
                      };
                      return (
                        <tr key={r.season}>
                          <td className="py-2 font-semibold">{r.season}</td>
                          {cell(r.me, r.meRank)}
                          {cell(r.them, r.themRank)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button type="button" className="btn-quiet" onClick={() => { setGive([]); setGet([]); }}>
            Clear trade
          </button>
        </section>
      )}
    </div>
  );
};
