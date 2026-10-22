import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { fmt, pickName } from '../lib/leagueStats';
import { findTrades, finderAssetId, type FinderAsset, type TradeIdea } from '../lib/tradeFinder';
import { ManagerProfileNote } from '../components/ManagerProfile';

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
        })
      );
    }, 30);
    return () => window.clearTimeout(id);
  }, [evaluation, history]);

  const byPartner = useMemo(() => {
    const m = new Map<string, TradeIdea[]>();
    for (const i of ideas || []) m.set(i.partner_id, [...(m.get(i.partner_id) || []), i]);
    return [...m.values()];
  }, [ideas]);

  if (!evaluation) return null;
  if (!evaluation.season_outlook?.length)
    return <p className="text-muted">Trade ideas need season projections. Connect a real league to see them.</p>;
  if (!ideas)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Looking for trades that help you
      </p>
    );

  const me = evaluation.roster.franchise_id;
  const seasons = evaluation.season_outlook.map((o) => o.season);

  return (
    <div className="space-y-6">
      <p className="text-[14px] text-muted">
        Deals that are fair on value, so the other side could say yes, but make your lineup better over the next five seasons.
        Best calls first. {history ? 'Ranked using how each manager actually trades.' : ''}
      </p>
      {byPartner.length === 0 && <p className="text-muted">No clear improvements right now. Your roster is already well balanced for its value.</p>}
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
