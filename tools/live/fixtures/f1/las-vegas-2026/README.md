# F1 Las Vegas Grand Prix, 22 Nov 2026: what the free live data looked like

Recorded for building a live mode into the F1 tracker (scorebuzz-site `scorebuzz/tracker-f1.js`), which so far only
replays a finished race. The owner wants to stream the next Grand Prix (Qatar, 29 Nov 2026, 16:00 UTC).

- Source: `https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard`, polled every 20 s from 03:51 to 05:51 UTC
  (353 polls). Only snapshots that differed from the one before were kept: 101 of them.
- `snapshots.tar.gz`: the raw snapshots (`snap/sb-<UTC time>.json`) and `poll.log` (every poll, changed or same).
- `timeline.json`: one row per kept snapshot: `t`, race `status`, `lap`, and `order` (drivers in running order).

## What the feed gives during a race
- Race status: `STATUS_SCHEDULED` -> `STATUS_IN_PROGRESS` -> `STATUS_SESSION_COMPLETE` (not `STATUS_FINAL`).
- `status.period` of the Race competition = the lap the leader is on (0 to 50 here).
- For each of the 22 drivers: `order` (running position). Nothing else: `statistics` stayed empty all race, `winner`
  stayed false even at the end.
- A new snapshot about every 40 to 75 seconds (98 while the race was live, over about 100 minutes).

## What it does not give
No gaps or intervals, lap times, tyres, pit stops, retirements (a retired car just drops to the back of the order),
flags, safety car or car positions on the circuit. The `summary` endpoint returns 404 for F1.
`sports.core.api.espn.com` could not be reached from the recording machine, so its per-driver data is unchecked.

## What that allows
- Timing tower: real order, updated about once a minute; rows can animate when positions swap.
- Lap counter: real.
- Circuit map: cars can only be placed by estimate (even spacing in running order, moved round at a typical lap pace
  and re-synced when the lap number changes). It must be labelled as an illustration, not real positions.
- Not possible from this feed: safety-car banners, pit-stop markers, fastest lap, gaps.
