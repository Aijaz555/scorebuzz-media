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
top-10 college football).
**College football dropped (owner, 14 Nov 2026: too few views; only NFL for American football):** `"streams": {"leagues": [...]}`
in settings.json leaves out `ncaaf`; the 4 live NCAAF streams (Slots 4-7) were stopped 14 Nov 2026 ~21:55 UTC. Each game gets its own LiveReacting stream with its own title and description,
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
  - 16 Nov 2026 11:47 UTC usage check: 35.4 h of 680 this week (5%), last 7 days 392.7 h, level ok.
  - 11 Nov 2026 00:44 UTC usage check: 71.8 h of 680 this week (11%), last 7 days 384.2 h, level ok (finished broadcasts only; 8 streams live).
  - 12 Nov 2026 00:44 UTC usage check: 112.4 h of 680 this week (17%), last 7 days 422 h, level ok (finished broadcasts only; 9 streams live).
  - 12 Nov 2026 01:42 UTC: YouTube refused new broadcasts at 10 live ("User has too many live or scheduled broadcasts"): Oilers-Flyers (Slot 11, stuck PREPARING → stopped, restart refused), 02:00 schedules Rockets-Warriors (Slot 10) and Golden Knights-Mammoth (Slot 13) failed to start. Owner notified (likely stale Upcoming broadcasts in YouTube Studio).
  - 13 Nov 2026 00:44 UTC usage check: 164.2 h of 680 this week (24%), last 7 days 444.3 h, level ok (finished broadcasts only; 10 streams live). Same YouTube refusal at 10 live: Stars-Jets (Slot 10, stuck PREPARING → stopped) and Giants-Commanders TNF (Slot 11, 00:45 schedule) refused; owner notified.
  - 14 Nov 2026 00:44 UTC usage check: 206.6 h of 680 this week (30%), last 7 days 455.3 h, level ok (finished broadcasts only; 5 streams live).
  - 14 Nov 2026 02:44 UTC: same YouTube refusal at 10 live + 1 scheduled: Golden Knights-Predators (Slot 12) stuck PREPARING 14 min → stopped, restart refused ("User has too many live or scheduled broadcasts"); Clippers-Thunder (Slot 11, 03:00 schedule) at risk. Owner notified.
  - 14 Nov 2026 20:49 UTC usage check: 255.1 h of 680 this week (38%), last 7 days 416.5 h, level ok (finished broadcasts only; 6 streams live + Slot 21 RTMP UFC).
  - 15 Nov 2026 00:45 UTC usage check: 288.8 h of 680 this week (42%), last 7 days 422.3 h, level ok (incl. 11 streams live). Same YouTube refusal at 11 live: Stars-Sabres, Heat-Pistons, Grizzlies-Nets, Timberwolves-Bulls (Slots 8,12-14) errored at their 00:30 start and were refused again at 00:43; owner notified.
  - 15 Nov 2026 01:44 UTC: still refused at 11 live: restarts of Slots 8,12-14 and the new Mammoth-Sharks start (Slot 15) all got "User has too many live or scheduled broadcasts"; Ducks-Islanders, Kings-Flames (03:00) skipped as "cap 15" (planner counts the 5 refused slots). Owner notified.
  - 15 Nov 2026 02:43 UTC: after the end watch stopped 4 finished games (Slots 3,4,7,11), YouTube accepted restarts of Slots 8,12-15; Ducks-Islanders (Slot 3) and Kings-Flames (Slot 4) were refused at 11 live, then started once Slots 5 and 2 stopped. Slot 8 (Stars-Sabres) stuck PREPARING twice (restart at 03:01 didn't help) → owner notified.
- 15 Nov 2026 (owner): YouTube channel now verified and its live-broadcast limit raised, so the ~10-11 live refusals above should no longer happen. If "User has too many live or scheduled broadcasts" shows up again, treat it as new and notify the owner.
  - 15 Nov 2026 17:44 UTC: refusal came back at 11 live + 4 scheduled (15 YouTube broadcasts): Saints-Panthers (Slot 13) start refused; started fine at 17:50 once Slot 1 (Lions-Patriots, final) stopped. Owner notified. Limit now looks like ~15 live+scheduled.
  - 15 Nov 2026 19:29 UTC: refused again at 10 live: Belgium-Italy (Slot 2) and France-Türkiye (Slot 6) stuck PREPARING 14 min after their 19:15 schedule → stopped, restart refused ("User has too many live or scheduled broadcasts"). Owner notified. 15 Nov 18:46 UTC usage check: 330.6 h of 680 this week (49%), last 7 days 377.8 h, level ok.
  - 15 Nov 2026 20:44 UTC: refused again at 10 live + 1-2 scheduled (~11-12 YouTube broadcasts): Suns-Lakers (Slot 2) 20:30 schedule errored, Cowboys-49ers (Slot 1) and Clippers-Hornets (Slot 15) schedules errored, Raiders-Seahawks (Slot 4), Cardinals-Rams (Slot 6) refused. Each started once the end watch stopped a finished game (20:48-21:30). Packers-Vikings and Saints-Panthers kept off (owner's 19:44 request). Owner notified.
  - 16 Nov 2026 00:44 UTC usage check (new week): 5.4 h of 680 this week (1%), last 7 days 390.3 h, level ok (incl. 8 streams live).
  - 17 Nov 2026 00:53 UTC usage check: 68.9 h of 680 this week (10%), last 7 days 420.1 h, level ok (incl. 8 streams live).
  - 17 Nov 2026 02:43 UTC: refused again at 10 live: Mammoth-Canucks (Slot 11) 02:00 schedule errored (UNKNOWN_ERROR), restart refused ("User has too many live or scheduled broadcasts"); started at 02:48 once the end watch stopped Slots 1,3,4. Owner notified.
  - 18 Nov 2026 00:44 UTC usage check: 118.7 h of 680 this week (17%), last 7 days 431.6 h, level ok (finished broadcasts only; 11 streams live). Refused again at 11 live: Blues-Ducks (Slot 11) stuck PREPARING 13 min after its 00:30 start → stopped, restart refused ("User has too many live or scheduled broadcasts"). Owner notified.
  - 18 Nov 2026 01:42 UTC: still refused at 11 live: Blues-Ducks (Slot 11) restart refused again; Golden Knights-Stars (Slot 13) and Sharks-Flames (Slot 15) 02:30 schedules errored (UNKNOWN_ERROR), Slot 13 start at 02:31 refused. Clippers-Jazz (Slot 14, 03:00) still scheduled. Owner notified.
  - 20 Nov 2026 20:43 UTC: stream check: Slot 1 (Troyes-Le Havre) preview showed a raw.githack.com "500 Something is wrong" page (web layer failed to load, likely around the 20:31 reload) → stop + start; Slot 2 correct.
  - 20 Nov 2026 22:47 UTC usage check: 270.5 h of 680 this week (40%), last 7 days 455.5 h, level ok (finished broadcasts only; 0 live, 4 NBA scheduled 23:30-00:00).
  - 21 Nov 2026 00:45 UTC usage check: 270.5 h of 680 this week (40%), last 7 days 452.2 h, level ok (finished broadcasts only; 6 NBA live, Jazz-Suns scheduled 02:00). Stream check: Slots 1-6 correct.
  - 21 Nov 2026 01:45 UTC: stream check Slots 1-6 correct; Lakers-Kings, Nuggets-Rockets (Slots 8, 9) scheduled 02:30; end watch stopped Hawks-Hornets (Slot 2) 12 min after the final.
  - 21 Nov 2026 02:43 UTC: no planner actions (8 NBA live, cap 10); stream check Slots 1, 3-9 correct.
  - 21 Nov 2026 13:43 UTC: 6 games scheduled (EPL 14:30 on Slots 5-9, Rayo-Valencia 14:45 on Slot 10); stream check Slots 2-4 correct, Slot 1 (Man City-Fulham) preview 404 on i.ytimg.com (not checked).
  - 21 Nov 2026 14:43 UTC: Nice-PSG (Slot 1) scheduled 15:45; stream check Slots 2-9 correct.
  - 21 Nov 2026 15:43 UTC: Newcastle-Arsenal (Slot 2) scheduled 17:00; Parma-Roma, Sevilla-Betis skipped (cap 10); stream check Slots 3-10 correct; end watch stopped Lazio-Lecce (Slot 4) and Como-Cagliari (Slot 3) ~12 min after the final.
  - 21 Nov 2026 16:43 UTC: 76ers-Bucks (Slot 3), Hurricanes-Oilers (Slot 4) scheduled 17:30; Sevilla-Betis, Parma-Roma skipped (cap 10); stream check: Slot 1 (Nice-PSG) preview showed the finished Man City v Fulham scorebuzz.net match page (full page, no overlay) → stop + start; Slots 5-10 correct.
  - 21 Nov 2026 17:30 UTC: Slot 1 still showed the Man City v Fulham site page after the restart (owner notified: check Slot 1's Web Page layer URL in the Studio). End watch stopped Slots 6, 5, 9, 7, 8 (EPL) and 10 (Rayo-Valencia) ~12 min after the final; re-plan started Parma-Roma (Slot 5), Sevilla-Betis (Slot 7) and scheduled Revolution-Union (Slot 6, 18:30).
  - 21 Nov 2026 17:46 UTC usage check: 326.5 h of 680 this week (48%), last 7 days 460.7 h, level ok (finished broadcasts only; 6 live, 4 scheduled). Napoli-Torino, Lille-Lyon, Monaco-Auxerre (Slots 8-10) scheduled 19:15; Lens-Toulouse, Strasbourg-Brest skipped (cap 10). Stream check: Slots 2-5, 7 correct; Slot 1 still on the Man City v Fulham site page (owner already notified, not restarted again).
  - 21 Nov 2026 18:43 UTC: Flames-Blackhawks (Slot 1) scheduled 20:00; Real Madrid-Celta, Lens-Toulouse, Strasbourg-Brest skipped (cap 10). Stream check: Slots 2-7 correct. End watch stopped Parma-Roma (Slot 5, ~12 min after the final) and Newcastle-Arsenal (Slot 2, ~12 min); re-plan scheduled FC Dallas-Portland (Slot 5, 20:30). Napoli-Torino, Lille-Lyon, Monaco-Auxerre (Slots 8-10) went LIVE at 19:15.
  - 21 Nov 2026 19:43 UTC: Real Madrid-Celta (Slot 2) started now; Sevilla-Betis (Slot 7) was already OFFLINE at the end watch (planned duration ran out at the final), re-plan started Lens-Toulouse on Slot 7; Strasbourg-Brest skipped (cap 10). Stream check: Slots 3, 4, 6, 8-10 correct; Slot 1 (Flames-Blackhawks, 20:00 schedule) now shows the right game. Slot 2 title switched to the new 'Live Score |' format.
  - 21 Nov 2026 20:43 UTC: no planner actions (10 live, cap 10); Strasbourg-Brest skipped (cap 10); 76ers-Bucks (Slot 3) final, in grace. Stream check: Slots 1, 2, 4-10 correct.
  - 21 Nov 2026 21:42 UTC: Panthers-Sabres (Slot 4), Predators-Penguins (Slot 6) scheduled 22:30. Stream check: Slots 1, 2, 5, 10 correct. End watch stopped Strasbourg-Brest, Lens-Toulouse, Napoli-Torino, Lille-Lyon (Slots 3, 7-9, ~5 min after first look), Monaco-Auxerre (Slot 10, ~12 min) and Real Madrid-Celta (Slot 2, ~12 min); re-plan scheduled Inter Miami-Columbus (Slot 3, 22:30). All three 22:30 schedules accepted.
  - 21 Nov 2026 22:42 UTC: Bruins-Capitals, Canadiens-Flyers, Blues-Devils, Jets-Golden Knights, Senators-Kings (Slots 2, 7-10) scheduled 23:30, all went LIVE. Stream check: Slots 1, 3-6 correct. End watch: FC Dallas-Portland (Slot 5) already OFFLINE at its stopAt; Flames-Blackhawks (Slot 1) stopped ~12 min after the final. Re-plan had ranked favourite Mavericks-Clippers (NBA) above the 00:00 NHL games → planner fixed (favourites lead only within the NBA); Red Wings-Islanders started on Slot 5 at 23:30. Leafs-Blue Jackets left for the 23:41 run (Slot 1 freed).
  - 21 Nov 2026 23:42 UTC: Maple Leafs-Blue Jackets (Slot 1) started now, LIVE; Knicks-Blazers, Mavericks-Clippers, Timberwolves-Grizzlies, Spurs-Pelicans (NBA) skipped (cap 10). Stream check: Slots 2-10 correct. End watch: no games ended by 00:35.
  - 22 Nov 2026 00:42 UTC usage check: 364.7 h of 680 this week (54%), last 7 days 464.3 h, level ok (finished broadcasts only; 10 live). Stream check: Slots 1-10 correct. Inter Miami-Columbus (Slot 3) hit its planned end at full time (01:15); re-plan started Mavericks-Clippers on Slot 3 (LIVE 01:18). Mammoth-Ducks (NHL 02:00) skipped as cap 10 this run.
  - 22 Nov 2026 01:42 UTC: stream check Slots 1-3, 5, 7-10 correct. End watch stopped Panthers-Sabres (Slot 4) and Predators-Penguins (Slot 6) at their 01:47 stopAt. Re-plan ranked in-progress NBA (Timberwolves-Grizzlies, Knicks-Blazers) above the 02:00 NHL Mammoth-Ducks → planner fixed (NBA always ranks after every other league); Mammoth-Ducks started on Slot 4 (LIVE 01:49), Sharks-Kraken on Slot 6 (02:30, LIVE). Canucks-Wild (NHL 03:00) and 4 NBA skipped (cap 10).
  - 22 Nov 2026 02:42 UTC: no planner actions at first (10 live, cap 10; Canucks-Wild NHL 03:00 skipped as cap 10). Stream check: Slots 1-4, 6, 8-10 correct. End watch stopped Red Wings-Islanders, Canadiens-Flyers (Slots 5, 7, 02:48), Blues-Devils (Slot 8), Leafs-Blue Jackets (Slot 1), Bruins-Capitals (Slot 2), Senators-Kings (Slot 10), Timberwolves-Grizzlies (Slot 7, 03:25), Spurs-Pelicans (Slot 1, 03:38), all ~12 min after the final; Jets-Golden Knights (Slot 9) already offline (planned end). Re-plans started Canucks-Wild (Slot 5), Timberwolves-Grizzlies (Slot 7) at 02:49 and Spurs-Pelicans (Slot 1), Kings-Celtics (Slot 2) at 03:04, all LIVE. Mavericks-Clippers (Slot 3) final, grace ends 03:40 (left for the next run).
  - 22 Nov 2026 03:42 UTC: no planner actions (5 live, nothing left to schedule). Stream check: Slots 2, 4-6 correct. End watch stopped Mavericks-Clippers (Slot 3) at 03:48 (~5 min after the run's first look); no other games ended by 04:32.
  - 22 Nov 2026 04:42 UTC: no planner actions (4 live, nothing left to schedule; Slot 3 cleared). Stream check: Slots 2, 5, 6 correct. End watch stopped Mammoth-Ducks (Slot 4) at 04:47 (~5 min after the run's first look); no other games ended by 05:30.
  - 22 Nov 2026 05:42 UTC: no planner actions (3 live, nothing left to schedule; Slot 4 cleared). Stream check: Slots 5, 6 correct. End watch stopped Kings-Celtics (Slot 2) at 05:48 (~5 min after the run's first look), Sharks-Kraken (Slot 6) at 05:58 and Canucks-Wild (Slot 5) at 06:08 (~12 min after the final); idle by 06:09.
  - 22 Nov 2026 06:42 UTC: no planner actions (0 live, nothing to schedule; Slots 2, 5, 6 cleared from settings). End watch idle.
  - 22 Nov 2026 09:42 UTC: Juventus-Venezia (Slot 1) scheduled 11:00 (Serie A). Nothing live, no stream check. End watch idle.
  - 22 Nov 2026 11:42 UTC: Barcelona-Villarreal (Slot 2) scheduled 12:30 (LaLiga). Stream check: Slot 1 (Juventus-Venezia) correct. End watch: no games ended by 12:31.
  - 22 Nov 2026 12:42 UTC: Hull-Brighton, Bologna-Udinese, Sassuolo-Genoa, Paris FC-Angers (Slots 3-6) scheduled 13:30 (Slots 4, 6 LIVE; 3, 5 still PREPARING at 13:35). Stream check: Slots 1, 2 correct. End watch stopped Juventus-Venezia (Slot 1) at 13:34 (~12 min after the final).
  - 22 Nov 2026 14:42 UTC: Lorient-Rennes (Slot 8, 15:45) and Liverpool-Man Utd (Slot 7, 16:00) scheduled. Stream check: Slots 2-6 correct. End watch stopped Barcelona-Villarreal (Slot 2) at 15:14 (~12 min after the final); no other games ended by 15:32.
  - 22 Nov 2026 15:42 UTC: Milan-Frosinone (Slot 10, 16:30), Rangers-Hurricanes (Slot 2, NHL) and Osasuna-Málaga (Slot 9, 17:00) scheduled. Stream check: Slots 1, 3-6 correct. End watch stopped Bologna-Udinese, Sassuolo-Genoa, Paris FC-Angers, Hull-Brighton (Slots 4, 5, 6, 3) 16:06-16:11 (~12 min after the final); re-plan scheduled Chiefs-Cardinals, Eagles-Steelers, Cowboys-Titans, Bears-Saints (Slots 3-6, 17:30). Lions-Bucs, Bills-Dolphins, Panthers-Ravens (18:00) skipped (cap 10).
  - 22 Nov 2026 16:42 UTC: no planner actions at first (10 live/scheduled, cap 10). Stream check: Slots 1, 7, 8, 10 correct. Slots 2, 9 (17:00) and 3-6 (NFL 17:30) went LIVE. End watch stopped Racing-Real Sociedad (Slot 1) at 17:15 (~5 min after the final); re-plan scheduled Lions-Buccaneers (Slot 1, 17:30, PREPARING at 17:31). Bills-Dolphins, Panthers-Ravens (18:00) skipped (cap 10).
  - 22 Nov 2026 17:42 UTC: no planner actions at first (10 live, cap 10; Bills-Dolphins, Panthers-Ravens skipped cap 10). Stream check: Slots 1-10 correct. End watch stopped Lorient-Rennes (Slot 8) at 18:21 and Liverpool-Man Utd (Slot 7) at 18:35 (~12 min after the final); re-plan started Bills-Dolphins (Slot 8, LIVE 18:22) and Panthers-Ravens (Slot 7).
  - 22 Nov 2026 18:42 UTC: no planner actions at first (10 live, cap 10). Stream check: Slots 1-10 correct. End watch stopped Milan-Frosinone (Slot 10) at 19:05 and Osasuna-Málaga (Slot 9) at 19:35 (~12 min after the final); re-plans scheduled Chargers-Jets (Slot 10, 20:35) and Giants-Jaguars (Slot 9, 20:55). Atalanta-Inter, Marseille-Le Mans, Getafe-Atlético, Broncos-Raiders, Nashville-Cincinnati, Hawks-Pistons skipped (cap 10).
  - 22 Nov 2026 21:42 UTC usage check: 471.5 h of 680 this week (69%), last 7 days 488.5 h, level ok (finished broadcasts only; 9 live). No planner actions (Heat-Thunder skipped cap 10). Stream check: Slots 1, 2, 6-10 correct (Slot 1's centre tracker showed a scorebuzz.net "page does not exist" box).
  - 22 Nov 2026 22:42 UTC: Stars-Penguins (Slot 2), Blues-Oilers (Slot 5) NHL scheduled 23:30 (Slot 5 LIVE, Slot 2 PREPARING at 23:35); Jazz-Mavericks, Bulls-Nuggets, Wizards-Magic (NBA) skipped (cap 10). Stream check: Slots 1, 3, 6-10 correct. End watch stopped Hawks-Pistons (Slot 7) at 23:06 (~12 min after the final) → re-plan scheduled Canucks-Blackhawks (Slot 7, 00:30); Nashville-Cincinnati (Slot 1) hit its planned end before its stopAt → re-plan scheduled 49ers-Vikings SNF (Slot 1, 00:50).
  - 22 Nov 2026 23:42 UTC: no planner actions at first (10 live/scheduled, cap 10; Vancouver-RSL + 5 NBA skipped cap 10). Stream check: Slots 2-6, 8-10 correct. End watch stopped Chargers-Jets (Slot 10) at 23:59 (~12 min after the final); re-plan scheduled Vancouver-Real Salt Lake (Slot 10, 01:00). Canucks-Blackhawks (Slot 7) went LIVE at 00:30. No other games ended by 00:31.
  - 23 Nov 2026 00:42 UTC usage check (new week): 5.9 h of 680 this week (1%), last 7 days 492.7 h, level ok (incl. 7 live). No planner actions at first (Jazz-Mavericks, Bulls-Nuggets, Wizards-Magic, Knicks-Pacers, Warriors-Celtics skipped cap 10). Stream check: Slots 2-7, 9 correct. 49ers-Vikings SNF (Slot 1) went LIVE 00:50. End watch stopped Lightning-Sabres (Slot 8, 00:46, ~5 min after first look), Broncos-Raiders (Slot 6, 00:59), Giants-Jaguars (Slot 9, 01:07) and Heat-Thunder (Slot 3, 01:33), each ~12 min after the final; re-plans started Jazz-Mavericks (Slot 6), Bulls-Nuggets (Slot 8), Wizards-Magic (Slot 9) and Knicks-Pacers (Slot 3). Warriors-Celtics skipped (cap 10).
  - 23 Nov 2026 01:43 UTC: no planner actions at first (Warriors-Celtics skipped cap 10). Stream check: Slots 1-3, 5-10 correct (Slot 3's first preview was stale, re-download showed Knicks-Pacers). Chicago-Charlotte (Slot 4) hit its planned end at full time → re-plan started Warriors-Celtics on Slot 4 (LIVE 01:50). End watch stopped Wizards-Magic (Slot 9, 02:29) and Jazz-Mavericks (Slot 6, 02:39), ~12 min after the final; Stars-Penguins (Slot 2, grace to 02:44) left for the next run.
  - 23 Nov 2026 02:42 UTC: no planner actions (Slots 6, 9 cleared from settings). Stream check: Slots 1, 3, 4, 5, 7, 10 correct (Slot 10's centre box showed a scorebuzz.net "page does not exist" panel, matchup bar correct). End watch stopped Stars-Penguins (Slot 2) and Bulls-Nuggets (Slot 8) at 02:48 and Blues-Oilers (Slot 5) at 03:10 (~12 min after the final); no other games ended by 03:31.
  - 23 Nov 2026 03:42 UTC: no planner actions (Slots 2, 5, 8 cleared from settings). Stream check: Slots 1, 4, 7 correct. End watch stopped Knicks-Pacers (Slot 3) at 03:48 (~5 min after first look), Canucks-Blackhawks (Slot 7) at 03:59, Warriors-Celtics (Slot 4) at 04:12 and 49ers-Vikings SNF (Slot 1) at 04:38 (~12 min after the final); Vancouver-RSL (Slot 10) already offline (planned end).
  - 23 Nov 2026 09:42 UTC: nothing live or scheduled anywhere (all 21 projects OFFLINE), no planner actions, no games inside the 30-min lead window. No stream check (nothing live), usage check already done at 00:42. End watch idle.
  - 23 Nov 2026 14:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions, no games inside the 30-min lead window. No stream check, usage already done at 00:42. End watch idle.
  - 23 Nov 2026 15:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions, no games inside the 30-min lead window. No stream check, usage already done today. End watch idle.
  - 23 Nov 2026 16:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions, no games inside the 30-min lead window. No stream check, usage already done today. End watch idle.
  - 23 Nov 2026 17:42 UTC: Monza-Fiorentina (Slot 1, Serie A) scheduled 19:15. Nothing live, no stream check; usage already done today. End watch idle.
  - 23 Nov 2026 20:41 UTC: no planner actions (3 live: Monza-Fiorentina, Brentford-Everton, Levante-Elche). Stream check: Slots 1-3 correct. End watch: no games ended by 21:30.
  - 23 Nov 2026 21:41 UTC: no planner actions (Monza-Fiorentina in grace). Stream check: Slots 2, 3 correct. End watch stopped Monza-Fiorentina (Slot 1) at 21:52 and Levante-Elche (Slot 3) at 22:12 (~10-18 min after the final); Brentford-Everton (Slot 2) hit its planned end at 22:15 (~12 min after the final). Idle by 22:15.
  - 23 Nov 2026 22:42 UTC: 10 games scheduled (cap 10): NHL Devils-Blue Jackets (Slot 1, 23:30), Senators-Flames, Jets-Mammoth, Canadiens-Kings, Islanders-Maple Leafs (Slots 2-5, 00:00); NBA 76ers-Trail Blazers, Hornets-Grizzlies (Slots 6-7, 23:30), Timberwolves-Nets, Pacers-Thunder, Raptors-Bucks (Slots 8-10, 00:00). Nothing live, no stream check; usage already done today. End watch idle.
  - 23 Nov 2026 23:42 UTC: no planner actions (Slots 1, 6, 7 LIVE since 23:30; Slots 2-5, 8-10 scheduled 00:00); Commanders-Bengals MNF, St. Louis-LAFC, Rockets-Clippers, Pelicans-Suns, Bulls-Cavaliers skipped (cap 10). Stream check: Slots 1, 6, 7 correct (pre-game countdowns).
  - 20 Nov 2026 06:46 UTC usage check: 265.2 h of 680 this week (39%), last 7 days 450.2 h, level ok (no streams live).
  - 18 Nov 2026 22:46 UTC usage check: 169.4 h of 680 this week (25%), last 7 days 448.7 h, level ok (finished broadcasts only; 0 live, 10 scheduled for 23:00-00:00).
  - 19 Nov 2026 00:30 UTC: 00:30 schedules for Slots 11-13 errored (UNKNOWN_ERROR) at 10 live; Slot 11 start refused ("User has too many live or scheduled broadcasts") → bump.js dropped Nets-Bulls (Slot 10, lowest-ranked NBA); Slots 11, 12, 13 then started (12 live/preparing).
  - 19 Nov 2026 00:44 UTC usage check: 172.3 h of 680 this week (25%), last 7 days 443.8 h, level ok (finished broadcasts only). Refused again at ~10 live: Nets-Bulls (Slot 10) restart refused (no lower NBA to drop); Thunder-Hawks (Slot 12) and Pelicans-Pistons (Slot 13) stuck PREPARING 10 min → stopped, restarts refused → bump.js dropped Raptors-Wizards (Slot 9) and Heat-Bucks (Slot 8); Slots 12, 13 then went LIVE.
  - 19 Nov 2026 01:43 UTC: restarts of Nets-Bulls, Raptors-Wizards, Heat-Bucks (Slots 10, 9, 8) refused ("User has too many live or scheduled broadcasts" at 11 live + 1 scheduled); bump.js had no lower-ranked NBA game to drop. Lakers-Jazz, Mammoth-Avalanche, Kings-Suns (03:00) skipped as "cap 14" this run. Slots 4-5 (Brasileirão, final) already offline at end watch.
  - 19 Nov 2026 02:42 UTC: Mammoth-Avalanche, Lakers-Jazz (Slots 5, 4) started; Kings-Suns (Slot 7) and Heat-Bucks (Slot 8) stuck PREPARING 10 min → restarted (Slot 7 went LIVE). Raptors-Wizards (Slot 9) restart refused; bump.js named Kings-Suns but the bump was skipped (Raptors-Wizards had 0.7 s left). Nets-Bulls (Slot 10) restarted once Slots 2,6 stopped.
  - 20 Nov 2026 00:44 UTC usage check: 216.9 h of 680 this week (32%), last 7 days 434.4 h, level ok (finished broadcasts only; 11 streams live). Avalanche-Ducks, Kraken-Canucks (NHL) and 3 NBA 01:00 games skipped as "cap 12" this run.
  - 20 Nov 2026 01:31 UTC: Texans-Colts TNF (Slot 10) 00:45 schedule never started; restart refused ("User has too many live or scheduled broadcasts" at 11 live) → bump.js dropped Grizzlies-Warriors (Slot 9), restart refused again at 10 live. Owner notified.
  - 20 Nov 2026 01:42 UTC: restarts of Texans-Colts TNF (Slot 10) and Grizzlies-Warriors (Slot 9) refused again at 10 live; bump.js had nothing left to drop. Avalanche-Ducks, Kraken-Canucks, Golden Knights-Stars (NHL) skipped as "cap 12". Stream check: Slots 1-8, 11, 12 correct. Owner notified.
  - 20 Nov 2026 02:42 UTC: Slots 10, 9 (Texans-Colts TNF, Grizzlies-Warriors) refused at 10 live, then restarted at 02:48 once the end watch stopped Slot 4; after Slots 1,3,5,6 stopped (03:00), a re-plan started Avalanche-Ducks, Kraken-Canucks, Golden Knights-Stars (NHL) and Timberwolves-Knicks, Spurs-Clippers, Bucks-Blazers (NBA) on Slots 1,3,8,4,5,6 — all accepted (12 at once). Slots 3, 5 stuck PREPARING 11 min → restarted, LIVE.
  - 24 Nov 2026 00:45 UTC usage check: 39.7 h of 680 this week (6%), last 7 days 464.6 h, level ok (finished broadcasts only; 10 streams live).
  - 24 Nov 2026 02:42 UTC: planner first skipped the 02:40 NHL Kraken-Ducks at cap 10 because an in-progress MLS game (St. Louis-LAFC) outranked it → planner fixed (NFL/NHL rank above in-progress games of other leagues) and maxLiveTemp 11 until 04:00 so MLS wasn't dropped. Started Kraken-Ducks (Slot 7), Sharks-Wild (Slot 1), St. Louis-LAFC (Slot 11). Slot 1 stuck PREPARING 11 min → restart refused ("too many live or scheduled broadcasts" at 10 live) → bump.js dropped Raptors-Bucks (Slot 10, 4th qtr), Slot 1 then LIVE. Stream check: Slots 2-6, 8-10 correct. End watch stopped Pacers-Thunder (Slot 9), Timberwolves-Nets (Slot 8), Islanders-Leafs (Slot 5), Jets-Mammoth (Slot 3), Senators-Flames (Slot 2), Canadiens-Kings (Slot 4) ~12 min after the final; St. Louis-LAFC (Slot 11) hit its planned end. Re-plan started Lakers-Jazz, Rockets-Clippers, Kings-Spurs (Slots 8-10), all LIVE.
  - 24 Nov 2026 03:42 UTC: Pelicans-Suns (Slot 2, NBA, in OT) started now (LIVE 03:42). Stream check: Slots 1, 6-10 correct. End watch stopped Pelicans-Suns (Slot 2) at 04:01, Rockets-Clippers (Slot 9) at 04:04 and Commanders-Bengals MNF (Slot 6) at 04:32, each ~12 min after the final.
  - 24 Nov 2026 04:42 UTC: no planner actions (Slots 2, 6, 9 cleared from settings; 4 live). Stream check: Slots 1, 7, 8, 10 correct. End watch stopped Kraken-Ducks (Slot 7) at 05:34 and Kings-Spurs (Slot 10) at 05:37 (~12 min after the final); Lakers-Jazz (Slot 8, grace to 05:48) left for the next run.
  - 24 Nov 2026 05:42 UTC: no planner actions (2 live, both final, in grace). End watch stopped Sharks-Wild (Slot 1) and Lakers-Jazz (Slot 8) at 05:47 (~5 min after first seen final). Idle; no live streams.
  - 24 Nov 2026 06:42 UTC: no planner actions (0 live, nothing to schedule; Slots 1, 8 cleared from settings). End watch idle.
  - 24 Nov 2026 08:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions; usage already done today. End watch idle.
  - 24 Nov 2026 09:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions; usage already done today. End watch idle.
  - 24 Nov 2026 10:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions; usage already done today. End watch idle.
  - 24 Nov 2026 11:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions; usage already done today. End watch idle.
  - 24 Nov 2026 12:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions; usage already done today. End watch idle.
  - 24 Nov 2026 13:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions; usage already done today. End watch idle.
  - 24 Nov 2026 14:42 UTC: nothing live or scheduled (all 21 projects OFFLINE), no planner actions; usage already done today. End watch idle.
  - 24 Nov 2026 15:42 UTC: Galatasaray-Aston Villa (Slot 1) and Bodo/Glimt-LASK Linz (Slot 2) UCL scheduled 17:15 (crowd audio). Nothing live, no stream check; usage already done today. End watch idle.
  - 24 Nov 2026 16:42 UTC: no planner actions (Slots 1, 2 UCL still scheduled 17:15; nothing live). No stream check; usage already done today. End watch idle.
  - 24 Nov 2026 17:10 UTC (owner asked: every UCL game live with SEO title/description/tags): the 7 UCL 20:00 games set up early on Slots 3-9 (new SEO description + hashtags, crowd audio) and scheduled 19:30, all accepted (9 UCL streams, cap 10). Slots 1, 2 went LIVE 17:15; their descriptions refreshed to the new format. YouTube live tags workflow run by hand to tag them.
  - 24 Nov 2026 18:41 UTC: no planner actions (Slots 1, 2 UCL LIVE, Slots 3-9 UCL scheduled 19:30). Stream check: Slots 1, 2 correct (half-time). End watch: no games ended by 19:31; Slots 3-9 PREPARING from 19:30.
  - 24 Nov 2026 19:42 UTC: no planner actions (Slots 3-9 UCL LIVE since 19:30, pre-game). Stream check: Slots 3-9 correct. End watch stopped Galatasaray-Aston Villa (Slot 1) and Bodo/Glimt-LASK (Slot 2) at 19:48 (~5 min after first seen final); idle (20:00 games not started yet).
  - 24 Nov 2026 20:42 UTC: no planner actions (Slots 1, 2 cleared from settings; Slots 3-9 UCL + Slot 10 all-games board LIVE). Stream check: Slots 3-10 correct (~40', first half).
  - 24 Nov 2026 21:42 UTC: no planner actions (Slots 3-9 UCL + Slot 10 all-games board LIVE). Stream check: Slots 3-10 correct (~80-87'). End watch stopped Man City-Napoli, Slovan-Betis (Slots 4, 7) at 22:02, Arsenal-Dortmund, Leipzig-Lens (Slots 3, 9) at 22:03, Real Madrid-PSV (Slot 5) at 22:05, Como-AEK (Slot 6) at 22:07 and Feyenoord-Porto (Slot 8) at 22:10, each ~12 min after the final; idle by 22:10. Slot 10 (multi) ends on its planned duration ~22:12.
  - 24 Nov 2026 23:42 UTC: Oilers-Golden Knights (Slot 2, NHL) and Wizards-Celtics (Slot 3, NBA) scheduled 00:30; Magic-Pistons (Slot 1) LIVE since 23:30. Stream check: Slot 1 correct (pre-game). End watch idle.
  - 25 Nov 2026 00:44 UTC usage check: 113.9 h of 680 this week (17%), last 7 days 478.7 h, level ok (incl. 3 streams live). No planner actions; stream check: Slots 1-3 correct.
  - 25 Nov 2026 02:42 UTC: no planner actions (4 live, Slot 1 Magic-Pistons cleared). Stream check: Slots 2-5 correct. End watch: no games ended by 03:31.
  - 25 Nov 2026 03:42 UTC: no planner actions (4 live). Stream check: Slots 4, 5 correct. End watch stopped Oilers-Golden Knights (Slot 2) and Wizards-Celtics (Slot 3) at 03:48 (~5 min after the run's first look); no other games ended by 04:32.
  - 25 Nov 2026 04:42 UTC: no planner actions (Slots 2, 3 cleared from settings; 2 live). Stream check: Slots 4, 5 correct.
  - 25 Nov 2026 06:42 UTC: no planner actions (Slot 5 Nuggets-Mavericks cleared from settings; all 21 projects OFFLINE). No stream check; usage already done today. End watch idle.
  - 25 Nov 2026 17:42 UTC: no planner actions (Slots 1, 2, 10 LIVE: Sabah-Barcelona, Slavia Prague-Villarreal, all-games UCL). Stream check Slots 1, 2, 10 correct; usage already done today. End watch idle.
  - 25 Nov 2026 18:42 UTC: UCL 20:00 games Brugge-Liverpool, PSG-Roma, Sporting-Man Utd, Inter-Stuttgart, Atlético-Viking, Lille-Bayern, Shakhtar-Fenerbahce (Slots 3-9) scheduled 19:30 (crowd audio), all accepted; 8 LIVE, 2 PREPARING at 19:32. Stream check: Slots 1, 2, 10 correct (half-time). End watch: no games ended by 19:32.
  - 25 Nov 2026 19:42 UTC: no planner actions (10 live, cap 10; Sabah-Barcelona, Slavia Prague-Villarreal (Slots 1, 2) final, in grace). Stream check: Slots 3-10 correct (pre-game, 20:00 kick-offs).
  - 25 Nov 2026 21:42 UTC: no planner actions (9 live, cap 10). Stream check: Slots 1, 3-10 correct (UCL 80-86', 76ers-Heat pre-game, all-games board). End watch stopped Atlético-Viking, Lille-Bayern (Slots 7, 8), Inter-Stuttgart (Slot 6), Brugge-Liverpool, PSG-Roma, Sporting-Man Utd, Shakhtar-Fenerbahce (Slots 3-5, 9) ~12 min after the final (22:05-22:08); Slot 10 all-games board runs to its planned 22:15 end.
  - 25 Nov 2026 22:42 UTC: Bruins-Jets, Capitals-Flyers, Lightning-Hurricanes, Panthers-Senators, Blue Jackets-Devils, Islanders-Blues, Sabres-Rangers, Penguins-Flames (Slots 2-9) scheduled 23:30, all went LIVE; Red Wings-Canucks (Slot 10) scheduled 00:00. Hornets-Bulls, Thunder-Timberwolves, Knicks-Cavaliers (NBA) skipped (cap 10). Stream check: Slot 1 correct. End watch: no games ended by 23:39.
  - 25 Nov 2026 23:42 UTC: cap 10 full (76ers-Heat + 9 NHL) would have skipped the 01:00 NHL Stars-Predators, Wild-Mammoth and NFL Rams-Packers → maxLiveTemp 13 until 26 Nov 04:30; all three scheduled 00:30 on Slots 11-13 (accepted), but at 00:30 all errored (UNKNOWN_ERROR) at 10 live; Slot 11 start refused ("User has too many live or scheduled broadcasts"), bump.js: no lower-ranked NBA to drop (76ers-Heat final, grace to 00:45). Owner notified. Stream check: Slots 1-9 correct.
  - 26 Nov 2026 00:42 UTC: Stars-Predators (Slot 11) start refused at 10 live (bump.js: nothing to drop); started 00:48 once the end watch stopped 76ers-Heat (Slot 1, ~5 min after the final), then Wild-Mammoth (Slot 13) and Rams-Packers (Slot 12) were accepted too (12 live). Avalanche-Canadiens, Kraken-Blackhawks (NHL 02:30/02:40) and 6 NBA skipped (cap 13). Stream check: Slots 2-10 correct. Usage check: 159.5 h of 680 this week (23%), last 7 days 470.2 h, level ok. Re-plan scheduled Avalanche-Canadiens (Slot 1, NHL) for 02:00. Rams-Packers (Slot 12) stuck PREPARING 10 min (YouTube took only 11 live) → stopped, restart refused ("User has too many live or scheduled broadcasts"), bump.js: no lower-ranked NBA → owner notified. End watch: no games ended by 01:30.
  - 26 Nov 2026 01:42 UTC: no new assignments (Kraken-Blackhawks, Ducks-Sharks NHL + 8 NBA skipped cap 13). Stars-Predators (Slot 11) stuck PREPARING 55 min (YouTube preview = channel placeholder) → stopped, restart refused at 10 live; Rams-Packers (Slot 12) restart refused; Slot 1 (Avalanche-Canadiens) 02:00 schedule never started, start at 02:27 refused. bump.js: nothing to drop (all NHL). Owner notified. Stream check: Slots 2-10, 13 correct.
  - 26 Nov 2026 02:42 UTC: Slot 1 restart refused at 10 live; end watch stopped Slots 4, 8, 9 (Slot 2 already offline) ~5 min after the final, then Avalanche-Canadiens (Slot 1), Stars-Predators (11), Rams-Packers (12) restarted and Kraken-Blackhawks (2), Ducks-Sharks (4), Rockets-Suns (8), Thunder-Timberwolves (9) started. Slots 1, 12, 9 stuck PREPARING (YouTube at 10 live) → stop + start after Slots 3, 6 (03:03) stopped: Slots 1, 12 LIVE. Slot 14 NHL board started 03:10 (owner's chat request, kept in settings). Re-plan: Warriors-Kings (6) LIVE, Grizzlies-Clippers (3), Bucks-Nets (5) stuck/refused at 10 live, both final before going on air. End watch also stopped Slots 5, 7, 9, 10, 3. Blazers-Spurs skipped (cap 13). Stream check: Slots 3, 5, 6, 7, 10, 13 correct.
  - 26 Nov 2026 03:42 UTC: Trail Blazers-Spurs (Slot 3) started 03:43, LIVE ~03:53. End watch stopped Stars-Predators (11) 03:49, Wild-Mammoth (13) 04:05 (~13 min after the final), Rockets-Suns (8) 04:20 (~12 min after). Rams-Packers (12) final, grace until 04:43 (next run). Stream check: Slots 1, 2, 4, 6, 8, 12, 13, 14 correct.
  - 26 Nov 2026 04:42 UTC: no planner actions (7 live, cap 10). Stream check: Slots 1-4, 6, 14 correct. End watch stopped Rams-Packers (Slot 12) 04:49 (~6 min after first look final), Avalanche-Canadiens (Slot 1) 05:29, Kraken-Blackhawks (Slot 2) and Warriors-Kings (Slot 6) 05:36 (~12 min after the final).
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

- **UEFA Nations League (owner, 15 Nov 2026: no EPL this week, stream the Nations League instead):** league key `unl`
  (ESPN `soccer/uefa.nations`, scorebuzz.net `football/uefa-nations-league`) added to feed.js, app.html, center.html, soccer.html,
  match3d.html, overlay.html, live_thumbs.js, check_trackers.py and settings `streams.leagues` (after epl), `centerLeagues`,
  `soccerLeagues`. Centre layout checked with Cyprus-Montenegro (live) and Spain-England (pre-game). Remove `unl` from
  `streams.leagues` after the window to stop it. Auto-off (owner said yes, 15 Nov 2026): `"streams": {"until": {"unl": "2026-11-17T23:59:00Z"}}`
  — plan_streams.js drops a league from new assignments after its `until` time (games already on a slot still finish and stop normally).

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
Event caption removed (owner 16 Nov 2026: "Corner K Shaw (Malta)" text under the pitch on every game): soccer.html crop height 517 → 474, so the site's caption strip below the pitch is cut off. Reload 34.

- **Brasileirão + 10-stream limit (owner, 18 Nov 2026):** keep 10 streams at a time (`streams.maxLive: 10`). League key `bra`
  (ESPN `soccer/bra.1`, scorebuzz.net `football/brasileirao`) wired into feed.js, app/center/soccer/match3d.html, overlay.html,
  live_thumbs.js, check_trackers.py; lowest priority (after mlb). New planner options: `streams.onlyEvents {"<league>": [ESPN ids]}`
  (only those games of that league) and `streams.maxLiveTemp {"value", "until"}` (temporary cap). Night of 18-19 Nov: every NBA/NHL
  game (they alone peak at 11 live) + top 2 Brazil games, Palmeiras-Cruzeiro and Athletico-PR-Flamengo (23:30 UTC); owner approved
  up to 13 live, set as maxLiveTemp 14 until 19 Nov 08:00 UTC because the planner also counts the 02:00 schedule for Celtics-Nuggets
  while the Brazil games (done ~01:45) still run. `bra` auto-off 19 Nov 06:00 UTC (`streams.until`).

- **Drop order (owner, 18 Nov 2026: "drop only low ranked NBA games and cover all NHL"):** `streams.leagues` now has `nhl` (and
  tonight `bra`) ahead of `nba`, and within a league the planner ranks games by the two teams' average win % (`winPct` from ESPN
  records in feed.js), so the cap skips the lowest-ranked NBA games first. When YouTube refuses a start ("User has too many live or
  scheduled broadcasts", or a stuck PREPARING whose restart is refused): `node tools/live/bump.js <refused slot> [--skip <slots>]`
  names the lowest-ranked NBA stream to give up (never NHL; for an NBA game only a lower-ranked one). Stop it (LIVE/PREPARING) or
  cancel its schedule, start the refused game once, and put "bump: Slot N <dropped> for Slot M <refused>" in the commit. No
  candidate → notify the owner as before.

## All-games scoreboard (owner, 24 Nov 2026)

`docs/live/multi.html?league=ucl` shows every game of one league on one screen (grid of score cards, scorers, red cards, goal flash,
goals ticker; ESPN scoreboard every 15 s; `&demo=1` fakes a mid-game state). On a stream slot: `"slots": {"N": {"league": "ucl",
"event": null, "multi": "ucl"}}` makes app.html hand that slot to multi.html (no event, so the planner and end watch leave it alone and
the stream ends on its planned duration; the next planner run frees the slot once it is offline).
- 24 Nov 2026 20:22 UTC: first run, Slot 10 "Champions League Live Scores Today | All Games Live Scoreboard", planned 6600 s (to ~22:12),
  crowd audio. PREPARING for 10 min, then LIVE at 20:32; YouTube preview showed all 9 games correctly.
- 25 Nov 2026 (owner asked in chat): Slot 10 all-games UCL board again, scheduled 17:15Z (30 min before the 17:45 games), planned 18000 s (to ~22:15, after the 20:00 games end), crowd audio.
- 26 Nov 2026 (owner asked in chat): NHL board. multi.html now takes `league=nhl` (ESPN hockey/nhl: period clock, ET/UK puck drop, scores by period, score ticker). Slot 14 `{"multi": "nhl"}`, started once YouTube had room (it refuses past 10 live), after the single NHL games.

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
- **24 Nov 2026 (owner: "proper SEO title, description, keywords, tags" for the UCL night):** title format unchanged (owner's 22 Nov
  short-name format). Fixes: ESPN initial-abbreviated names ("S Bratislava") fall back to the full name in titles; football hashtags use the
  title's short names (#ArsenalVsDortmund, was #ArsenalVsBorussia); football descriptions get a natural "Follow <Home> vs <Away> live in the
  <League>: live score, goals, cards, line-ups and match stats" line and the start time in CET too; the repeated "X vs Y live · X vs Y" line
  becomes "X vs Y live stream" when short and full names match. The "<Home> vs <Away> <League> Live Scoreboard" line stays (yt_tags.js reads it).
- **22 Nov 2026 (owner, after vidIQ keyword research):** titles now read `<Home short> vs <Away short> Live Score | <League> Live Scoreboard`
  (e.g. `Newcastle vs Arsenal Live Score | Premier League Live Scoreboard`, `Hurricanes vs Oilers Live Score | NHL Live Scoreboard`).
  Research: "live scoreboard", "nba live scoreboard", "play by play" all under 750 searches a month; people search
  "<team> vs <team> live", "... live score", "... live match today" with short names. The description is unchanged (full names).
  YouTube tags are written by the "YouTube live tags" GitHub Action every 10 min (yt_tags.js; back on 22 Nov 2026 with the Google
  project "ScoreBuzz Live Streams"); it reads either title format and takes the full names from the description. vidIQ is NOT used
  for tagging: 5 credits per video against 150 a month.
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
  as a live game from the commentary. On air 13 Nov 2026 (owner): all football leagues are in settings `centerLeagues` (reload 31);
  remove them to send football back to soccer.html. Bottom bar = only this league's games (owner 13 Nov 2026, league uid filter).

- Score pill on the football tracker (owner, 16 Nov 2026: live score inside the tracker like on the website): the site draws its
  "clock · GER 0 - 0 NED · LIVE" pill at the very top of the pitch canvas, which sits under the site's 65 px sticky header in the
  cropped iframe. center.html now draws the same pill over the tracker (`trackerChip`, ESPN data every 2 s, score flashes lime 8 s
  after a goal). Reload 33.

- Tracker drift fix (owner, 18 Nov 2026: Spurs-Pistons, Wild-Predators, Timberwolves-Blazers, Flyers-Sabres, Islanders-Blue Jackets
  "live tracker showing wrong"): after 1-2 h on air the scorebuzz.net page's content above `#trkSlot` changes height, so the
  one-time anchor scroll drifted and the centre box showed the site's score card or stats table instead of the tracker.
  center.html now re-anchors every 20 s (fragment-only `#_` → `#trkSlot`, scrolls without reloading the page). Reload 35.

- Away left / home right for US leagues (owner, 18 Nov 2026: Lightning-Capitals overlay had TB left, the tracker had WSH left):
  center.html now puts the AWAY team on the left and HOME on the right for NBA / NHL / NFL / MLB (sidebars, strip, play scores,
  bottom bar), matching US TV and the scorebuzz.net tracker; football keeps home on the left. Reload 36.
- Clock gap vs the tracker (~10-20 s): both use ESPN, but the site's tracker gets a `stopped` flag from its own in-play feed
  (`scorebuzz.net/api/live/t-<id>.json`, id from `/api/live/<sport>.json` → `m[].p`) and runs the clock locally between updates;
  the overlay only shows ESPN's clock, which jumps every 10-30 s. The overlay can't read that feed: scorebuzz.net sends no
  `Access-Control-Allow-Origin` header, so a fetch from raw.githack.com is blocked. Fix needs a site change: CORS `*` on
  `/api/live/*`, or the tracker page posting its clock to the parent (`postMessage`).

## NFL on the centre layout (owner, 15 Nov 2026: NFL tracker in the centre like NBA / NHL)
center.html now handles `nfl`: scorebuzz.net field tracker (`american-football/nfl/<home>-vs-<away>-<id>/`, same 'live action' crop as us.html)
in the centre while in play; strip with timeouts (3 dots each), down & distance with the ball carrier's logo, RED ZONE lights; Q1–Q4/OT chips;
game leaders = top passer, 2 rushers, 2 receivers (season leaders before kick-off); plays from ESPN drives; built-in gridiron (team-colour end
zones) before/after the game or with `sbtrk: 0`. On air via settings `centerLeagues` (+ `nfl`, reload 32); remove `nfl` there to send NFL back to us.html.
Preview: `center.html?league=nfl&event=401873053` (Lions-Patriots, Munich).

## UFC fight nights (owner's request, 14 Nov 2026)
A slot with `"league": "ufc"` in settings.slots shows docs/live/ufc.html (app.html hand-off; `"ufcPage": false` turns it off):
scorebuzz.net's own UFC fight tracker (`https://scorebuzz.net/tracker-ufc.js`, feed `https://scorebuzz.net/api/ufc/card`,
autoSample off) full screen. It follows whichever fight is in the cage, shows "UP NEXT" + tale of the tape between fights and FINAL after the card.
- UFC isn't in plan_streams.js leagues or feed.js, so the planner and watch_ends.js leave a UFC slot alone (game "we can't see"):
  it is set up by hand (title, description, music, schedule); the hourly manager never stops it.
- Stream check: any bout of the card on screen is correct for a UFC slot ("UP NEXT" between fights is expected there, not a problem).
- Crowd audio (owner, 14 Nov 2026): `music.playlists.ufc_crowd` = ScoreBuzz UFC Crowd 01-06, the owner's 6 Envato fight-crowd
  recordings (01 Wrestling Crowd Interior Huge Crowd Cheers OCP-0098-04, 02/04 Boxing Crowds During Fight 01/02, 03/05/06 Crowd Reaction
  MMA Fight OCM-0046-118-23/-120-25/-097-02), each only loudness-normalised (-18 LUFS, stereo, MP3 192k), not mixed; played in that
  order on loop at volume 6 on Slot 20's Music layer (set by hand, replacing the rock playlist). Not committed (Envato licence).
- UFC 334 (Gane vs Hokit, MSG): Slot 20, scheduled 14 Nov 2026 21:30 UTC (30 min before the 22:00 UTC early prelims), manual duration: the owner stops it himself. Stopped 14 Nov 2026 ~22:24 UTC on the owner's request (Slot 21's RTMP feed to ufc2cobra left running).

## 3D tracker on stream: tried and rolled back (owner, 20 Nov 2026)
scorebuzz.net drops to its 2D tracker when a device can't keep 3D at 24 fps, and LiveReacting's stream browser (no GPU) counts as slow.
Forcing 3D with `?trk=3d` on the tracker iframes worked, but it ran at ~3 fps (headless test: 3 fps at 1000 px, 5 fps at 640 px) and
looked like buffering on YouTube, so it was reverted the same evening (reload 38). Streams use the site's own choice again (2D in the stream browser).
Smooth 3D on stream would need a GPU-backed renderer.

## A lighter 3D tracker for the stream browser: built, not on stream yet (21 Nov 2026)
The streams are on the site's own choice (2D in the stream browser) since the roll-back above. The reload 39 that came with this note
changed nothing on screen: it was pushed minutes after that roll-back, before this session had seen it.
What is new is on the site (scorebuzz-site 0f94075): when 3D is forced with `?trk=3d` and the browser reports a software renderer
(no graphics card), scorebuzz.net draws the 3D view at two thirds of the resolution with no edge smoothing and lighter textures, and
steps down to half if it still can't hold 24 fps; it never leaves 3D. Measured on the site's demo trackers (scripted play, 1000 px,
2-core headless Chromium with no GPU, frames a second): football 2D 5.9 / full 3D 2.3 / lighter 3D 5.7; NBA 4.7 / 3.5 / 8.3;
NHL 5.3 / 3.5 / 7.4. So the lighter 3D costs the stream browser about what the 2D tracker costs, or less. NOT tried on LiveReacting yet.
Without `?trk=3d` a browser with no GPU now gets the 2D tracker at once (no seconds of 3D first). To try it: put `?trk=3d` back on ONE layout or slot, watch that stream for a few
minutes, and only then roll it out. `&q3d=full` forces the full-quality picture, `&q3d=lite` the light one (to preview on any device).

## Trial: the lighter 3D tracker on Slot 2 only (owner said yes, 21 Nov 2026)
`docs/live/settings.json` has `"trk3d": ["2"]`: the centre layout (center.html) opens the site's match page with `?trk=3d` on the
slots listed there (`true` = every slot; remove the key = off, the site's own choice, 2D in the stream browser). The setting is read
every minute, so adding or removing a slot needs no reload. It stays with the slot number, so the next game the planner puts on Slot 2
is in 3D too. Reload 40 loaded the layout that knows the setting. The owner watches Slot 2: smooth -> `"trk3d": true`; not smooth ->
remove the key. Only center.html reads it (soccer/us/nba/dark/app.html do not).

**Result of the trial (21 Nov 2026, 21:25 UTC):** the owner watched Slot 2 (Athletic Club v Espanyol) with the lighter 3D picture and it
was NOT smooth on YouTube, so `"trk3d"` was removed again and every slot is on the 2D tracker. The headless comparison (lighter 3D
costs about what 2D costs) did not carry over to LiveReacting's stream browser. Do not turn 3D on for the streams again without a
capture machine that has a graphics card. The `"trk3d"` setting in center.html stays for that day; it is off when the key is absent.

## Next trial: LiveReacting's graphics-card servers (owner asked them for a trial, 21 Nov 2026)
LiveReacting told the owner they have servers with a graphics card that the account can be upgraded to; the owner asked for a trial
first. Nothing is switched on yet: `"trk3d"` is still absent, every slot is on the 2D tracker.
When the owner says which slot/project has the graphics card: add `"trk3d": ["N"]` and `"trkgpu": ["N"]` to settings.json (no reload
needed, the setting is read every minute; reload 41 already loaded the layout that knows `trkgpu`).
- `trkgpu` (same form as `trk3d`: `true` or a list of slots) makes center.html add `&gpu=1` to the match page address. The site's 3D
  view then shows a small readout at the top centre of the picture: "Graphics card: <chip>" (green line) or "No graphics card: <chip>"
  (red line), the frames a second it reaches, and "full 3D" or "light 3D" with the drawn size. So the YouTube picture itself shows
  whether their card is used for the page (some services use the card only for encoding the video).
- With a real card the site picks the full-quality picture by itself (`?trk=3d` only goes light on a software renderer).
- Smooth and "Graphics card" on the readout -> remove `trkgpu`, set `"trk3d": true` once every slot is on such a server. Red line or
  still not smooth -> remove both keys again (2D).


**Started (owner, 21 Nov 2026):** LiveReacting is giving the owner a graphics-card server to test on Slot 1, so settings.json now has
`"trk3d": ["1"]` and `"trkgpu": ["1"]`. Slot 1's next game (Manchester City v Fulham, 12:30 UTC) opens in 3D with the readout. Check the
readout on YouTube: green "Graphics card" and smooth -> keep; red "No graphics card" -> the project is not on the GPU server yet.

## Site preview slides before the start (owner's request, 21 Nov 2026)
Before the start, center.html now shows the scorebuzz.net match page's own preview slides (form guide, in the table, head to head,
season leaders…) in the tracker box, under the "KICK-OFF 12:30 UK · IN 24 MIN" line. These are the slides the site shows where its
live tracker appears at kick-off (`#trkSlot`, cropped `CROP_PRE` = x 120-880, y 65-326 of the 1000 px page, fitted inside the box).
It is the same page address as the live tracker, so at kick-off the box switches to the tracker without reloading. Default on;
`"sitePreview": false` in settings.json turns it off (or `["1", "3"]` for only those slots); a `sbtrk: 0` slot keeps the built-in pitch.
Reload 42 loaded it (reload 43: 5 px less at the bottom, a white line from the page showed under the slides). Checked locally with Oilers @ Hurricanes (NHL) and Alavés v Deportivo (LaLiga).
**Result on Slot 1 (21 Nov 2026, 12:36 UTC):** after kick-off (Man City v Fulham) the owner said the stream was still stuttering in 3D,
so `trk3d`/`trkgpu` were removed again (2D on every slot). Slot 1 is most likely not on LiveReacting's graphics-card server yet;
the readout was not visible in YouTube's preview frame. Try again once LiveReacting confirms the project runs on the GPU server.
The pre-game site preview slides worked, and the box switched to the tracker at kick-off without a reload.
**Owner, 21 Nov 2026 ~12:42 UTC: keep Slot 1 in 3D for now** (don't switch it to 2D): `trk3d`/`trkgpu` ["1"] put back.
**21 Nov 2026 14:26 UTC:** Man City v Fulham (Slot 1) finished 1-1; `trk3d`/`trkgpu` removed (owner asked for 2D on Slot 1 after this game). Every slot is on the 2D tracker.

## Football player photos on streams follow the site's line-ups (owner, 21 Nov 2026)

The scorebuzz.net match page now draws its line-ups in the browser (from `/api/live/md-<fx>.json`; `/api/live/football.json`
maps the page URL `…-<ESPN event>/` to `fx`), so the old server-rendered line-up cards that `check_trackers.py` scraped are
gone and `docs/live/player_photos.json` had stopped filling (last entry 9 Nov). `lineup_photos()` now reads the feed (starters +
bench, jersey → `/img/p/<id>.png`) and, when the feed's player ids are empty (often Serie A / Ligue 1), opens the page in
Playwright and reads the photos the page matched itself. soccer.html / center.html already show those photos for the game
leaders and line-up cards (shirt when there is none). Filled by hand for Newcastle-Arsenal, Sevilla-Betis, Parma-Roma on 21 Nov;
the Live tracker check (every 10 min) keeps it going. Games the site itself has no photos for (e.g. Nice-PSG) keep the shirts.

## Scores from Goalserve (owner, 24 Nov 2026)

Speed test 23-24 Nov (every score change, Goalserve's in-play feed on the server vs ESPN checked every 3 s): football goals
Goalserve 70-90 s ahead; NHL goals ~15 s ahead (20 of 21 first); NBA about level (ESPN ~3 s ahead while the server checked
Goalserve's basketball feed only every 12 s, now 4 s); NFL not enough data.

center.html therefore also reads `https://scorebuzz.net/api/live/sc-<soccer|hockey|basket>.json` (written by vps/multiticks.py the
moment a score changes; the game is found through the site row whose page address ends in the ESPN id, field `p`) and shows
whichever of Goalserve and ESPN changed last. NFL stays on ESPN only. Switch: settings `"gsScores": true` or a list of slots
(URL `gs=1`). Started on slot 1 only (24 Nov); widened to `true` on 25 Nov after a clean 5-minute check on Magic v Pistons: the board took
every basket from Goalserve within ~2 s, 5-8 s before ESPN, never older and never flipping. NFL stays ESPN-only automatically.

## Player photos on the streams (25 Nov 2026)

Order for every player card (live tracker side panels, game leaders): the site's own photo `/img/p/<Goalserve id>.png`, else
ESPN's headshot, else the shirt with his number. Line-ups come from `md-<fixture>.json`; when Goalserve has no line-up yet the
live feed uses ESPN's and now fills each player's Goalserve id from his club's squad (surname, then shirt number), so the
site's photos show. A game whose line-up is still thin is looked at again every minute (10 minutes once it is complete).

### 4K (25 Nov 2026)
LiveReacting tested 4K on their graphics-card servers (GTX 1080, 30 fps). `"trk4k": true` (or a list of slots) in settings.json makes
center.html open the match page with `&q3d=4k`: tracker-3d.js draws the 3D view at 4x the stage size (about 3880 x 2328, the stream's
own pixels). If the machine drops under 24 fps it steps down to 2x, then 1x. `trkhd` (2x) is for 1080p streams. Reload 48 also hides
broken team logos in the ticker and header (they showed as broken-image boxes on teams without an ESPN logo).

### Match story (26 Nov 2026) — demo, not on air yet
Why: YouTube's "generic or repetitive content" policy. Every stream had the same layout and nothing written for that match.
`docs/live/story.js` adds three things to center.html when `"story": true` (or a list of slots) is in settings.json, or `&story=1` is in the URL:
1. **Pre-match show** (strip under the tracker, 10 s per slide): what's at stake, form, head to head / season series, players to watch,
   team news (US sports), line-ups (football, once announced), the details.
2. **Live commentary card** (left two thirds of the strip; the latest feed play stays on the right): one line per notable play, written
   in our own words from the play's facts, with context (runs, lead changes, milestones, shot counts, power plays, drives). Big moments turn
   the card lime. When play is quiet it shows match facts. Never copy the feed's commentary text into this card.
3. **Reports** over the tracker box at every break and at the end (9 s per slide): written summary, key stats, top performers and, at the
   end, the table. The site tracker layer is hidden while a report is up (its page stays loaded).
Numbers: the feed's official team stats when live; our own running counts from the plays in a replay.
Demo URLs (raw.githack.com/Aijaz555/scorebuzz-media/main/docs/live/center.html?...): `league=<l>&event=<id>&story=1` (any game: upcoming = pre-match,
finished = final report), `&replay=1&from=<play>` (live commentary on a finished game), `&replay=1&at=<period>` (stops at the end of that
period: 1 = football half-time, 2 = NBA/NFL half-time, 1 or 2 = NHL intermission). NFL replay was added with this (drives grow play by play).
