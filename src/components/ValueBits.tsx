import React from 'react';
import type { ContractValue, NflContract, ProjectionTier, ValueSignal } from '../types';
import { SEASON } from '../lib/season';

export const SIGNAL_LABEL: Record<ValueSignal, string> = {
  BUY_LOW: 'Buy low',
  SELL_HIGH: 'Sell high',
  BUY: 'Undervalued',
  SELL: 'Overvalued',
  HOLD: '',
};

export const SignalTag: React.FC<{ signal?: ValueSignal | null; className?: string }> = ({ signal, className = '' }) => {
  if (!signal || signal === 'HOLD') return null;
  const buy = signal === 'BUY_LOW' || signal === 'BUY';
  return (
    <span className={`inline-block rounded px-1.5 py-px text-[12px] font-semibold ${buy ? 'bg-up/12 text-up' : 'bg-down/12 text-down'} ${className}`}>
      {SIGNAL_LABEL[signal]}
    </span>
  );
};

/** "+12%" / "−8%" coloured by direction. */
export const Change: React.FC<{ value: number | null | undefined; className?: string }> = ({ value, className = '' }) => {
  if (value == null) return <span className={`text-muted ${className}`}>–</span>;
  const pct = Math.round(value * 100);
  if (pct === 0) return <span className={`text-muted ${className}`}>0%</span>;
  return <span className={`${pct > 0 ? 'text-up' : 'text-down'} ${className}`}>{`${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`}</span>;
};

/** Tiny line of recent values. */
export const Sparkline: React.FC<{ values: number[]; width?: number; height?: number; label?: string }> = ({
  values,
  width = 72,
  height = 22,
  label,
}) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 2) + 1},${height - 1 - ((v - min) / span) * (height - 2)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? 'Value trend'} className="shrink-0">
      <polyline points={pts} fill="none" strokeWidth="1.6" className={up ? 'stroke-up' : 'stroke-down'} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export const TIER_STYLE: Record<ProjectionTier, string> = {
  Starter: 'bg-ink text-paper',
  Flex: 'bg-ink/45 text-paper',
  Depth: 'bg-line text-text',
  Fading: 'border border-dashed border-line text-muted',
};

/** "$90, 5 yrs" plus a bargain / overpaid tag for salary-cap leagues. */
export const ContractNote: React.FC<{ c: ContractValue }> = ({ c }) => {
  const big = Math.abs(c.surplus) >= Math.max(40, c.salary * 0.5);
  return (
    <span className="ml-2 whitespace-nowrap">
      ${c.salary}
      {c.years_left ? `, ${c.years_left} yr${c.years_left === 1 ? '' : 's'}` : ''}
      {big && (
        <span className={`ml-1.5 inline-block rounded px-1.5 py-px text-[12px] font-semibold ${c.surplus > 0 ? 'bg-up/12 text-up' : 'bg-down/12 text-down'}`}>
          {c.surplus > 0 ? 'Bargain' : 'Overpaid'}
        </span>
      )}
    </span>
  );
};

/** The next NFL contract milestone within two seasons: "FA 2027" or "Cut risk 2028". Quiet, outline only. */
export const NflChip: React.FC<{ c?: NflContract | null; className?: string }> = ({ c, className = '' }) => {
  const next = c?.events?.find((e) => e.season <= SEASON.seasonYear + 2);
  if (!next) return null;
  return (
    <span
      className={`inline-block rounded border border-line px-1.5 py-px text-[12px] font-semibold text-muted ${className}`}
      title={next.kind === 'free_agent' ? 'NFL contract ends: may change teams' : 'Team can cut him and save most of his cap hit'}
    >
      {next.kind === 'free_agent' ? `FA ${next.season}` : `Cut risk ${next.season}`}
    </span>
  );
};

/** Plain-language NFL contract summary with the cut / dead-money schedule. */
export const NflContractDetail: React.FC<{ c?: NflContract | null }> = ({ c }) => {
  if (!c) return null;
  const outRow = c.by_season.find((r) => r.season === c.out_year);
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-semibold">NFL contract</div>
      <p className="text-[14px]">
        {c.type === 'Drafted' ? 'Rookie deal' : c.type === 'Franchise' ? 'Franchise tag / tag-and-extend' : c.type === 'Extension' ? 'Extension' : 'Free-agent deal'}
        {c.team ? ` with the ${c.team}` : ''}, signed {c.signed}: {c.years} yr{c.years === 1 ? '' : 's'}, ${c.apy}M a year, ${c.guaranteed}M guaranteed.
        {' '}Runs through {c.through}
        {c.option_year ? ` (team option for ${c.option_year})` : ''}.
        {c.out_year && outRow
          ? ` From ${c.out_year} the team can cut him and save $${outRow.savings_if_cut}M (dead money $${outRow.dead_if_cut}M).`
          : c.by_season.length
            ? ' Guaranteed money makes him expensive to cut before the deal ends.'
            : ''}
        {' '}Free agent in {c.free_agent_year}.
      </p>
      {c.by_season.length > 0 && (
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="text-left font-semibold">If cut before</th>
              {c.by_season.map((r) => (
                <th key={r.season} className="text-right font-semibold">
                  {r.season}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-muted">Dead money</td>
              {c.by_season.map((r) => (
                <td key={r.season} className="text-right">${r.dead_if_cut}M</td>
              ))}
            </tr>
            <tr>
              <td className="text-muted">Cap saved</td>
              {c.by_season.map((r) => (
                <td key={r.season} className={`text-right ${r.savings_if_cut >= 0.5 * r.cap ? 'text-down font-semibold' : ''}`}>
                  {r.savings_if_cut < 0 ? '−' : ''}${Math.abs(r.savings_if_cut)}M
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
      {c.events.length > 0 && (
        <p className="text-[13px] text-muted">
          In projections:{' '}
          {c.events
            .map((e) => `${Math.round(e.probability * 100)}% chance he ${e.kind === 'free_agent' ? 'changes teams in free agency' : 'is cut'} before ${e.season}`)
            .join('; ')}
          . Based on what happened to similar players since 2012.
        </p>
      )}
    </div>
  );
};
