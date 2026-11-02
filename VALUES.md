
## Game-day weather (weekly lineup)

Outdoor games within 7 days of kickoff get a National Weather Service forecast for the stadium over the game window
(kickoff + 3.5 h). Domes and fixed roofs are skipped; retractable roofs get a note only (they close in bad weather).
Kickoffs come from ESPN's scoreboard (falling back to Sleeper's schedule with the usual Sunday/prime-time slots).

Each game is classed as rain, heavy rain, snow, wind 15+, wind 20+, rain plus wind 15+, or bitter cold (25°F or below).
Projections are multiplied by how each position scored in that weather in 2016–2025 compared to the same player's
other games that season (scripts/analysis/weather_effects.py → data/weather-effects.json):

| Weather | QB | RB | WR | TE | K |
|---|---|---|---|---|---|
| Rain | −12% | −7% | −9% | −14% | −3% |
| Wind 15–19 mph | −11% | −4% | −8% | −6% | −11% |
| Rain and wind | −26% | +3% | −22% | −25% | −29% |
| Snow | −16% | +13% | −18% | −21% | −14% |

Small samples are pulled toward "no change" (25 player-games of prior weight); worse weather is never treated as milder
than its lighter version; RB effects are kept between −10% and +5%. Heavy rain has too few logged games of its own, so
it uses the rain-and-wind numbers. Defenses gain in proportion to the drop in total points (capped at +15%). The final
multiplier is scaled by the chance of the weather, so a 50% chance of rain gets half the effect.
