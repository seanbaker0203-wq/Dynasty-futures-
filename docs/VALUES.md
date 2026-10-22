# Futures Value — how Dynasty Futures values players

Futures Value is our own number for every player and pick, tuned to each league's format
(league size, 1QB or Superflex, PPR level, TE premium, starting slots).

```
Futures Value = 0.40 × Model + 0.30 × Market + 0.30 × Experts
```

If a source has no value for a player, the remaining weights are scaled up to 100%.

## The three inputs

| Input | Source | What it captures |
|---|---|---|
| **Market** | [FantasyCalc](https://fantasycalc.com) dynasty values, built from real trades, requested for the league's exact format | What the player actually trades for today. This is the shared scale everything else is mapped onto. |
| **Experts** | FantasyPros dynasty ECR via [DynastyProcess](https://github.com/dynastyprocess/data) (1QB or Superflex) | Consensus of professional rankers. Mapped to the market scale by rank. |
| **Model** | Ours (`server/model/futures.ts`) | Five-season production outlook, see below. Mapped to the market scale by rank. |

## The model

1. **Recent production.** Points per game from Sleeper's season stats under the league's scoring (standard / half / full
   PPR, +0.5 per TE reception in TE-premium leagues). This season (4+ games) weighted 65%, last season (6+ games) 35%.
2. **Regress to the market.** Production is blended 60/40 with what the market implies the player produces (his rank at
   his position mapped to the points-per-game of the player at that rank). Players without enough games use the implied
   number only, so rookies and injured players aren't punished for missing stats.
3. **Age forward.** Each of the next five seasons is projected with a position aging curve
   (`server/model/ageCurves.ts`: RB peak 24–25 and steep after 27; WR peak 25–27, decline from 29; TE peak 26–28, decline
   from 30; QB plateau 26–32, decline from mid-30s; all curves reach zero by retirement age).
4. **Only points that win weeks count.** For each season, points per game above a replacement-level starter in *this*
   league (from league size and starting slots), times 17 games, discounted 15% per year, summed over five seasons.
5. **Per-season role.** Each projected season is tagged Starter, Flex, Depth or Fading against the league's starter and
   replacement lines. A **fall-off season** is the first season a past-peak player drops out of Starter/Flex and is at least
   15% below his best projected season.

## Signals

- **Edge** = (Futures Value − Market) ÷ Market, adjusted against players of similar market value.
- **Buy low**: edge ≥ +12% and the market fell 5–35% in 30 days (bigger crashes usually mean injury or role loss).
- **Sell high**: edge ≤ −12% and the market rose 5%+ in 30 days.
- **Undervalued / Overvalued**: edge beyond ±20% without the momentum condition.
- Only players worth 1,000+ get signals.

## Picks

Average of the market's pick value (FantasyCalc lists the next two or three drafts by round and early/mid/late) and the
expert pick value mapped to the same scale. Years past what the market lists are discounted 10% per year.

## Season outlook (Plan page)

Each team's best possible starting lineup is built from projected points per game for each of the next five seasons,
then ranked within the league. Future rookies and trades are not included, so every team trends down; ranks are the signal.

## Limits and next steps

- Injuries and depth-chart changes only show up through the market and experts until they hit the stat line.
- Aging curves are v1 assumptions; calibrate against historical player-seasons.
- FantasyCalc has no published API terms; confirm permission before charging for the product. Same for DynastyProcess
  (GPL-3 repo, FantasyPros-derived data).
- KeepTradeCut can't be pulled in (no API, scraping not permitted); we link to each player's KTC page instead.
