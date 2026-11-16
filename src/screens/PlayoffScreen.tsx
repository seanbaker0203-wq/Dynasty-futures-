import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoster } from '../context/RosterContext';
import { apiPost } from '../lib/api';
import { fmt } from '../lib/leagueStats';

interface PPlayer {
  key: string;
  name: string;
  position: string;
  nfl_team: string | null;
  age: number | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_record: string | null;
  owner_out: boolean;
  value: number;
  games: number;
  ppg: number;
  playoff_ppg: number;
  grade: number;
  opponents: string[];
  injury: string | null;
  designation: string | null;
}
interface PlayoffRun {
  season: number;
  weeks: number[];
  through_week: number;
  scoring: string;
  mine: PPlayer[];
  targets: PPlayer[];
  waivers: PPlayer[];
  trade_deadline: { at: string; week: number | null; source: 'platform' } | null;
  build_later: (PPlayer & { why: string })[];
  schedules: Record<string, { team: string; grade: number; opponents: string[] }[]>;
}

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/** Matchup chip: green easy, grey neutral, red tough. */
const Grade: React.FC<{ g: number }> = ({ g }) => {
  const pct = Math.round((g - 1) * 100);
  const cls = g >= 1.05 ? 'bg-up/12 text-up' : g <= 0.95 ? 'bg-down/12 text-down' : 'bg-line text-muted';
  return (
    <span className={`inline-block rounded px-1.5 py-px text-[11px] font-semibold ${cls}`} title="Playoff matchups vs an average schedule">
      {pct >= 0 ? '+' : '−'}
      {Math.abs(pct)}%
    </span>
  );
};

/** My playoff lineup by the league's slots (best playoff estimate first), and each slot's floor. */
function lineupOf(mine: PPlayer[], slots: Record<string, number>) {
  const pool = mine.filter((p) => !['IR', 'Out', 'PUP', 'Sus'].includes(p.injury ?? '') && p.designation !== 'IR' && p.designation !== 'TAXI');
  const used = new Set<string>();
  const starters: { slot: string; p: PPlayer | null }[] = [];
  const take = (slot: string, ok: (p: PPlayer) => boolean) => {
    const p = pool.filter((x) => !used.has(x.key) && ok(x)).sort((a, b) => b.playoff_ppg - a.playoff_ppg)[0] ?? null;
    if (p) used.add(p.key);
    starters.push({ slot, p });
  };
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) for (let i = 0; i < (slots[pos] || 0); i++) take(pos, (x) => x.position === pos);
  for (let i = 0; i < (slots.FLEX || 0); i++) take('FLEX', (x) => ['RB', 'WR', 'TE'].includes(x.position));
  for (let i = 0; i < (slots.SUPER_FLEX || 0); i++) take('SF', (x) => ['QB', 'RB', 'WR', 'TE'].includes(x.position));
  return starters;
}

/** Weekly playoff points he'd add over the starter he'd replace in my lineup. */
function gainFor(t: PPlayer, starters: { slot: string; p: PPlayer | null }[]) {
  const fits = starters.filter(
    (s) => s.slot === t.position || (s.slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(t.position)) || (s.slot === 'SF' && t.position !== 'K' && t.position !== 'DEF')
  );
  if (!fits.length) return 0;
  const weakest = Math.min(...fits.map((s) => s.p?.playoff_ppg ?? 0));
  return Math.max(0, Math.round((t.playoff_ppg - weakest) * 10) / 10);
}

const deadlineKey = (lrKey: string) => `df:trade-deadline:${lrKey}`;
function readStored(lrKey: string): string | null {
  try {
    return localStorage.getItem(deadlineKey(lrKey));
  } catch {
    return null;
  }
}
function countdown(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return d > 0 ? `${d} day${d === 1 ? '' : 's'}, ${h} hr` : h > 0 ? `${h} hr ${min} min` : `${min} min`;
}
/** datetime-local value in the viewer's time zone */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const Who: React.FC<{ p: PPlayer }> = ({ p }) => (
  <span className="block text-[12px] text-muted truncate">
    {p.owner_name ? (
      <>
        {p.owner_name}
        {p.owner_record ? ` (${p.owner_record})` : ''}
        {p.owner_out && <span className="ml-1 font-semibold text-gold">likely seller</span>}
      </>
    ) : (
      <span className="font-semibold text-up">Free agent</span>
    )}
  </span>
);

/** My team → Playoff run: best fantasy-playoff schedules, upgrades for your lineup, and players to buy cheap for later. */
export const PlayoffScreen: React.FC = () => {
  const { evaluation, leagueRequest } = useRoster();
  const [data, setData] = useState<PlayoffRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState('All');
  const [sellersOnly, setSellersOnly] = useState(false);
  const [schedPos, setSchedPos] = useState('RB');
  const lr = leagueRequest();
  const lrKey = lr ? `${lr.platform}:${lr.league_id}:${lr.franchise_id}` : '';
  // Trade deadline: what you set for this league (saved on this device), else what the platform says.
  const [stored, setStored] = useState<string | null>(() => readStored(lrKey));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setStored(readStored(lrKey)), [lrKey]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const saveDeadline = (value: string | null) => {
    try {
      if (value) localStorage.setItem(deadlineKey(lrKey), value);
      else localStorage.removeItem(deadlineKey(lrKey));
    } catch {
      /* private mode: keep it for this visit only */
    }
    setStored(value);
    setEditing(false);
  };

  useEffect(() => {
    if (!lr) return;
    const ac = new AbortController();
    setData(null);
    setError(null);
    apiPost<PlayoffRun>('/api/playoffs', lr, ac.signal)
      .then(setData)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lrKey]);

  const slots = (evaluation?.settings?.slots || {}) as Record<string, number>;
  const starters = useMemo(() => (data ? lineupOf(data.mine, slots) : []), [data, slots]);
  const deadlineAt = stored ?? data?.trade_deadline?.at ?? null;
  const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : null;
  const tradesClosed = deadlineMs != null && now >= deadlineMs;
  const upgrades = useMemo(() => {
    if (!data) return [];
    return (tradesClosed ? data.waivers : data.targets)
      .map((t) => ({ t, gain: gainFor(t, starters) }))
      .filter((x) => x.gain >= 0.5 && (pos === 'All' || x.t.position === pos) && (tradesClosed || !sellersOnly || x.t.owner_out || !x.t.owner_id))
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 25);
  }, [data, starters, pos, sellersOnly, tradesClosed]);

  if (error) return <p role="alert" className="text-down">{error}</p>;
  if (!data)
    return (
      <p className="flex items-center gap-2 text-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Grading playoff schedules
      </p>
    );

  const weeks = `weeks ${data.weeks[0]}–${data.weeks[data.weeks.length - 1]}`;
  const when = deadlineMs
    ? new Date(deadlineMs).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const left = deadlineMs ? deadlineMs - now : 0;
  return (
    <div className="space-y-8">
      <section
        aria-label="Trade deadline"
        className={`rounded-xl border p-4 space-y-2 ${!deadlineMs ? 'border-line bg-card' : tradesClosed ? 'border-line bg-card' : left < 2 * 86400000 ? 'border-down/50 bg-down/5' : 'border-gold/50 bg-card'}`}
      >
        {deadlineMs && !editing ? (
          <>
            <p className="text-[13px] font-semibold text-muted">League trade deadline</p>
            {tradesClosed ? (
              <p className="text-[15px]">
                <span className="font-semibold">Passed</span> ({when}). Trades are closed, so upgrades below are free agents you can add.
              </p>
            ) : (
              <p>
                <span className="display text-[28px] text-ink">{countdown(left)}</span>
                <span className="block text-[13px] text-muted">left to trade · {when}</span>
              </p>
            )}
            <p className="text-[12px] text-muted">
              {stored ? 'You set this date.' : data.trade_deadline?.week ? `From your league: trades end after Week ${data.trade_deadline.week}.` : 'From your league settings.'}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setDraft(toLocalInput(deadlineAt!));
                  setEditing(true);
                }}
              >
                Change
              </button>
              {stored && data.trade_deadline && (
                <>
                  {' · '}
                  <button type="button" className="underline" onClick={() => saveDeadline(null)}>
                    Use league's
                  </button>
                </>
              )}
            </p>
          </>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft) saveDeadline(new Date(draft).toISOString());
            }}
          >
            <label htmlFor="po-deadline" className="block text-[14px]">
              <span className="font-semibold">When is your league's trade deadline?</span>
              <span className="block text-[13px] text-muted">
                {lr?.platform === 'mfl' ? "MFL doesn't share it, so set it once. " : ''}After it passes, this page switches from trade targets to free agents.
              </span>
            </label>
            <div className="flex gap-2">
              <input id="po-deadline" type="datetime-local" className="field" value={draft} onChange={(e) => setDraft(e.target.value)} required />
              <button type="submit" className="btn-primary shrink-0">
                Save
              </button>
              {editing && (
                <button type="button" className="btn-quiet shrink-0" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      <p className="text-[14px] text-muted">
        Your fantasy playoffs are {weeks}. Matchups are graded by the fantasy points each defense has allowed to that position in weeks
        1–{data.through_week}, scaled back because a half-season is a small sample. Estimates are this season's points per game × that
        grade. Kickers and defenses use standard scoring.
      </p>

      <section>
        <h2 className="display text-[24px] text-ink">Your playoff lineup</h2>
        <ul className="divide-y divide-line border-y border-line mt-2">
          {starters.map((s, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-[14px]">
              <span className="w-10 text-[12px] font-semibold text-muted">{s.slot}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{s.p?.name ?? 'Empty'}</span>
                {s.p && <span className="block text-[12px] text-muted">{s.p.opponents.join(' · ')}</span>}
              </span>
              {s.p && <Grade g={s.p.grade} />}
              <span className="w-12 text-right font-semibold">{s.p ? s.p.playoff_ppg.toFixed(1) : '–'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="display text-[24px] text-ink">{tradesClosed ? 'Best waiver pickups for your playoff run' : 'Best upgrades for your playoff run'}</h2>
        <p className="text-[14px] text-muted">
          {tradesClosed ? 'Free agents only. ' : ''}Points a week each player would add over the starter he'd replace in your lineup.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPos(p)}
              aria-pressed={pos === p}
              className={`rounded-full border px-3 py-1 font-semibold text-[13px] ${pos === p ? 'border-ink bg-ink text-paper' : 'border-line text-muted'}`}
            >
              {p}
            </button>
          ))}
          {!tradesClosed && <label className="flex items-center gap-1.5 text-[13px] ml-auto">
            <input type="checkbox" checked={sellersOnly} onChange={(e) => setSellersOnly(e.target.checked)} /> Losing teams and free agents only
          </label>}
        </div>
        {upgrades.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {upgrades.map(({ t, gain }) => (
              <li key={t.key} className="flex items-center gap-3 py-2.5 text-[14px]">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">
                    {t.name} <span className="text-[12px] font-medium text-muted">{t.position} {t.nfl_team}</span>
                  </span>
                  <Who p={t} />
                  <span className="block text-[12px] text-muted">
                    {t.opponents.join(' · ')} · {t.ppg} a game now{t.value ? ` · value ${fmt(t.value)}` : ''}
                  </span>
                </span>
                <Grade g={t.grade} />
                <span className="text-right shrink-0 w-16">
                  <span className="block font-semibold text-up">+{gain.toFixed(1)}</span>
                  <span className="block text-[11px] text-muted">{t.playoff_ppg.toFixed(1)}/wk</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{tradesClosed ? 'No free agent beats your starters here right now. Check back after injuries and bye weeks.' : 'No clear upgrades at this position.'}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="display text-[24px] text-ink">Build for later</h2>
        <p className="text-[14px] text-muted">
          Valuable players who are hurt or underperforming. A team out of the race, or a frustrated owner, may sell them cheap. Likely
          sellers first.
        </p>
        <ul className="divide-y divide-line border-y border-line">
          {data.build_later.map((p) => (
            <li key={p.key} className="py-2.5 text-[14px]">
              <div className="flex items-baseline gap-3">
                <span className="flex-1 min-w-0 font-semibold truncate">
                  {p.name}{' '}
                  <span className="text-[12px] font-medium text-muted">
                    {p.position} {p.nfl_team}
                    {p.age ? `, ${Math.floor(p.age)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">{fmt(p.value)}</span>
              </div>
              <Who p={p} />
              <span className="block text-[12px] text-muted">{p.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="display text-[24px] text-ink">Easiest playoff schedules</h2>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.slice(1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSchedPos(p)}
              aria-pressed={schedPos === p}
              className={`rounded-full border px-3 py-1 font-semibold text-[13px] ${schedPos === p ? 'border-ink bg-ink text-paper' : 'border-line text-muted'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <ol className="divide-y divide-line border-y border-line text-[14px]">
          {(data.schedules[schedPos] || []).slice(0, 10).map((s, i) => (
            <li key={s.team} className="flex items-center gap-3 py-2">
              <span className="w-5 text-muted">{i + 1}</span>
              <span className="w-12 font-semibold">{s.team}</span>
              <span className="flex-1 text-muted text-[13px]">{s.opponents.join(' · ')}</span>
              <Grade g={s.grade} />
            </li>
          ))}
        </ol>
        <p className="text-[12px] text-muted">Hardest: {(data.schedules[schedPos] || []).slice(-3).reverse().map((s) => s.team).join(', ')}.</p>
      </section>
    </div>
  );
};
