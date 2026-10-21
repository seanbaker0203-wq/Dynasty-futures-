# Dynasty AI Evaluator — Code Review & Roadmap

_Review of the AI Studio export, 21 Oct 2026. Code lives in `/home/claude/dynasty-ai` (git initialised, first commit = untouched export)._

## What the app actually is

- **Stack:** React 19 + Vite + Tailwind front end, one Express server (`server.ts`, ~1,550 lines) in TypeScript, Gemini for AI trade ideas. About 17,700 lines total.
- The `backend/` Python folder (FastAPI) is **dead code** — nothing calls it. Delete it.
- 8 tabs: Ingest, Dynasty Core, League Radar, Sit/Start, Optimization, Head-to-Head, Trade Builder, Market Radar.
- The Roster DNA math (`src/lib/rosterMath.ts`) is reasonable: lineup-aware starters, a **fixed** league baseline (so teams are comparable), age-curve half-life, classifications. Keep it.

## Critical problems (the numbers are wrong for real leagues)

| # | Problem | Where | Effect |
|---|---------|-------|--------|
| 1 | **45 of 57 seed player IDs point to the wrong Sleeper player** (e.g. `9220` is Evan Hull, seeded as Jahmyr Gibbs; `9226` is De'Von Achane, seeded as C.J. Stroud) | `src/data/seedPlayers.ts` | Sleeper rosters get the wrong players' values |
| 2 | **Only 57 players have values.** Sleeper players outside that list are silently **dropped**; MFL players get a flat placeholder by position (every unknown QB = 2,100, WR = 1,350…) | `server.ts` `resolvePlayersForRoster`, `handleMFLSync` | Power rankings and DNA scores for real leagues are mostly made-up |
| 3 | Values labelled "KTC" are hand-typed, not from KeepTradeCut | seed + 69 "KTC" labels | Misleading; also a brand/ToS problem |
| 4 | **Sit/Start invents projections** from a formula and labels them ESPN / Yahoo / FantasyPros / Footballguys; opponents are picked by hash | `src/lib/consensusProjections.ts` | Fabricated data attributed to real companies — must not ship |
| 5 | **Market Radar movement is hand-written** (e.g. "Nabers +18.5% in 30 days") | `src/lib/marketTrends.ts` | Fake trends presented as real |
| 6 | Failed sync **silently swaps in a fake demo league** | `src/context/RosterContext.tsx` | User thinks they're seeing their league |
| 7 | **"MFL OAuth" doesn't exist.** MFL uses username/password → session cookie, or a per-league API key. OAuth URL and hardcoded AI Studio Cloud Run URL can never work | `server.ts` `/api/auth/mfl/*`, `MFLAuthModal.tsx` | Dead button; asks user for keys that don't exist |
| 8 | TLS verification always off (`rejectUnauthorized: false`), and MFL passwords accepted in GET query strings | `server.ts` `fetchWithSslControl`, MFL GET route | Security issues before going public |
| 9 | MFL Superflex never detected (`SUPER_FLEX: 0` always); Sleeper slot counts default to 1–2 even when the league has 0 of a position; no TE-premium handling | `server.ts` settings parsing | Wrong lineup → wrong starter value |
| 10 | Years hardcoded (2026/2027/2029) in ~177 places | everywhere | Breaks next season |
| 11 | Trade history, sync history only in browser `localStorage` | several | Lost on another device; no accounts |

## Fix: an honest, live data layer (DynastyProcess)

`github.com/dynastyprocess/data` (reachable from here, updated **daily** — last scrape 16 Oct 2026):

- `values-players.csv` — 422 players with **1QB and Superflex values**, age, ECR.
- `values-picks.csv` — rookie pick values.
- `db_playerids.csv` — 12,500-row ID crosswalk: **Sleeper ↔ MFL ↔ FantasyPros ↔ KTC ↔ ESPN ↔ Yahoo**. 415/422 valued players have a Sleeper ID, 417 an MFL ID → **no more fuzzy name matching**.

Caveats: values are derived from FantasyPros expert rankings; repo is GPL-3. Fine for an MVP and personal/league use. **Before charging money**, confirm commercial terms or build our own value model on top (blend + our trade-data signal).

## Status — 21 Oct 2026

**Phase 1 done** (commits `23ee22e`, `0c9ae57`). Verified against real leagues:
- MFL 37804 *Nothin' But Babies & Memories* (public, 10 teams, 1QB, half PPR, salary/contract league): all 385 rostered players resolve by id, sync in ~1.5 s.
- Sleeper Superflex (*Hollywood Randos*) and 1QB (*Ballers Dynasty*) public leagues: correct format detection, username → team, traded picks.

**Found while testing — next up**
1. **Re-calibrate classifications.** DynastyProcess values are steep (top player ~10,000, mid 1st ~1,900, late 2nd ~120), so the old absolute thresholds over-fire: top 3–4 teams all "Juggernaut", "starters > 82% of value" warning on nearly everyone. Switch to within-league percentiles.
2. **Pick values assume 12 teams.** Scale for league size (picks in a 10-team league are worth more).
3. **MFL lists "2026" picks as still to come** in league 37804 (no 2026 draft results). We treat the earliest listed year as the next draft — confirm with Sean how his league labels its rookie draft.
4. **Salary/contract leagues.** League 37804 has salaries and contract years; value should account for contract cost. Big differentiator — few tools do this.
5. AI trade finder's "predicted Gross Liquidity delta" still uses the old fixed 22,500 baseline (`src/lib/aiTradeFinder.ts`).
6. Explanatory copy on League Radar still mentions 2027/2028 by name.
7. Phone layout: top tab bar overflows at 390 px → Phase 2 bottom tab bar.

## Roadmap

### Phase 1 — Make the numbers true ✅
1. Nightly job pulls DynastyProcess → `players.json` keyed by Sleeper ID and MFL ID; values by format (1QB / SF).
2. Load the **full** Sleeper player DB for names/ages/teams; every rostered player resolves by ID. Unvalued players = 0 and shown as "no market value", never a guess.
3. Correct league settings: Superflex/2QB detection for both platforms, TE premium, real slot counts, league size.
4. Real pick values from `values-picks.csv`; derive the current/next draft year from today's date, not constants.
5. Remove or clearly label fabricated features: Sit/Start (hide until real projections), Market Radar (switch to **our own daily value snapshots** — start storing them now), "KTC" labels → "Market value".
6. Show sync errors honestly; no silent demo fallback. Keep demo mode only behind an explicit "Try a demo league" button.
7. MFL: delete OAuth; support public leagues (no login), per-league **API key**, or username/password via POST with TLS verification on.

### Phase 2 — Phone-ready core experience
- Cut to 4 tabs: **My Team · League · Trade · Settings**. Merge Optimization into My Team; H2H into League.
- Mobile-first layout (bottom tab bar, cards not wide tables).
- League power-rankings **share image** for group chats (free marketing).
- Do-not-trade / trade-at-premium tags on players.

### Phase 3 — The differentiator
- **Manager profiles** from each league's transaction history (who sells picks, who buys vets, who's inactive).
- AI trade pitches that use those profiles — "who to call, what to offer, draft the message".
- Contention-window forecast built on the existing 3-season simulation, fed by real values.

### Phase 4 — Launch
- Accounts + database (Postgres on Render/Railway, or Supabase) for saved leagues, tags, trade history, value history.
- Deploy on Render or Railway (~$5–20/mo). Domain. PWA install on phones.
- Beta with your league + 5–10 others before building payments.

## Running it
- `npm install`, then `npm run dev` → http://localhost:3000. Optional `GEMINI_API_KEY` for AI trade ideas.
- Production: `npm run build` then `NODE_ENV=production npm start` (Render/Railway). Server needs outbound access to `api.sleeper.app`, `*.myfantasyleague.com`, `raw.githubusercontent.com`.
- In the Claude workspace only: start with `NODE_USE_ENV_PROXY=1` so the server's fetches use the sandbox proxy.
