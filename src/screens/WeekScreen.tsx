import React, { useEffect, useMemo, useState } from 'react';
import { CloudRain, CloudSun, Loader2, Snowflake, Thermometer, Wind } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { apiPost } from '../lib/api';
import type { MasterPlayer } from '../types';

interface Proj {
  points: number | null;
  base_points?: number;
  weather_factor?: number;
  weather_team?: string | null;
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
  weather?: Record<string, GameWeather>;
}
interface GameWeather {
  game: string;
  home: string;
  away: string;
  kickoff: string | null;
  kickoff_confirmed: boolean;
  venue: string;
  city: string;
  status: 'forecast' | 'indoors' | 'roof' | 'too_early' | 'unavailable';
  condition: 'clear' | 'cold' | 'wind_15' | 'wind_20' | 'rain' | 'heavy_rain' | 'snow' | 'wet_and_windy';
  severity: 'none' | 'watch' | 'moderate' | 'high';
  headline: string;
  details: string | null;
  impact: string | null;
  factors: Record<string, number>;
}

const WxIcon: React.FC<{ c: GameWeather['condition']; className?: string }> = ({ c, className = 'w-4 h-4' }) =>
  c === 'snow' ? <Snowflake className={className} /> : c === 'wind_15' || c === 'wind_20' ? <Wind className={className} /> : c === 'cold' ? <Thermometer className={className} /> : c === 'clear' ? <CloudSun className={className} /> : <CloudRain className={className} />;

const kickoffText = (w: GameWeather) => {
  if (!w.kickoff) return '';
  const d = new Date(w.kickoff);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  return w.kickoff_confirmed ? `${day} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : day;
};
const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.abs(Math.round((f - 1) * 100))}%`;

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
    apiPost<WeekData>('/api/projections/week', {
      platform: activePlatform,
      week,
      scoring_type: evaluation.settings?.scoring_type,
      te_premium: evaluation.settings?.te_premium,
      players: evaluation.players.map((p) => ({ id: p.id, position: p.position, team: p.nfl_team })),
    })
      .then((d) => {
        if (!cancelled) setData(d);
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
  const wxFor = (p: MasterPlayer) => {
    const t = proj(p)?.weather_team;
    const w = t ? data.weather?.[t] : undefined;
    return w && w.severity !== 'none' && proj(p)?.opponent ? w : undefined;
  };
  // Weather alerts: outdoor games this week with bad weather that involve players you'd start or might start.
  const starters = new Set(plan.lineup.map((l) => l.player?.id).filter(Boolean) as string[]);
  const alerts = (() => {
    const byGame = new Map<string, { w: GameWeather; mine: MasterPlayer[] }>();
    for (const p of active) {
      const w = wxFor(p);
      if (!w || w.severity === 'watch' && !starters.has(p.id)) continue;
      const g = byGame.get(w.game) ?? { w, mine: [] };
      g.mine.push(p);
      byGame.set(w.game, g);
    }
    const rank = { high: 0, moderate: 1, watch: 2, none: 3 };
    return [...byGame.values()].sort((a, b) => rank[a.w.severity] - rank[b.w.severity]);
  })();
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
            {wxFor(p) && (
              <span
                title={`${wxFor(p)!.headline}: ${wxFor(p)!.details ?? ''}`}
                className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[11px] font-semibold align-middle ${
                  (pr?.weather_factor ?? 1) > 1.005 ? 'bg-up/12 text-up' : wxFor(p)!.severity === 'high' ? 'bg-down/12 text-down' : 'bg-gold/15 text-gold'
                }`}
              >
                <WxIcon c={wxFor(p)!.condition} className="w-3 h-3" />
                {pr?.weather_factor && Math.abs(pr.weather_factor - 1) >= 0.01 ? pct(pr.weather_factor) : 'watch'}
              </span>
            )}
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

      {alerts.length > 0 && (
        <section className="space-y-2" aria-label="Weather alerts">
          <h2 className="display text-[22px] text-ink">Weather alerts</h2>
          {alerts.map(({ w, mine }) => (
            <div
              key={w.game}
              className={`rounded-lg border p-3 ${w.severity === 'high' ? 'border-down/40 bg-down/5' : 'border-gold/40 bg-gold/5'}`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <WxIcon c={w.condition} className={`w-4 h-4 shrink-0 ${w.severity === 'high' ? 'text-down' : 'text-gold'}`} />
                <span>
                  {w.headline} · {w.game}
                </span>
                <span className="ml-auto text-[12px] font-normal text-muted shrink-0">
                  {w.city} {kickoffText(w)}
                </span>
              </div>
              {w.details && <p className="text-[13px] text-muted mt-1">{w.details}</p>}
              {w.impact && <p className="text-[14px] mt-1.5">{w.impact}</p>}
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                {mine.map((p) => {
                  const pr = proj(p);
                  const f = pr?.weather_factor ?? 1;
                  return (
                    <li key={p.id}>
                      <span className="font-semibold">{p.full_name}</span>
                      {starters.has(p.id) ? '' : ' (bench)'}{' '}
                      <span className="text-muted">
                        {Math.abs(f - 1) >= 0.01 && pr?.base_points != null
                          ? `${pr.base_points.toFixed(1)} → ${(pr.points ?? 0).toFixed(1)} (${pct(f)})`
                          : 'no adjustment yet'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="text-[12px] text-muted">
            Projections in weather games are adjusted by how much each position scored in similar weather, 2016–2025, weighted by the chance it
            happens. Forecasts update hourly and firm up closer to kickoff.
          </p>
        </section>
      )}

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
        Projections: {data.source}, scored for your league ({evaluation?.settings?.scoring_type ?? 'standard'}). Players listed Out or Doubtful count as 0. Bad-weather games are adjusted (see Weather alerts); forecasts come from the National Weather Service.
        Taxi and IR players can’t start.
      </p>
    </div>
  );
};
