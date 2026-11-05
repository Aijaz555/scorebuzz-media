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
