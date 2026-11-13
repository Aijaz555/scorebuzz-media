// Grace period after the final whistle (owner, 13 Nov 2026): don't stop a stream the moment a game ends; keep it on
// air 10-15 min so viewers see the final score, then stop it. Shared by plan_streams.js and watch_ends.js.
//
// State (which games were seen in progress / final, and when) is kept in tools/live/status/ended.json (gitignored),
// so the planner and every watch_ends.js call in the same run agree on when a game ended.
//   - Seen in progress, then final        → ended ≈ first time seen final; stop `graceMinutes` (12) after that.
//   - Already final the first time we look (it ended in the gap between hourly runs, up to ~10 min earlier)
//                                          → stop `graceUnseenMinutes` (5) after that first look, so the total
//                                            stays inside ~10-15 min.
// Override in docs/live/settings.json: "streams": {"endGraceMinutes": 12, "endGraceUnseenMinutes": 5}.
const fs = require('fs');
const path = require('path');

const FILE = process.env.LIVE_END_STATE || path.join(__dirname, 'status', 'ended.json');
const MIN = 60000;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(s) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // forget games older than 2 days
  const cut = Date.now() - 2 * 24 * 3600e3;
  for (const [k, v] of Object.entries(s)) if ((v.final || v.live || 0) < cut) delete s[k];
  fs.writeFileSync(FILE, JSON.stringify(s, null, 1) + '\n');
}

function graceOf(settings) {
  const st = (settings && settings.streams) || {};
  return { seen: Number(st.endGraceMinutes ?? 12), unseen: Number(st.endGraceUnseenMinutes ?? 5) };
}

// Record what we see for game `key` ("league:event"). over = game finished/off. Returns
// { due: bool, stopAt: ms, final: ms } for finished games, null for games still on.
function observe(state, key, over, grace, now = Date.now()) {
  const e = state[key] || (state[key] = {});
  if (!over) { e.live = now; delete e.final; delete e.unseen; return null; }
  if (!e.final) {
    e.final = now;
    // "seen" only if we watched it in progress within the last few minutes (a poll ago, not an hour ago)
    e.unseen = !(e.live && now - e.live < 15 * MIN);
  }
  const stopAt = e.final + (e.unseen ? grace.unseen : grace.seen) * MIN;
  return { due: now >= stopAt, stopAt, final: e.final };
}

module.exports = { load, save, graceOf, observe, FILE };
