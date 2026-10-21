# Dynasty Futures

Dynasty fantasy football roster intelligence. Connect a Sleeper or MyFantasyLeague league and see every team's
Roster DNA (Gross Liquidity, Asset Half-Life, Structural Integrity), power rankings, picks, and trade impact,
valued with live market data.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional: set `GEMINI_API_KEY` in `.env.local` for AI trade ideas.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

The server needs outbound HTTPS to `api.sleeper.app`, `*.myfantasyleague.com` and `raw.githubusercontent.com`.

## Data

- Player and pick values: [DynastyProcess](https://github.com/dynastyprocess/data) (derived from FantasyPros ECR), refreshed daily.
- Player directory: Sleeper public API, refreshed daily.
- MFL private leagues: league API key or MFL login (password is never stored).

See `docs/ROADMAP.md` for the plan.
