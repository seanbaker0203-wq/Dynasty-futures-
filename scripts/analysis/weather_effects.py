"""How weather changes fantasy scoring. nflverse play-by-play (game weather) + weekly player stats, 2016-2025.
Each player-game is compared to that player's average in his OTHER games that season (leave-one-out), so
talent and role are held constant. Usage: python3 -I weather_effects.py <dir with pbp_*.parquet ps_*.parquet> <out.json>"""
import sys, re, json, pandas as pd, numpy as np
D, OUT = sys.argv[1], sys.argv[2]
YEARS = range(2016, 2026)
games = []
for y in YEARS:
    p = pd.read_parquet(f'{D}/pbp_{y}.parquet', columns=['game_id', 'roof', 'weather', 'home_team', 'season_type', 'total_home_score', 'total_away_score'])
    g = p.groupby('game_id').agg(roof=('roof', 'first'), weather=('weather', 'first'), pts=('total_home_score', 'max'), pts2=('total_away_score', 'max')).reset_index()
    games.append(g)
G = pd.concat(games)
G['total'] = G.pts + G.pts2
w = G.weather.fillna('').str.lower()
G['wind'] = w.str.extract(r'wind:\s*[a-z/]*\s*(\d+)\s*mph')[0].astype(float)
G['temp'] = w.str.extract(r'temp:\s*(-?\d+)')[0].astype(float)
cond = w.str.split('temp:').str[0]
G['snow'] = cond.str.contains(r'snow|flurr|sleet|wintry')
G['heavy'] = cond.str.contains(r'heavy|downpour|thunder|storm') & ~G.snow
G['rain'] = cond.str.contains(r'rain|shower|drizzle') & ~G.snow
G['outdoor'] = G.roof.isin(['outdoors', 'open'])

def bucket(r):
    if not r.outdoor: return 'dome'
    if r.snow: return 'snow'
    if r.heavy: return 'heavy_rain'
    if r.rain: return 'rain'
    if r.wind >= 20: return 'wind_20'
    if r.wind >= 15: return 'wind_15'
    if r.temp <= 25: return 'cold'
    return 'clear'
G['bucket'] = G.apply(bucket, axis=1)
G['windy_wet'] = G.outdoor & (G.rain | G.snow) & (G.wind >= 15)
G.loc[G.windy_wet, 'bucket'] = 'wet_and_windy'

S = pd.concat([pd.read_parquet(f'{D}/ps_{y}.parquet', columns=['player_id', 'position', 'season', 'game_id', 'season_type', 'fantasy_points', 'receptions', 'attempts', 'passing_yards', 'carries', 'targets', 'fg_made', 'fg_att', 'pat_made', 'fg_made_distance']) for y in YEARS])
S = S[S.season_type == 'REG'].reset_index(drop=True)
S['half'] = S.fantasy_points.fillna(0) + 0.5 * S.receptions.fillna(0)
# Kicker points: 3 per FG (+1 for 40-49, +2 for 50+ roughly via distance), 1 per PAT.
S.loc[S.position == 'K', 'half'] = 3 * S.fg_made.fillna(0) + S.pat_made.fillna(0)
S = S.merge(G[['game_id', 'bucket', 'total']], on='game_id').reset_index(drop=True)
S = S[S.position.isin(['QB', 'RB', 'WR', 'TE', 'K'])]
grp = S.groupby(['player_id', 'season'])
S['n'] = grp.half.transform('count'); S['sum'] = grp.half.transform('sum')
S = S[S.n >= 6]
S['loo'] = (S['sum'] - S.half) / (S.n - 1)
S = S[S.loo >= (4 if True else 0)]
S.loc[S.position == 'K', 'loo'] = S.loc[S.position == 'K', 'loo']

out = {'source': 'nflverse play-by-play + weekly player stats, regular seasons 2016-2025', 'method': 'player-game half-PPR points / same player\'s average in his other games that season; outdoor games bucketed by reported game-time weather', 'buckets': {}}
base = S[S.bucket == 'clear']
base_ratio = {pos: base[base.position == pos].half.sum() / base[base.position == pos].loo.sum() for pos in ['QB', 'RB', 'WR', 'TE', 'K']}
for b in ['clear', 'cold', 'wind_15', 'wind_20', 'rain', 'heavy_rain', 'snow', 'wet_and_windy', 'dome']:
    sub = S[S.bucket == b]
    ng = G[G.bucket == b]
    row = {'games': int(len(ng)), 'avg_total_points': round(float(ng.total.mean()), 1) if len(ng) else None, 'by_position': {}}
    for pos in ['QB', 'RB', 'WR', 'TE', 'K']:
        s = sub[sub.position == pos]
        if len(s) < 30: continue
        r = s.half.sum() / s.loo.sum() / base_ratio[pos]
        # bootstrap 90% interval
        rng = np.random.default_rng(1); idx = np.arange(len(s)); hs, ls = s.half.values, s.loo.values
        bs = [hs[i].sum() / ls[i].sum() / base_ratio[pos] for i in (rng.choice(idx, len(idx)) for _ in range(300))]
        row['by_position'][pos] = {'factor': round(float(r), 3), 'lo': round(float(np.percentile(bs, 5)), 3), 'hi': round(float(np.percentile(bs, 95)), 3), 'n': int(len(s))}
    out['buckets'][b] = row
json.dump(out, open(OUT, 'w'), indent=1)
for b, r in out['buckets'].items():
    print(f"{b:14} games={r['games']:4} total={r['avg_total_points']}  " + '  '.join(f"{p}:{v['factor']:.2f}({v['lo']:.2f}-{v['hi']:.2f})" for p, v in r['by_position'].items()))
