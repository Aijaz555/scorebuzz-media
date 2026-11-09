// End watcher: polls ESPN for the games assigned to ScoreBuzz Main (settings.pin) and the Slots (settings.slots) and
// returns as soon as one of them is over, so the hourly stream manager can stop that stream within a few minutes of
// the final whistle instead of at the next hourly run (owner, 9 Nov 2026: no more than ~10-15 min after the game ends).
//
//   node tools/live/watch_ends.js [--max <minutes, default 9>] [--every <seconds, default 60>] [--skip main,3,...]
//
// Prints one JSON line and exits:
//   {"ended":[{"slot":"3","project":"Slot 3","matchup":"...","status":"STATUS_FINAL"}], "live": n}  → stop those projects
//   {"ended":[], "live": 0, "idle": true}   → no assigned game is in progress: nothing left to watch this run
//   {"ended":[], "live": n, "timeout": true} → still going; call again (each call stays under the 10-min Bash limit)
// --skip: slots already handled this run (or whose project is not running), so they are not reported again.
const fs = require('fs');
const path = require('path');
const feed = require('./feed');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const maxMs = Number(arg('--max', 9)) * 60e3;
const every = Number(arg('--every', 60)) * 1e3;
const skip = new Set(String(arg('--skip', '')).split(',').filter(Boolean));
const OFF = /CANCELED|CANCELLED|POSTPONED|ABANDONED|FORFEIT/;
const SETTINGS = process.env.LIVE_SETTINGS || path.join(__dirname, '..', '..', 'docs', 'live', 'settings.json');

const ymd = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  const assigned = Object.entries({ ...(s.slots || {}), ...(s.pin ? { main: s.pin } : {}) })
    .filter(([k, a]) => a && a.league && a.event && !skip.has(k))
    .map(([k, a]) => {
      const iso = (/(\d{4}-\d\d-\d\dT[\d:]+Z)/.exec(a.note || '') || [])[1];
      const t = iso ? Date.parse(iso) : Date.now();
      return { slot: k, project: k === 'main' ? 'ScoreBuzz Main' : `Slot ${k}`, league: a.league, event: String(a.event), days: [...new Set([ymd(t), ymd(Date.now())])] };
    });
  const t0 = Date.now();
  for (;;) {
    const cache = new Map();
    const ended = [];
    let live = 0;
    for (const a of assigned) {
      let g = null;
      for (const day of a.days) {
        const key = `${a.league}:${day}`;
        if (!cache.has(key)) cache.set(key, feed.list(a.league, day).catch(() => []));
        g = (await cache.get(key)).find((x) => String(x.id) === a.event);
        if (g) break;
      }
      if (!g) continue;
      if (g.state === 'post' || OFF.test(g.status)) ended.push({ slot: a.slot, project: a.project, matchup: g.matchup, status: g.status });
      else if (g.state === 'in') live++;
    }
    if (ended.length) { console.log(JSON.stringify({ ended, live })); return; }
    if (!live) { console.log(JSON.stringify({ ended, live, idle: true })); return; }
    if (Date.now() - t0 + every > maxMs) { console.log(JSON.stringify({ ended, live, timeout: true })); return; }
    await sleep(every);
  }
})();
