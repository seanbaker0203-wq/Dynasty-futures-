#!/usr/bin/env python3
"""
What rookie draft picks actually produce, by slot.

Rookie-draft order is estimated from each class's NFL draft order of skill players, with QBs pushed down in 1QB
leagues (x2.2 draft position) and up in Superflex (x0.6), TEs slightly down (x1.3). For each estimated slot
(1 = first pick), we record per-season points per game (half PPR) for years 1-5 and whether the season was a "hit"
(starter-level: QB 16+, RB 9.5+, WR 9+, TE 7.5+ points per game in 6+ games; PFF's rookie study thresholds in half PPR).

Usage: python3 rookie_picks.py <player_seasons.json> <out data/rookie-picks.json>
"""
import json, sys
from collections import defaultdict

HIT = {'QB': 16, 'RB': 9.5, 'WR': 9, 'TE': 7.5}
YEARS = 5
BIN = 4  # slots per bin: 1-4, 5-8, ...
MAX_SLOT = 48

def main():
    rows = json.load(open(sys.argv[1]))
    last = max(r['season'] for r in rows)
    by = defaultdict(dict)
    meta = {}
    for r in rows:
        by[r['id']][r['season']] = r
        if r.get('draft_year') and r.get('draft_ovr'):
            meta[r['id']] = (r['draft_year'], r['draft_ovr'], r['pos'], r.get('name'))
    out = {}
    for fmt, mult in (('1qb', {'QB': 2.2, 'TE': 1.3}), ('sf', {'QB': 0.6, 'TE': 1.3})):
        classes = defaultdict(list)
        for pid, (dy, ovr, pos, name) in meta.items():
            if 2013 <= dy <= last:
                classes[dy].append((ovr * mult.get(pos, 1.0), pid, pos, name))
        # per-bin accumulators: for each year k, [hits, count_with_outcome, sum_ppg_all, sum_ppg_hits]
        acc = defaultdict(lambda: [[0, 0, 0.0, 0.0] for _ in range(YEARS)])
        any_hit = defaultdict(lambda: [0, 0])
        for dy, players in classes.items():
            players.sort()
            for slot, (_, pid, pos, name) in enumerate(players[:MAX_SLOT], start=1):
                b = (slot - 1) // BIN
                seasons = by[pid]
                hit_any = False
                complete = True
                for k in range(YEARS):
                    y = dy + k
                    if y > last:
                        complete = False if k < 3 else complete
                        continue
                    s = seasons.get(y)
                    ppg = (s['half'] / s['gp']) if s and s['gp'] >= 1 else 0.0
                    hit = bool(s and s['gp'] >= 6 and ppg >= HIT[pos])
                    a = acc[b][k]
                    a[0] += hit; a[1] += 1; a[2] += ppg; a[3] += ppg if hit else 0
                    if k < 3 and hit: hit_any = True
                if dy + 2 <= last:
                    any_hit[b][0] += hit_any; any_hit[b][1] += 1
        bins = []
        for b in range(MAX_SLOT // BIN):
            yrs = []
            for k in range(YEARS):
                h, n, s_all, s_hit = acc[b][k]
                yrs.append({'year': k + 1, 'n': n, 'hit_rate': round(h / n, 3) if n else None,
                            'ppg_if_hit': round(s_hit / h, 1) if h else None, 'ppg_avg': round(s_all / n, 1) if n else None})
            ah, an = any_hit[b]
            bins.append({'slots': [b * BIN + 1, b * BIN + BIN], 'hit_in_first_3_years': round(ah / an, 3) if an else None, 'classes': an, 'years': yrs})
        out[fmt] = bins
        print(f'\n{fmt.upper()}  slots   hit in yrs 1-3   yr1 / yr2 / yr3 hit rate      ppg if hit (yr2)   n')
        for bn in bins:
            y = bn['years']
            print(f"  {bn['slots'][0]:>2}-{bn['slots'][1]:<2}      {bn['hit_in_first_3_years']:.0%}           "
                  f"{y[0]['hit_rate']:.0%} / {y[1]['hit_rate']:.0%} / {y[2]['hit_rate']:.0%}              {y[1]['ppg_if_hit']}            {bn['classes']}")
    json.dump({'method': __doc__.strip().splitlines()[1], 'hit_thresholds_half_ppr': HIT, 'bins': out}, open(sys.argv[2], 'w'), indent=1)

if __name__ == '__main__':
    main()
