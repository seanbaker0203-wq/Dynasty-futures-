#!/usr/bin/env python3
"""
How the trade market priced each rookie draft class over time ("class strength").

For each window (spring = Jan-Apr, before the draft; fall = mid-Aug to Nov), fit pick values by absolute draft year
with trade_values.py --abs-picks, then compare a class's 1st-round price with the class one year earlier in the same
window. Time-to-draft is the same for every "next year vs this year" comparison in a given window type, so differences
between years are class strength (plus noise), not time discount.

  class premium(D) = [price(D) / price(D-1) in a window] / [the average of that ratio across years for that window]

Usage: python3 class_strength.py <trades.ndjson ...> --out data/class-strength.json
"""
import argparse, json, os, subprocess, sys, tempfile, statistics as st

ap = argparse.ArgumentParser()
ap.add_argument('trades', nargs='+')
ap.add_argument('--out', required=True)
A = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp()
merged = os.path.join(tmp, 'all.ndjson')
seen = set()
with open(merged, 'w') as w:
    for f in A.trades:
        for line in open(f):
            if not line.strip(): continue
            t = json.loads(line)
            k = (t['league_id'], t['trade_id'])
            if k in seen: continue
            seen.add(k); w.write(line if line.endswith('\n') else line + '\n')
print(len(seen), 'unique trades', file=sys.stderr)

WINDOWS = []
for y in (2024, 2025, 2026):
    WINDOWS.append(('spring', y, f'{y}-01-01', f'{y}-04-30'))
    WINDOWS.append(('fall', y, f'{y}-08-15', f'{y}-11-30'))

result = {'windows': [], 'ratios': {}, 'premium': {}}
for kind, y, since, until in WINDOWS:
    for sf in (0, 1):
        out = os.path.join(tmp, f'{kind}{y}_{sf}.json')
        # Trades after `until` are dropped by asof (negative age); before `since` by --since.
        r = subprocess.run([sys.executable, '-I', os.path.join(here, 'trade_values.py'), merged, out, '--sf', str(sf), '--alpha', '1',
                            '--abs-picks', '1', '--since', since, '--asof', until, '--half-life', '99999', '--holdout', '0.05'],
                           capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out):
            continue
        d = json.load(open(out))
        firsts = {int(k.split('_')[2]): v for k, v in d['values'].items() if k.startswith('PICK_R1_')}
        nxt = y if kind == 'spring' else y + 1  # the next rookie draft
        row = {'window': f'{kind} {y}', 'format': 'sf' if sf else '1qb', 'trades': d['trades'],
               'firsts': {str(k): {'value': v['value'], 'trades': v['trades']} for k, v in sorted(firsts.items())}}
        result['windows'].append(row)
        for off in (1, 2):
            a, b = firsts.get(nxt + off - 1), firsts.get(nxt + off)
            if a and b and a['trades'] >= 25 and b['trades'] >= 25:
                result['ratios'].setdefault(f"{kind}|{'sf' if sf else '1qb'}|Y{off}/Y{off-1}", {})[str(nxt + off)] = round(b['value'] / a['value'], 3)

# Premium: each class's ratio vs the average ratio for the same window, format and offset.
for key, by in result['ratios'].items():
    if len(by) < 2: continue
    m = st.mean(by.values())
    for cls, r in by.items():
        result['premium'].setdefault(cls, []).append({'basis': key, 'vs_typical': round(r / m, 3)})
json.dump(result, open(A.out, 'w'), indent=1)
print(json.dumps(result['ratios'], indent=1))
print(json.dumps(result['premium'], indent=1))
