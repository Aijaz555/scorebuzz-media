// Autopilot for an always-on server: for every chosen game it creates a YouTube broadcast with the
// game's own title/description/thumbnail, starts streaming the scoreboard `leadMinutes` before
// kick-off (YouTube auto-starts the broadcast when video arrives) and stops 20 min after the final
// (YouTube auto-stops it). Runs under pm2:
//   pm2 start tools/live/autopilot.js --name scorebuzz-live
//
// Two files:
//  - tools/live/live.settings.json  (in git, NO secrets) — which leagues/games to stream. Re-read every
//    minute, so changes pushed to GitHub take effect after tools/live/sync.sh pulls them.
//      { "leagues": [...], "leadMinutes": 30, "only": {"nba": ["LAL", ...]} | [...], "top25": 15,
//        "include": ["<event id>", ...],   // always stream these (if a key is free)
//        "exclude": ["<event id>", ...],   // never stream these; a running one is stopped
//        "paused": false }                 // true = start nothing new
//  - tools/live/live.config.json    (server only, git-ignored) — secrets:
//      { "keys": ["yt-key-1", {"youtube": "yt-key-2", "facebook": "fb-key"}],
//        "youtubeApi": {"clientId": "...", "clientSecret": "...", "refreshToken": "..."} }
//    Any setting can also be put here to override the git one.
// Status (running/finished/skipped games, errors) is written to tools/live/status/status.json;
// sync.sh pushes it to the `live-status` branch so it can be checked remotely.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const feed = require('./feed');
const yt = require('./youtube');

const SETTINGS = path.join(__dirname, 'live.settings.json');
const SECRETS = process.argv[2] || path.join(__dirname, 'live.config.json');
const STATUS_DIR = path.join(__dirname, 'status');
fs.mkdirSync(STATUS_DIR, { recursive: true });

const running = new Map(); // event id -> { key, proc, title, league, start, broadcast, startedAt }
const done = new Map();    // event id -> { title, result, at }
const errors = [];
const log = (...a) => console.log(new Date().toISOString(), ...a);
const err = (m) => { log(`ERROR ${m}`); errors.push({ at: new Date().toISOString(), m }); if (errors.length > 30) errors.shift(); };
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (fs.existsSync(f)) err(`${path.basename(f)}: ${e.message}`); return {}; } };

function config() {
  const s = { leagues: ['nba', 'nfl'], leadMinutes: 30, ...readJSON(SETTINGS) };
  const sec = readJSON(SECRETS);
  return { ...s, ...sec, keys: sec.keys || [] };
}

function thumbnailFor(g, league) {
  // designed thumbnail via make_thumbs.js (1280x720), e.g. "LIVE · LAL v SAC"
  try {
    const dir = path.join(STATUS_DIR, 'thumbs');
    fs.mkdirSync(dir, { recursive: true });
    const sport = { nba: 'nba', nfl: 'nfl', ncaaf: 'nfl', nhl: 'nhl', mlb: 'mlb' }[league] || 'football';
    const spec = [{ id: g.id, sport, format: 'video', tagText: league.toUpperCase(),
      thumb: { kicker: 'Live scoreboard', big: `${g.abbrs[0]} v ${g.abbrs[1]}`, hook: `${g.matchup.split(' vs ')[0].split(' ').pop()} vs *${g.matchup.split(' vs ')[1].split(' ').pop()}*`, sticker: 'Live now' } }];
    const f = path.join(dir, `${g.id}.json`);
    fs.writeFileSync(f, JSON.stringify(spec));
    execFileSync(process.execPath, [path.join(__dirname, '..', 'make_thumbs.js'), f, dir], { stdio: 'ignore', timeout: 60000 });
    return path.join(dir, `${g.id}.thumb.jpg`);
  } catch (e) { err(`thumbnail ${g.id}: ${e.message}`); return null; }
}

async function start(g, league, key, cfg) {
  const k = typeof key === 'string' ? { youtube: key } : key;
  let broadcast = null;
  if (cfg.youtubeApi?.refreshToken && k.youtube) {
    try {
      broadcast = await yt.createBroadcast(cfg.youtubeApi, { title: g.title, description: g.description, start: g.start, key: k.youtube, thumbnail: thumbnailFor(g, league) });
      log(`broadcast ${broadcast} created: ${g.title}`);
    } catch (e) { err(`broadcast for ${g.matchup}: ${e.message} (streaming anyway)`); }
  }
  const dest = [...(k.youtube ? ['--key', k.youtube] : []), ...(k.facebook ? ['--fb-key', k.facebook] : [])];
  log(`START ${g.title}`);
  const proc = spawn(process.execPath, [path.join(__dirname, 'stream.js'), '--league', league, '--event', g.id, ...dest], { stdio: 'inherit' });
  running.set(g.id, { key, proc, title: g.title, league, start: g.start, broadcast, startedAt: new Date().toISOString() });
  proc.on('exit', (c) => {
    const r = running.get(g.id);
    log(`END ${g.matchup} (${c})`);
    running.delete(g.id);
    done.set(g.id, { title: g.title, broadcast: r?.broadcast, result: r?.stopped ? 'stopped (excluded)' : c === 0 ? 'finished' : `exited ${c}`, at: new Date().toISOString() });
  });
}

async function tick() {
  const cfg = config();
  const lead = (cfg.leadMinutes ?? 30) * 60000;
  const include = new Set((cfg.include || []).map(String));
  const exclude = new Set((cfg.exclude || []).map(String));
  const upcoming = [];
  // stop anything that was excluded while running
  for (const [id, r] of running) if (exclude.has(id) && !r.stopped) { r.stopped = true; log(`STOP ${r.title} (excluded)`); r.proc.kill('SIGTERM'); }
  for (const league of cfg.leagues || []) {
    let games = [];
    try { games = await feed.list(league); } catch (e) { err(`${league}: ${e.message}`); continue; }
    const only = Array.isArray(cfg.only) ? cfg.only : cfg.only?.[league];
    for (const g of games) {
      if (running.has(g.id) || done.has(g.id) || g.state === 'post' || exclude.has(g.id)) continue;
      const picked = include.has(g.id) || (
        (!only?.length || only.some((a) => g.abbrs.map((x) => x.toUpperCase()).includes(a.toUpperCase()))) &&
        !(league === 'ncaaf' && cfg.top25 && g.rank > cfg.top25));
      if (!picked) continue;
      if (new Date(g.start) - Date.now() > lead) { upcoming.push({ id: g.id, league, title: g.title, start: g.start }); continue; }
      if (cfg.paused) continue;
      const busy = new Set([...running.values()].map((r) => JSON.stringify(r.key)));
      const key = cfg.keys.find((k) => !busy.has(JSON.stringify(k)));
      if (!key) { err(`no free stream key for ${g.matchup}, skipped`); done.set(g.id, { title: g.title, result: 'skipped: no free key', at: new Date().toISOString() }); continue; }
      await start(g, league, key, cfg);
    }
  }
  const status = {
    updated: new Date().toISOString(), paused: !!cfg.paused, keys: cfg.keys.length, youtubeApi: !!cfg.youtubeApi?.refreshToken,
    running: [...running].map(([id, r]) => ({ id, league: r.league, title: r.title, start: r.start, startedAt: r.startedAt, broadcast: r.broadcast })),
    upcoming: upcoming.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 30),
    finished: [...done].slice(-30).map(([id, d]) => ({ id, ...d })),
    errors,
  };
  fs.writeFileSync(path.join(STATUS_DIR, 'status.json'), JSON.stringify(status, null, 2));
}

const c0 = config();
log(`autopilot: ${(c0.leagues || []).join(', ')} · ${c0.keys.length} stream key(s) · YouTube API ${c0.youtubeApi?.refreshToken ? 'on' : 'off'}`);
const loop = async () => { try { await tick(); } catch (e) { err(`tick: ${e.message}`); } };
loop(); setInterval(loop, 60000);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { for (const r of running.values()) r.proc.kill('SIGTERM'); setTimeout(() => process.exit(0), 5000); });
