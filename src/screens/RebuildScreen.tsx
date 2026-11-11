import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { apiPost } from '../lib/api';
import { fmt, pickName } from '../lib/leagueStats';
import { finderAssetId, type FinderAsset } from '../lib/assets';

interface RebuildPackage {
  partner_id: string;
  partner_name: string;
  partner_record: string | null;
  give: FinderAsset[];
  get: FinderAsset[];
  value_give: number;
  value_get: number;
  picks: number;
  young_players: number;
  my_change: number[];
  their_now: number;
  rebuild_gain: number;
  reasons: string[];
}
interface SellCandidate {
  id: string;
  name: string;
  position: string;
  age: number;
  value: number;
  value_next_year: number;
  ppg_by_season: number[];
  why: string;
  packages: RebuildPackage[];
}
interface RebuildPlan {
  seasons: number[];
  sell: SellCandidate[];
  keep: { id: string; name: string; position: string; age: number; value: number }[];
  picks: { label: string; value: number }[];
}
interface OfferCheck {
  value_give: number;
  value_get: number;
  my_change: number[];
  rebuild_gain: number;
  age_give: number | null;
  age_get: number | null;
  verdict: 'good' | 'sideways' | 'bad';
  summary: string;
}

const Delta: React.FC<{ x: number }> = ({ x }) => (
  <span className={x > 0 ? 'text-up' : x < 0 ? 'text-down' : 'text-muted'}>
    {x > 0 ? '+' : x < 0 ? '−' : ''}
    {Math.abs(x)}
  </span>
);

const assetName = (a: FinderAsset, owner: string) =>
  a.kind === 'player' ? `${a.item.full_name} (${a.item.position}${a.item.age ? `, ${Math.floor(a.item.age)}` : ''})` : pickName(a.item, owner);

/** Chips plus a select, for choosing up to `max` assets. */
const AssetPicker: React.FC<{ label: string; options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; max?: number }> = ({
  label,
  options,
  value,
  onChange,
  max = 4,
}) => (
  <div>
    <span className="text-[13px] font-semibold text-muted">{label}</span>
    {value.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {value.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(value.filter((x) => x !== id))}
            className="rounded-full pl-3 pr-2 py-1 text-[13px] font-semibold bg-ink text-paper flex items-center gap-1"
            aria-label={`Remove ${options.find((o) => o.id === id)?.label}`}
          >
            {options.find((o) => o.id === id)?.label.replace(/ · .*$/, '')} <span aria-hidden>×</span>
          </button>
        ))}
      </div>
    )}
    {value.length < max && (
      <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} className="field mt-1.5" aria-label={label}>
        <option value="">{value.length ? 'Add another…' : 'Choose…'}</option>
        {options
          .filter((o) => !value.includes(o.id))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
      </select>
    )}
  </div>
);

/** My team → Rebuild: sell veterans to contenders for picks and young players, and check offers on a rebuild horizon. */
export const RebuildScreen: React.FC = () => {
  const { evaluation, leagueRequest, openTrade } = useRoster();
  const [plan, setPlan] = useState<RebuildPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partner, setPartner] = useState('');
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [check, setCheck] = useState<OfferCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const lr = leagueRequest();
  const lrKey = lr ? `${lr.platform}:${lr.league_id}:${lr.franchise_id}` : '';

  useEffect(() => {
    if (!lr) return;
    const ac = new AbortController();
    setPlan(null);
    setError(null);
    apiPost<RebuildPlan>('/api/rebuild', lr, ac.signal)
      .then(setPlan)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lrKey]);

  useEffect(() => {
    setCheck(null);
    setCheckError(null);
  }, [partner, give.join(), get.join()]);

  if (!evaluation) return null;
  if (!lr) return <p className="text-muted">Rebuild mode needs a real league. Connect yours to see it.</p>;
  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!plan)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Finding contenders who'll pay for your veterans
      </p>
    );

  const me = evaluation.roster.franchise_id;
  const teams = (evaluation.league_teams || []).filter((t) => t.franchise_id !== me);
  const partnerTeam = teams.find((t) => t.franchise_id === partner);
  const mineOpts = [
    ...[...evaluation.players].filter((p) => p.market_value >= 100).sort((a, b) => b.market_value - a.market_value).map((p) => ({ id: `player:${p.id}`, label: `${p.full_name} · ${p.position}, ${Math.floor(p.age ?? 0)} · ${fmt(p.market_value)}` })),
    ...(evaluation.draft_picks || []).filter((p) => p.market_value > 0).map((p) => ({ id: `pick:${p.id}`, label: `${pickName(p, me)} · ${fmt(p.market_value)}` })),
  ];
  const theirOpts = partnerTeam
    ? [
        ...[...partnerTeam.starters, ...partnerTeam.bench, ...(partnerTeam.reserves || [])]
          .filter((p) => p.market_value >= 100)
          .sort((a, b) => b.market_value - a.market_value)
          .map((p) => ({ id: `player:${p.id}`, label: `${p.full_name} · ${p.position}, ${Math.floor(p.age ?? 0)} · ${fmt(p.market_value)}` })),
        ...partnerTeam.draft_picks.filter((p) => p.market_value > 0).map((p) => ({ id: `pick:${p.id}`, label: `${pickName(p, partnerTeam.franchise_id)} · ${fmt(p.market_value)}` })),
      ]
    : [];

  const runCheck = () => {
    if (!lr) return;
    setChecking(true);
    apiPost<OfferCheck>('/api/rebuild/check', { ...lr, partner_id: partner, give, get })
      .then(setCheck)
      .catch((e) => setCheckError(e.message))
      .finally(() => setChecking(false));
  };

  const VERDICT = { good: { label: 'Helps your rebuild', cls: 'text-up' }, sideways: { label: 'Sideways move', cls: 'text-gold' }, bad: { label: 'Hurts your rebuild', cls: 'text-down' } };
  const later = `${plan.seasons[1]} to ${plan.seasons[plan.seasons.length - 1]}`;

  return (
    <div className="space-y-8">
      <p className="text-[14px] text-muted">
        For a team building for later. Trades here are judged on seasons {later}, not this one. Veterans go to teams with a winning record,
        and only picks and players 24 or younger come back.
      </p>

      <section className="rounded-xl bg-card border border-line p-4 space-y-3" aria-label="Check an offer">
        <h2 className="display text-[24px] text-ink">Check an offer</h2>
        <p className="text-[14px] text-muted">Got an offer? See whether it moves your rebuild forward or just swaps one starter for another.</p>
        <div>
          <label htmlFor="rb-team" className="text-[13px] font-semibold text-muted">
            From
          </label>
          <select
            id="rb-team"
            value={partner}
            onChange={(e) => {
              setPartner(e.target.value);
              setGet([]);
            }}
            className="field mt-1"
          >
            <option value="">Choose a team…</option>
            {teams.map((t) => (
              <option key={t.franchise_id} value={t.franchise_id}>
                {t.franchise_name}
              </option>
            ))}
          </select>
        </div>
        <AssetPicker label="You give" options={mineOpts} value={give} onChange={setGive} />
        {partner && <AssetPicker label="You get" options={theirOpts} value={get} onChange={setGet} />}
        <button type="button" className="btn-primary" disabled={!partner || !give.length || !get.length || checking} onClick={runCheck}>
          {checking ? 'Checking…' : 'Check it'}
        </button>
        {checkError && <p role="alert" className="text-down text-[14px]">{checkError}</p>}
        {check && (
          <div className="space-y-2 text-[14px]" aria-live="polite">
            <p>
              <span className={`font-semibold ${VERDICT[check.verdict].cls}`}>{VERDICT[check.verdict].label}.</span> {check.summary}
            </p>
            <p className="text-muted text-[13px]">
              Value: you give {fmt(check.value_give)}, get {fmt(check.value_get)}
              {check.age_give != null && check.age_get != null ? ` · average age ${check.age_give} → ${check.age_get}` : ''}
            </p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-semibold">Your pts/wk</th>
                  {plan.seasons.map((s) => (
                    <th key={s} className="text-right font-semibold">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td />
                  {check.my_change.map((x, i) => (
                    <td key={i} className="text-right">
                      <Delta x={x} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="display text-[24px] text-ink">Sell these veterans</h2>
          <p className="text-[14px] text-muted">
            Oldest value first to fall. Each offer is fair on Futures Value, helps the buyer's lineup this season, and pays you in picks and
            young players.
          </p>
        </div>
        {plan.sell.length === 0 && <p className="text-muted">No veterans worth selling. Your roster is already young.</p>}
        {plan.sell.map((s) => (
          <article key={s.id} className="rounded-xl bg-card border border-line p-4 space-y-3">
            <div className="flex items-baseline gap-3">
              <h3 className="flex-1 min-w-0 font-semibold text-[16px] truncate">
                {s.name} <span className="text-[13px] font-medium text-muted">{s.position}, {Math.floor(s.age)}</span>
              </h3>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">{fmt(s.value)}</span>
                <span className="block text-[11px] text-muted">≈{fmt(s.value_next_year)} next year</span>
              </span>
            </div>
            <p className="text-[13px] text-muted">
              {s.why} Projected pts/game: {s.ppg_by_season.map((x, i) => `${plan.seasons[i]} ${x}`).join(' · ')}.
            </p>
            {s.packages.length ? (
              <ul className="space-y-2">
                {s.packages.map((pk) => (
                  <li key={finderAssetId(pk.get[0]) + pk.get.length + pk.partner_id + pk.get.map(finderAssetId).join()} className="rounded-lg border border-line p-3 space-y-1.5 text-[14px]">
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 min-w-0 font-semibold truncate">
                        {pk.partner_name}
                        {pk.partner_record ? <span className="font-medium text-muted"> ({pk.partner_record})</span> : null}
                      </span>
                      <span className="shrink-0 text-muted text-[13px]">gets you {fmt(pk.value_get)}</span>
                    </div>
                    <ul className="text-[14px]">
                      {pk.get.map((a) => (
                        <li key={finderAssetId(a)} className="flex justify-between gap-2">
                          <span className="truncate">{assetName(a, pk.partner_id)}</span>
                          <span className="text-muted shrink-0">{fmt(a.item.market_value)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[13px] text-muted">
                      Your pts/wk:{' '}
                      {pk.my_change.map((x, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && ' · '}
                          {plan.seasons[i]} <Delta x={x} />
                        </React.Fragment>
                      ))}
                    </p>
                    <p className="text-[13px] text-muted">{pk.reasons.join(' ')}</p>
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => openTrade({ partnerId: pk.partner_id, give: pk.give.map(finderAssetId), get: pk.get.map(finderAssetId) })}
                    >
                      Open in trade builder
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">
                No contender would start him enough to pay a fair price in picks or young players. Hold him, or add him to a bigger deal.
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="display text-[24px] text-ink">Your young core</h2>
        <p className="text-[14px] text-muted">Players 25 or younger worth 1,000+. Build around these; don't sell them for veterans.</p>
        {plan.keep.length ? (
          <ul className="divide-y divide-line border-y border-line text-[14px]">
            {plan.keep.map((k) => (
              <li key={k.id} className="flex items-baseline gap-3 py-2">
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-semibold">{k.name}</span> <span className="text-[12px] text-muted">{k.position}, {Math.floor(k.age)}</span>
                </span>
                <span className="font-semibold">{fmt(k.value)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">None yet. That's what selling veterans is for.</p>
        )}
        <p className="text-[13px] text-muted">
          Your picks: {plan.picks.filter((p) => p.value >= 500).map((p) => p.label).join(', ') || 'none worth much yet'}.
        </p>
      </section>
    </div>
  );
};
