import React from 'react';
import type { ManagerProfile } from '../types';

/** "How this manager trades": tags plus one plain-language line. */
export const ManagerProfileNote: React.FC<{ profile?: ManagerProfile | null; compact?: boolean }> = ({ profile, compact }) => {
  if (!profile) return null;
  return (
    <div className="space-y-1.5">
      {!compact && <div className="text-[13px] font-semibold">How they trade</div>}
      {profile.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.tags.map((t) => (
            <span key={t} className="rounded px-1.5 py-px text-[12px] font-semibold bg-ink-soft text-ink">
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="text-[14px] text-muted">{profile.summary}</p>
    </div>
  );
};
