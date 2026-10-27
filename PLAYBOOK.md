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
- Before scheduling, call `getScheduledPosts` for the window and skip slots that already have a post.

## Report
At the end, send the user a short summary: number of posts scheduled, the mix, and anything skipped or uncertain.
