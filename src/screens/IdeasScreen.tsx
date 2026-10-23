import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { fmt, pickName } from '../lib/leagueStats';
import { findTrades, finderAssetId, type FinderAsset, type TradeIdea } from '../lib/tradeFinder';
import { ManagerProfileNote } from '../components/ManagerProfile';
import { useAccount } from '../context/AccountContext';
import { findPersonalIdeas } from '../lib/personalValues';
import { Lock } from 'lucide-react';

const assetLine = (a: FinderAsset, ownerId: string) => (
  <li key={finderAssetId(a)} className="flex items-baseline justify-between gap-2">
    <span className="min-w-0 truncate">
      <span className="text-[12px] font-semibold text-muted mr-1.5">{a.kind === 'player' ? a.item.position : 'Pick'}</span>
      {a.kind === 'player' ? a.item.full_name : pickName(a.item, ownerId)}
    </span>
    <span className="text-muted shrink-0">{fmt(a.item.market_value)}</span>
  </li>
);

/** Trade → Ideas: who to call and with what. */
export const IdeasScreen: React.FC = () => {
  const { evaluation, history, loadHistory, isDemo, openTrade } = useRoster();
  const [ideas, setIdeas] = useState<TradeIdea[] | null>(null);
  const [sellId, setSellId] = useState<string>('');
  const [want, setWant] = useState<string[]>([]);
  const filtered = !!sellId || want.length > 0;
  const { adjustments } = useAccount();
  const personal = useMemo(
    () =>
      evaluation && adjustments.enabled
        ? findPersonalIdeas({
            me: evaluation.roster.franchise_id,
            players: evaluation.players,
            picks: evaluation.draft_picks || [],
            teams: evaluation.league_teams || [],
            settings: evaluation.settings,
            seasons: (evaluation.season_outlook || []).map((o) => o.season),
            adj: adjustments,
          })
        : [],
    [evaluation, adjustments]
  );

  useEffect(() => {
    if (!isDemo) loadHistory();
  }, [isDemo]);

  // Run after first paint so the spinner shows; recompute when profiles arrive.
  useEffect(() => {
    if (!evaluation) return;
    setIdeas(null);
    const id = window.setTimeout(() => {
      setIdeas(
        findTrades({
          me: evaluation.roster.franchise_id,
          mine: { players: evaluation.players, picks: evaluation.draft_picks || [] },
          teams: evaluation.league_teams || [],
          settings: evaluation.settings,
          seasons: (evaluation.season_outlook || []).map((o) => o.season),
          profiles: history?.profiles,
          capHits: evaluation.settings?.salary_cap
            ? Object.fromEntries([
                [evaluation.roster.franchise_id, evaluation.cap?.hit ?? 0],
                ...(evaluation.league_teams || []).filter((t) => t.cap).map((t) => [t.franchise_id, t.cap!.hit]),
              ])
            : undefined,
          sellId: sellId || null,
          wantPositions: want,
        })
      );
    }, 30);
    return () => window.clearTimeout(id);
  }, [evaluation, history, sellId, want]);

  const byPartner = useMemo(() => {
    const m = new Map<string, TradeIdea[]>();
    for (const i of ideas || []) m.set(i.partner_id, [...(m.get(i.partner_id) || []), i]);
    return [...m.values()];
  }, [ideas]);

  if (!evaluation) return null;
  if (!evaluation.season_outlook?.length)
    return <p className="text-muted">Trade ideas need season projections. Connect a real league to see them.</p>;

  const me = evaluation.roster.franchise_id;
  const seasons = evaluation.season_outlook.map((o) => o.season);
  const myAssets = [
    ...[...evaluation.players].filter((p) => p.market_value >= 300).sort((a, b) => b.market_value - a.market_value).map((p) => ({ id: `player:${p.id}`, label: `${p.position} ${p.full_name} (${fmt(p.market_value)})` })),
    ...[...(evaluation.draft_picks || [])].filter((p) => p.market_value >= 300).sort((a, b) => a.year - b.year || a.round - b.round).map((p) => ({ id: `pick:${p.id}`, label: `${pickName(p, me)} (${fmt(p.market_value)})` })),
  ];
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const sellName = myAssets.find((a) => a.id === sellId)?.label.replace(/ \(.*\)$/, '').replace(/^(QB|RB|WR|TE|K|DEF) /, '');

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-card border border-line p-4 space-y-3" aria-label="Trade search">
        <label className="block">
          <span className="text-[13px] font-semibold text-muted">Trade away</span>
          <select value={sellId} onChange={(e) => setSellId(e.target.value)} className="field mt-1">
            <option value="">Anyone (best fits)</option>
            {myAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="text-[13px] font-semibold text-muted">Looking for</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[null, ...positions].map((pos) => {
              const on = pos ? want.includes(pos) : want.length === 0;
              return (
                <button
                  key={pos ?? 'any'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setWant(pos ? (want.includes(pos) ? want.filter((w) => w !== pos) : [...want, pos]) : [])}
                  className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold border ${on ? 'bg-ink text-paper border-ink' : 'border-line text-muted'}`}
                >
                  {pos ?? 'Any position'}
                </button>
              );
            })}
          </div>
        </div>
        {filtered && (
          <button type="button" className="text-[13px] underline underline-offset-2 text-muted" onClick={() => { setSellId(''); setWant([]); }}>
            Clear search
          </button>
        )}
      </section>

      <p className="text-[14px] text-muted">
        {filtered
          ? `Fair-value deals${sellName ? ` that move ${sellName}` : ''}${want.length ? ` for a ${want.join(' or ')}` : ''}, best for your next five seasons first. Picks or a second player are added to even out value when needed.`
          : 'Deals that are fair on value, so the other side could say yes, but make your lineup better over the next five seasons. Best calls first.'}{' '}
        {history ? 'Ranked using how each manager actually trades.' : ''}
      </p>
      {!ideas && (
        <p className="flex items-center gap-2 text-muted py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Looking for trades
        </p>
      )}
      {ideas && filtered && ideas.length === 0 && (
        <p className="text-muted">No fair deals found for that search. Try another position, or let the finder add a pick by choosing “Anyone”.</p>
      )}
      {!filtered && personal.length > 0 && (
        <section className="space-y-3 rounded-xl border border-gold/50 p-4">
          <div>
            <h2 className="display text-[24px] text-ink flex items-center gap-2">
              From your rules <Lock className="w-4 h-4 text-muted" aria-label="Private" />
            </h2>
            <p className="text-[14px] text-muted">
              Players who won’t start for you, for picks {adjustments.ideas_min_years_out}+ drafts away. Fair on market value; better on your values.
            </p>
          </div>
          <ul className="space-y-3">
            {personal.slice(0, 6).map((idea) => (
              <li key={idea.give.map(finderAssetId).join() + finderAssetId(idea.get[0])} className="rounded-lg bg-card border border-line p-3 space-y-2">
                <div className="grid grid-cols-2 gap-3 text-[14px]">
                  <div>
                    <div className="text-[12px] font-semibold text-muted mb-1">You give · {fmt(idea.market_give)}</div>
                    <ul className="space-y-0.5">{idea.give.map((a) => assetLine(a, me))}</ul>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-muted mb-1">You get · {fmt(idea.market_get)}</div>
                    <ul className="space-y-0.5">{idea.get.map((a) => assetLine(a, idea.partner_id))}</ul>
                  </div>
                </div>
                <p className="text-[14px]">
                  <span className="font-semibold">On your values: </span>
                  <span className="text-up font-semibold">+{fmt(idea.gain)}</span>
                  <span className="text-muted">
                    {' '}
                    ({fmt(idea.mine_give)} → {fmt(idea.mine_get)}).{' '}
                    {idea.lineup_change === 0 ? 'No change to your lineup.' : `Lineup ${idea.lineup_change > 0 ? '+' : '−'}${Math.abs(idea.lineup_change)} pts/wk this season.`}
                  </span>
                </p>
                <p className="text-[13px] text-muted">
                  Teams with this pick: {[idea.partner_name, ...idea.also.map((a) => a.partner_name)].join(', ')}.
                </p>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => openTrade({ partnerId: idea.partner_id, give: idea.give.map(finderAssetId), get: idea.get.map(finderAssetId) })}
                >
                  Open in trade builder
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ideas && !filtered && byPartner.length === 0 && <p className="text-muted">No clear improvements right now. Your roster is already well balanced for its value.</p>}
      {byPartner.map((list) => {
        const first = list[0];
        const profile = history?.profiles.find((p) => p.team_id === first.partner_id);
        return (
          <section key={first.partner_id} className="space-y-3">
            <div>
              <h2 className="display text-[24px] text-ink">{first.partner_name}</h2>
              <ManagerProfileNote profile={profile} compact />
            </div>
            <ul className="space-y-3">
              {list.map((idea) => (
                <li key={idea.give.map(finderAssetId).join() + idea.get.map(finderAssetId).join()} className="rounded-xl bg-card border border-line p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-[14px]">
                    <div>
                      <div className="text-[12px] font-semibold text-muted mb-1">You give · {fmt(idea.value_give)}</div>
                      <ul className="space-y-0.5">{idea.give.map((a) => assetLine(a, me))}</ul>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-muted mb-1">You get · {fmt(idea.value_get)}</div>
                      <ul className="space-y-0.5">{idea.get.map((a) => assetLine(a, idea.partner_id))}</ul>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-muted">
                          <th className="text-left font-semibold">Pts/wk</th>
                          {seasons.map((s) => (
                            <th key={s} className="text-right font-semibold">
                              {s}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { who: 'You', xs: idea.my_change },
                          { who: 'Them', xs: idea.their_change },
                        ].map((r) => (
                          <tr key={r.who}>
                            <td className="font-semibold">{r.who}</td>
                            {r.xs.map((x, i) => (
                              <td key={i} className={`text-right ${x > 0 ? 'text-up' : x < 0 ? 'text-down' : 'text-muted'}`}>
                                {x > 0 ? '+' : x < 0 ? '−' : ''}
                                {Math.abs(x)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {idea.reasons.length > 0 && <p className="text-[14px] text-muted">{idea.reasons.join(' ')}</p>}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      openTrade({ partnerId: idea.partner_id, give: idea.give.map(finderAssetId), get: idea.get.map(finderAssetId) })
                    }
                  >
                    Open in trade builder
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};
