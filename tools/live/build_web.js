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
const AUTO = q.get('auto') === '1';
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
    const r = await window.fetch('settings.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const c = await r.json();
    if (Array.isArray(c.leagues) && c.leagues.length) AUTO_LEAGUES = c.leagues;
    if (Array.isArray(c.teams)) AUTO_TEAMS = c.teams.map((t) => String(t).toUpperCase());
    if (c.top25 !== undefined) AUTO_TOP = Number(c.top25) || 0;
    PIN = c.pin && c.pin.event ? c.pin : null;
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
  const cur = G && G.id === event ? G : null;
  if (cur && cur.state === 'in') { finalSince = 0; return; }
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
fs.writeFileSync(out, page);
const settings = path.join(path.dirname(out), 'settings.json');
if (!fs.existsSync(settings)) fs.writeFileSync(settings, JSON.stringify({ leagues: ['nfl', 'ncaaf', 'nba', 'nhl', 'ucl', 'epl'], teams: ['LAL', 'GS', 'NYK', 'BOS', 'PHI', 'KC', 'DAL', 'ARS', 'LIV', 'MNC'], top25: 15, pin: null }, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(page.length / 1024)} KB)`);
