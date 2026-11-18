#!/usr/bin/env python3
"""
Do elite or modern running backs age differently? (Tester question, 18 Nov 2026: Bijan, Gibbs, CMC, Henry, Saquon.)

Data: Sleeper season stats 2012-2025 (fetch_history.sh) + birthdates. For every RB season with 6+ games, compare
half-PPR points per game the NEXT season with this season. A back who doesn't play (or plays < 3 games) next year
counts as 0, so injuries and retirements stay in (no survivorship bias).
Groups: age at 1 Sep; tier by this season's PPG rank among RBs (elite = top 12, starter = 13-24, rest);
era 2012-2018 vs 2019-2024; workload = touches per game.

Usage: python3 rb_aging.py <history dir> [out.json]
"""
import json, sys, datetime, csv, statistics as st
from collections import defaultdict

H = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else None
ids = {}
for r in csv.DictReader(open('/home/claude/dynastyprocess/data/files/db_playerids.csv')):
    if r['sleeper_id'] not in ('', 'NA'): ids[r['sleeper_id']] = r
sp = json.load(open(f'{H}/sleeper_players_full.json'))

def birth(pid):
    b = (ids.get(pid) or {}).get('birthdate')
    if b in (None, '', 'NA'): b = (sp.get(pid) or {}).get('birth_date')
    return b

seasons = defaultdict(dict)  # pid -> year -> row
for y in range(2012, 2026):
    stats = json.load(open(f'{H}/stats_{y}.json'))
    rows = []
    for pid, s in stats.items():
        pos = (ids.get(pid) or {}).get('position') or (sp.get(pid) or {}).get('position')
        if pos != 'RB': continue
        gp = s.get('gp') or 0
        b = birth(pid)
        if not b: continue
        try: age = (datetime.date(y, 9, 1) - datetime.date.fromisoformat(b[:10])).days / 365.25
        except Exception: continue
        pts = s.get('pts_half_ppr') or 0
        touches = (s.get('rush_att') or 0) + (s.get('rec') or 0)
        rows.append(dict(pid=pid, year=y, age=age, gp=gp, ppg=pts / gp if gp else 0, tpg=touches / gp if gp else 0,
                         name=(sp.get(pid) or {}).get('full_name')))
    ranked = sorted([r for r in rows if r['gp'] >= 6], key=lambda r: -r['ppg'])
    for i, r in enumerate(ranked): r['rank'] = i + 1
    for r in rows: seasons[pid := r['pid']][y] = r

pairs = []
for pid, ys in seasons.items():
    for y, r in ys.items():
        if r['gp'] < 6 or y >= 2025 or 'rank' not in r or r['ppg'] < 5: continue
        n = ys.get(y + 1)
        nxt = n['ppg'] if n and n['gp'] >= 3 else 0.0
        pairs.append(dict(r, next=nxt, ratio=min(2.0, nxt / r['ppg']),
                          tier='elite' if r['rank'] <= 12 else 'starter' if r['rank'] <= 24 else 'other',
                          era='2012-18' if y <= 2018 else '2019-24'))

def summary(rows):
    if not rows: return None
    rs = [p['ratio'] for p in rows]
    return dict(n=len(rows), mean=round(st.mean(rs), 3), median=round(st.median(rs), 3),
                fell_off=round(sum(1 for x in rs if x < 0.6) / len(rs), 3))  # lost 40%+ of production

ages = [(23, 25), (25, 27), (27, 28), (28, 29), (29, 30), (30, 40)]
lab = lambda a: f'{a[0]}' if a[1] - a[0] == 1 else (f'{a[0]}-{a[1]-1}' if a[1] < 40 else f'{a[0]}+')
out = {'by_tier': {}, 'by_era': {}, 'elite_by_era': {}, 'by_workload': {}}
for a in ages:
    sel = [p for p in pairs if a[0] <= int(p['age']) < a[1]]
    out['by_tier'][lab(a)] = {t: summary([p for p in sel if p['tier'] == t]) for t in ('elite', 'starter', 'other')}
    out['by_era'][lab(a)] = {e: summary([p for p in sel if p['era'] == e and p['tier'] != 'other']) for e in ('2012-18', '2019-24')}
    out['elite_by_era'][lab(a)] = {e: summary([p for p in sel if p['era'] == e and p['tier'] == 'elite']) for e in ('2012-18', '2019-24')}
    top = [p for p in sel if p['tier'] != 'other']
    out['by_workload'][lab(a)] = {
        'heavy (18+ touches/g)': summary([p for p in top if p['tpg'] >= 18]),
        'lighter (<18)': summary([p for p in top if p['tpg'] < 18]),
    }
# Elite backs 27+ and what happened next, for the write-up.
out['elite_27_plus'] = sorted(
    [dict(name=p['name'], year=p['year'], age=round(p['age'], 1), ppg=round(p['ppg'], 1), next=round(p['next'], 1)) for p in pairs if p['tier'] == 'elite' and p['age'] >= 27],
    key=lambda x: (x['year'], -x['ppg']))
out['pairs'] = len(pairs)
print(json.dumps({k: v for k, v in out.items() if k != 'elite_27_plus'}, indent=1))
print(len(out['elite_27_plus']), 'elite 27+ seasons')
if OUT: json.dump(out, open(OUT, 'w'), indent=1)
