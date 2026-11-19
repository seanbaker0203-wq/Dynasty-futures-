# Usage analytics and feedback

First-party and anonymous:
- a random id per device, plus the account id when signed in
- the screen, the platform type, and a few counts or flags
- no league ids, usernames or rosters
- no third-party trackers or cookies
- Do Not Track and Global Privacy Control are honored

Stored in Supabase: `usage_events` and `feedback`. Both are insert-only through the API; read them in the dashboard.

**Setup.** Run the "Usage analytics and feedback" block at the end of `supabase/schema.sql` in the Supabase SQL editor.

## Events
| event | when | props |
|---|---|---|
| `view` | a screen opens (`view` = screen id, e.g. playoffs, rebuild, records, ideas) | |
| `league_synced` | a league loads | format, superflex, teams, new_league |
| `trade_ideas` | trade ideas arrive | count, targeted, one_team, fire_sale, picks, refresh |
| `show_different_ideas` | "Show different ideas" | round |
| `feedback_sent` | feedback submitted | |

## Useful queries (SQL editor)
```sql
-- Active devices per day
select date_trunc('day', at) as day, count(distinct device) as devices
from usage_events group by 1 order by 1 desc limit 30;

-- Most-used screens in the last 7 days
select view, count(*) as opens, count(distinct device) as devices
from usage_events where event = 'view' and at > now() - interval '7 days'
group by 1 order by devices desc;

-- Leagues loaded by platform and format
select platform, props->>'format' as format, count(*) as syncs, count(distinct device) as devices
from usage_events where event = 'league_synced' group by 1, 2 order by syncs desc;

-- Returning users: devices seen on 2+ different days
select count(*) from (
  select device from usage_events group by device having count(distinct date_trunc('day', at)) >= 2
) t;

-- Latest feedback
select at, view, platform, email, message from feedback order by at desc limit 50;
```
