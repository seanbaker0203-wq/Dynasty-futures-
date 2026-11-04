#!/usr/bin/env python3
"""Fit our own player and pick values from real dynasty trades (output of scripts/collect/crawl-sleeper.ts).

Model: each asset i has a value v_i = exp(theta_i). A side of a trade is worth (sum v_i^a)^(1/a). Trades are assumed
fair on average. Note: the exponent a is NOT identifiable from trades alone: fitting with exponent a gives exactly
v^a = the a=1 fit, i.e. the same order of players with the spread stretched. The app maps these values onto the market
scale by rank, so a=1 (sides add up) is used and the consolidation premium comes from the market scale. We minimise
  sum_t w_t * (log S_A - log S_B)^2  +  lam * sum_i (theta_i - mu)^2
w_t = recency weight (half-life in days). The prior pulls rarely-traded assets toward a low value (most rarely traded
players are throw-ins) and fixes the overall scale. Values are rescaled so the top asset = 10,000.

Usage: python3 -I trade_values.py <trades.ndjson> <out.json> [--sf 0|1] [--alpha 1.4] [--half-life 90] [--holdout 0.2]
"""
import sys, json, math, argparse, datetime
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

ap = argparse.ArgumentParser()
ap.add_argument('trades'); ap.add_argument('out')
ap.add_argument('--sf', type=int, default=0)
ap.add_argument('--alpha', type=float, default=None, help='fixed consolidation exponent; default: choose by holdout')
ap.add_argument('--half-life', type=float, default=90)
ap.add_argument('--lam', type=float, default=0.05)
ap.add_argument('--holdout', type=float, default=0.2)
ap.add_argument('--asof', default=None)
A = ap.parse_args()

asof = datetime.datetime.fromisoformat(A.asof) if A.asof else datetime.datetime.now(datetime.timezone.utc)

def pick_key(p, traded):
    # Rookie drafts happen around May; after May 31 the next draft is next year's.
    nxt = traded.year + (1 if traded.month >= 6 else 0)
    yo = max(0, min(2, p['year'] - nxt))
    return f"PICK_R{min(p['round'], 4)}_Y{yo}"

trades = []
seen = set()
for line in open(A.trades):
    if not line.strip(): continue
    t = json.loads(line)
    if bool(t['format']['superflex']) != bool(A.sf): continue
    key = (t['league_id'], t['trade_id'])
    if key in seen: continue
    seen.add(key)
    ts = datetime.datetime.fromisoformat(t['traded_at'].replace('Z', '+00:00'))
    age = (asof - ts).days
    if age < 0 or age > 365: continue
    sides = []
    for s in t['sides']:
        sides.append([a['id'] if a['kind'] == 'player' else pick_key(a, ts) for a in s['received']])
    if len(sides) != 2 or not sides[0] or not sides[1]: continue
    trades.append((sides, 0.5 ** (age / A.half_life)))

assets = sorted({a for s, _ in trades for side in s for a in side})
idx = {a: i for i, a in enumerate(assets)}
counts = np.zeros(len(assets))
for s, _ in trades:
    for side in s:
        for a in side: counts[idx[a]] += 1
print(f'{len(trades)} trades, {len(assets)} assets, {int((counts >= 5).sum())} traded 5+ times', file=sys.stderr)

rng = np.random.default_rng(7)
test_mask = rng.random(len(trades)) < A.holdout
MU = math.log(0.03)  # prior: rarely traded assets sit near 3% of the scale

def fit(train, alpha, theta0=None):
    """Vectorised Gauss-Newton fit (scipy least_squares with an exact sparse Jacobian)."""
    from scipy.sparse import coo_matrix
    n = len(assets)
    tr = [trades[i] for i in train]
    sw = np.sqrt(np.array([w for _, w in tr]))
    ent_side, ent_asset, side_sign, side_trade = [], [], [], []
    for k, (s, _) in enumerate(tr):
        for j, side in enumerate(s):
            sid = 2 * k + j
            for a in side:
                ent_side.append(sid); ent_asset.append(idx[a])
    ent_side = np.array(ent_side); ent_asset = np.array(ent_asset)
    order = np.argsort(ent_side, kind='stable'); ent_side = ent_side[order]; ent_asset = ent_asset[order]
    starts = np.r_[0, np.flatnonzero(np.diff(ent_side)) + 1]
    nside = 2 * len(tr)
    ent_trade = ent_side // 2
    ent_sign = np.where(ent_side % 2 == 0, 1.0, -1.0)
    lam = math.sqrt(A.lam)
    rows_prior = np.arange(n) + len(tr)

    def parts(theta):
        x = alpha * theta[ent_asset]
        m = np.maximum.reduceat(x, starts)
        e = np.exp(x - np.repeat(m, np.diff(np.r_[starts, len(x)])))
        tot = np.add.reduceat(e, starts)
        side_log = (m + np.log(tot)) / alpha
        p = e / np.repeat(tot, np.diff(np.r_[starts, len(x)]))
        return side_log, p

    def resid(theta):
        side_log, _ = parts(theta)
        r = sw * (side_log[0::2] - side_log[1::2])
        return np.r_[r, lam * (theta - MU)]

    def jac(theta):
        _, p = parts(theta)
        data = ent_sign * sw[ent_trade] * p
        J = coo_matrix((np.r_[data, np.full(n, lam)], (np.r_[ent_trade, rows_prior], np.r_[ent_asset, np.arange(n)])), shape=(len(tr) + n, n))
        return J.tocsr()

    if theta0 is None:
        th = np.full(n, MU)
        for a, i in idx.items():
            if a.startswith('PICK_R'): th[i] = MU + (5 - int(a[6])) * 0.6 - int(a[-1]) * 0.15
            else: th[i] = MU + 0.1 * math.log1p(counts[i])
    else:
        th = theta0.copy()
    res = least_squares(resid, th, jac=jac, method='trf', x_scale='jac', max_nfev=300, verbose=0)
    return res.x, None

def holdout_err(theta, alpha, rows):
    e, ws = 0.0, 0.0
    for i in rows:
        s, w = trades[i]
        def sl(side):
            x = alpha * np.array([theta[idx[a]] for a in side]); m = x.max()
            return (m + math.log(np.exp(x - m).sum())) / alpha
        e += w * (sl(s[0]) - sl(s[1])) ** 2; ws += w
    # Scale-free: divide by the spread of values among regularly traded assets, so squashing all values together
    # can't look like a better fit.
    spread = np.std(theta[counts >= 5]) if (counts >= 5).sum() > 5 else np.std(theta)
    return math.sqrt(e / ws) / max(spread, 1e-6)

train = np.where(~test_mask)[0]; test = np.where(test_mask)[0]
alphas = [A.alpha or 1.0]
best = None
for al in alphas:
    th, _ = fit(train, al)
    err = holdout_err(th, al, test)
    print(f'alpha {al}: holdout RMS log-imbalance {err:.3f}', file=sys.stderr)
    if best is None or err < best[1]: best = (al, err)
alpha = best[0]
theta, _ = fit(np.arange(len(trades)), alpha)
v = np.exp(theta); v = v / v.max() * 10000
out = {
    'asof': asof.date().isoformat(), 'superflex': bool(A.sf), 'alpha': alpha, 'holdout_rms': round(best[1], 4),
    'trades': len(trades), 'half_life_days': A.half_life,
    'values': {a: {'value': round(float(v[i])), 'trades': int(counts[i])} for a, i in idx.items()},
}
json.dump(out, open(A.out, 'w'))
print(f'chose alpha {alpha}', file=sys.stderr)
