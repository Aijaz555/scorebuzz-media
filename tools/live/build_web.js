// Builds a server-free version of the live scoreboard: one static HTML page that reads ESPN directly
// from the browser (ESPN's API allows cross-origin requests). Host it anywhere (GitHub Pages, githack)
// and point a cloud streaming studio's "Web page" layer at it — no VPS, no OBS, no stream keys.
//   node tools/live/build_web.js        → docs/live/index.html
//
// URL parameters:
//   ?league=nba&event=<ESPN id>                one fixed game (same as the server version)
//   ?auto=1&leagues=nba,nhl[&teams=LAL,GS]     autopilot: always shows the best game right now —
//                                              a live game (teams list first, then the closest score),
//                                              otherwise the next one to start; holds a final for 15 min.
//   ?auto=1&leagues=ncaaf&top25=10             college: only games with a team ranked 10 or better
const fs = require('fs');
const path = require('path');

const feedSrc = fs.readFileSync(path.join(__dirname, 'feed.js'), 'utf8');
let page = fs.readFileSync(path.join(__dirname, 'overlay.html'), 'utf8');

const feedBundle = `
const FEED = (function () {
  const module = { exports: {} };
  const require = () => ({});
  const process = { env: {} };
  const fetch = (url) => window.fetch(url, { cache: 'no-store' }); // plain GET: no custom headers, no CORS preflight
  ${feedSrc}
  return module.exports;
})();
`;

const autoPick = `
// ---- autopilot game picker (static version) ----
// ?slot=N: a reusable "game slot" for a studio project. The game shown comes from settings.json
// "slots": {"1": {"league": "ncaaf", "event": "401858291"}, ...}, so a project's web layer never
// has to change: Claude sets the slot's game in git, retitles the project and schedules it via API.
const SLOT = q.get('slot');
const AUTO = q.get('auto') === '1' || !!SLOT;
let AUTO_LEAGUES = (q.get('leagues') || q.get('league') || 'nba').split(',').filter(Boolean);
let AUTO_TEAMS = (q.get('teams') || '').toUpperCase().split(',').filter(Boolean);
let AUTO_TOP = Number(q.get('top25') || 0);
let PIN = null;
// Remote control: in auto mode the page also reads ./settings.json next to it (committed to GitHub),
// so leagues/teams can be changed or a game pinned without touching the streaming studio.
//   { "leagues": ["nba","nfl"], "teams": ["LAL"], "top25": 10, "pin": {"league": "nba", "event": "401..."} | null }
async function loadSettings() {
  if (q.has('noremote')) return;
  try {
    const r = await window.fetch('https://raw.githubusercontent.com/Aijaz555/scorebuzz-media/main/docs/live/settings.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const c = await r.json();
    if (Array.isArray(c.leagues) && c.leagues.length) AUTO_LEAGUES = c.leagues;
    if (Array.isArray(c.teams)) AUTO_TEAMS = c.teams.map((t) => String(t).toUpperCase());
    if (c.top25 !== undefined) AUTO_TOP = Number(c.top25) || 0;
    PIN = c.pin && c.pin.event ? c.pin : null;
    // remote screen fitting for the streaming studio: {"fit": {"w": 1910, "h": 1070, "x": 0, "y": 0, "fit": "fill", "debug": true}}
    window.__fitRemote = c.fit || {}; if (window.__fit) window.__fit();
    // remote reload: bump "reload" in settings.json and every open stream page reloads itself (picks up new code)
    if (window.__reloadSeen === undefined) window.__reloadSeen = c.reload ?? null;
    else if ((c.reload ?? null) !== window.__reloadSeen) location.reload();
    if (SLOT) { const sl = (c.slots || {})[SLOT]; PIN = sl && sl.event ? sl : null; }
  } catch (e) { /* keep URL settings */ }
}
let finalSince = 0;
async function pickGame() {
  const all = [];
  for (const lg of AUTO_LEAGUES) {
    const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
    for (const day of [undefined, ymd(new Date()), ymd(new Date(Date.now() + 86400e3))]) {   // ESPN's current day, today and tomorrow (ET)
      try { for (const g of await FEED.list(lg, day)) if (!all.some((x) => x.id === g.id)) all.push({ ...g, league: lg }); } catch (e) { /* no games */ }
    }
  }
  const ok = all.filter((g) => !(g.league === 'ncaaf' && AUTO_TOP && g.rank > AUTO_TOP));
  const fav = (g) => AUTO_TEAMS.length && g.abbrs.some((a) => AUTO_TEAMS.includes(String(a).toUpperCase()));
  const live = ok.filter((g) => g.state === 'in');
  if (live.length) {
    live.sort((a, b) => (fav(b) - fav(a)) || (a.rank - b.rank));
    return live[0];
  }
  const pre = ok.filter((g) => g.state === 'pre').sort((a, b) => a.start.localeCompare(b.start));
  const soonFav = pre.find((g) => fav(g) && new Date(g.start) - Date.now() < 3 * 3600e3);
  return soonFav || pre[0] || ok.filter((g) => g.state === 'post').pop() || null;
}
async function autoTick() {
  await loadSettings();
  if (PIN && (PIN.event !== event || PIN.league !== league)) { league = PIN.league; event = String(PIN.event); G = null; finalSince = 0; tickKey = ''; poll(); return; }
  if (PIN) return;
  if (SLOT) { if (!event) $('app').innerHTML = '<div class="err">ScoreBuzz live scoreboard · next game coming up</div>'; return; }
  const cur = G && G.id === event ? G : null;
  if (cur && cur.state === 'in') {
    finalSince = 0;
    // stay on a live game, unless it isn't a favourite and a favourite game is live now
    const isFav = AUTO_TEAMS.length && [cur.home.abbr, cur.away.abbr].some((a) => AUTO_TEAMS.includes(String(a).toUpperCase()));
    if (isFav || !AUTO_TEAMS.length) return;
    const better = await pickGame();
    if (better && better.state === 'in' && better.id !== event && better.abbrs.some((a) => AUTO_TEAMS.includes(String(a).toUpperCase()))) { league = better.league; event = better.id; G = null; tickKey = ''; poll(); }
    return;
  }
  if (cur && cur.state === 'post') { if (!finalSince) finalSince = Date.now(); if (Date.now() - finalSince < 15 * 60000) return; }
  const g = await pickGame();
  if (g && (g.id !== event || g.league !== league)) { league = g.league; event = g.id; G = null; finalSince = 0; tickKey = ''; poll(); }
}
`;

// fixed game → let (auto mode switches games)
page = page.replace("const league = q.get('league'), event = q.get('event');", "let league = q.get('league'), event = q.get('event');");
page = page.replace(/const r = await fetch\(`\/api\/game\?league=\$\{encodeURIComponent\(league\)\}&event=\$\{encodeURIComponent\(event\)\}`\);\s*const g = await r\.json\(\);/,
  'if (!event) return;\n    const g = await FEED.game(league, event);');
page = page.replace('poll(); setInterval(poll, 5000);', 'if (AUTO) { autoTick().then(poll); setInterval(autoTick, 60000); } else poll();\nsetInterval(poll, 5000);');
page = page.replace('<script>\nconst q = new URLSearchParams(location.search);', `<script>${feedBundle}\nconst q = new URLSearchParams(location.search);`);
page = page.replace('\nasync function poll() {', `${autoPick}\nasync function poll() {`);

for (const must of ['FEED.game(league, event)', 'let league', 'autoTick', 'const FEED']) {
  if (!page.includes(must)) { console.error(`build failed: overlay.html changed, could not patch "${must}"`); process.exit(1); }
}
const out = path.join(__dirname, '..', '..', 'docs', 'live', 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
// index.html is a tiny loader: it fetches the real page (app.html) straight from raw.githubusercontent.com,
// so code updates reach running streams on the next reload instead of waiting for the host's cache.
fs.writeFileSync(path.join(path.dirname(out), 'app.html'), page);
fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><title>ScoreBuzz live</title></head><body style="margin:0;background:#0A0E1E">
<script>
(function () {
  var src = 'https://raw.githubusercontent.com/Aijaz555/scorebuzz-media/main/docs/live/app.html?t=' + Date.now();
  function go(html) { document.open(); document.write(html); document.close(); }
  fetch(src, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(go)
    .catch(function () { setTimeout(function () { location.reload(); }, 15000); });
})();
</script></body></html>
`);
const settings = path.join(path.dirname(out), 'settings.json');
if (!fs.existsSync(settings)) fs.writeFileSync(settings, JSON.stringify({ leagues: ['nfl', 'ncaaf', 'nba', 'nhl', 'ucl', 'epl'], teams: ['LAL', 'GS', 'NYK', 'BOS', 'PHI', 'KC', 'DAL', 'ARS', 'LIV', 'MNC'], top25: 15, pin: null }, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(page.length / 1024)} KB)`);
