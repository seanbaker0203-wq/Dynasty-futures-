# Dynasty AI Evaluator — Code Review & Roadmap

_Review of the AI Studio export, 21 Oct 2026. Code: github.com/seanbaker0203-wq/Dynasty-futures- (first commit = untouched export)._

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

**Live:** https://dynasty-futures.onrender.com (Render free plan, auto-deploys on every push to `main`). Verified: health check, both data feeds loaded, league 37804 syncs and renders.


**Phase 1 done** (commits `23ee22e`, `0c9ae57`). Verified against real leagues:
- MFL 37804 *Nothin' But Babies & Memories* (public, 10 teams, 1QB, half PPR, salary/contract league): all 385 rostered players resolve by id, sync in ~1.5 s.
- Sleeper Superflex (*Hollywood Randos*) and 1QB (*Ballers Dynasty*) public leagues: correct format detection, username → team, traded picks.

**Found while testing — next up**
1. ~~Re-calibrate classifications~~ — done (`810d2db`): labels and trade stance graded within each league (lineup, age runway, picks).
2. **Pick values assume 12 teams.** Scale for league size (picks in a 10-team league are worth more).
3. ~~MFL lists "2026" picks as still to come~~ — resolved: league 37804 drafts in person and adds players manually, so MFL never consumes the picks. Picks before the next calendar draft are now ignored (`b83c0c8`). Sean's team is franchise **0010** (*Injured Reserve 4 Lyfe*).
4. **Salary/contract leagues.** League 37804 has salaries and contract years; value should account for contract cost. Big differentiator — few tools do this.
5. AI trade finder's "predicted Gross Liquidity delta" still uses the old fixed 22,500 baseline (`src/lib/aiTradeFinder.ts`).
6. Explanatory copy on League Radar still mentions 2027/2028 by name.
7. ~~Phone layout~~ — shell done: 4 destinations (My team · League · Trade · Connect), bottom tab bar on phones, no horizontal scroll on any screen at 390 px.
8. ~~Visual pass~~ — done: "Front office" design system (`docs/DESIGN.md`), light + dark, every screen rebuilt phone-first. Front end went from ~17,700 to ~3,700 lines; JS bundle 984 KB → 300 KB.
   **Removed from the UI for now** (code is in git history before the design-pass commit): AI Trade Architect, trade history log, 3-season projection chart, market heatmap. AI trade ideas come back in Phase 3 built on manager profiles; the `/api/trade/ai-suggest` endpoint still exists.
9. The "prime years left" model gives RBs a 26.5 age cliff, so swapping a 30-year-old RB for a 24-year-old RB can show little change. Revisit age curves (per-position value curves rather than a single cliff).

## Futures Value release — 22 Oct 2026

- **Futures Value** (our own value, `docs/VALUES.md`): 40% projection model, 30% FantasyCalc trade market, 30% FantasyPros
  experts, tuned per league format. Replaces raw DynastyProcess values everywhere (rosters, picks, trades, rankings).
- **Values page**: our rankings with market / experts / model side by side, edge vs market, owner in your league,
  5-season projected role, KTC link. **Movers**: buy low, sell high, 30-day market risers/fallers, 4-week expert movers.
- **Plan page** (My team): projected lineup and league rank for each of the next 5 seasons, moves to plan by
  season (sell before fall-off, positional holes with buy-low targets, picks to restock), roster timeline grid.
- Expert value history: 26 weeks bundled (`scripts/build-expert-history.mjs`), extended from GitHub at runtime.

- **Measured aging curves** (14 seasons, blended with published research) and **rookie pick outcomes by slot**; picks
  now count in the season outlook (with diminishing returns) and the Plan shows each pick's value now vs at draft time.

**Next for values:** store our own daily Futures Value snapshots (pick appreciation into the draft, longer history);
injury/depth-chart awareness; rookie-draft order from real rookie ADP instead of NFL draft order; FantasyCalc permission
before charging.

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
- ✅ **Manager profiles** from three seasons of league trades (Sleeper + MFL): activity, partners, picks gained/spent, age of players bought vs sold, positions targeted, record on today's values. Tags: Trades a lot, Collects/Spends picks, Buys veterans/youth, Usually wins trades, Often overpays, Hasn't traded in a year. (`server/leagues/history.ts`, `server/model/managers.ts`, `POST /api/league/history`)
- ✅ **Trade report cards** (League → Trades): every trade graded on today's Futures Values, plus a "who wins their trades" leaderboard. Used picks are valued as a same-round pick in the next draft.
- ✅ **Trade finder** (Trade → Ideas, `src/lib/tradeFinder.ts`): value-fair 1-for-1 and 2-for-1 deals (2-for-1 asks ~10%+ premium) that raise your five-season outlook, ranked by both teams' outlook change, the partner's direction and trading profile; salary-cap safe; "Open in trade builder".
- Next: draft the trade message for the user to send.
- Contention-window forecast built on the existing 3-season simulation, fed by real values.

### Phase 4 — Launch
- Accounts + database (Postgres on Render/Railway, or Supabase) for saved leagues, tags, trade history, value history.
- Deploy on Render or Railway (~$5–20/mo). Domain. PWA install on phones.
- Beta with your league + 5–10 others before building payments.

## Running it
- `npm install`, then `npm run dev` → http://localhost:3000. Optional `GEMINI_API_KEY` for AI trade ideas.
- Production: `npm run build` then `NODE_ENV=production npm start` (Render/Railway). Server needs outbound access to `api.sleeper.app`, `*.myfantasyleague.com`, `raw.githubusercontent.com`.
- In the Claude workspace only: start with `NODE_USE_ENV_PROXY=1` so the server's fetches use the sandbox proxy.

## Private notebook + personal values — 22 Oct 2026
- **My team → Rules** (`src/screens/RulesScreen.tsx`): private notes (pin, tags, edit). Signed in = Supabase `user_rules`
  (owner-only row security); signed out = this device only, moved to the account on first sign-in.
- **Personal value adjustments** (`src/lib/personalValues.ts`, stored in `user_settings`): premium/discount on picks by
  drafts away (with a "match the market's time discount" shortcut from the league's own pick prices), and a discount on
  your players who aren't in your best projected lineup. Shown only to that user: "On your values" in the trade builder
  and a "From your rules" section in Trade → Ideas. Never changes league/market values.
- Accounts: Supabase email sign-in link (`src/context/AccountContext.tsx`); keys served by `/api/config` from env.
