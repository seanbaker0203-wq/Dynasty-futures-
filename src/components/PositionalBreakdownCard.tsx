/**
 * Dynasty AI Evaluator - Positional Breakdown Component (Slice 6)
 * Displays capital allocation shares and age metrics by position group.
 */

import React from 'react';
import { PositionalBreakdown } from '../types';
import { Layers } from 'lucide-react';

interface PositionalBreakdownCardProps {
  breakdown: Record<string, PositionalBreakdown>;
}

export const PositionalBreakdownCard: React.FC<PositionalBreakdownCardProps> = ({ breakdown }) => {
  const positions = ['QB', 'RB', 'WR', 'TE', 'PICK'].filter((p) => breakdown[p] && breakdown[p].count > 0);

  const getPositionColor = (pos: string) => {
    switch (pos) {
      case 'QB':
        return { bar: 'bg-rose-500', text: 'text-rose-400', badge: 'bg-rose-950/60 text-rose-300 border-rose-800/60' };
      case 'RB':
        return { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60' };
      case 'WR':
        return { bar: 'bg-cyan-500', text: 'text-cyan-400', badge: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60' };
      case 'TE':
        return { bar: 'bg-amber-500', text: 'text-amber-400', badge: 'bg-amber-950/60 text-amber-300 border-amber-800/60' };
      default:
        return { bar: 'bg-purple-500', text: 'text-purple-400', badge: 'bg-purple-950/60 text-purple-300 border-purple-800/60' };
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold tracking-tight text-white uppercase font-mono">
            Capital Allocation By Position
          </h3>
        </div>
        <span className="text-xs text-zinc-400 font-mono">
          Target: 30% QB • 20% RB • 40% WR • 10% TE
        </span>
      </div>

      {/* Visual Stacked Bar */}
      <div className="w-full h-3 rounded-full bg-zinc-950 overflow-hidden flex my-4 border border-zinc-800">
        {positions.map((pos) => {
          const item = breakdown[pos];
          const color = getPositionColor(pos);
          return (
            <div
              key={pos}
              style={{ width: `${item.share_of_roster}%` }}
              className={`${color.bar} h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full`}
              title={`${pos}: ${item.share_of_roster}% (${item.total_value.toLocaleString()} pts)`}
            />
          );
        })}
      </div>

      {/* Grid of Position Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 pt-1">
        {positions.map((pos) => {
          const item = breakdown[pos];
          const color = getPositionColor(pos);
          return (
            <div
              key={pos}
              className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-3 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded border font-mono ${color.badge}`}
                >
                  {pos} ({item.count})
                </span>
                <span className="text-xs font-mono font-bold text-white">
                  {item.share_of_roster}%
                </span>
              </div>

              <div>
                <div className="text-xs font-mono text-zinc-300 font-semibold">
                  {item.total_value.toLocaleString()} <span className="text-[10px] text-zinc-500 font-sans">pts</span>
                </div>
                <div className="text-[11px] text-zinc-400 font-mono flex items-center justify-between mt-1">
                  <span>Avg Age:</span>
                  <span className={item.avg_age > 28.5 ? 'text-amber-400' : 'text-emerald-400'}>
                    {item.avg_age || '—'} yrs
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
