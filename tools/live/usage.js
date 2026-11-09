// Weekly streaming hours vs the LiveReacting fair-use cap (Large plan: 680 h/week, 15 concurrent; agreed 9 Nov 2026).
//
//   node tools/live/usage.js <broadcasts.json> [<status.json>]
//
// broadcasts.json = { "<project name>": <livereacting_list_broadcasts result or its broadcasts array>, ... }
// status.json     = optional { "<project name>": <livereacting_get_stream_status result> } for streams running now
// Week = Monday 00:00 UTC to now (also reports the rolling last 7 days, in case LiveReacting counts that way).
// Prints JSON with hours used, the cap, % used, a straight-line projection for the week, and level ok / warn (>=80%
// used) / over (>=100%).
const fs = require('fs');

const CAP = Number(process.env.WEEK_CAP_HOURS || 680);
const now = process.env.USAGE_NOW ? Date.parse(process.env.USAGE_NOW) : Date.now();
const d = new Date(now);
const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
const last7 = now - 7 * 86400e3;

const read = (f) => (f ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
const bc = read(process.argv[2]);
const st = read(process.argv[3]);
if (!process.argv[2]) { console.error('usage: node tools/live/usage.js broadcasts.json [status.json]'); process.exit(1); }

// seconds of [a, b] that fall after `from`
const within = (a, b, from) => Math.max(0, (b - Math.max(a, from)) / 1000);
let week = 0, rolling = 0;
const perProject = {};
for (const [name, v] of Object.entries(bc)) {
  const list = Array.isArray(v) ? v : v.broadcasts || [];
  let w = 0;
  for (const b of list) {
    const a = Date.parse(b.date);
    const e = b.endedAt ? Date.parse(b.endedAt) : a + (b.duration || 0) * 1000;
    w += within(a, e, monday);
    rolling += within(a, e, last7);
  }
  week += w;
  perProject[name] = +(w / 3600).toFixed(1);
}
for (const [name, s] of Object.entries(st)) {   // streams running right now count up to `now`
  if (!s || !/LIVE|PREPARING/.test(s.status || s.liveStatus || '')) continue;
  const started = Date.parse(s.startedAt || s.liveStartedAt || (s.destinations || []).map((x) => x.startedAt).find(Boolean) || '');
  if (!started) continue;
  week += within(started, now, monday);
  rolling += within(started, now, last7);
  perProject[name] = +((perProject[name] || 0) + within(started, now, monday) / 3600).toFixed(1);
}
const h = week / 3600;
const elapsedDays = Math.max((now - monday) / 86400e3, 0.25);
const projected = (h / elapsedDays) * 7;
const used = h / CAP;
console.log(JSON.stringify({
  now: new Date(now).toISOString(),
  weekStart: new Date(monday).toISOString(),
  hoursThisWeek: +h.toFixed(1),
  hoursLast7Days: +(rolling / 3600).toFixed(1),
  cap: CAP,
  percentUsed: Math.round(used * 100),
  projectedWeek: Math.round(projected),
  level: used >= 1 ? 'over' : used >= 0.8 ? 'warn' : 'ok',   // projection is informational only (weekends are heavy)
  perProject,
}, null, 1));
