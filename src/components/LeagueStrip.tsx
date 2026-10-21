import React from 'react';

/**
 * Every team in the league as a tick on one line, scaled from lowest to highest,
 * with your team in gold and the league median marked. Reads "where am I" at a glance.
 */
export const LeagueStrip: React.FC<{ values: { id: string; value: number }[]; mine: string; label: string }> = ({
  values,
  mine,
  label,
}) => {
  if (values.length < 2) return null;
  const nums = values.map((v) => v.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const pos = (v: number) => `${((v - min) / span) * 100}%`;

  return (
    <div className="relative h-4 mx-1.5" role="img" aria-label={label}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <div className="absolute top-0.5 bottom-0.5 w-px bg-muted/50" style={{ left: pos(median) }} />
      {values
        .filter((v) => v.id !== mine)
        .map((v) => (
          <span
            key={v.id}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-muted/60"
            style={{ left: pos(v.value) }}
          />
        ))}
      {values
        .filter((v) => v.id === mine)
        .map((v) => (
          <span
            key={v.id}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold ring-2 ring-card"
            style={{ left: pos(v.value) }}
          />
        ))}
    </div>
  );
};
