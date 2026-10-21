/**
 * Dynasty AI Evaluator - Custom Pure SVG Circular Dial Gauge (Slice 6)
 * Strictly zero heavy charting libraries. Pure SVG vector arcs with neon accents.
 */

import React from 'react';

interface CircularDialGaugeProps {
  value: number;
  min?: number;
  max?: number;
  title: string;
  subtitle: string;
  unit?: string;
  variant?: 'cyan' | 'amber' | 'emerald';
  benchmarkLabel?: string;
  benchmarkValue?: string;
}

export const CircularDialGauge: React.FC<CircularDialGaugeProps> = ({
  value,
  min = 0,
  max = 100,
  title,
  subtitle,
  unit = '',
  variant = 'cyan',
  benchmarkLabel = 'League Avg',
  benchmarkValue = '100',
}) => {
  // Constrain value between min and max for the visual arc fill
  const clampedValue = Math.min(Math.max(value, min), max);
  const percentage = (clampedValue - min) / (max - min);

  // SVG dimensions
  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // 240-degree dial arc (open at bottom)
  const angleRange = 240;
  const strokeDasharray = `${(angleRange / 360) * circumference} ${circumference}`;
  const strokeDashoffset = (angleRange / 360) * circumference * (1 - percentage);

  // Color variants matching UI/UX design rules
  const variantStyles = {
    cyan: {
      stroke: '#06b6d4', // Cyan #06b6d4
      glowClass: 'drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]',
      textAccent: 'text-cyan-400',
      bgGlow: 'bg-cyan-950/20',
      borderAccent: 'border-cyan-900/40',
      badgeBg: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60',
    },
    amber: {
      stroke: '#f59e0b', // Electric Amber #f59e0b
      glowClass: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]',
      textAccent: 'text-amber-400',
      bgGlow: 'bg-amber-950/20',
      borderAccent: 'border-amber-900/40',
      badgeBg: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
    },
    emerald: {
      stroke: '#10b981', // Emerald #10b981
      glowClass: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]',
      textAccent: 'text-emerald-400',
      bgGlow: 'bg-emerald-950/20',
      borderAccent: 'border-emerald-900/40',
      badgeBg: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
    },
  }[variant];

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center justify-between relative overflow-hidden transition-all duration-300 hover:border-zinc-700 ${variantStyles.bgGlow}`}
    >
      {/* Subtle top indicator */}
      <div className="w-full flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        <span
          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${variantStyles.badgeBg}`}
        >
          Target: {benchmarkValue}
        </span>
      </div>

      {/* SVG Circular Dial */}
      <div className="relative flex items-center justify-center my-2">
        <svg
          width={size}
          height={size}
          className="transform -rotate-[210deg]"
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background Track Circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#27272a" /* zinc-800 */
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
          />

          {/* Active Progress Dial Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={variantStyles.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-out ${variantStyles.glowClass}`}
          />
        </svg>

        {/* Center Display Value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
          <div className="flex items-baseline">
            <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
              {typeof value === 'number' ? value.toFixed(1) : value}
            </span>
            {unit && (
              <span className={`ml-1 text-sm font-bold font-mono ${variantStyles.textAccent}`}>
                {unit}
              </span>
            )}
          </div>
          <span className="text-[11px] text-zinc-400 font-medium mt-0.5">
            {benchmarkLabel}
          </span>
        </div>
      </div>

      {/* Subtitle / Interpretive Caption */}
      <div className="w-full pt-3 border-t border-zinc-800/80 text-center">
        <p className="text-xs text-zinc-400 line-clamp-2">
          {subtitle}
        </p>
      </div>
    </div>
  );
};
