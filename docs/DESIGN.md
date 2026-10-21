# Dynasty Futures — design system ("Front office")

**Subject.** A dynasty fantasy football front office. **Audience.** Dynasty managers in multi-year leagues, mostly on phones,
checking between games and in the group chat. **Primary job.** Tell me where my team stands in *my* league and what to do next.

The feel is a GM's scouting report: calm white pages, deep field-green ink, a little gold for standing and honours,
tall condensed athletic type for team names and ranks. Numbers are crisp and aligned.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F6F8F6` | `#0D1411` | page background (cool, slightly green — not cream) |
| `card` | `#FFFFFF` | `#141D19` | the few raised surfaces |
| `ink` | `#0F3D2E` | `#D8EBDF` | brand, headings, team names (field green) |
| `text` | `#1C2622` | `#D3DCD7` | body |
| `muted` | `#5E6C65` | `#8E9C95` | secondary text |
| `line` | `#DCE3DF` | `#25322C` | hairlines between rows |
| `gold` | `#A87A1C` | `#D8AE55` | rank / "most in league" — used sparingly |
| `up` | `#1D7A4C` | `#62C48F` | positive change |
| `down` | `#B0412C` | `#E07B66` | negative change |

## Type

- **Barlow Condensed** (600/700) — team names, ranks, big figures, section titles. Team names may be set in capitals as the
  one loud element; labels never are.
- **Barlow** (400/500/600) — everything else. Tabular figures for every number.
- Scale (px): 13 · 15 (body) · 18 · 22 · 30 · 44. Body line-height 1.5; condensed display 1.05.

## Layout

- Phone first, single column, left aligned, 16px gutters. Content max 720px on My team; League and Trade may use 1080px.
- Lists, not card soup: rows separated by hairlines. Cards only for the masthead and interactive panels.
- Radius 12 on containers, 8 on controls. No shadows except the bottom tab bar.
- Bottom tab bar on phones, top tabs on desktop (md+).

```
My team (phone)
┌────────────────────────────┐
│ INJURED RESERVE 4 LYFE     │  ← condensed, ink
│ 2nd of 10 · Contender      │  ← gold rank
│ Balanced contender: …      │
├────────────────────────────┤
│ Lineup   163  3rd          │  ← three vitals with league rank
│ Runway   4.6y 5th          │
│ Picks    14.7k 1st         │
├────────────────────────────┤
│ Next moves (2)             │
├────────────────────────────┤
│ Roster by position         │
│ Picks by year              │
└────────────────────────────┘
```

## Principles

1. Every number is compared with *this league* (rank, median), never shown bare.
2. One bold thing per screen: the team masthead or the ranking list. Everything else is quiet.
3. Plain words: "Lineup strength", "Prime years left", "Draft capital" — not "Gross Liquidity Index".
   (The original metric names stay available as small secondary text for people who know them.)
4. No decorative motion. Motion only confirms an action (row expands, trade total updates).
5. Labels in sentence case, no monospace UI text, no arrow glyphs on buttons.
