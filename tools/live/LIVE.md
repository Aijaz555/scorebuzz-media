# ScoreBuzz live scoreboard streams

YouTube live streams that show a game's live score, not the game itself. This is the same
format as Dope Media (@dopemediaph) and Sports Lounge (@Sportslounge6), which get
5k–250k views per stream. Leagues: `nba nfl nhl ncaaf mlb epl ucl laliga seriea bundesliga mls`.

## The overlay (`overlay.html`, 1920x1080)

Laid out like Sports Lounge (team sidebars, centre stage, play-by-play) with more depth:

- **Team sidebars:** team logo (or national flag), name, record, big score that flashes when it changes, period-by-period chips with the current period highlighted, game leaders (season leaders before tip-off), team stats with comparison bars.
- **Status bar:** clock and period, "RGK LEAD BY 7", and a scoring-run badge ("10-0 RUN") when one side scores 8+ unanswered.
- **Centre stage, by sport:**
  - NBA: tilted 3D court with a live shot chart (made ● / missed ✕, team colours).
  - NFL / NCAAF: field with end zones, line of scrimmage, first-down marker, direction arrow, current drive.
  - NHL: rink with shots and goals.
  - MLB: diamond with runners on base, balls/strikes/outs, batter and pitcher.
  - Football: pitch with shots (on target), plus a 0–90' timeline of goals and cards.
- **Win probability** bar with a trend line (NBA/NFL/NCAAF), or **possession** for football.
- **Play-by-play** with team logo, clock and +2/+3/+7 badges; scoring plays highlighted.
- **Big-play pop-up** on the stage for every score ("THREE! · KNIGHTS +3", "TOUCHDOWN!", "GOAL!").
- **Breaks:** at the end of a quarter, half-time and full time, a full-screen split banner in both team colours, then the stage rotates between a team-stats comparison and a box score (NBA top 4 per team).
- **Pre-game:** countdown to tip-off/kick-off, logos head to head, ET and UK times, TV channel.
- **Footer:** ticker of the league's other games with logos, and a SUBSCRIBE button with a ringing bell; a "like and subscribe" card slides up for 8 s every 7 minutes.

Preview tricks: `?league=nba&event=<id>&demo=pop` shows the pop-up, `&demo=trans` the break banner.
`/classic` serves the simpler first version (`scoreboard.html`).

Logos and flags are loaded from ESPN's image CDN (`team.logo` in the feed); if one fails to load, the
team's abbreviation on its team colour is shown instead. Team logos are trademarks of the leagues and
clubs: the channel decided to use them; if a rights holder complains, remove the `<img>` in `logo()`.

Which ESPN fields each panel needs (all optional; a panel hides or falls back when data is missing):
`summary.plays[].coordinate` (shot chart), `summary.winprobability` (win %), `summary.boxscore.teams`
(team stats), `summary.boxscore.players` (box score), `competitions[0].situation` (NFL field, MLB count),
`competitions[0].details` (football timeline). These were built from ESPN's documented-by-community shape
and tested with the fake fixtures, not yet against a live game: check the first real stream and adjust
`feed.js` if a panel stays empty.

## Files

| File | What it does |
|---|---|
| `feed.js` | Reads ESPN's public scoreboard/summary JSON and normalises it. All data-shape fixes go here. |
| `server.js` | Local web server: scoreboard page at `/?league=nba&event=<id>`, JSON at `/api/game`, `/api/games`. |
| `overlay.html` | The 1920x1080 broadcast overlay (refreshes every 5 s). Also usable as an OBS browser source. |
| `scoreboard.html` | Simpler first version, served at `/classic`. |
| `games.js` | Lists today's games with ESPN event ids, ET/UK/PKT times and a YouTube title + description. |
| `stream.js` | Streams one game to YouTube (or records to a file with `--out`). Stops 20 min after the final. |
| `autopilot.js` | For an always-on server: starts a stream for every game, 15 min before it begins. |
| `setup_vps.sh` | Installs everything on a fresh Ubuntu server. |
| `fixtures/` | **Fake** test games for `SCOREBUZZ_MOCK=1` (not real teams or scores). |

## Try it

```bash
npm install playwright && npx playwright install chromium   # once; ffmpeg must be installed
node tools/live/games.js nba nfl epl                          # today's games + titles
node tools/live/server.js                                     # then open http://localhost:8787/?league=nba&event=<id>
node tools/live/stream.js --league nba --event <id> --out test.mp4 --minutes 1   # 1-minute test recording
SCOREBUZZ_MOCK=1 node tools/live/server.js                    # offline fake games: nba 9001 (live) 9004 (half-time) 9002 (pre) 9003 (final), nfl 7001, epl 8001, nhl 6001
```

## Go live on YouTube

1. **Turn on live streaming** for the channel: YouTube Studio → Go live (needs a verified phone; the first time takes up to 24 hours).
2. **Get a stream key**: Studio → Go live → Stream → copy the stream key. Make extra keys (one per game you want live at the same time) under "Stream settings → Select stream key → Create new stream key".
3. **Set the title and description** from `games.js` for the broadcast on that key.
4. Run: `node tools/live/stream.js --league nba --event <id> --key <stream key>`.

Manual alternative with no server: add `http://localhost:8787/?league=nba&event=<id>` as a 1920x1080 Browser Source in OBS and press Start Streaming.

## YouTube and Facebook at the same time

`stream.js --key <youtube key> --fb-key <facebook key>` encodes once and sends the same stream to both
(ffmpeg `tee`), so it costs no extra CPU, only double the upload (~3 Mbps each). If one side drops, the other
keeps going. Facebook key: Page > Live Producer > "Streaming software" > copy the stream key (turn on
"Use a persistent stream key" so it doesn't change). Facebook needs RTMPS (`rtmps://live-api-s.facebook.com:443/rtmp`,
the default). In `live.config.json` a key can be `{"youtube": "...", "facebook": "..."}`.

## What Sports Lounge does (checked 5 Nov 2026, @Sportslounge7 live tab)

- 2–4 streams a day, each one game, 2.5–5 h long (goes live before the start, ends after the final).
- Title: `<Team> vs <Team> | NBA Live Scoreboard & Play-by-Play`, `| Week 8 Live Scoreboard & Play-by-Play` (NFL), `<Team> vs <Team> LIVE | NCAAF Live Scoreboard & Play-by-Play`. Our `games.js` uses the same pattern.
- Views per stream: college football Saturday top games 60k–260k (best: Texas v Ole Miss 262k, Georgia v Florida 236k, Notre Dame v BYU 220k), NFL 15k–180k (Bears v Seahawks 179k), NBA 25k–100k (Lakers games most often), MLB playoffs 13k–54k.
- So pick games, don't stream everything: ranked college games on Saturday, NFL Sunday/prime time, one or two big-market NBA games a night (Lakers, Warriors, Knicks, Celtics, 76ers), big Champions League/Premier League games for the UK audience. `live.config.example.json` is set up that way (`only` per league, `top25` for college).

## VPS quick start (recommended hosting)

1. Rent an Ubuntu 24.04 server with 2 vCPU / 4 GB RAM (Hetzner CPX21, DigitalOcean or Vultr; roughly $5–12 a month). Each stream needs ~0.6 CPU core and ~3 Mbps upload, so this runs 3 at once.
2. SSH in and run:
   ```bash
   git clone https://github.com/Aijaz555/scorebuzz-media && cd scorebuzz-media
   bash tools/live/setup_vps.sh
   node tools/live/games.js nba nfl ncaaf     # check the data feed works from the server
   ```
3. YouTube Studio → Go live → Stream → create one **reusable stream key per simultaneous stream** (3 keys), each with "Enable auto-start" and "Enable auto-stop". Paste them into `tools/live/live.config.json`.
4. Test one recording without going live: `node tools/live/stream.js --league nba --event <id> --out test.mp4 --minutes 2`.
5. Start it: `pm2 start tools/live/autopilot.js --name scorebuzz-live && pm2 save && pm2 startup`. Logs: `pm2 logs scorebuzz-live` (it prints the YouTube title and description for each game it starts).
6. Update later with `git pull && pm2 restart scorebuzz-live`.

Titles: with reusable keys, YouTube reuses the last title on that key. Until the YouTube Data API step below is set up, set each upcoming broadcast's title from `games.js` in Studio (or accept the generic title).

## Remote control (no SSH needed after setup)

The server is managed through GitHub, so it can be run from a Claude session (which can't open SSH connections):

- **Settings in git:** `tools/live/live.settings.json` — leagues, team filters (`only`), college `top25`, `leadMinutes`, plus `include` / `exclude` (event ids) and `paused`. `sync.sh` (cron, every 2 min) pulls `main`; the autopilot re-reads settings every minute, and a game added to `exclude` while live is stopped. Code changes under `tools/` restart the autopilot automatically.
- **Status from the server:** `sync.sh` pushes `status.json` (running / upcoming / finished games, YouTube broadcast ids, errors), `log.txt` (last 150 log lines) and `server.txt` (CPU, memory, pm2) to the **`live-status`** branch.
- **Secrets stay on the server** in `tools/live/live.config.json` (git-ignored): stream keys and the YouTube API refresh token. Never commit them: the repo is public.
- **Push access for the server:** create a fine-grained GitHub token (Settings → Developer settings → Fine-grained tokens) for `Aijaz555/scorebuzz-media` only, permission *Contents: Read and write*, then on the server: `git config credential.helper store && git push` once (user = your GitHub name, password = the token). Or add an SSH deploy key with write access.

## Auto start and stop (with each game's own title)

With `youtubeApi` set, for each chosen game the autopilot creates a public broadcast with the game's
title, description and a designed "LIVE NOW" thumbnail, binds it to a free stream key, starts the video
`leadMinutes` before kick-off (YouTube **auto-starts** the broadcast) and stops 20 min after the final
(YouTube **auto-stops** it). One-time setup:
1. Google Cloud Console → new project → enable **YouTube Data API v3** → OAuth consent screen (External, add your Google account as a test user, or publish it so the token doesn't expire after 7 days) → Credentials → OAuth client ID → type **Desktop app**. Put the client id/secret in `live.config.json` under `youtubeApi`.
2. On the server: `node tools/live/youtube.js auth`. Open the printed link on any device, sign in, then copy the address the browser ends on (127.0.0.1:8788/?code=…, the page itself won't load) and paste it into the terminal. Then `node tools/live/youtube.js check` tests everything and explains any failure.
3. `pm2 restart scorebuzz-live`. The log line `YouTube API on` confirms it.
Quota: ~150 units per game (insert + bind + thumbnail) of the default 10,000/day.

## Cloud studio (LiveReacting) — no server needed (tested 5 Nov 2026)

`docs/live/index.html` is a server-free copy of the overlay (build with `node tools/live/build_web.js`
after changing `overlay.html` or `feed.js`). It reads ESPN from the browser. Use it as a **Web Page layer**
in LiveReacting (or any cloud studio). Working settings on the free plan (1280x720 canvas; the web layer
renders at 1697x715 but only ~1280x720 is shown):

    https://raw.githack.com/Aijaz555/scorebuzz-media/main/docs/live/index.html?auto=1&fit=fill&w=1280&h=720

- `auto=1`: always shows the best game (live first, favourite teams first, else the next game's countdown; finals held 15 min).
  Steer it from git with `docs/live/settings.json` (`leagues`, `teams`, `top25`, `pin: {league, event}`); the page re-reads it every minute.
- One game only: `?league=nba&event=<ESPN id>&fit=fill&w=1280&h=720`.
- `size=1` shows the real window size in a yellow label (debugging only). Add `&v=N` to bust caches after an update.
- Plans: the 24/7 plan has no length limit and 5 destinations (YouTube + Facebook together); Facebook ends any live after 8 hours,
  so schedule daily windows (weeknights ~7pm–3am ET; weekends noon–8pm and 8pm–4am ET).

## Fully automatic (next step)

`autopilot.js` + a stream-key pool already starts and stops the video for every game. What it can't
do yet is create a YouTube broadcast per game with the right title: that needs the YouTube Data API
(`liveBroadcasts.insert` + `liveBroadcasts.bind`) with an OAuth client and refresh token for the
channel, set up once in Google Cloud Console. Until then, schedule the broadcasts in YouTube Studio
with "auto-start" on, one per key.

Hosting: a $5–12/month Ubuntu VPS (2 vCPU / 2–4 GB) runs 3–4 streams at once; each uses about
0.6 CPU core and 3.1 Mbps upload. Run `bash tools/live/setup_vps.sh`, put keys in
`tools/live/live.config.json` (copy `live.config.example.json`), then `pm2 start tools/live/autopilot.js -- tools/live/live.config.json`.

## Rules

- Title format: `<Team> vs <Team> | NBA Live Scoreboard & Play-by-Play` (`games.js` builds it). Always say "Scoreboard" so nobody expects game video; never say "full game", "HD stream" or "watch free".
- No player photos, footage or TV audio. Team logos/flags are used (see above).
- Description says it is a live scoreboard without footage, and links scorebuzz.net.
- YouTube can limit monetization on channels whose videos are mass-produced or repetitive. Each stream has different live data, but keep the channel varied (Shorts, recaps) and don't run streams for games with no audience.
- ESPN's JSON API is unofficial, with no SLA: if it changes or blocks requests, `feed.js` is the only file to change (or swap in a paid feed such as Sportradar/API-Sports).

## Every game, its own stream (owner's request, 5 Nov 2026)

Leagues: NFL, NBA, NHL, MLB, Premier League, LaLiga, Serie A, Ligue 1, MLS (plus Champions League and
top-10 college football). Each game gets its own LiveReacting stream with its own title and description,
starting 30 min before kick-off and stopped when the game is over.

- Pool: LiveReacting projects named `ScoreBuzz Main` (web layer `?auto=1…`, steered by `settings.pin`) and
  `Slot N` (web layer `…/docs/live/index.html?slot=N&fit=fill&w=1920&h=1080`, steered by `settings.slots[N]`).
  To add capacity: duplicate a Slot project in the Studio, name it `Slot <next number>` and change `slot=` in
  its Web Page layer URL to the same number. Peak load (Sat/Sun evenings) is about 20 games at once.
- `node tools/live/plan_streams.js <projects.json> --write` (projects.json = livereacting_list_projects output)
  decides stops, restarts and new assignments and updates docs/live/settings.json. Priority when the pool is
  short: favourite teams, then nfl > nba > epl > ucl > ncaaf > nhl > laliga > seriea > ligue1 > mls > mlb.
  Override any of it with `"streams": {...}` in settings.json (leagues, leadMinutes, ncaafTop, hours).
- Run hourly by the scheduled task "ScoreBuzz live stream manager". For each action:
  1. `stop` → livereacting_stop_stream. `cancel` → livereacting_cancel_schedules.
  2. Commit + push settings.json (attribution) BEFORE starting/scheduling, so the page shows the right game.
  3. `assign` → livereacting_update_project(title, description, duration {manual:false, planned: durationSec}),
     then, if the action has `music`, livereacting_set_playlist(projectId, music.layerId, music.files, loop: true,
     volume: music.volume) — a freshly shuffled per-sport playlist — and finally livereacting_schedule_stream([at])
     or, when at = "now", livereacting_start_stream.
     `restart` → update_project(duration) then start_stream.
- YouTube tags and category: the LiveReacting API ignores youtubeAdvancedSettings (tested 5 Nov 2026), so Category =
  Sports is set once per project in the Studio (and as the channel upload default). Per-game keywords go in the title
  and the hashtag line (league, matchup, both teams), which the planner writes; actions also carry `tags` for later.
- LiveReacting refuses title/description edits on a SCHEDULED project ("Can not update title/description"): cancel the
  schedule, update, then schedule again. (Edits on a LIVE project work.)
- **Plan limits (LiveReacting support, 9 Nov 2026): Large plan raised to 15 concurrent streams, fair-use cap 680 streaming
  hours per week** (≈ 15 streams × 6.5 h/day on average; busy weekends are fine as long as the week stays under 680 h). Over the
  cap, LiveReacting tells the owner and offers the custom $199/mo plan.
  - plan_streams.js caps new assignments at `maxLive` (15; override with `"streams": {"maxLive": N}` in settings.json): running +
    scheduled + restarted projects count, and the lowest-priority games go to `skipped` with `reason: "cap 15"` (vs
    `"no free project"` when the 21 projects run out).
  - `node tools/live/usage.js <broadcasts.json> [status.json]` sums livereacting_list_broadcasts (per project) for the week
    (Mon 00:00 UTC) and rolling 7 days: hours, % of 680, projection, level ok/warn (≥80%)/over. The hourly manager runs it once
    a day (first run after 00:00 UTC) and notifies the owner at warn/over (once per day, word "usage" in the commit/summary).
  - For the hourly manager: step 5's "skipped" notification is only for `reason: "no free project"`; games skipped with
    `reason: "cap 15"` are expected on busy weekends — list them in the summary, don't notify. Usage check (once per UTC day,
    when today's git log has no "usage:" commit): livereacting_list_broadcasts (limit 50) for every project → scratch
    {"<project name>": [...]} → `node tools/live/usage.js <file>` → add "usage: <h> h of 680 this week (<pct>%), last 7 days <h> h"
    to the run's commit message; notify the owner when level is warn or over.
  - Baseline (before the raise, 9-stream cap): 5–9 Nov ≈ 347 h in total, of which Fri 53 h, Sat 113 h, Sun 140 h; peak 11 at once.
    With 15 streams a full weekend could reach ~180–220 h/day, so a week with every game is close to the 680 h cap.
  - 9 Nov 2026 09:44 UTC usage check: 34.4 h of 680 this week (5%), last 7 days 346.8 h, level ok.
  - 10 Nov 2026 00:47 UTC usage check: 34.4 h of 680 this week (5%), last 7 days 346.8 h, level ok (finished broadcasts only; Mon night games still live).
  - 11 Nov 2026 00:44 UTC usage check: 71.8 h of 680 this week (11%), last 7 days 384.2 h, level ok (finished broadcasts only; 8 streams live).
  - 12 Nov 2026 00:44 UTC usage check: 112.4 h of 680 this week (17%), last 7 days 422 h, level ok (finished broadcasts only; 9 streams live).
  - 12 Nov 2026 01:42 UTC: YouTube refused new broadcasts at 10 live ("User has too many live or scheduled broadcasts"): Oilers-Flyers (Slot 11, stuck PREPARING → stopped, restart refused), 02:00 schedules Rockets-Warriors (Slot 10) and Golden Knights-Mammoth (Slot 13) failed to start. Owner notified (likely stale Upcoming broadcasts in YouTube Studio).
  - 13 Nov 2026 00:44 UTC usage check: 164.2 h of 680 this week (24%), last 7 days 444.3 h, level ok (finished broadcasts only; 10 streams live). Same YouTube refusal at 10 live: Stars-Jets (Slot 10, stuck PREPARING → stopped) and Giants-Commanders TNF (Slot 11, 00:45 schedule) refused; owner notified.
- Older cap (found 7 Nov 2026 01:45 UTC): the plan allowed only 9 concurrent live streams; the log below is from that period.
  - 8 Nov 2026 14:43 UTC: cap hit again — Real Sociedad-Rayo (Slot 2, now) and 4 Ligue 1 16:15 UK games (Slots 12-15) refused; only Slot 1 (Man Utd-Villa) scheduled.
  - 8 Nov 2026 16:45 UTC: 4 Ligue 1 restarts (Slots 14-17) went through (10 streams counted), then all 8 18:00 UK schedules (7 NFL 1pm ET games + Panthers-Bruins, Slots 4-6,8-11,18) were refused by the cap; the next hourly runs start them as slots free up.
  - 8 Nov 2026 17:43 UTC: Bengals-Falcons (Slot 7) stopped, Cowboys-Colts started on Slot 2 (9/9); Jets-Chiefs, Giants-Eagles, Panthers-Bruins, Lions-Dolphins, Browns-Saints, Rams-Commanders (Slots 4-6,8-11) prepared but refused by the cap. Schedules for 19:15 UTC (Slots 18-19) were accepted.
  - 8 Nov 2026 18:43 UTC: Man Utd-Villa (Slot 1) stopped; Jets-Chiefs, Giants-Eagles, Lions-Dolphins, Browns-Saints, Rams-Commanders (Slots 4,5,8,9,10) started (9/9); Broncos-Panthers (Slot 11) and Panthers-Bruins (Slot 6) refused by the cap. Atlético-Barcelona (Slot 15, 19:30), 76ers-Bulls (Slot 7) and Golden Knights-Sabres (Slot 14, 20:00) scheduled.
  - 8 Nov 2026 19:43 UTC: Villarreal-Getafe (Slot 12) and Celta-Levante (Slot 3) stopped; Atlético-Barcelona started on Slot 17 (9/9). Texans-Chargers (Slot 1, 20:35), Packers-Patriots, Raiders-49ers, Cardinals-Seahawks (Slots 13,15,16, 20:55) set up but schedules refused by the cap; Broncos-Panthers (Slot 11) restart refused again.
  - 8 Nov 2026 20:43 UTC: no stops due (9 LIVE). Slot 7 (76ers-Bulls) stuck PREPARING 43 min → stopped, re-start refused by the cap. Texans-Chargers (Slot 1, now), Packers-Patriots, Raiders-49ers, Cardinals-Seahawks (Slots 3,12,13, 20:55) set up (title, description, music) but start/schedules refused; Broncos-Panthers (Slot 11) and Panthers-Bruins (Slot 6) restarts not possible.
  - 8 Nov 2026 22:43 UTC: no stops due (8 LIVE). Flyers-Flames (Slot 4, 23:30) and Nets-Mavericks (Slot 2, 00:00) scheduled; Jazz-Timberwolves (Slot 5) and Devils-Leafs (Slot 8, 23:30) set up (title, description, music) but schedules refused by the cap.
  - 8 Nov 2026 23:43 UTC: Golden Knights-Sabres (Slot 14) and 76ers-Bulls (Slot 7) stopped; Jazz-Timberwolves (Slot 9) and Devils-Leafs (Slot 10) started (9/9 incl. Slot 2's 00:00 schedule). Celtics-Bucks (Slot 5, 00:30), Penguins-Ducks (Slot 15, 00:30) and Buccaneers-Bears (Slot 8, 00:50) set up (title, description, music) but schedules refused by the cap.
  - 9 Nov 2026 00:43 UTC: Seahawks-Cardinals (Slot 13), 49ers-Raiders (Slot 12), Chargers-Texans (Slot 1) stopped; Mavericks-Nets restarted (Slot 2), Celtics-Bucks (Slot 5) and Penguins-Ducks (Slot 15) started (9/9); Pelicans-Clippers (Slot 8, 01:30) scheduled; Bucs-Bears (Slot 7, 00:50) and Heat-Kings (Slot 14, 01:30) set up but schedules refused by the cap. Stream check: Slots 3,4,6,9,10,11 all correct.
  - 9 Nov 2026 02:43 UTC: Timberwolves-Jazz (Slot 9) stopped (final). Stream check: Slot 1 (Kings-Heat) preview showed a static Napoli vs Lazio card → restarted; Slots 2,4,5,7,8,10,15 correct.
- **Stop 10–15 min after the final whistle (owner, 13 Nov 2026: don't stop instantly; wait 10–15 min, then stop).**
  (Earlier rule, 9 Nov: stop as soon as possible, never more than ~10–15 min after.) `tools/live/end_grace.js` keeps a
  per-run record (tools/live/status/ended.json, gitignored) of when each game was seen in progress and final:
  seen ending → stop 12 min after it went final; already final at the run's first look (ended in the gap between runs,
  up to ~10 min earlier) → stop 5 min after that look. Cancelled/postponed games stop at once. Tune with
  `"streams": {"endGraceMinutes": 12, "endGraceUnseenMinutes": 5}` in settings.json.
  plan_streams.js lists finished games still in their grace under `ending` (no stop action); the end watch stops them.
  Last step of every run ("end watch"): loop `node tools/live/watch_ends.js --max <min(9, minutes left)> --skip <slots
  already handled>` until 50 minutes after the run started (the next run starts at :41). If a stop is `pending` (grace
  running) at the 50-min mark, keep looping until it is done, but not past 57 min (the next run's planner picks it up).
  `ended` → livereacting_stop_stream for each listed project that is LIVE/PREPARING (check with get_stream_status; on a
  timeout read status, don't retry), add its slot to --skip, keep looping; `idle` (no assigned game in progress or in
  grace) → finish the run; `timeout` → call again. settings.json is cleaned up by the next planner run (no commit needed
  for these stops). Mention the stops in the run summary.
- Stuck starts: a project can sit in PREPARING forever after a YouTube error (6 Nov: TNF on Slot 1 scheduled →
  ERROR UNKNOWN_ERROR, then PREPARING for 37 min). Each hourly run checks every PREPARING project with
  livereacting_get_stream_status; if preparingStartedAt is over 10 min ago, stop it and start it again (once per run).
- Planned durations are generous (NBA/NHL 3h15 after tip-off, NFL 4h, soccer 2h15) and the hourly run stops a
  stream once ESPN says the game is final; a stream that ended before the game did is restarted.
- Music per sport (settings.json `music`): Kevin MacLeod tracks from incompetech.com (CC BY 4.0, credited in every
  description, which the planner adds) plus our own originals. Playlists: american_football (rock/epic), basketball
  (funk/hip-hop), hockey (hard rock/electro), soccer (upbeat electronic/world), baseball (easy funk/acoustic),
  14–22 tracks (~45–60 min) each, reshuffled for every game. Add a track: livereacting_import_from_url
  (https://incompetech.com/music/royalty-free/mp3-royaltyfree/<Title>.mp3), then add title → file id to a playlist.
  `music.layers` maps each project (main, 1–20) to its Music layer id; a new Slot needs its layer id added there.
- Originals: every project has an `audioPlaylist` layer of original synthesised tracks (tools/music/live, built by
  `python3 tools/make_live_music.py`; 6 upbeat ones imported to the LiveReacting library), looping at volume 3/10,
  a different order per project. Duplicated Slot projects inherit it. No commercial music, ever.

## NBA broadcast layout (on air 9 Nov 2026)
NBA slots now show docs/live/nba.html (games bar, timeouts/bonus, big score + quarters, scorebuzz.net live tracker beside the
3 latest plays, players on the court, leaders with ESPN headshots — owner OK'd headshots 9 Nov 2026). app.html loads it fresh from
raw GitHub (document.write, like cricket2) so edits go live without the host's cache; its script is wrapped in an IIFE for that reason.
Kill switch: `"nbaPage": false` in settings.json sends NBA slots back to dark.html. Pre-game: countdown, injuries, season leaders.

## NHL / NFL / MLB broadcast layout (on air 9 Nov 2026, owner's request)
NHL, NFL and MLB slots now show docs/live/us.html (same look as nba.html: games bar, sport strip — NHL shots + power play,
NFL down & distance, MLB count/outs/bases — big score + line score, live tracker beside the latest plays, player panel,
leaders with headshots). app.html loads it fresh from raw GitHub for leagues listed in settings `"usLeagues"` (nhl, nfl, mlb;
add "ncaaf" to put college football on it too). Kill switch: `"usPage": false` sends those slots back to dark.html.
dark.html hands usLeagues slots back to the main overlay so they reach us.html.
NHL (owner 9 Nov 2026): bigger rink tracker (770px column, shorter score row) and no "Live tracker · scorebuzz.net" caption (removed for all us.html leagues).

## Football broadcast layout (on air 9 Nov 2026, owner's request)
Football slots (leagues in settings `"soccerLeagues"`) now show docs/live/soccer.html, loaded fresh from raw GitHub by app.html like nba.html / us.html.
Kill switch: `"soccerPage": false` keeps football on the main overlay. soccer.html hands a slot back to index.html when its game isn't football.

docs/live/soccer.html: the nba.html / us.html look for EPL, LaLiga, Serie A, Ligue 1, Bundesliga, MLS, UCL, UEL — ESPN data only (no tracker):
games bar, header with table position + points, cards / corners / possession strip, big score with goal scorers (P, OG), match stats
bars beside the 3 latest commentary lines, line-ups with formation, cards, goals and subs (league table around both clubs before line-ups
are out), leaders with shirt numbers (goals, shots, saves) or last-5 form before kick-off. Kick-off times in UK time (ET for MLS).
Try: soccer.html?league=epl&event=401879240 (Man Utd 4-4 Villa). Not wired into app.html yet.
Live tracker (owner 9 Nov 2026): during live games the scorebuzz.net pitch tracker sits left of the stats (same URL and crop as app.html:
`scorebuzz.net/football/<league>/<home>-vs-<away>-<id>/#trkSlot`, top 64 / height 536), and the column beside it alternates every 15 s between
match stats and the latest commentary. `sbtrk: 0` on a slot (or ?sbtrk=0) turns it off; ?sbtrk=1 forces it for testing.
Player photos (owner 9 Nov 2026): ESPN has almost no football headshots, so the leaders strip uses the scorebuzz.net line-up photos
(`scorebuzz.net/img/p/<site id>.png`). The tracker check (tools/live/check_trackers.py) copies each football slot's starters
(team -> jersey -> photo id) into docs/live/player_photos.json from about an hour before kick-off; soccer.html reads it from raw GitHub
and falls back to a team-coloured shirt with the number (subs, or no line-up yet).

New tracker (owner 10 Nov 2026): NBA (nba.html), NHL (us.html) and football (soccer.html) now crop scorebuzz.net's new "live action"
tracker (970x582 canvas at the top of #trkSlot; the site's 64.5 px sticky header hides its first rows, so the crop is x 15, y 65..582)
and scale it to fill the tracker box edge to edge (cover). The box border and the NBA "Live tracker · scorebuzz.net" caption are gone,
so no white line / page background shows around it. Reload 28.
NFL / NCAAF (us.html) moved to the same new "live action" field tracker crop and cover scaling (owner 10 Nov 2026). Reload 29.

## Stream check (added 9 Nov 2026)

Each hourly run checks what every LIVE stream actually shows on YouTube (needs `i.ytimg.com` on the session's allowed
network domains, which the owner added 9 Nov 2026):
`node tools/live/check_streams.js <videoId>:<slot> ... --out <scratch dir>` downloads YouTube's live preview frame
(`maxresdefault_live.jpg`, refreshed every few minutes) and prints, per stream, the image path and the game
settings.json says the slot should show. Look at each image: the screen shows home team first, so either team order
matches. Problems: a different matchup, "next game coming up", a blank/black/loading screen. Skip streams that went
LIVE in this run (the preview lags a few minutes). A problem seen once → stop + start that project once
(it reloads the page); seen again in the next run (same game) → notify the owner.

## Thumbnails for live streams (added 6 Nov 2026)

LiveReacting's API can't set a YouTube thumbnail, so live streams get one through the YouTube Data API, run from a GitHub Action
(the credentials live in GitHub repository secrets, never in this public repo):

1. `node tools/live/live_thumbs.js <videoId>:<slot> ...` renders `thumbs/live/<videoId>.jpg` (1280x720, light ScoreBuzz look:
   league, "LIVE", team badges, "Home v Away", LIVE NOW sticker) and prints `video_ids=...` for the ones not yet done.
   The video id is the `v=` part of `livereacting_get_stream_status` → `destinations[].viewingUrl`.
2. Commit + push, then run the **Live thumbnails** workflow (`.github/workflows/live_thumbs.yml`, ref `main`) with input
   `video_ids`. It calls `thumbnails.set` (50 of the 10,000 daily quota units each) and records successes in `thumbs/live/done.json`.

Only runs when `"thumbs": true` in `docs/live/settings.json` (so the hourly manager doesn't trigger failing runs before setup).

**One-time setup (owner):**
1. YouTube Studio > Settings > Channel > Feature eligibility: verify the channel by phone (custom thumbnails need it).
2. Google Cloud console (any project): enable **YouTube Data API v3**; OAuth consent screen: External, add yourself, then
   **Publish app** (otherwise the token expires after 7 days); Credentials > Create OAuth client ID > **Desktop app**.
3. On any computer with Node: put the client id/secret in `tools/live/live.config.json` as
   `{"youtubeApi": {"clientId": "...", "clientSecret": "..."}}`, run `node tools/live/youtube.js auth`, sign in with the
   account that owns @scorebuzznet, and copy the `refreshToken` it saves. Don't commit that file.
4. GitHub > Aijaz555/scorebuzz-media > Settings > Secrets and variables > Actions: add `YT_CLIENT_ID`, `YT_CLIENT_SECRET`,
   `YT_REFRESH_TOKEN`. Then set `"thumbs": true` in `docs/live/settings.json` (or ask Claude to).

## Titles and tags (owner's request, 7 Nov 2026)
- Every stream title reads `<Home> vs <Away> <League> Live Scoreboard` (NFL: `NFL Week N`), home team first in every league to match the
  scoreboard (owner, 9 Nov 2026, copying BL Football Talks; was `<Team> vs <Team> LIVE | <League> Scoreboard & Play-by-Play`).
  The description opens with `<League> Live Scoreboard`, `<Away> @ <Home> <League> Live Scoreboard`, the arena and city, and
  `<Home> vs <Away> live · <Nick> vs <Nick>`, then the start time (feed.js list() + plan_streams describe()).
- YouTube tags: the LiveReacting tool can't write `youtubeAdvancedSettings.tags` (the field exists on each project but the API tool doesn't accept it), so the "live" keywords go in the title and the description hashtags (#<A>Vs<B>Live, #<League>Live, #LiveStream). `ytTags()` in plan_streams.js holds the per-game tag list for when the tool or the YouTube Data API can set them.

- **docs/live/app.html has edits that tools/live/overlay.html lacks** (league colour touch, 7 Nov 2026). Before running build_web.js, port those into overlay.html, or patch app.html directly, otherwise the rebuild drops them.

## Tracker check at kick-off (owner's request, 7 Nov 2026)
- `tools/live/check_trackers.py` runs every 10 min (workflow `tracker_check.yml`). For each stream whose game has started it opens
  the scorebuzz.net match page the stream embeds and checks the tracker card really draws (a canvas ≥400×250 with real contrast,
  no "loading…" text; two tries 25 s apart). A failing game gets `"sbtrk": 0` on its slot in settings.json, which makes the stream
  page use the built-in ESPN-data tracker for that game (no restart). Results: `docs/live/tracker_checks.json`.
- The slot's `sbtrk` is cleared when the planner assigns a new game to the slot (plan_streams writes a fresh entry).
- The stream manager should read tracker_checks.json and mention any switched games in its summary.

## Dark broadcast layout (owner's request, 7 Nov 2026)
- `docs/live/dark.html` (source `tools/live/dark.html`): navy/gold "big score" layout for NBA, NFL, NHL, MLB — big crests, score,
  quarter-by-quarter table, team stats, the scorebuzz.net live tracker in the centre (during play; scoring plays before/after),
  latest plays, top players, league scores ticker. `?slot=N` reads settings.json like the main overlay.
- College football (built-in field from ESPN's situation: ball, line of scrimmage, first-down line, down & distance) and MLB (built-in diamond: runners, count, outs) are included; NFL/NHL/NBA use the website tracker, and fall back to the built-in field when the tracker check sets `sbtrk: 0`.
- Switch a league to it with `"dark": ["nba", ...]` in docs/live/settings.json (all five on since 8 Nov 2026): the main overlay hands those slots over
  (`location.replace('dark.html?slot=N…')`) and dark.html hands back when the slot's league isn't listed. Web-layer URLs stay as they are.
- Football (NFL / college) in the main overlay keeps the field in the centre during play (no rotation to stats / win probability).
- Play-by-play rows wrap to two lines (3 plays) so sentences are readable.

## Cricket (owner's request, 8 Nov 2026)

`docs/live/cricket.html` is a separate 1920x1080 live-score page for cricket (score only, no footage), in the dark
broadcast style. It reads ESPN's public cricket JSON from the browser (`/apis/site/v2/sports/cricket/<league>/summary`,
`/playbyplay` and `/scorepanel`; CORS is open), so it also works on GitHub Pages or as an OBS Browser Source.

- Open: `cricket.html?league=<ESPN cricket league id>&event=<id>` (e.g. Asia U19 Cup = league `8616`), or
  `cricket.html?teams=IND19,PAK19` to pick that match from ESPN's score panel (live first). `?fit=fill` scales to the window.
- Find ids: `https://site.api.espn.com/apis/site/v2/sports/cricket/scorepanel` lists every match with its league id and event id.
- Panels: big score with overs/CRR/RRR and the chase equation ("PAK19 need 132 off 188 balls", or the result), both teams'
  innings, batters (R B 4s 6s SR), bowlers (O M R W Econ), partnership, last wicket, last 5 overs, extras, toss,
  this over (ball chips), a run worm for both innings with wicket dots and the target line, ball-by-ball commentary,
  FOUR / SIX / WICKET pop-ups, and a ticker of other matches. Pre-match shows the start time (GMT) and toss.
- Stream: `node tools/live/stream.js --league cricket:8616 --event 1558437 --key <stream key>` (served at `/cricket` by `server.js`;
  the stream ends 20 min after the result like other sports).
- Flags/logos are ESPN's `team.logo`; team colours are approximate national colours (colours only).
- The daily-posts playbook still excludes cricket for the US/UK feed; this page is for live-score streams the owner chooses to run.

## Stadium crowd audio (owner's request, 8 Nov 2026)
- The owner wants stadium crowd ambience instead of music, sport by sport. Done so far: **nfl** (`music.playlists.nfl_crowd`: ScoreBuzz Stadium NFL A, from one 39 s clip chopped into 12-30 s sections with ±4% speed and L/R variation; NCAAF uses it too), **soccer** (`music.playlists.soccer`:
  ScoreBuzz Stadium Soccer A/B, 30 min each) and **cricket** (`music.playlists.cricket`: ScoreBuzz Stadium Cricket A), volume 6
  (`music.volumes`). **nba** (11 Nov 2026: `music.playlists.basketball_crowd`: ScoreBuzz
  Basketball Crowd 01-08, the owner's Envato arena recordings (01-03 OCP-0333-80/-93/-75; 04-08 added 11 Nov:
  Stadium Game, Arena Crowd Applause, Crowd Noise Game Stadium, Ball Loss and Whistling Crowd, Arena Crowd Ambience), each only
  loudness-normalised, not mixed, played in that order on loop via `music.ordered`; the earlier mixed versions
  Stadium Basketball A/B were dropped at the owner's request; old funk playlist kept as `basketball`). Other sports still use the Kevin MacLeod playlists until the owner supplies crowd recordings.
- **nhl** (11 Nov 2026: `music.playlists.hockey_crowd`: ScoreBuzz Hockey Crowd 01-08, the owner's 8 Envato hockey
  game/crowd recordings, each only loudness-normalised (-18 LUFS, MP3 192k), not mixed; played in that order on loop
  (`music.ordered` turns off the per-game shuffle); old music kept as `hockey`).
- **soccer** (11 Nov 2026, owner: "popular sound for all games, no mix"): `music.playlists.soccer_cheer` = ScoreBuzz Football
  Crowd Cheer, the owner's 80 s Envato clip uploaded unchanged, looping at volume 4 (owner, 11 Nov 2026; the clip is
  ~6 dB louder than the normalised crowd tracks). The Pixabay mixes ScoreBuzz Stadium Soccer A/B stay in `music.playlists.soccer`. NFL/NCAAF unchanged.
- Envato Elements files: licensed for the owner's YouTube use, never commit or redistribute the raw recordings or the mixes.
- Mixes are built from Pixabay recordings the owner downloads (Pixabay Content License: commercial/YouTube use, no credit; not
  allowed to redistribute the files on their own, so they are NOT committed here). Recipe: loudness-normalise each clip (-18 LUFS),
  chain random 40-110 s sections of the long stadium beds with 5 s equal-power crossfades, overlay cheer clips every 1.5-3 min,
  3 s fade at both ends, loudnorm -16 LUFS, MP3 160k, 30 min. Upload with livereacting_upload_file (needs
  `*.r2.cloudflarestorage.com` allowed), then add title → file id to the sport's playlist. Titles start with "ScoreBuzz" so the
  planner doesn't add a Kevin MacLeod credit.

## Centre-tracker layout (on air 12 Nov 2026, owner's request)
NBA and NHL slots now show `docs/live/center.html`: same colours/fonts as nba.html / us.html, rearranged so the live tracker sits in the
centre — team sidebars (logo, record, big score, period chips, 5 game leaders with headshots), clock on top, sport strip, big tracker,
3 latest plays below, today's games + SUBSCRIBE along the bottom. Tracker = scorebuzz.net live tracker while in play, a built-in shot
map before/after the game (or `&trk=own` / `sbtrk: 0`). Preview: `center.html?league=nba|nhl&event=<ESPN id>` or `?slot=N`.
- app.html loads it fresh from raw GitHub for the leagues in settings `"centerLeagues"` (nba, nhl), before the nba.html / us.html hand-offs.
  Kill switch: `"centerPage": false` (or remove a league from `centerLeagues`) sends those slots back to nba.html / us.html.
- Sync with the tracker (owner: the board must not run behind it): the page polls ESPN every 2 s (ESPN caches ~3 s) and takes the
  further-on clock/score of ESPN's scoreboard and summary feeds.
- Football on the centre layout (owner 13 Nov 2026, demo first): center.html now also handles the football leagues (epl, laliga,
  seriea, ligue1, bundesliga, mls, ucl, uel): sidebars with table points / W-D-L, big score, 1st/2nd-half chips, 4 game leaders +
  goalkeeper (scorebuzz.net line-up photos, shirt number fallback; starting XI or last-5 results before kick-off), cards / corners /
  possession strip, scorebuzz.net pitch tracker in the centre while in play (built-in pitch with score + scorers otherwise), latest
  3 commentary lines below. Demo: `center.html?league=epl&event=401879240` (Man Utd 4-4 Villa) or add `&replay=1&from=60` to run it
  as a live game from the commentary. NOT on air yet: football goes live on it when the leagues are added to settings `centerLeagues`.
