import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import type { MasterPlayer } from '../types';

interface Proj {
  points: number | null;
  opponent: string | null;
  injury_status: string | null;
  game_date?: string | null;
}
interface WeekData {
  season: number;
  week: number;
  current_week: number;
  source: string;
  projections: Record<string, Proj>;
}

type SlotName = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'SUPER_FLEX' | 'K' | 'DEF';
const ELIGIBLE: Record<SlotName, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  K: ['K'],
  DEF: ['DEF'],
};
const SLOT_LABEL: Record<SlotName, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'Flex', SUPER_FLEX: 'SF', K: 'K', DEF: 'DEF' };
const OUT = new Set(['Out', 'IR', 'Doubtful', 'Suspended', 'PUP', 'NA']);

const InjuryTag: React.FC<{ s: string | null }> = ({ s }) =>
  s ? (
    <span className={`ml-1.5 inline-block rounded px-1.5 py-px text-[11px] font-semibold ${OUT.has(s) ? 'bg-down/12 text-down' : 'bg-gold/15 text-gold'}`}>
      {s === 'Questionable' ? 'Q' : s}
    </span>
  ) : null;

export const WeekScreen: React.FC = () => {
  const { evaluation, activePlatform, isDemo } = useRoster();
  const [week, setWeek] = useState<number | null>(null);
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active = useMemo(
    () => (evaluation?.players || []).filter((p) => p.roster_designation !== 'IR' && p.roster_designation !== 'TAXI'),
    [evaluation]
  );

  useEffect(() => {
    if (!evaluation || isDemo) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/projections/week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: activePlatform,
        week,
        scoring_type: evaluation.settings?.scoring_type,
        te_premium: evaluation.settings?.te_premium,
        players: evaluation.players.map((p) => ({ id: p.id, position: p.position, team: p.nfl_team })),
      }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Couldn’t load projections (${r.status}).`);
        if (!cancelled) setData(d as WeekData);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [evaluation, week, activePlatform, isDemo]);

  const plan = useMemo(() => {
    if (!data || !evaluation) return null;
    const pts = (p: MasterPlayer) => {
      const pr = data.projections[p.id];
      if (!pr || pr.points == null || !pr.opponent) return 0; // bye or no projection
      return pr.injury_status && OUT.has(pr.injury_status) ? 0 : pr.points;
    };
    const slots = evaluation.settings?.slots;
    const order: SlotName[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF'];
    const pool = [...active].sort((a, b) => pts(b) - pts(a));
    const used = new Set<string>();
    const lineup: { slot: SlotName; player: MasterPlayer | null }[] = [];
    for (const s of order) {
      const n = (slots as any)?.[s] ?? 0;
      for (let i = 0; i < n; i++) {
        const p = pool.find((x) => !used.has(x.id) && ELIGIBLE[s].includes(x.position));
        if (p) used.add(p.id);
        lineup.push({ slot: s, player: p ?? null });
      }
    }
    const bench = pool.filter((p) => !used.has(p.id));
    const total = lineup.reduce((t, l) => t + (l.player ? pts(l.player) : 0), 0);

    // Close calls: a bench player within 1.5 pts of the weakest starter he could replace.
    const closeCalls: { bench: MasterPlayer; starter: MasterPlayer; gap: number }[] = [];
    for (const b of bench) {
      if (pts(b) <= 0) continue;
      const rivals = lineup.filter((l) => l.player && ELIGIBLE[l.slot].includes(b.position)).map((l) => l.player!);
      const weakest = rivals.sort((x, y) => pts(x) - pts(y))[0];
      if (weakest && pts(weakest) - pts(b) <= 1.5 && !closeCalls.some((c) => c.starter.id === weakest.id)) closeCalls.push({ bench: b, starter: weakest, gap: pts(weakest) - pts(b) });
    }
    // Questionable starters: who to use if they sit.
    const backups = lineup
      .filter((l) => l.player && data.projections[l.player.id]?.injury_status === 'Questionable')
      .map((l) => ({ starter: l.player!, backup: bench.find((b) => ELIGIBLE[l.slot].includes(b.position) && pts(b) > 0) ?? null }));
    return { lineup, bench, total, pts, closeCalls, backups };
  }, [data, evaluation, active]);

  if (isDemo) return <p className="text-muted">Start/sit needs a real league. Connect yours to see this week’s best lineup.</p>;
  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!data || !plan)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading this week’s projections
      </p>
    );

  const proj = (p: MasterPlayer) => data.projections[p.id];
  const row = (p: MasterPlayer, label?: string) => {
    const pr = proj(p);
    const bye = !pr?.opponent;
    return (
      <li key={(label ?? '') + p.id} className="flex items-center gap-3 py-2.5">
        {label != null && <span className="w-9 shrink-0 text-[12px] font-semibold text-muted">{label}</span>}
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">
            {p.full_name}
            <InjuryTag s={pr?.injury_status ?? null} />
          </span>
          <span className="block text-[13px] text-muted truncate">
            {p.position} · {bye ? (pr?.injury_status ? 'Not projected' : 'Bye') : `vs ${pr.opponent}`}
          </span>
        </span>
        <span className={`font-semibold shrink-0 ${bye ? 'text-muted' : ''}`}>{bye ? '–' : plan.pts(p).toFixed(1)}</span>
      </li>
    );
  };
  const weeks = Array.from({ length: Math.max(0, Math.min(18, data.current_week + 2) - data.current_week + 1) }, (_, i) => data.current_week + i);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-muted shrink-0">Week</span>
        <select value={data.week} onChange={(e) => setWeek(Number(e.target.value))} className="field !w-auto" aria-label="Week">
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
              {w === data.current_week ? ' (this week)' : ''}
            </option>
          ))}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
      </div>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="display text-[24px] text-ink">Best lineup</h2>
          <span className="font-semibold">{plan.total.toFixed(1)} pts</span>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {plan.lineup.map((l, i) =>
            l.player ? row(l.player, SLOT_LABEL[l.slot]) : (
              <li key={`empty-${i}`} className="flex items-center gap-3 py-2.5 text-down">
                <span className="w-9 shrink-0 text-[12px] font-semibold">{SLOT_LABEL[l.slot]}</span>
                <span className="flex-1">Empty: no eligible player</span>
              </li>
            )
          )}
        </ul>
      </section>

      {(plan.closeCalls.length > 0 || plan.backups.length > 0) && (
        <section className="space-y-2">
          <h2 className="display text-[22px] text-ink">Worth a second look</h2>
          <ul className="space-y-1.5 text-[14px]">
            {plan.closeCalls.map((c) => (
              <li key={c.bench.id}>
                <span className="font-semibold">{c.starter.full_name}</span> or <span className="font-semibold">{c.bench.full_name}</span>:{' '}
                <span className="text-muted">
                  {c.gap < 0.15 ? 'a coin flip' : `only ${c.gap.toFixed(1)} pts apart`}. Go with the matchup or the news.
                </span>
              </li>
            ))}
            {plan.backups.map((b) => (
              <li key={b.starter.id}>
                <span className="font-semibold">{b.starter.full_name}</span> is questionable.{' '}
                <span className="text-muted">{b.backup ? `If he sits, start ${b.backup.full_name} (${plan.pts(b.backup).toFixed(1)}).` : 'No healthy backup at his spot.'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="display text-[22px] text-ink">Bench</h2>
        <ul className="divide-y divide-line border-y border-line">{plan.bench.map((p) => row(p))}</ul>
      </section>

      <p className="text-[12px] text-muted">
        Projections: {data.source}, scored for your league ({evaluation?.settings?.scoring_type ?? 'standard'}). Players listed Out or Doubtful count as 0.
        Taxi and IR players can’t start.
      </p>
    </div>
  );
};
