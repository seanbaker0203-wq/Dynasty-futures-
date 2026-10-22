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
3. **Age forward.** Each of the next five seasons is projected with a position aging curve (`data/age-curves.json`).
   Curves are measured from Sleeper stats since 2012 with `scripts/analysis/age_curves.py` (delta method on half-PPR
   points per game; players selected on the prior season to avoid regression-to-the-mean bias; players who leave the
   league count as zero to avoid survivorship bias; smoothed) and blended 50/50 with published research
   ([4for4 production curves](https://www.4for4.com/2025/preseason/production-curves-positional-breakouts-prime-years-and-falloffs-age),
   [PFF aging curves](https://pff.com/news/fantasy-football-metrics-that-matter-aging-curves-by-position)).
   Result: RB full strength to 27, 91% at 28, 77% at 29, 57% at 30. WR peak 26, 88% at 29, 73% at 31. TE peak 26,
   ~75% by 30–32. QB improves to 29, plateau to 32, then declines. Re-run every off-season.
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

Each team's best possible starting lineup is built from projected points per game for each of the next five seasons.
**Draft picks** add their expected value from the season after their draft: the chance of a starter-level season that
year times what a hit adds over the team's weakest starter. Picks are applied best first and each can only displace the
next-weakest starter, so stacking picks has diminishing returns. Teams are ranked with and without picks.

### Rookie pick outcomes (`data/rookie-picks.json`, `scripts/analysis/rookie_picks.py`)

Rookie-draft order is estimated from each class's NFL draft order of skill players (QBs pushed down in 1QB, up in
Superflex; TEs slightly down). Over the 2013–2025 classes, the share of picks that were starter-level in a given season
(half PPR: QB 16+, RB 9.5+, WR 9+, TE 7.5+ points per game, 6+ games), 1QB:

| Slots (12-team) | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| 1.01–1.04 | 52% | 62% | 57% |
| 1.05–1.08 | 42% | 58% | 64% |
| 1.09–1.12 | 40% | 38% | 48% |
| 2nd round | 10–25% | 25–31% | 30–36% |
| 3rd round | 2–12% | 10–17% | 14–20% |
| 4th round | 4–8% | 8–12% | 7–14% |

Consistent with [PFF's rookie draft study](https://www.pff.com/news/fantasy-dynasty-rookie-draft-history-lesson)
(top 3 picks 67%, picks 4–12 32%, picks 13–22 24%).

### Pick value at draft time

A pick's value once it is the next draft's pick is taken as today's market value of a next-draft pick in the same round
and tier (e.g. a 2028 1st worth 2,162 today ≈ 2,606 when it becomes the next draft's pick). Spring pre-draft
appreciation isn't measured yet; storing our own daily snapshots will let us measure it.

## Limits and next steps

- Injuries and depth-chart changes only show up through the market and experts until they hit the stat line.
- Aging curves are v1 assumptions; calibrate against historical player-seasons.
- FantasyCalc has no published API terms; confirm permission before charging for the product. Same for DynastyProcess
  (GPL-3 repo, FantasyPros-derived data).
- KeepTradeCut can't be pulled in (no API, scraping not permitted); we link to each player's KTC page instead.
