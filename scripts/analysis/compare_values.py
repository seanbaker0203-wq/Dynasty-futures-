#!/usr/bin/env python3
"""Compare fitted trade values with FantasyCalc (sanity check only). Usage: compare_values.py <tv.json> <fc.json> <sleeper_players.json>"""
import sys, json
import numpy as np
from scipy.stats import spearmanr
tv = json.load(open(sys.argv[1])); fc = json.load(open(sys.argv[2])); spl = json.load(open(sys.argv[3]))
fcv = {str(r['player'].get('sleeperId')): r['value'] for r in fc if r['player'].get('sleeperId')}
fcrank = {str(r['player'].get('sleeperId')): r['overallRank'] for r in fc if r['player'].get('sleeperId')}
rows = [(k, v['value'], v['trades'], fcv.get(k)) for k, v in tv['values'].items() if not k.startswith('PICK')]
common = [r for r in rows if r[3] and r[2] >= 5]
if len(common) > 5:
    rho = spearmanr([r[1] for r in common], [r[3] for r in common]).correlation
    top = [r for r in common if fcrank.get(r[0], 999) <= 100]
    rho_top = spearmanr([r[1] for r in top], [r[3] for r in top]).correlation if len(top) > 5 else float('nan')
    print(f"players traded 5+ times and valued by FantasyCalc: {len(common)}; Spearman {rho:.3f}; within FC top 100 ({len(top)}): {rho_top:.3f}")
nm = lambda k: (spl.get(k) or {}).get('full_name') or k
print('Top 25 by our trade values:')
for k, v, n, f in sorted(rows, key=lambda r: -r[1])[:25]:
    print(f"  {nm(k):26} {v:6}  trades {n:4}  FC {f}  FCrank {fcrank.get(k)}")
print('Picks:')
for k, v in sorted(((k, v) for k, v in tv['values'].items() if k.startswith('PICK')), key=lambda x: -x[1]['value']):
    print(f"  {k:12} {v['value']:6}  trades {v['trades']}")
