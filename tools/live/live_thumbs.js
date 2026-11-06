// Designed 1280x720 thumbnails for the live scoreboard streams on YouTube.
//
// LiveReacting can't set a YouTube thumbnail, so the hourly live manager does it in two steps:
//   1. node tools/live/live_thumbs.js <videoId>:<slot> [<videoId>:<slot> ...]
//      renders thumbs/live/<videoId>.jpg for the game in that slot (docs/live/settings.json) and
//      prints the video ids that still need their thumbnail set (skips ones listed in thumbs/live/done.json).
//   2. commit + push, then run the "Live thumbnails" GitHub Action (.github/workflows/live_thumbs.yml)
//      with input video_ids = the printed ids. The Action uploads them with the YouTube Data API
//      (thumbnails.set) using the repository secrets YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN,
//      and records successes in thumbs/live/done.json.
// The YouTube video id is the v= part of livereacting_get_stream_status → destinations[].viewingUrl.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'thumbs', 'live');
const LEAGUES = {
  epl: ['soccer/eng.1', 'Premier League', 'football'], ucl: ['soccer/uefa.champions', 'Champions League', 'football'],
  uel: ['soccer/uefa.europa', 'Europa League', 'football'], laliga: ['soccer/esp.1', 'LaLiga', 'football'],
  seriea: ['soccer/ita.1', 'Serie A', 'football'], bundesliga: ['soccer/ger.1', 'Bundesliga', 'football'],
  ligue1: ['soccer/fra.1', 'Ligue 1', 'football'], mls: ['soccer/usa.1', 'MLS', 'football'],
  nfl: ['football/nfl', 'NFL', 'nfl'], ncaaf: ['football/college-football', 'College Football', 'nfl'],
  nba: ['basketball/nba', 'NBA', 'nba'], nhl: ['hockey/nhl', 'NHL', 'nhl'], mlb: ['baseball/mlb', 'MLB', 'mlb'],
};

(async () => {
  const pairs = process.argv.slice(2).map((a) => a.split(':')).filter((p) => p.length === 2);
  if (!pairs.length) { console.error('usage: node tools/live/live_thumbs.js <videoId>:<slot> ...'); process.exit(1); }
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'live', 'settings.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const doneFile = path.join(OUT, 'done.json');
  const done = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : {};
  const specs = [], todo = [];
  for (const [vid, slot] of pairs) {
    const sl = (settings.slots || {})[slot];
    if (!sl || !sl.event) { console.error(`slot ${slot}: no game`); continue; }
    if (done[vid]) continue;
    const [lgPath, lgName, sport] = LEAGUES[sl.league] || [];
    if (!lgPath) { console.error(`slot ${slot}: unknown league ${sl.league}`); continue; }
    let j;
    try { j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/${lgPath}/summary?event=${sl.event}`)).json(); }
    catch (e) { console.error(`slot ${slot}: ESPN ${e.message}`); continue; }
    const comp = j.header?.competitions?.[0];
    const by = (ha) => comp?.competitors?.find((c) => c.homeAway === ha)?.team || {};
    const home = by('home'), away = by('away');
    if (!home.abbreviation || !away.abbreviation) { console.error(`slot ${slot}: teams not found`); continue; }
    const soccer = sport === 'football';
    const [L, R] = soccer ? [home, away] : [away, home]; // soccer lists home first, US sports away @ home
    const short = (t) => t.shortDisplayName || t.name || t.abbreviation;
    specs.push({ id: vid, sport, format: 'video', tagText: lgName.toUpperCase(),
      thumb: { kicker: `${lgName} · live scoreboard`, big: 'LIVE', teams: [L.abbreviation, R.abbreviation],
        hook: `${short(L)} ${soccer ? 'v' : 'at'} *${short(R)}*`, sticker: 'Live now', emoji: '🔴' } });
    todo.push(vid);
  }
  if (!specs.length) { console.log('nothing to do'); return; }
  const f = path.join(OUT, '.spec.json');
  fs.writeFileSync(f, JSON.stringify(specs, null, 1));
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'make_thumbs.js'), f, OUT], { stdio: 'inherit', timeout: 120000 });
  fs.unlinkSync(f);
  for (const v of todo) fs.renameSync(path.join(OUT, `${v}.thumb.jpg`), path.join(OUT, `${v}.jpg`));
  console.log(`video_ids=${todo.join(',')}`);
})();
