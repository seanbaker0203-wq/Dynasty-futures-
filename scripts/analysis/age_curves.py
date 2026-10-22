#!/usr/bin/env python3
"""
Measure fantasy aging curves and blend them with published research.

Inputs (see fetch_history.sh): Sleeper season stats per year, Sleeper player directory, DynastyProcess db_playerids.csv.
Method: delta method on half-PPR points per game. Players are selected on the PRIOR season (avoids regression-to-mean
bias); a relevant player who leaves the league counts as 0 the next year (avoids survivorship bias); year-over-year
changes are games-weighted, smoothed across neighbouring ages and chained into a curve normalised to peak = 1.
Final curve = 50% measured + 50% research prior (4for4 production curves 2025, PFF aging work), renormalised.

Usage: python3 age_curves.py <player_seasons.json> <out data/age-curves.json>
"""
import json, math, sys
from collections import defaultdict

PRIOR = {  # research-informed shape (see docs/VALUES.md for sources)
    'RB': [[21, 0.8], [22, 0.9], [23, 0.97], [24, 1], [25, 1], [26, 1], [27, 0.95], [28, 0.88], [29, 0.75], [30, 0.6], [31, 0.48], [32, 0.36], [33, 0.25], [34, 0.12], [35, 0]],
    'WR': [[21, 0.75], [22, 0.82], [23, 0.9], [24, 0.94], [25, 0.98], [26, 1], [27, 1], [28, 1], [29, 0.96], [30, 0.92], [31, 0.86], [32, 0.74], [33, 0.6], [34, 0.45], [35, 0.3], [36, 0.15], [37, 0]],
    'TE': [[21, 0.55], [22, 0.66], [23, 0.78], [24, 0.88], [25, 0.95], [26, 1], [27, 1], [28, 0.98], [29, 0.95], [30, 0.92], [31, 0.86], [32, 0.8], [33, 0.7], [34, 0.58], [35, 0.42], [36, 0.25], [37, 0.1], [38, 0]],
    'QB': [[21, 0.7], [22, 0.78], [23, 0.85], [24, 0.9], [25, 0.94], [26, 0.97], [27, 1], [32, 1], [33, 0.97], [34, 0.93], [35, 0.88], [36, 0.82], [37, 0.74], [38, 0.64], [39, 0.53], [40, 0.4], [41, 0.26], [42, 0.12], [43, 0]],
}
MIN_PPG = {'QB': 12, 'RB': 7, 'WR': 7, 'TE': 5}
END = {'QB': 43, 'RB': 35, 'WR': 37, 'TE': 38}

def interp(pts, a):
    if a <= pts[0][0]: return pts[0][1]
    for i in range(1, len(pts)):
        if a <= pts[i][0]:
            a0, v0 = pts[i - 1]; a1, v1 = pts[i]
            return v0 + (v1 - v0) * (a - a0) / (a1 - a0)
    return pts[-1][1]

def measure(rows, pos):
    by = defaultdict(dict)
    for r in rows: by[r['id']][r['season']] = r
    last = max(r['season'] for r in rows)
    num, den, n = defaultdict(float), defaultdict(float), defaultdict(int)
    for seasons in by.values():
        for y, r in seasons.items():
            if r['pos'] != pos or r['gp'] < 6 or y >= last: continue
            prev = seasons.get(y - 1)
            if not prev or prev['gp'] < 6 or prev['half'] / prev['gp'] < MIN_PPG[pos]: continue
            p0 = r['half'] / r['gp']
            if p0 <= 0.5: continue
            nxt = seasons.get(y + 1)
            if nxt and nxt['gp'] >= 4:
                p1, w = nxt['half'] / nxt['gp'], 2 / (1 / r['gp'] + 1 / nxt['gp'])
            elif not nxt and not seasons.get(y + 2):
                p1, w = 0.0, r['gp'] / 2
            else:
                continue
            a = int(math.floor(r['age']))
            num[a] += w * (p1 - p0) / p0; den[a] += w; n[a] += 1
    ages = list(range(21, END[pos] + 1))
    raw = {a: (num[a] / den[a] if den[a] else 0.0) for a in ages}
    # smooth: weight each age's change with its neighbours by sample weight
    smooth = {}
    for a in ages:
        ws = [(den[b] * (2 if b == a else 1), raw[b]) for b in (a - 1, a, a + 1) if b in raw and den[b]]
        tot = sum(w for w, _ in ws)
        d = sum(w * v for w, v in ws) / tot if tot else 0.0
        smooth[a] = d * min(1.0, n[a] / 10) if n[a] else d * 0.5  # shrink thin samples toward no change
    curve, level = {}, 1.0
    for a in ages:
        curve[a] = level
        level *= max(0.0, 1 + max(-0.6, min(0.4, smooth[a])))
    peak = max(curve.values())
    return {a: v / peak for a, v in curve.items()}, n

def main():
    rows = json.load(open(sys.argv[1]))
    out = {}
    for pos in ('QB', 'RB', 'WR', 'TE'):
        measured, n = measure(rows, pos)
        blend = {a: 0.5 * measured[a] + 0.5 * interp(PRIOR[pos], a) for a in measured}
        blend[END[pos]] = 0.0  # retirement
        peak = max(blend.values())
        final = {a: round(v / peak, 3) for a, v in blend.items()}
        out[pos] = [[a, final[a]] for a in sorted(final)]
        print(f'\n{pos} age  measured  prior  final   n')
        for a in sorted(final):
            print(f'    {a:>3}   {measured.get(a, 0):5.2f}   {interp(PRIOR[pos], a):5.2f}  {final[a]:5.2f}  {n.get(a, 0)}')
    json.dump({'method': 'delta method (prior-season selection, dropouts as 0, smoothed) 50% + research prior 50%',
               'seasons': sorted({r['season'] for r in rows}), 'curves': out}, open(sys.argv[2], 'w'), indent=1)

if __name__ == '__main__':
    main()
