#!/usr/bin/env python3
"""Turn collected trades into the app's market data files.

  python3 -I build_market_data.py <trades.ndjson> <data dir> [--days 120] [--alpha 1.5]

Writes:
  <data dir>/trade-values.json   {"superflex": fit, "oneqb": fit}   (fits from trade_values.py, last 365 days)
  <data dir>/market-trades.json  {"built": date, "trades": [[ts_ms, sf, teams, ppr, tep, sideA, sideB], ...]}
                                 two-team trades from the last --days days, newest first
"""
import sys, os, json, argparse, subprocess, tempfile, datetime

ap = argparse.ArgumentParser()
ap.add_argument('trades'); ap.add_argument('data_dir')
ap.add_argument('--days', type=int, default=120)
ap.add_argument('--alpha', type=float, default=1.0)
A = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
now = datetime.datetime.now(datetime.timezone.utc)

fits = {}
for name, sf in (('superflex', 1), ('oneqb', 0)):
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
        out = f.name
    subprocess.run([sys.executable, '-I', os.path.join(here, 'trade_values.py'), A.trades, out, '--sf', str(sf), '--alpha', str(A.alpha)], check=True)
    fits[name] = json.load(open(out))
    os.unlink(out)
json.dump(fits, open(os.path.join(A.data_dir, 'trade-values.json'), 'w'), separators=(',', ':'))

seen, rows = set(), []
cutoff = now - datetime.timedelta(days=A.days)
for line in open(A.trades):
    if not line.strip(): continue
    t = json.loads(line)
    key = (t['league_id'], t['trade_id'])
    if key in seen: continue
    seen.add(key)
    ts = datetime.datetime.fromisoformat(t['traded_at'].replace('Z', '+00:00'))
    if ts < cutoff or len(t['sides']) != 2: continue
    enc = lambda side: [a['id'] if a['kind'] == 'player' else f"P{a['year']}-{a['round']}" for a in side['received']]
    f = t['format']
    rows.append([int(ts.timestamp() * 1000), 1 if f['superflex'] else 0, f['teams'], f['ppr'], f['te_premium'], enc(t['sides'][0]), enc(t['sides'][1])])
rows.sort(key=lambda r: -r[0])
json.dump({'built': now.date().isoformat(), 'days': A.days, 'trades': rows}, open(os.path.join(A.data_dir, 'market-trades.json'), 'w'), separators=(',', ':'))
print(f"fits: SF {fits['superflex']['trades']} trades, 1QB {fits['oneqb']['trades']} trades; recent trades written: {len(rows)}")
