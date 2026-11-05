# ScoreBuzz Facebook daily playbook

Every day, publish 20–25 posts to the ScoreBuzz Facebook Page (Metricool brand `7677948`): **image posts and Reels only**
(owner's request, 5 Nov 2026: focus on images and Reels; no text-only or link posts).
- **~15–17 image posts**, each an original branded card (below).
- **~8–10 Reels**: the day's best vertical videos from `shorts/YYYY-MM-DD/` (results boards, big wins, records, upsets),
  posted as Facebook Reels with a Facebook-style caption (not the YouTube title) and the designed `.thumb.jpg` as cover.
- Alternate the two through the day (image, image, Reel, …) so the feed never runs 3+ of one kind in a row; put Reels in
  the evening UK / US prime-time slots, when Reels reach is highest.

## Audience and mix
- Audience: **US and UK sports fans**. Not South Asia. No cricket unless it is a huge global story.
- Mix per day (about 22 posts):
  - **Football ~45% (≈10):** Premier League first, then Champions League / Europa League, LaLiga, Serie A, Bundesliga, MLS. Results, table changes, big-match previews, transfer/manager news, title-race polls.
  - **US sports ~45% (≈10):** NFL, NBA, NHL, MLB (in season), spread by what is happening: last night's results, tonight's slates, big storylines, standings.
  - **Extras ~10% (≈2):** UFC/MMA, F1/NASCAR, only when there is a real result or headline.

## Timing (all scheduled in Asia/Karachi time in Metricool)
- Run at ~09:45 PKT. Schedule posts from **11:00 PKT to 09:30 PKT the next day** (06:00 UK → 23:30 ET).
- Roughly one post per hour, never two within 30 minutes.
- UK morning/afternoon slots (11:00–20:00 PKT) → football first.
- US afternoon/evening slots (20:00–09:30 PKT) → US sports first; "tonight" slates go out 1–3 hours before the first game (ET).
- Time-sensitive claims (series leads, "tonight", "one win away") must still be true at the scheduled time. If a game finishes before the post goes out, write it as a result instead, or don't schedule it.

## Facts: accuracy rules
- Scores/schedules: use `fetch_sports_data` (scores, standings) for epl, la_liga, serie_a, bundesliga, champions_league, mls, nfl, nba, nhl, mlb, mma, nascar.
- News: `WebSearch`, then **open the page with WebFetch** before using a fact. Never post a fact taken only from a search snippet.
- Never invent quotes, injuries, transfers, odds, or stats. If unsure, leave it out.
- Write in our own words. Do not copy article text. No club logos, no player photos, no match footage.
- Convert times correctly (US DST ends first Sunday of November; UK clocks change last Sunday of October). Label times "ET" or "GMT".

## Captions
- 1–4 short lines: hook with emoji → the fact → a question to drive comments. Then 2–4 hashtags.
- **No link in the first comment** (owner's request, 5 Nov 2026): send `firstCommentText: ""` on every Facebook post and Reel. No links in captions either; the scorebuzz.net name on the card/video is enough.
- Vary wording and post types day to day; avoid identical openings.

## Cards
1. Write `cards/YYYY-MM-DD/posts.json` (see the format at the top of `tools/make_cards.js`; see `cards/2026-10-28/posts.json` for a full example). Each post: `id`, `time` (PKT, `YYYY-MM-DDTHH:MM:SS`), `sport` (football|nfl|nba|nhl|mlb|mma|racing|other), `kind` (score|headline|list), card fields, `caption`.
2. `node tools/make_cards.js cards/YYYY-MM-DD/posts.json cards/YYYY-MM-DD`
3. Look at a contact sheet of the cards before publishing (text must fit; fix long headlines).
4. Commit and push to `main` in `Aijaz555/scorebuzz-media`.
5. Image URL: `https://raw.githubusercontent.com/Aijaz555/scorebuzz-media/main/cards/YYYY-MM-DD/<id>.png` (the agent workspace proxy may return 403 for raw.githubusercontent.com; that is expected, Metricool can fetch it).

## Scheduling (Metricool `createScheduledPost`)
- Reels: same as below but `facebookData: {"type":"REEL"}`, the Short's MP4 (commit-pinned raw URL) in `media`,
  `videoThumbnailUrl` = its `.thumb.jpg`, caption in `text` (hook + question + 2–4 hashtags incl. #Reels), `firstCommentText: ""` (no link).
  Count Reels toward the 20–25 Facebook total. The same video may also be a YouTube Short (that's fine).
- Image posts: `blogId: "7677948"`, provider `facebook`, `facebookData: {"type":"POST"}`, `autoPublish: true`, the card URL in `media`, caption in `text`, `firstCommentText: ""` (no link comment), `publicationDate.timezone: "Asia/Karachi"`.
- Confirm each response shows a `static.metricool.com` media URL (Metricool copied the image).
- Before scheduling, call `getScheduledPosts` for the window and skip slots that already have a post. Count those existing posts toward the 20–25 target for the window, so the Page never gets more than ~25 posts in 24 hours.

## Report
At the end, send the user a short summary: number of posts scheduled, the mix, and anything skipped or uncertain.

# YouTube (ScoreBuzz channel @scorebuzznet)

Target set by the owner: **15 YouTube uploads per day**, including weekly recap videos on Tuesdays and Fridays (see "Long videos" below). Publishing goes through Metricool (same brand `7677948`), so it only works on a paid Metricool plan; on the free plan, build and commit but do not schedule.

## Shorts
- Generator: `node tools/make_shorts.js shorts/YYYY-MM-DD/shorts.json shorts/YYYY-MM-DD [id ...]` → `<id>.mp4` (1080x1920, 12–20 s) + `<id>.jpg` thumbnail. Scene types and fields are documented at the top of the script; see `shorts/2026-10-29/shorts.json`.
- Same accuracy rules as Facebook: every fact from a page opened with WebFetch, no invented quotes/stats, no logos/photos/footage.
- Every Short must be different: vary the scene types and the angle (result, table, stat of the day, preview, title race, poll question). Never re-post the same template with only names swapped; YouTube's inauthentic-content policy targets mass-produced, repetitive videos.
- Hook in the first 2 seconds, one idea per Short, end on a question.
- Title ≤ 70 chars ending `#shorts`; description = 1–2 sentence summary + `https://scorebuzz.net` + 3–4 hashtags; 5–7 tags.
- Mix like Facebook (~45% football, ~45% US sports, ~10% UFC/F1). Spread uploads roughly every 1–1.5 h across 11:00–09:30 PKT, never within 30 min of each other.
- **Results boards (owner's request, 1 Nov 2026):** for round-ups of several results, use the `board` scene (format modelled on a fast-growing UCL score-prediction Short): kicker + big title + yellow badge ("FULL TIME"/"RESULTS") over a white fixture card; each score drops in with a bounce and a pop sound, home then away, one fixture every ~1.7–2.2 s; a full-board hold, then the `cta` Like/Comment/Share end card. 6–11 fixtures, 18–32 s. Home team on the left. No crests: abbreviation badges only. Run `tools/add_music.sh` as usual; it mixes the pops in automatically from `<id>.sfx.json` (sound made by `tools/make_pop.py`, original). Make at least one board per day (league matchday, Top 25 Saturday, NBA/NHL night), and use it for previews too ("score prediction" boards with a question, never presented as results). Example: `n15-cfb-board` in `shorts/2026-11-01/shorts.json`.
- Every Short gets a music bed too: after rendering, run `tools/add_music.sh shorts/<day>/<id>.mp4 <hype|anthem|drama> <tmp>` and replace the file before pushing (same beds and rules as TikTok).
- Optional voiceover: set `voice` to an MP3 path. vidIQ voiceover costs 14 credits per 1,000 characters, so it can't cover daily volume on the current plan.

## What gets views (vidIQ research, 31 Oct 2026)
- Small sports channels break out with: weekly recaps ("Everything you missed from NFL Week X"), "3 biggest takeaways"/instant reactions, college football recaps, comebacks/upsets, records ("one point short of Lemieux"), and list/history Shorts ("Every Premier League winner").
- Titles: hook first, a number or name, one emoji, then 1–2 hashtags + #shorts (e.g. "McDavid Falls ONE Point Short of Mario Lemieux's Record 😮 #NHL #shorts").
- Cover every big sport the US/UK audience follows: NFL, college football (Saturdays), NBA, NHL, F1, UFC, Premier League, LaLiga, Serie A, Bundesliga.
- Publish results within hours, previews 1–3 hours before kick-off; end every Short on a question.
- Scores can come straight from ESPN's scoreboard/summary JSON (site.api.espn.com), which is allowed in this environment.

## Long videos: weekly recaps (owner's request, 4 Nov 2026)
- **Only on some days, not daily** (YouTube's upload limit). Fixed days, all times PKT:
  - **Tuesday:** a football weekend recap (Premier League, LaLiga, Serie A, Bundesliga) at ~13:00, and an NFL week recap after Monday Night Football at ~22:00.
  - **Friday:** an NBA/NHL week in review at ~22:00.
  - (First week only: the football and NFL Week 8 recaps go out Thu 5 Nov and the NBA/NHL review Fri 6 Nov.)
- Length 3–5 minutes (180–300 s), 1920x1080: `node tools/make_shorts.js videos/YYYY-MM-DD/videos.json videos/YYYY-MM-DD` with `"format": "video"`. It renders at about 3x real time, so run it in the background (`nohup … &`). Example: `videos/2026-11-04/videos.json`.
- **No voiceover** (owner's choice): on-screen text, scores and tables carry the story. Give each text/score scene 6–9 s and each table 8–11 s so it can be read. Then add a music bed with `tools/add_music.sh` (original royalty-free beds only, never commercial songs). Don't use `board` scenes in wide format, because they're built for vertical; use a `table` with cols `["",""]` and rows `["", "Home v Away", hs, as]` for results lists, with at most ~11 rows per table.
- Research: every score and scorer comes from ESPN JSON (scoreboard + summary). Story details come from the ESPN/AP game story in the summary's `article`, or from a page opened with WebFetch. Frame stats in time ("as of 3 Nov", "through Week 8") so they stay true when the video goes out.
- **Count them toward the day's targets**: each long video counts as 1 of the 15 YouTube uploads and 1 of the ≤25 Facebook posts for its day, so a Tuesday has 13 Shorts and a Friday has 14.
- Post each long video on **YouTube** (`type: "video"`, title ≤100 chars, chapters optional) **and the Facebook Page** (same MP4, `facebookData: {"type":"POST","title": <title>}`, caption = 2–3 lines + question + hashtags, no first-comment link), at least 1 hour apart on the two networks.

## Thumbnails (owner's request, 5 Nov 2026)
- Every Short and long video gets a designed thumbnail, not a video frame: add a `thumb` object to each entry in `shorts.json` / `videos.json` and run `node tools/make_thumbs.js <json> <dir>` → `<id>.thumb.jpg` (1080x1920 Shorts, 1280x720 videos). Fields are documented at the top of the script.
- Formula: yellow kicker (league/event) → one giant number or score (`big`, ≤ 6–8 chars; team abbreviation badges optional) → a 2–5 word hook with one *highlighted* word (+ one emoji) → a red corner sticker (RECORD, FINAL, TONIGHT, COMEBACK, UPSET…). One idea per thumbnail, and it must say something the title doesn't repeat word for word.
- Same accuracy rules: the number and hook must be true facts from the Short. No logos, crests or player photos.
- Check a contact sheet (nothing clipped or overlapping), commit, then pass the commit-pinned URL as `videoThumbnailUrl` in `createScheduledPost` (YouTube Shorts/videos and Facebook video posts). YouTube only displays custom Shorts thumbnails on verified channels where Shorts thumbnails are enabled; it is harmless otherwise.

## Scheduling (Metricool `createScheduledPost`)
- provider `youtube`, `youtubeData: {"title": ..., "type": "short"|"video", "privacy": "public", "tags": [...], "category": "SPORTS", "madeForKids": false, "isAiGeneratedContent": false}`, media = `https://raw.githubusercontent.com/Aijaz555/scorebuzz-media/main/shorts/YYYY-MM-DD/<id>.mp4`, text = description.

# TikTok (@scorebuzznet, connected in Metricool brand 7677948)

> **PAUSED by the owner on 1 Nov 2026.** TikTok rejected posts as "high spamming risk" and the failures caused error emails. Do not create or schedule TikTok posts until the owner turns this back on. The notes below are kept for reference.

- Post **5 TikToks per day**, the strongest of the day's Shorts (records, upsets, late drama, big previews). New accounts get flagged for spam at high volume.
- Same MP4 as the Short, but **not at the same time** as YouTube: aim for US evening (7–10pm ET), US lunchtime before NFL/NBA slates, and UK lunchtime/afternoon for football. ET = PKT − 10 in US winter time (PKT − 9 in summer).
- Caption, written for TikTok: a hook line in caps or with one emoji ("89th minute. Bayern thought they'd won it… then Fábio Silva 😱"), the fact in one line, a question, then 4–5 lowercase hashtags (sport, league, team, player, #football/#sports). No #shorts, no links (they aren't clickable).
- Metricool `createScheduledPost`: provider `tiktok`, `tiktokData: {"title": <short hook, required>, "privacyOption": "PUBLIC_TO_EVERYONE", "disableComment": false, "disableDuet": false, "disableStitch": false, "commercialContentThirdParty": false, "commercialContentOwnBrand": false, "autoAddMusic": false, "isAigc": false}`, media = the Short's raw.githubusercontent.com MP4 URL.
- What overperforms on TikTok (vidIQ, Oct 2026): drama hooks in the first 3 s ("IT ALL CAME DOWN TO THIS"), upsets, records, emotional moments, and trending audio. Every TikTok gets an original, royalty-free music bed made by `tools/make_music.py` (beds live in `tools/music/`: `hype` for results/upsets/NFL, `anthem` for big wins and goal-fests, `drama` for late drama, records and near misses). Mix with `tools/add_music.sh shorts/<day>/<id>.mp4 <bed> tiktok/<day>/<id>.mp4` and schedule the `tiktok/` file. Never put commercial or trending songs into the file: TikTok mutes or removes them.
