import React, { useEffect, useState } from 'react';
import { apiPost } from '../lib/api';

interface PlayerUsage {
  team: string;
  position: string;
  weeks: { week: number; pct: number; snaps: number }[];
  season_pct: number;
  last3_pct: number;
  trend: number | null;
  team_rank: number;
  depth: { position: string; order: number } | null;
}
interface UsageResponse {
  season: number;
  through_week: number;
  players: Record<string, PlayerUsage>;
}

// One request per batch of ids opened close together; results kept for the visit.
const memo = new Map<string, Promise<PlayerUsage | null>>();
export function fetchUsage(id: string): Promise<PlayerUsage | null> {
  if (!memo.has(id))
    memo.set(
      id,
      apiPost<UsageResponse>('/api/usage', { ids: [id] })
        .then((r) => r.players[id] ?? null)
        .catch(() => {
          memo.delete(id);
          return null;
        })
    );
  return memo.get(id)!;
}

/** Snap share by week and his rank among teammates at the position (Sleeper's depth chart was too stale to show). */
export const UsageDetail: React.FC<{ sleeperId?: string | null; position: string }> = ({ sleeperId, position }) => {
  const [u, setU] = useState<PlayerUsage | null | undefined>(undefined);
  useEffect(() => {
    if (!sleeperId || !['QB', 'RB', 'WR', 'TE'].includes(position)) return setU(null);
    let live = true;
    fetchUsage(sleeperId).then((x) => live && setU(x));
    return () => {
      live = false;
    };
  }, [sleeperId, position]);
  if (!u) return null;

  const role = `${u.position}${u.team_rank} by snaps on ${u.team}`;
  const trend = u.trend == null || Math.abs(u.trend) < 5 ? null : u.trend;
  const max = 100;
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-semibold">Usage</div>
      <p className="text-[13px]">
        <span className="font-semibold">{role}</span>
        <span className="text-muted">
          {' '}
          · {Math.round(u.last3_pct)}% of snaps, last 3 games
          {trend != null && (
            <span className={trend > 0 ? 'text-up' : 'text-down'}>
              {' '}
              ({trend > 0 ? 'up' : 'down'} {Math.abs(Math.round(trend))} pts)
            </span>
          )}{' '}
          · {Math.round(u.season_pct)}% this season
        </span>
      </p>
      <div className="flex items-end gap-[3px] h-12" role="img" aria-label={`Snap share by week: ${u.weeks.map((w) => `week ${w.week} ${Math.round(w.pct)}%`).join(', ')}`}>
        {u.weeks.map((w) => (
          <div key={w.week} className="flex-1 max-w-[18px] flex flex-col items-center justify-end h-full" title={`Week ${w.week}: ${Math.round(w.pct)}% (${w.snaps} snaps)`}>
            <div className="w-full rounded-sm bg-ink/70" style={{ height: `${Math.max(3, (w.pct / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] text-[10px] text-muted">
        {u.weeks.map((w) => (
          <span key={w.week} className="flex-1 max-w-[18px] text-center">
            {w.week}
          </span>
        ))}
      </div>
    </div>
  );
};
