import React, { useState } from 'react';
import { useRoster } from '../context/RosterContext';
import { NflChip, SignalTag } from '../components/ValueBits';

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/** Redraft → Waivers: free agents ranked by how much they add to your lineup, with a FAAB bid guide. */
export const WaiversScreen: React.FC = () => {
  const { evaluation } = useRoster();
  const [pos, setPos] = useState('All');
  const r = evaluation?.redraft;
  if (!evaluation || !r) return <p className="text-muted">Waiver tools are for redraft leagues.</p>;
  const list = r.waivers.filter((w) => pos === 'All' || w.player.position === pos);

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">
        Ranked by points per week each player adds to your best lineup for the rest of the season (playoff weeks count extra).
        {r.faab_remaining != null && (
          <>
            {' '}
            You have <span className="font-semibold text-text">${r.faab_remaining}</span>
            {r.faab_budget != null ? ` of $${r.faab_budget}` : ''} FAAB left. Bids are a guide, not a guarantee.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pos === p}
            onClick={() => setPos(p)}
            className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold border ${pos === p ? 'bg-ink text-paper border-ink' : 'border-line text-muted'}`}
          >
            {p}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-muted py-4">No free agent would crack your lineup{pos !== 'All' ? ` at ${pos}` : ''} right now.</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {list.map((w) => (
            <li key={w.player.id} className="flex items-center gap-3 py-3">
              <span className="w-9 shrink-0 text-[12px] font-semibold text-muted">{w.player.position}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{w.player.full_name}</span>
                <span className="block text-[13px] text-muted">
                  {w.player.nfl_team}
                  {w.player.futures?.ros ? `, ${w.player.futures.ros.ppg} pts/wk` : ''}
                  <SignalTag signal={w.player.futures?.signal} className="ml-2" />
                  <NflChip c={w.player.futures?.nfl_contract} className="ml-2" />
                </span>
                <span className="block text-[13px]">{w.note}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-semibold text-up">+{w.upgrade_ros.toFixed(1)}/wk</span>
                {w.faab && <span className="block text-[13px] text-muted">{w.faab.high <= 1 ? '$0–1' : `$${w.faab.low}–${w.faab.high}`}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
