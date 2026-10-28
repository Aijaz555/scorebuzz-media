# ScoreBuzz Facebook daily playbook

Every day, publish 20–25 posts to the ScoreBuzz Facebook Page (Metricool brand `7677948`), each with an original branded image card.

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
- Put the link in the **first comment**, not the caption: `firstCommentText: "Live scores, fixtures and results: https://scorebuzz.net"`.
- Vary wording and post types day to day; avoid identical openings.

## Cards
1. Write `cards/YYYY-MM-DD/posts.json` (see the format at the top of `tools/make_cards.js`; see `cards/2026-10-28/posts.json` for a full example). Each post: `id`, `time` (PKT, `YYYY-MM-DDTHH:MM:SS`), `sport` (football|nfl|nba|nhl|mlb|mma|racing|other), `kind` (score|headline|list), card fields, `caption`.
2. `node tools/make_cards.js cards/YYYY-MM-DD/posts.json cards/YYYY-MM-DD`
3. Look at a contact sheet of the cards before publishing (text must fit; fix long headlines).
4. Commit and push to `main` in `Aijaz555/scorebuzz-media`.
5. Image URL: `https://raw.githubusercontent.com/Aijaz555/scorebuzz-media/main/cards/YYYY-MM-DD/<id>.png` (the agent workspace proxy may return 403 for raw.githubusercontent.com; that is expected, Metricool can fetch it).

## Scheduling (Metricool `createScheduledPost`)
- `blogId: "7677948"`, provider `facebook`, `facebookData: {"type":"POST"}`, `autoPublish: true`, the card URL in `media`, caption in `text`, link in `firstCommentText`, `publicationDate.timezone: "Asia/Karachi"`.
- Confirm each response shows a `static.metricool.com` media URL (Metricool copied the image).
- Before scheduling, call `getScheduledPosts` for the window and skip slots that already have a post. Count those existing posts toward the 20–25 target for the window, so the Page never gets more than ~25 posts in 24 hours.

## Report
At the end, send the user a short summary: number of posts scheduled, the mix, and anything skipped or uncertain.

# YouTube (ScoreBuzz channel @scorebuzznet)

Target set by the owner: **10–15 Shorts per day + 1 long video per day**. Publishing goes through Metricool (same brand `7677948`), so it only works on a paid Metricool plan; on the free plan, build and commit but do not schedule.

## Shorts
- Generator: `node tools/make_shorts.js shorts/YYYY-MM-DD/shorts.json shorts/YYYY-MM-DD [id ...]` → `<id>.mp4` (1080x1920, 12–20 s) + `<id>.jpg` thumbnail. Scene types and fields are documented at the top of the script; see `shorts/2026-10-29/shorts.json`.
- Same accuracy rules as Facebook: every fact from a page opened with WebFetch, no invented quotes/stats, no logos/photos/footage.
- Every Short must be different: vary the scene types and the angle (result, table, stat of the day, preview, title race, poll question). Never re-post the same template with only names swapped; YouTube's inauthentic-content policy targets mass-produced, repetitive videos.
- Hook in the first 2 seconds, one idea per Short, end on a question.
- Title ≤ 70 chars ending `#shorts`; description = 1–2 sentence summary + `https://scorebuzz.net` + 3–4 hashtags; 5–7 tags.
- Mix like Facebook (~45% football, ~45% US sports, ~10% UFC/F1). Spread uploads roughly every 1–1.5 h across 11:00–09:30 PKT, never within 30 min of each other.
- Optional voiceover: set `voice` to an MP3 path. vidIQ voiceover costs 14 credits per 1,000 characters, so it can't cover daily volume on the current plan.

## Long video (format "video", 1920x1080)
- Same generator with `"format": "video"`; 4–8 minutes, e.g. weekend football roundup, NFL week recap, NBA/NHL power rankings. Needs a voiceover to be worth watching.

## Scheduling (Metricool `createScheduledPost`)
- provider `youtube`, `youtubeData: {"title": ..., "type": "short"|"video", "privacy": "public", "tags": [...], "category": "SPORTS", "madeForKids": false, "isAiGeneratedContent": false}`, media = `https://raw.githubusercontent.com/Aijaz555/scorebuzz-media/main/shorts/YYYY-MM-DD/<id>.mp4`, text = description.
