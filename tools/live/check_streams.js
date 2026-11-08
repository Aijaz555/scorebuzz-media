#!/usr/bin/env node
// Stream check for the hourly live manager (added 9 Nov 2026).
//   node tools/live/check_streams.js <videoId>:<slot> [<videoId>:<slot> ...] [--out <dir>]
// <slot> is the N of "Slot N" (or "main" for ScoreBuzz Main). For each stream it downloads YouTube's live
// preview frame (https://i.ytimg.com/vi/<id>/maxresdefault_live.jpg, refreshed by YouTube every few minutes)
// and prints one JSON line: {slot, videoId, expected, league, image} where expected is the game that
// docs/live/settings.json says the slot should show. The run then looks at each image and compares the
// matchup on screen with `expected` (team order on screen is home first, so either order counts as a match).
// Needs i.ytimg.com on the session's allowed network domains.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const args = process.argv.slice(2);
let out = path.join(require('os').tmpdir(), 'scorebuzz-stream-check');
const oi = args.indexOf('--out'); if (oi >= 0) { out = args[oi + 1]; args.splice(oi, 2); }
const pairs = args.map((a) => a.split(':')).filter((p) => p.length === 2 && /^[\w-]{11}$/.test(p[0]));
if (!pairs.length) { console.error('usage: node tools/live/check_streams.js <videoId>:<slot> ... [--out <dir>]'); process.exit(1); }
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/live/settings.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });
for (const [id, slot] of pairs) {
  const cfg = slot === 'main' ? settings.pin : (settings.slots || {})[slot];
  const expected = cfg && cfg.note ? cfg.note.replace(/,\s*\d{4}-\d\d-\d\dT.*$/, '') : null;
  const img = path.join(out, `${slot}_${id}.jpg`);
  let error = null;
  try {
    execFileSync('curl', ['-sSfL', '--max-time', '20', '-o', img, `https://i.ytimg.com/vi/${id}/maxresdefault_live.jpg?t=${Date.now()}`]);
    if (fs.statSync(img).size < 5000) error = 'preview image too small (stream may not be live yet)';
  } catch (e) { error = 'could not download preview: ' + String(e.message).split('\n')[0]; }
  console.log(JSON.stringify({ slot, videoId: id, expected, league: cfg && cfg.league || null, image: error ? null : img, error }));
}
