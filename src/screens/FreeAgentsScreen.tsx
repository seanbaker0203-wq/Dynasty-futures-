import React, { useState } from 'react';
import { useRoster } from '../context/RosterContext';
import { PlayerRow } from '../components/PlayerRow';

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE'];

export const FreeAgentsScreen: React.FC = () => {
  const { evaluation, isDemo } = useRoster();
  const [pos, setPos] = useState('All');
  const all = evaluation?.free_agents || [];
  const list = pos === 'All' ? all : all.filter((p) => p.position === pos);

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">
        {isDemo
          ? 'Sample data.'
          : 'Players with a market value that nobody in your league rosters, best first. Deep stashes without a market value are not listed.'}
      </p>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="Position">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pos === p}
            onClick={() => setPos(p)}
            className={`shrink-0 rounded-full border px-3.5 py-1 font-semibold text-[14px] ${
              pos === p ? 'border-ink bg-ink text-paper' : 'border-line text-muted'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-muted">No valued free agents{pos !== 'All' ? ` at ${pos}` : ''} right now.</p>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {list.map((p) => (
            <PlayerRow key={p.id} player={p} />
          ))}
        </div>
      )}
    </div>
  );
};
