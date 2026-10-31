// Autopilot for an always-on server: starts a scoreboard stream for every game in the
// configured leagues shortly before it begins, using a pool of YouTube stream keys.
//   node tools/live/autopilot.js tools/live/live.config.json
//
// live.config.json:
// {
//   "leagues": ["nba", "nfl", "epl"],
//   "leadMinutes": 15,                       // go live this long before the start
//   "keys": ["key-1", "key-2", "key-3"],      // one key per stream running at the same time
//   "only": ["LAL", "GS", "NYK"]              // optional: only games involving these team abbreviations
// }
// Each key must belong to a YouTube broadcast that starts automatically when video arrives
// (YouTube Studio > Go live > Manage > Schedule stream > "Enable auto-start"). Creating those
// broadcasts automatically, with the right title per game, needs the YouTube Data API:
// see docs in LIVE.md.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const feed = require('./feed');

const cfg = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, 'live.config.json'), 'utf8'));
const lead = (cfg.leadMinutes ?? 15) * 60000;
const running = new Map(); // event id -> { key, proc }
const done = new Set();
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function tick() {
  for (const league of cfg.leagues) {
    let games = [];
    try { games = await feed.list(league); } catch (e) { log(`${league}: ${e.message}`); continue; }
    for (const g of games) {
      if (running.has(g.id) || done.has(g.id) || g.state === 'post') continue;
      if (new Date(g.start) - Date.now() > lead) continue;
      if (cfg.only?.length && !cfg.only.some((a) => g.title.toUpperCase().includes(a.toUpperCase()))) continue;
      const busy = new Set([...running.values()].map((r) => r.key));
      const key = cfg.keys.find((k) => !busy.has(k));
      if (!key) { log(`no free stream key for ${g.matchup}, skipped`); done.add(g.id); continue; }
      log(`START ${g.title}`);
      log(`  description:\n${g.description}`);
      const proc = spawn(process.execPath, [path.join(__dirname, 'stream.js'), '--league', league, '--event', g.id, '--key', key], { stdio: 'inherit' });
      running.set(g.id, { key, proc });
      proc.on('exit', (c) => { log(`END ${g.matchup} (${c})`); running.delete(g.id); done.add(g.id); });
    }
  }
}

log(`autopilot: ${cfg.leagues.join(', ')} · ${cfg.keys.length} stream key(s)`);
tick(); setInterval(tick, 60000);
