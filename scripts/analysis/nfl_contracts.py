#!/usr/bin/env python3
"""NFL contracts → per-player contract outlook + measured effects of team changes.

Inputs (download first):
  historical_contracts.parquet  https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.parquet
                                (OverTheCap data via nflverse)
  rosters/roster_YYYY.csv       https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_YYYY.csv
  player_seasons.json           from build_player_seasons.py (Sleeper stats by season)

Usage:
  python3 nfl_contracts.py <contracts.parquet> <rosters dir> <player_seasons.json> <out dir: data/> <current season>

Writes:
  data/nfl-contracts.json     per Sleeper id: current deal, yearly cap / dead money / savings, free-agent year, "out" year
  data/contract-effects.json  measured: production change after free agency / trade / release vs players who stayed,
                              chance of changing teams in free agency, and veteran-deal survival after guarantees run out
"""
import csv, json, sys, os, statistics
from collections import defaultdict
import pyarrow.parquet as pq

PARQ, RDIR, PSEASONS, OUT, CUR = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
POS = ('QB', 'RB', 'WR', 'TE')
VET_TYPES = {'UFA', 'Extension', 'Franchise', 'Transition', 'RFA', 'Other'}

# ---- ids and teams by season -------------------------------------------------------------------------
gsis_to_sleeper, team_by = {}, {}  # team_by[(sleeper_id, season)] = team
for f in sorted(os.listdir(RDIR)):
    if not f.endswith('.csv'): continue
    for r in csv.DictReader(open(os.path.join(RDIR, f))):
        sid, gid = r.get('sleeper_id') or '', r.get('gsis_id') or ''
        if sid and sid != 'NA' and gid and gid != 'NA': gsis_to_sleeper[gid] = sid
        if sid and sid != 'NA': team_by[(sid, int(r['season']))] = r['team']

ps = json.load(open(PSEASONS))
season_of = {(r['id'], r['season']): r for r in ps}

# ---- contracts, one history per player ----------------------------------------------------------------
rows = pq.read_table(PARQ).to_pylist()
hist, current = {}, {}
for x in rows:
    gid = x.get('gsis_id')
    if not gid or x.get('position') not in POS: continue
    if x.get('contract_history'): hist[gid] = (x['position'], x['contract_history'])
    if x.get('is_active'):
        prev = current.get(gid)
        if not prev or (x['year_signed'], x['years']) > (prev['year_signed'], prev['years']): current[gid] = x

def contract_at(h, season):
    """The (non-practice) contract in force for a season: latest signed on or before it."""
    best = None
    for c in h:
        if c.get('contract_type') in ('Practice', None, ''): continue
        ys = c.get('year_signed') or 0
        if ys <= season and (best is None or ys >= best['year_signed']): best = c
    return best

def age_bucket(a): return '≤25' if a < 26 else '26-28' if a < 29 else '29+'

# ---- 1. what happens after a team change ----------------------------------------------------------------
pairs = defaultdict(list)  # (pos, kind, age_bucket) -> [(ppg_t, ppg_t1 or None)]
fa_total, fa_left = defaultdict(int), defaultdict(int)
for gid, (pos, h) in hist.items():
    sid = gsis_to_sleeper.get(gid)
    if not sid: continue
    for t in range(2012, CUR - 1):
        a, b = season_of.get((sid, t)), season_of.get((sid, t + 1))
        if not a or a['gp'] < 6: continue
        ppg_t = a['half'] / a['gp']
        if ppg_t < 5: continue  # fantasy-relevant players only
        ta, tb = team_by.get((sid, t)), team_by.get((sid, t + 1))
        c = contract_at(h, t)
        if not c: continue
        end = (c['year_signed'] or 0) + (c['yrs'] or 1) - 1
        if end == t and c.get('status') == 'Expired':
            fa_total[(pos, age_bucket(a['age']))] += 1
            if ta and tb and ta != tb: fa_left[(pos, age_bucket(a['age']))] += 1
        if not ta: continue
        if tb == ta: kind = 'stayed'
        elif c.get('status') == 'Traded': kind = 'traded'
        elif c.get('status') in ('Terminated', 'June 1 Terminated', 'Claimed'): kind = 'released'
        elif end == t: kind = 'free_agent'
        elif tb is None: kind = 'released'
        else: continue
        ppg_t1 = (b['half'] / b['gp']) if b and b['gp'] >= 4 else None
        pairs[(pos, kind, age_bucket(a['age']))].append((ppg_t, ppg_t1))

effects = {}
for pos in POS:
    effects[pos] = {}
    for kind in ('free_agent', 'traded', 'released'):
        num = den = n = played = 0
        for ab in ('≤25', '26-28', '29+'):
            mv, st = pairs.get((pos, kind, ab), []), pairs.get((pos, 'stayed', ab), [])
            mv_p = [(x, y) for x, y in mv if y is not None]
            st_p = [(x, y) for x, y in st if y is not None]
            if len(mv_p) < 5 or len(st_p) < 20: continue
            r_mv = sum(y for _, y in mv_p) / sum(x for x, _ in mv_p)
            r_st = sum(y for _, y in st_p) / sum(x for x, _ in st_p)
            w = len(mv)
            num += w * (r_mv / r_st); den += w; n += len(mv); played += len(mv_p)
        st_all = [p for ab in ('≤25', '26-28', '29+') for p in pairs.get((pos, 'stayed', ab), [])]
        st_play = sum(1 for _, y in st_all if y is not None) / max(1, len(st_all))
        if den:
            effects[pos][kind] = {
                'ppg_vs_stayers': round(num / den, 3),  # per-game production next season vs similar players who stayed
                'played_next_season': round(played / n, 3),  # share who played 4+ games next season
                'stayers_played_next_season': round(st_play, 3),
                'n': n,
            }

# Average yearly move risk by position/age (what the age curves already include), as a production factor.
baseline = {}
for pos in POS:
    for ab in ('≤25', '26-28', '29+'):
        groups = {k: pairs.get((pos, k, ab), []) for k in ('stayed', 'free_agent', 'traded', 'released')}
        total = sum(len(v) for v in groups.values())
        if total < 30: continue
        st = groups['stayed']
        st_play = sum(1 for _, y in st if y is not None) / max(1, len(st))
        st_p = [(x, y) for x, y in st if y is not None]
        r_st = sum(y for _, y in st_p) / max(1e-9, sum(x for x, _ in st_p))
        factor = 0.0
        for k, v in groups.items():
            if not v: continue
            vp = [(x, y) for x, y in v if y is not None]
            r = (sum(y for _, y in vp) / max(1e-9, sum(x for x, _ in vp))) / r_st if vp else 0
            play = len(vp) / len(v)
            f = 1.0 if k == 'stayed' else r * play / st_play
            factor += len(v) / total * f
        baseline[f'{pos}|{ab}'] = {'factor': round(factor, 3), 'move_share': round(1 - len(st) / total, 3), 'n': total}

fa_leave = {f'{pos}|{ab}': {'left': fa_left[(pos, ab)], 'n': fa_total[(pos, ab)], 'rate': round(fa_left[(pos, ab)] / fa_total[(pos, ab)], 3)}
            for (pos, ab) in fa_total if fa_total[(pos, ab)] >= 10}

# ---- 2. veteran deals: how long they last vs guarantees -------------------------------------------------
surv = defaultdict(lambda: defaultdict(int))  # pos -> {'deals', 'cut_by_gyears+1', ...}
for gid, (pos, h) in hist.items():
    hs = sorted([c for c in h if c.get('contract_type') not in ('Practice', None, '')], key=lambda c: c['year_signed'] or 0)
    for i, c in enumerate(hs):
        if c.get('contract_type') not in VET_TYPES or (c.get('yrs') or 0) < 2 or not c.get('apy'): continue
        ys = c['year_signed'] or 0
        if ys < 2012 or ys + c['yrs'] - 1 >= CUR: continue  # finished deals only
        nxt = next((d for d in hs[i + 1:] if (d['year_signed'] or 0) > ys), None)
        served = ((nxt['year_signed'] - ys) if nxt else c['yrs']) if c.get('status') in ('Terminated', 'June 1 Terminated', 'Traded', 'Claimed') else c['yrs']
        served = max(1, min(served, c['yrs']))
        g_years = max(1, round((c.get('guarantees') or 0) / c['apy'])) if c['apy'] else 1
        big = (c['apy'] or 0) >= {'QB': 25, 'RB': 8, 'WR': 15, 'TE': 10}[pos]
        key = pos + ('|big' if big else '')
        for k in (pos, key) if big else (pos,):
            s = surv[k]
            s['deals'] += 1
            s['years_signed'] += c['yrs']
            s['years_served'] += served
            s['ended_early'] += served < c['yrs']
            if served < c['yrs'] and served <= g_years + 1: s['ended_within_1yr_of_guarantees'] += 1
            s['reached_past_guarantees'] += c['yrs'] > g_years
            if c['yrs'] > g_years and served <= g_years + 1 and served < c['yrs']: s['cut_when_guarantees_ran_out'] += 1
survival = {}
for k, s in surv.items():
    if s['deals'] < 15: continue
    survival[k] = {
        'deals': s['deals'],
        'share_of_years_served': round(s['years_served'] / s['years_signed'], 3),
        'ended_early': round(s['ended_early'] / s['deals'], 3),
        'cut_soon_after_guarantees': round(s['cut_when_guarantees_ran_out'] / max(1, s['reached_past_guarantees']), 3),
    }

# ---- 3. current deals: yearly cap, dead money if cut, savings ------------------------------------------
TAG_TYPES = {'Franchise', 'Transition'}
out_players = {}
for gid, x in current.items():
    sid = gsis_to_sleeper.get(gid)
    if not sid: continue
    pos, h = hist.get(gid, (x['position'], []))
    sh = [s for s in (x.get('season_history') or []) if (s.get('year') or '').isdigit()]
    by_year = {int(s['year']): s for s in sh}
    start, yrs = x['year_signed'], x['years']
    end = start + yrs - 1
    ctype = next((c.get('contract_type') for c in reversed(h) if c.get('year_signed') == start and c.get('contract_type') not in ('Practice',)), None)
    years = []
    for y in range(max(CUR + 1, start), end + 1):
        s = by_year.get(y)
        if not s: continue
        cap = s.get('cap_number') or 0
        dead = sum((by_year[z].get('prorated_bonus') or 0) for z in by_year if z >= y) + sum((by_year[z].get('guaranteed_salary') or 0) for z in by_year if z >= y)
        dead = min(dead, sum((by_year[z].get('cap_number') or 0) for z in by_year if z >= y) or dead)
        years.append({'season': y, 'cap': round(cap, 2), 'dead_if_cut': round(dead, 2), 'savings_if_cut': round(cap - dead, 2)})
    out_year = next((r['season'] for r in years if r['cap'] > 0 and r['savings_if_cut'] >= 0.5 * r['cap']), None)
    # First-round rookie deals carry a fifth-year team option: free agency comes a year later if it's exercised.
    option_year = end + 1 if ctype == 'Drafted' and x.get('draft_round') == 1 and yrs == 4 else None
    out_players[sid] = {
        'option_year': option_year,
        'team': x.get('team'),
        'type': ctype,  # Drafted (rookie deal), UFA, Extension, Franchise, ...
        'signed': start,
        'years': yrs,
        'through': end,
        'apy': round(x.get('apy') or 0, 2),  # $M per year
        'guaranteed': round(x.get('guaranteed') or 0, 2),
        'free_agent_year': end + (2 if option_year else 1),
        'out_year': out_year,  # first season the team saves at least half the cap hit by cutting him
        'by_season': years,
    }

os.makedirs(OUT, exist_ok=True)
meta = {'source': 'OverTheCap via nflverse (historical_contracts)', 'built_for_season': CUR}
json.dump({'meta': meta, 'players': out_players}, open(os.path.join(OUT, 'nfl-contracts.json'), 'w'), separators=(',', ':'))
json.dump({'meta': meta, 'move_effects': effects, 'free_agent_leave_rate': fa_leave, 'veteran_deal_survival': survival, 'annual_baseline': baseline},
          open(os.path.join(OUT, 'contract-effects.json'), 'w'), indent=1)
print('players with current deals', len(out_players))
print(json.dumps({'annual_baseline': baseline}, indent=1))
