# Dynasty Futures

Dynasty fantasy football roster intelligence. Connect a Sleeper or MyFantasyLeague league and see every team's
Roster DNA (Gross Liquidity, Asset Half-Life, Structural Integrity), power rankings, picks, and trade impact,
valued with live market data.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional: copy `.env.example` to `.env` and set `GEMINI_API_KEY` (used by the AI trade-ideas API).

## Production

```bash
npm run build      # client to dist/, server to build/server.mjs
npm start          # NODE_ENV=production node build/server.mjs
```

Deploys to Render from `render.yaml` (New > Blueprint). The server needs outbound HTTPS to `api.sleeper.app`,
`*.myfantasyleague.com` and `raw.githubusercontent.com`. Health check: `/api/health`.

## Data

- Player and pick values: [DynastyProcess](https://github.com/dynastyprocess/data) (derived from FantasyPros ECR), refreshed daily.
- Player directory: Sleeper public API, refreshed daily.
- MFL private leagues: league API key or MFL login (password is never stored).

See `docs/ROADMAP.md` for the plan.
