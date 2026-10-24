import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { fmt, pickName } from '../lib/leagueStats';
import { finderAssetId, type FinderAsset, type PersonalIdea, type TradeIdea } from '../lib/assets';
import { apiPost } from '../lib/api';
import { ManagerProfileNote } from '../components/ManagerProfile';
import { useAccount } from '../context/AccountContext';
import { Lock } from 'lucide-react';
import { useReference } from '../lib/useReference';

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
  const { evaluation, history, loadHistory, isDemo, openTrade, leagueRequest } = useRoster();
  const [ideas, setIdeas] = useState<TradeIdea[] | null>(null);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [sellIds, setSellIds] = useState<string[]>([]);
  const [fairOn, setFairOn] = useState<'ours' | 'theirs'>('ours');
  const ref = useReference();
  const [want, setWant] = useState<string[]>([]);
  const filtered = sellIds.length > 0 || want.length > 0;
  const { adjustments, reference } = useAccount();
  const [personal, setPersonal] = useState<PersonalIdea[]>([]);
  const lr = leagueRequest();
  const lrKey = lr ? `${lr.platform}:${lr.league_id}:${lr.franchise_id}` : '';

  useEffect(() => {
    if (!isDemo) loadHistory();
  }, [isDemo]);

  // Ideas are built on the server. Re-ask when the search changes or manager profiles arrive.
  useEffect(() => {
    if (!lr) return;
    const ctl = new AbortController();
    setIdeas(null);
    setIdeasError(null);
    const t = window.setTimeout(() => {
      apiPost<{ ideas: TradeIdea[] }>(
        '/api/trade/ideas',
        {
          ...lr,
          sell_ids: sellIds,
          want_positions: want,
          fair: fairOn === 'theirs' && ref ? { source: reference.source, imported: reference.source === 'imported' ? reference.imported : null } : null,
        },
        ctl.signal
      )
        .then((d) => setIdeas(d.ideas))
        .catch((e) => e?.name !== 'AbortError' && setIdeasError(e.message));
    }, 150);
    return () => {
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [lrKey, !!history, sellIds.join(), want.join(), fairOn, ref?.label, reference.source]);

  useEffect(() => {
    if (!lr || !adjustments.enabled) return setPersonal([]);
    const ctl = new AbortController();
    apiPost<{ ideas: PersonalIdea[] }>('/api/trade/personal-ideas', { ...lr, adjustments }, ctl.signal)
      .then((d) => setPersonal(d.ideas))
      .catch(() => setPersonal([]));
    return () => ctl.abort();
  }, [lrKey, JSON.stringify(adjustments)]);

  const byPartner = useMemo(() => {
    const m = new Map<string, TradeIdea[]>();
    for (const i of ideas || []) m.set(i.partner_id, [...(m.get(i.partner_id) || []), i]);
    return [...m.values()];
  }, [ideas]);

  if (!evaluation) return null;
  if (isDemo || !lr) return <p className="text-muted">Trade ideas need a real league. Connect yours to see them.</p>;
  if (!evaluation.season_outlook?.length)
    return <p className="text-muted">Trade ideas need season projections. Connect a real league to see them.</p>;

  const me = evaluation.roster.franchise_id;
  const seasons = evaluation.season_outlook.map((o) => o.season);
  const myAssets = [
    ...[...evaluation.players].filter((p) => p.market_value >= 300).sort((a, b) => b.market_value - a.market_value).map((p) => ({ id: `player:${p.id}`, label: `${p.position} ${p.full_name} (${fmt(p.market_value)})` })),
    ...[...(evaluation.draft_picks || [])].filter((p) => p.market_value >= 300).sort((a, b) => a.year - b.year || a.round - b.round).map((p) => ({ id: `pick:${p.id}`, label: `${pickName(p, me)} (${fmt(p.market_value)})` })),
  ];
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const shortName = (id: string) => myAssets.find((a) => a.id === id)?.label.replace(/ \(.*\)$/, '').replace(/^(QB|RB|WR|TE|K|DEF) /, '') ?? '';
  const sellName = sellIds.length === 1 ? shortName(sellIds[0]) : sellIds.length > 1 ? `any mix of ${sellIds.map(shortName).join(', ')}` : '';

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-card border border-line p-4 space-y-3" aria-label="Trade search">
        <div>
          <span className="text-[13px] font-semibold text-muted">Trade away {sellIds.length > 1 ? '(mixed and matched, up to three at once)' : ''}</span>
          {sellIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {sellIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSellIds(sellIds.filter((x) => x !== id))}
                  className="rounded-full pl-3 pr-2 py-1 text-[13px] font-semibold bg-ink text-paper flex items-center gap-1"
                  aria-label={`Remove ${shortName(id)}`}
                >
                  {shortName(id)} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
          <select
            value=""
            onChange={(e) => e.target.value && setSellIds([...sellIds, e.target.value])}
            className="field mt-1.5"
            aria-label="Add a player or pick to trade away"
          >
            <option value="">{sellIds.length ? 'Add another…' : 'Anyone (best fits), or pick players…'}</option>
            {myAssets
              .filter((a) => !sellIds.includes(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
          </select>
        </div>
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
        <div>
          <span className="text-[13px] font-semibold text-muted">Looks fair on</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(['ours', 'theirs'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={fairOn === k}
                disabled={k === 'theirs' && !ref}
                onClick={() => setFairOn(k)}
                className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold border disabled:opacity-40 ${fairOn === k ? 'bg-ink text-paper border-ink' : 'border-line text-muted'}`}
              >
                {k === 'ours' ? 'Futures Value' : ref ? `Their values (${ref.label.replace(/ \(.*\)$/, '')})` : 'Their values'}
              </button>
            ))}
          </div>
          {fairOn === 'theirs' && <p className="text-[12px] text-muted mt-1">Deals that look even on the values your league uses, ranked by how much you gain on ours. Change the source in Value gaps.</p>}
        </div>
        {filtered && (
          <button type="button" className="text-[13px] underline underline-offset-2 text-muted" onClick={() => { setSellIds([]); setWant([]); }}>
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
      {ideasError && (
        <p role="alert" className="text-down">
          {ideasError}
        </p>
      )}
      {!ideas && !ideasError && (
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
                  {idea.fair_give != null && idea.fair_get != null && ref && (
                    <p className="text-[13px] text-muted">
                      On {ref.label.replace(/ \(.*\)$/, '')}: you give {fmt(idea.fair_give)}, get {fmt(idea.fair_get)}
                      {' · '}on ours:{' '}
                      <span className={idea.value_get - idea.value_give >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
                        {idea.value_get - idea.value_give >= 0 ? '+' : '−'}
                        {fmt(Math.abs(idea.value_get - idea.value_give))}
                      </span>
                    </p>
                  )}
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
