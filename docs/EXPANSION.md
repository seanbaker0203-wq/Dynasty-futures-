# Expansion plan: redraft football, a broader name, prediction markets

_Written 24 Oct 2026. Planning only: nothing here is built yet. Order: finish and launch dynasty football first._

## Priorities
1. **Launch dynasty football**: accounts on, beta with your league + 5–10 others, FantasyCalc / DynastyProcess
   permission, payments, terms reviewed by a lawyer.
2. **Redraft football ready by August 2027** (draft season).
3. **Rename to Fantasy Futures** before marketing beyond the beta (cheapest while the audience is small).
4. **Prediction-market data** as an optional signal, after legal review. No betting features.
5. Other sports (baseball first, then basketball/hockey): later, not planned now.

---

## 1. Redraft football

### What changes from dynasty
| Area | Dynasty (today) | Redraft |
|---|---|---|
| Value horizon | 5 seasons, age curves, picks | Rest of this season only (weeks left + playoff weeks) |
| Player value | Futures Value (model/market/experts) | Rest-of-season value: weekly projections × weeks remaining, weighted toward playoff weeks |
| Trades | Five-season lineup change | This season's lineup change, playoff-week weighting, bye coverage |
| Draft picks | Rookie picks, pick board | None (hide pick board, pick ideas, "from your rules" picks) |
| Team labels | Contender / rebuild over 5 years | Playoff odds from record + rest-of-season strength |
| Plan page | 5-season outlook | Rest-of-season schedule: byes, playoff matchups |

### Reused as-is
League sync (Sleeper, MFL), start/sit, manager profiles and trade report cards, trade builder, targeted trade
search, value gaps (vs FantasyCalc redraft values / FantasyPros ROS), rules notebook, rate limits and accounts.

### New for redraft
- **Waiver wire**: best free agents for your lineup holes this week and rest of season, with FAAB bid guidance (from
  league FAAB history once we read transactions for waivers too).
- **Rest-of-season strength of schedule**, especially playoff weeks (usually weeks 15–17).
- **Bye-week planner**: weeks you can't field a full lineup, and who fixes it.
- **Draft assistant** (August): rankings tuned to the league's scoring, live pick tracking via Sleeper draft API, best
  available by need.

### How it fits the product
- One app, one subscription. The league's type decides the mode: Sleeper `settings.type` (0 redraft, 1 keeper,
  2 dynasty), MFL keeper/contract settings. Keeper leagues sit in between (value = this season + keeper cost next year).
- Hide what doesn't apply (picks, five-season views) instead of building separate screens.

### Engineering steps
1. Add `format: 'dynasty' | 'keeper' | 'redraft'` to `LeagueSettings`, detected in each league adapter.
2. Add a **rest-of-season value** to the board: Sleeper weekly projections for remaining weeks (we already fetch
   weekly projections), plus FantasyCalc redraft values and FantasyPros ROS where licensed.
3. Make `projectOutlook` / trade finder accept a horizon (weeks of this season vs seasons) so the same code scores
   redraft trades.
4. UI: format-aware navigation (hide Picks, five-season tables; add Waivers and Schedule).
5. Draft assistant last (needs live draft polling).
6. Test on 3–4 real redraft leagues across Sleeper and MFL in the 2027 preseason.

### Also: make the code sport-ready (cheap now)
Move football assumptions (positions, lineup slots, scoring, season calendar, age curves, id systems) into a
`Sport` definition object. No visible change; makes a later baseball version far cheaper.

---

## 2. Name: Fantasy Futures

**For:** covers redraft and other sports; keeps "Futures" (the long-view brand); short.
**Watch-outs:**
- A 2022 hackathon project used the name "FantasyFutures" (devpost.com/software/fantasyfutures); a quick search found
  no active product, but that is not a trademark search.
- **"Futures" next to prediction markets**: Kalshi/Polymarket contracts are regulated by the CFTC as derivatives
  ("futures" is a regulated term in that world). If we show market odds, a lawyer should confirm the name won't suggest
  we offer trading.
- Before switching: USPTO trademark search (fantasy sports software / entertainment classes), domain and social handles
  (e.g. fantasyfutures.com/.app, @fantasyfutures), App Store name.

**Rename checklist (when decided):** app title and header, `<title>`, legal pages (`LEGAL.product`), LICENSE,
Render service name and domain, Supabase project name and sign-in emails, repo name, docs. Keep "Futures Value" as the
name of our number.

---

## 3. Prediction markets (Polymarket, Kalshi)

### Where things stand (Oct 2026; changes fast)
- **Kalshi** is CFTC-regulated and offers sports event contracts in all 50 states, but several states call them
  unlicensed sports betting. Connecticut sued Kalshi in Aug 2026 after a federal judge denied Kalshi an injunction;
  courts in several states have so far sided with the states; the CFTC is suing states over preemption.
- **Polymarket** returned to the US in Dec 2025 (after its 2022 CFTC settlement), launching with sports event contracts.
- Bottom line: legal status is contested and state-by-state. Treat anything that sends users to place trades like
  sports betting (age limits, state restrictions, advertising rules, app store rules).

### Ways to use them, safest first
1. **Market data as a signal (recommended first)**. Both publish market prices through public APIs. Useful inputs:
   - Team win totals, playoff and division odds → strength of schedule, contender context, redraft playoff odds.
   - Award markets (MVP, Offensive Rookie of the Year) and player-season markets → market-implied production for
     projections and buy/sell signals ("market thinks this rookie breaks out").
   - Injury / availability markets where they exist.

   Shown as context ("Market: 62% to make playoffs"), never as a bet. Needs each API's terms checked for commercial use
   and attribution.
2. **Blend into values**: add a small market-implied component to rest-of-season projections (redraft) or team context
   (dynasty contenders). Test against outcomes before trusting it.
3. **Affiliate links to the markets**: only with legal sign-off, geo-restricted to allowed states, 18+/21+ checks,
   clear disclosure, kept apart from player values ("partners never change our numbers").
4. **Never**: letting users wager inside the app, "trading" fantasy players for money, or contracts on fantasy outcomes.
   That makes us a gambling or derivatives operator.

### Next steps (later)
- Read both API docs and terms; list which football markets exist each week of the season.
- Prototype: team playoff odds on the League page and in redraft schedule strength (read-only).
- Ask a lawyer: displaying odds, the "Futures" name, and any affiliate arrangement.

---

## 4. Other sports (not planned now)
Baseball has the largest dynasty community after football (prospects, minor-league slots, multi-year contracts) and its
season fills football's off-season. Each sport needs its own positions/scoring, measured age curves, value sources and
permissions, and platforms (Fantrax matters more). Revisit after redraft football ships.
