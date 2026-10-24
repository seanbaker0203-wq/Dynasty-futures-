import React, { useMemo, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { useBoard } from '../lib/useBoard';
import { fmt } from '../lib/leagueStats';
import { Change, SignalTag, Sparkline, TIER_STYLE } from '../components/ValueBits';
import type { BoardPlayer } from '../types';
import { PlayerLinks } from '../components/PlayerLinks';

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE'];
type Scope = 'all' | 'league' | 'mine' | 'available';
type Sort = 'value' | 'edge_up' | 'edge_down';

/** Who owns each player in the loaded league, keyed by the platform id the board uses. */
export function useOwnership() {
  const { evaluation } = useRoster();
  return useMemo(() => {
    const owners = new Map<string, { id: string; name: string }>();
    for (const t of evaluation?.league_teams || []) {
      for (const p of [...t.starters, ...t.bench, ...(t.reserves || [])]) owners.set(p.id, { id: t.franchise_id, name: t.franchise_name });
    }
    const platform = evaluation?.roster.platform;
    const idOf = (bp: BoardPlayer) => (platform === 'mfl' ? bp.mfl_id : bp.sleeper_id) ?? '';
    return { owners, idOf, me: evaluation?.roster.franchise_id };
  }, [evaluation]);
}

export const ValueRow: React.FC<{ p: BoardPlayer; owner?: string; mine?: boolean; showRank?: boolean; right?: React.ReactNode }> = ({
  p,
  owner,
  mine,
  showRank = true,
  right,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <li className={mine ? 'bg-ink-soft -mx-4 px-4 sm:mx-0 sm:px-3 sm:rounded-lg' : 'sm:px-3'}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-3 py-3 text-left">
        {showRank && <span className="display text-[22px] w-9 text-right shrink-0 text-ink">{p.rank}</span>}
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">
            {p.name} <span className="text-[13px] font-medium text-muted">{p.position}{p.position_rank}</span>
          </span>
          <span className="block text-[13px] text-muted truncate">
            {p.team || 'FA'}
            {p.age ? `, ${Math.floor(p.age)}` : ''}
            {owner ? `, ${mine ? 'your team' : owner}` : ''}
            <SignalTag signal={p.signal} className="ml-2" />
          </span>
        </span>
        {right ?? (
          <span className="text-right shrink-0">
            <span className="block display text-[22px] text-ink">{fmt(p.value)}</span>
            <span className="block text-[12px] text-muted">
              vs market <Change value={p.edge} className="font-semibold" />
            </span>
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="pb-4 sm:pl-12 space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-[13px]">
            {[
              ['Our model', p.model],
              ['Trade market', p.market],
              ['Experts', p.experts],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg border border-line bg-card px-2.5 py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-[15px]">{v != null ? fmt(v as number) : '–'}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <span>
              <span className="text-muted">Market, 30 days </span>
              <Change value={p.market_trend_30d} className="font-semibold" />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted">Experts, 4 weeks </span>
              <Change value={p.expert_trend_4w} className="font-semibold" />
              <Sparkline values={p.expert_history.map((h) => h.value)} label="Expert value, last 12 weeks" />
            </span>
            {p.ppg != null && (
              <span>
                <span className="text-muted">Points per game </span>
                <span className="font-semibold">{p.ppg}</span>
              </span>
            )}
          </div>

          {p.projection.length > 0 && (
            <div>
              <div className="text-[13px] font-semibold mb-1.5">
                Projected role
                {p.falloff_season && <span className="text-down font-medium">, falls off in {p.falloff_season}</span>}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {p.projection.map((s) => (
                  <div key={s.season} className={`rounded-md text-center py-1.5 ${TIER_STYLE[s.tier]}`}>
                    <div className="text-[11px] opacity-80">{s.season}</div>
                    <div className="text-[13px] font-semibold">{s.tier}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PlayerLinks player={{ name: p.name, position: p.position, team: p.team, ktc_url: p.ktc_url }} />
        </div>
      )}
    </li>
  );
};

export const ValuesScreen: React.FC = () => {
  const { evaluation } = useRoster();
  const { data, error, loading } = useBoard(evaluation?.settings);
  const { owners, idOf, me } = useOwnership();
  const [pos, setPos] = useState('All');
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<Sort>('value');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);

  const list = useMemo(() => {
    if (!data) return [];
    let ps = data.players.filter((p) => p.value > 0);
    if (pos !== 'All') ps = ps.filter((p) => p.position === pos);
    if (q.trim()) ps = ps.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
    if (scope !== 'all') {
      ps = ps.filter((p) => {
        const o = owners.get(idOf(p));
        return scope === 'league' ? !!o : scope === 'mine' ? o?.id === me : !o;
      });
    }
    if (sort === 'edge_up') ps = ps.filter((p) => p.edge != null).sort((a, b) => b.edge! - a.edge!);
    if (sort === 'edge_down') ps = ps.filter((p) => p.edge != null).sort((a, b) => a.edge! - b.edge!);
    return ps;
  }, [data, pos, q, scope, sort, owners, idOf, me]);

  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (loading || !data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Building values for your league
      </p>
    );

  const w = data.weights;
  const s = evaluation?.settings;

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted max-w-[40rem]">
        Futures Value is our own number: {w.model * 100}% our projection model, {w.market * 100}% the trade market (FantasyCalc),{' '}
        {w.experts * 100}% expert rankings (FantasyPros). Tuned to {s?.league_size} teams, {s?.superflex ? 'Superflex' : '1QB'},{' '}
        {s?.scoring_type?.toLowerCase()}. "vs market" is how far we sit above or below what the player trades for.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" aria-label="Search players" className="field !pl-9" />
        </div>
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Which players" className="field sm:max-w-[13rem]">
          <option value="all">All players</option>
          <option value="league">Rostered in my league</option>
          <option value="mine">My team</option>
          <option value="available">Free agents</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="field sm:max-w-[13rem]">
          <option value="value">Highest value</option>
          <option value="edge_up">We like more than market</option>
          <option value="edge_down">We like less than market</option>
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="Position">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pos === p}
            onClick={() => setPos(p)}
            className={`shrink-0 rounded-full border px-3.5 py-1 font-semibold text-[14px] ${pos === p ? 'border-ink bg-ink text-paper' : 'border-line text-muted'}`}
          >
            {p}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-6 text-muted">No players match.</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {list.slice(0, limit).map((p) => {
            const o = owners.get(idOf(p));
            return <ValueRow key={p.id} p={p} owner={o?.name} mine={!!o && o.id === me} />;
          })}
        </ol>
      )}
      {list.length > limit && (
        <button type="button" className="btn-quiet w-full justify-center" onClick={() => setLimit(limit + 60)}>
          Show more ({list.length - limit} left)
        </button>
      )}
    </div>
  );
};
