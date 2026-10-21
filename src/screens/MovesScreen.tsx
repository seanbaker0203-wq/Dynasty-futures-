import React from 'react';
import { useRoster } from '../context/RosterContext';

const SEVERITY: Record<string, { label: string; cls: string }> = {
  critical: { label: 'Fix soon', cls: 'text-down' },
  warning: { label: 'Worth doing', cls: 'text-gold' },
  opportunity: { label: 'Opportunity', cls: 'text-up' },
};

export const MovesScreen: React.FC = () => {
  const { evaluation, setActiveView } = useRoster();
  const moves = evaluation?.remediations || [];

  if (moves.length === 0) {
    return (
      <div className="py-10 space-y-3">
        <h2 className="display text-[30px] text-ink">Nothing urgent</h2>
        <p className="text-muted">Your roster passes every check. Look for upgrades in the trade builder.</p>
        <button type="button" className="btn-primary" onClick={() => setActiveView('trade')}>
          Open trade builder
        </button>
      </div>
    );
  }

  const order = { critical: 0, warning: 1, opportunity: 2 } as Record<string, number>;
  return (
    <ol className="divide-y divide-line">
      {[...moves]
        .sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3))
        .map((mv, i) => {
          const sev = SEVERITY[mv.severity] ?? SEVERITY.opportunity;
          return (
            <li key={i} className="py-5 space-y-2">
              <div className="text-[13px] font-semibold">
                <span className={sev.cls}>{sev.label}</span>
                <span className="text-muted">, {mv.metric_name}: {mv.current_value} (aim for {mv.threshold})</span>
              </div>
              <h3 className="text-[18px] font-semibold text-ink leading-snug">{mv.actionable_step}</h3>
              <p className="text-muted">{mv.issue}</p>
              {mv.recommended_moves?.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-[15px]">
                  {mv.recommended_moves.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
    </ol>
  );
};
