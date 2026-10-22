#!/usr/bin/env python3
"""Join Sleeper season stats (2012-) to DynastyProcess ids, birthdates and NFL draft slots.
Usage: python3 build_player_seasons.py <history dir from fetch_history.sh>  (writes player_seasons.json there)
Requires a DynastyProcess data clone at /home/claude/dynastyprocess/data or edit the path below."""
import json, csv, datetime, sys
H = sys.argv[1]
ids = {}
for r in csv.DictReader(open('/home/claude/dynastyprocess/data/files/db_playerids.csv')):
    if r['sleeper_id'] not in ('', 'NA'): ids[r['sleeper_id']] = r
sp = json.load(open(f'{H}/sleeper_players_full.json'))
def bd(pid):
    r = ids.get(pid, {})
    b = r.get('birthdate') if r.get('birthdate') not in (None, '', 'NA') else (sp.get(pid) or {}).get('birth_date')
    return b
rows = []
for y in range(2012, 2026):
    st = json.load(open(f'{H}/stats_{y}.json'))
    for pid, s in st.items():
        gp = s.get('gp') or 0
        if gp < 1: continue
        info = sp.get(pid) or {}
        pos = (ids.get(pid) or {}).get('position') or info.get('position')
        if pos not in ('QB', 'RB', 'WR', 'TE'): continue
        b = bd(pid)
        if not b: continue
        try: age = (datetime.date(y, 9, 1) - datetime.date.fromisoformat(b[:10])).days / 365.25
        except Exception: continue
        d = ids.get(pid) or {}
        dy = d.get('draft_year'); dovr = d.get('draft_ovr')
        rows.append(dict(id=pid, season=y, pos=pos, age=round(age, 2), gp=gp,
                         half=s.get('pts_half_ppr') or 0, ppr=s.get('pts_ppr') or 0, std=s.get('pts_std') or 0,
                         draft_year=int(dy) if dy not in (None, '', 'NA') else None,
                         draft_ovr=int(dovr) if dovr not in (None, '', 'NA') else None,
                         name=info.get('full_name') or d.get('name')))
json.dump(rows, open(f'{H}/player_seasons.json', 'w'))
from collections import Counter
print('player-seasons', len(rows), Counter(r['pos'] for r in rows))
print('with draft info', sum(1 for r in rows if r['draft_ovr']), 'undrafted/unknown', sum(1 for r in rows if not r['draft_ovr']))
print('seasons with 8+ games', sum(1 for r in rows if r['gp'] >= 8))
