// Stream manager planner: decides which LiveReacting project streams which game, so every game in the
// chosen leagues gets its own stream that starts `leadMinutes` before kick-off and ends when it is over.
// Claude runs this every hour (scheduled task) and then carries out the actions with the LiveReacting tools.
//
//   node tools/live/plan_streams.js projects.json [--write]
//
// projects.json = the raw result of livereacting_list_projects ({"projects": [...]}) or just the array.
// Projects named "ScoreBuzz Main" (web page ?auto=1, steered by settings.pin) and "Slot N" (web page ?slot=N,
// steered by settings.slots[N]) form the pool. --write saves the new assignments to docs/live/settings.json.
//
// Prints JSON: { actions: [...], skipped: [...], pool: {...} }. Action types, in the order to run them:
//   stop      livereacting_stop_stream(projectId)             game is over (or cancelled)
//   cancel    livereacting_cancel_schedules(projectId)        scheduled for a game that is off
//   restart   livereacting_update_project(duration) + start   stream ended early but the game is still on
//   assign    commit+push settings.json FIRST, then livereacting_update_project(projectId, title, description,
//             duration) and either livereacting_schedule_stream(projectId, [at]) or, if at = "now",
//             livereacting_start_stream(projectId)
const fs = require('fs');
const path = require('path');
const feed = require('./feed');

const SETTINGS = path.join(__dirname, '..', '..', 'docs', 'live', 'settings.json');
const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
const cfg = {
  // priority order: when there are more games than projects, earlier leagues win
  leagues: ['nfl', 'nba', 'epl', 'ucl', 'ncaaf', 'nhl', 'laliga', 'seriea', 'ligue1', 'mls', 'mlb'],
  leadMinutes: 30,
  lookaheadMinutes: 95,                         // plan streams that start before the next hourly run (+ margin)
  ncaafTop: 10,                                 // college: only games with a top-10 team
  // planned stream length after kick-off, in hours (generous: overtime; the hourly run stops it early when it ends)
  hours: { nfl: 4, ncaaf: 4.5, nba: 3.25, nhl: 3.25, mlb: 3.75, soccer: 2.25 },
  ...(settings.streams || {}),
};
const now = process.env.PLAN_NOW ? Date.parse(process.env.PLAN_NOW) : Date.now();
const MIN = 60000;
const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z');
const favs = (settings.teams || []).map((t) => String(t).toUpperCase());

function hoursFor(league) {
  return cfg.hours[league] ?? (feed.LEAGUES[league]?.soccer ? cfg.hours.soccer : 3.5);
}

// per-sport music: a freshly shuffled copy of that sport's playlist for the project's Music layer
function musicFor(g, key) {
  const M = settings.music || {};
  const sport = feed.LEAGUES[g.league]?.soccer ? 'soccer' : g.league;
  const list = Object.entries((M.playlists || {})[(M.sports || {})[sport]] || {});
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const layerId = (M.layers || {})[key];
  return list.length && layerId ? { layerId, volume: M.volume ?? 3, titles: list.map((x) => x[0]), files: list.map((x) => ({ fileId: x[1] })) } : null;
}

function describe(g, music) {
  const t = new Date(g.start);
  const et = t.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const uk = t.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const lines = g.description.split('\n');
  lines.splice(1, 0, `Start: ${et} ET / ${uk} UK.`);
  const kevin = (music?.titles || []).filter((t) => !t.startsWith('ScoreBuzz'));
  if (kevin.length) lines.push('', 'Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/):', kevin.join(' · '));
  return lines.join('\n');
}

async function games(extra) {
  const out = new Map();
  const ymd = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
  for (const lg of [...new Set([...cfg.leagues, ...extra])]) {
    if (!feed.LEAGUES[lg]) continue;
    for (const day of [ymd(now - 86400e3), ymd(now), ymd(now + 86400e3)]) {
      try { for (const g of await feed.list(lg, day)) out.set(`${lg}:${g.id}`, g); } catch (e) { /* no games / ESPN hiccup */ }
    }
  }
  return out;
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/live/plan_streams.js projects.json [--write]'); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const projects = (Array.isArray(raw) ? raw : raw.projects || []).map((p) => {
    const m = /^slot\s*(\d+)$/i.exec(String(p.name).trim());
    const key = /^scorebuzz main$/i.test(String(p.name).trim()) ? 'main' : m ? m[1] : null;
    return key ? { ...p, key } : null;
  }).filter(Boolean);

  const slots = { ...(settings.slots || {}) };
  // also look up leagues of games already on a project (e.g. a pinned Europa League match) so they can be stopped
  const all = await games([settings.pin, ...Object.values(slots)].filter(Boolean).map((a) => a.league));
  const getA = (k) => (k === 'main' ? settings.pin : slots[k]) || null;
  const setA = (k, v) => { if (k === 'main') settings.pin = v; else if (v) slots[k] = v; else delete slots[k]; };

  const actions = [];
  const busy = new Set();     // game keys already covered by a project
  const free = [];
  const OFF = /CANCELED|CANCELLED|POSTPONED|ABANDONED|FORFEIT/;
  for (const p of projects) {
    const a = getA(p.key);
    const gk = a ? `${a.league}:${a.event}` : null;
    const g = gk ? all.get(gk) : null;
    const st = p.liveStatus;
    const running = st === 'LIVE' || st === 'PREPARING';
    const over = g && (g.state === 'post' || OFF.test(g.status));
    if (running) {
      if (over) { actions.push({ type: 'stop', projectId: p.id, project: p.name, reason: `${g.matchup} is over (${g.status})` }); setA(p.key, null); }
      else if (gk) busy.add(gk);   // still on (or a game we can't see: leave it alone)
      continue;
    }
    if (st === 'SCHEDULED' || p.scheduledLivesCount > 0) {
      if (over) { actions.push({ type: 'cancel', projectId: p.id, project: p.name, reason: `${g.matchup} is off (${g.status})` }); setA(p.key, null); }
      else if (gk) busy.add(gk);
      continue;
    }
    // offline with no schedule
    if (g && g.state === 'in') {
      const left = Math.max(60 * MIN, new Date(g.start).getTime() + hoursFor(g.league) * 3600e3 - now);
      actions.push({ type: 'restart', projectId: p.id, project: p.name, title: g.title, durationSec: Math.round(left / 1000), reason: `${g.matchup} still live, stream had ended` });
      busy.add(gk);
      continue;
    }
    if (g && g.state === 'pre') {     // assigned but never scheduled (failed run): reassign below
      setA(p.key, null);
    } else if (a) setA(p.key, null);
    free.push(p);
  }

  const fav = (g) => g.abbrs.some((x) => favs.includes(String(x).toUpperCase()));
  const pri = (g) => cfg.leagues.indexOf(g.league);
  const want = [...all.values()].filter((g) => {
    if (!cfg.leagues.includes(g.league) || busy.has(`${g.league}:${g.id}`) || OFF.test(g.status)) return false;
    if (g.league === 'ncaaf' && g.rank > cfg.ncaafTop) return false;
    if (g.state === 'in') return true;
    return g.state === 'pre' && new Date(g.start).getTime() - cfg.leadMinutes * MIN <= now + cfg.lookaheadMinutes * MIN;
  }).sort((a, b) => (b.state === 'in') - (a.state === 'in') || fav(b) - fav(a) || pri(a) - pri(b) || a.start.localeCompare(b.start));

  // slots first; Main last (it is the "best game" channel and falls back to auto when unassigned)
  free.sort((a, b) => (a.key === 'main') - (b.key === 'main') || Number(a.key) - Number(b.key));
  const skipped = [];
  for (const g of want) {
    const p = free.shift();
    if (!p) { skipped.push({ league: g.league, event: g.id, matchup: g.matchup, start: g.start }); continue; }
    const kick = new Date(g.start).getTime();
    const startAt = kick - cfg.leadMinutes * MIN;
    const endAt = kick + hoursFor(g.league) * 3600e3;
    const at = startAt - now > 4 * MIN ? iso(startAt) : 'now';
    const dur = Math.round((endAt - Math.max(now, startAt)) / 1000);
    setA(p.key, { league: g.league, event: g.id, note: `${g.matchup}, ${iso(kick)}` });
    const music = musicFor(g, p.key);
    actions.push({ type: 'assign', projectId: p.id, project: p.name, league: g.league, event: g.id, title: g.title, description: describe(g, music), durationSec: Math.min(dur, 8 * 3600 - 120), at,
      music: music && { layerId: music.layerId, volume: music.volume, files: music.files } });
  }

  settings.slots = Object.fromEntries(Object.entries(slots).sort((a, b) => Number(a[0]) - Number(b[0])));
  if (process.argv.includes('--write')) fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 1) + '\n');
  console.log(JSON.stringify({
    now: iso(now), actions, skipped,
    pool: { projects: projects.length, free_after: free.length },
    note: skipped.length ? `${skipped.length} game(s) had no free project: add more "Slot N" projects in LiveReacting` : undefined,
  }, null, 2));
})();
