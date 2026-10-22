import React from 'react';
import type { ProjectionTier, ValueSignal } from '../types';

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
