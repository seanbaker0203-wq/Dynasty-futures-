import React from 'react';
import type { MasterPlayer } from '../types';
import { fmt } from '../lib/leagueStats';
import { SignalTag } from './ValueBits';

export const PlayerRow: React.FC<{
  player: MasterPlayer;
  starter?: boolean;
  right?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  /** Hide the position column when the list is already grouped by position */
  hidePosition?: boolean;
}> = ({ player: p, starter, right, onClick, selected, hidePosition }) => {
  const Tag = onClick ? 'button' : 'div';
  const tag =
    p.roster_designation === 'TAXI' ? 'Taxi' : p.roster_designation === 'IR' ? 'IR' : starter ? 'Starter' : null;
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      className={`w-full flex items-center gap-3 py-2.5 text-left ${onClick ? 'px-2 -mx-2 rounded-lg hover:bg-ink-soft' : ''} ${
        selected ? 'bg-ink-soft' : ''
      }`}
    >
      {!hidePosition && <span className="w-8 shrink-0 text-[12px] font-semibold text-muted">{p.position}</span>}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-text truncate">{p.full_name}</span>
        <span className="block text-[13px] text-muted">
          {p.nfl_team && p.nfl_team !== 'FA' ? p.nfl_team : 'Free agent'}
          {p.age ? `, age ${Math.floor(p.age)}` : ''}
          {tag && <span className={`ml-2 ${tag === 'Starter' ? 'text-ink font-medium' : ''}`}>{tag}</span>}
          <SignalTag signal={p.futures?.signal} className="ml-2" />
        </span>
      </span>
      {right ?? (
        <span className={`font-semibold ${p.market_value ? 'text-text' : 'text-muted'}`}>{p.market_value ? fmt(p.market_value) : '–'}</span>
      )}
    </Tag>
  );
};
