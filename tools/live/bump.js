// YouTube refused a start ("User has too many live or scheduled broadcasts") or the cap is hit: pick the stream to give up.
// Owner (18 Nov 2026): never drop NHL; drop only the lowest-ranked NBA game (lowest average team win %), and only one that
// ranks below the refused game when that one is NBA too.
//
//   node tools/live/bump.js <refused slot> [--skip <slots already dropped, comma-separated>]
//
// Reads docs/live/settings.json (slots → games) and ESPN (records). Prints {"drop": {"slot", "project", "matchup", "winPct"}}
// or {"drop": null, "reason": ...}. Then: livereacting_stop_stream (LIVE/PREPARING) or livereacting_cancel_schedules
// (SCHEDULED) on that project, start the refused one, and note "bump: Slot N <matchup> for Slot M <matchup>" in the commit.
const fs = require('fs');
const path = require('path');
const feed = require('./feed');
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'live', 'settings.json'), 'utf8'));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const refused = String(process.argv[2] || '');
const skip = new Set(String(arg('--skip') || '').split(',').filter(Boolean));
const FILL = (settings.streams && settings.streams.fill) || [];      // free-slot leagues (27 Nov 2026) are given up before any NBA game
const DROPPABLE = ['nba', ...FILL];
(async () => {
  const slots = { ...(settings.slots || {}), ...(settings.pin ? { main: settings.pin } : {}) };
  const cache = {};
  const ymd = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
  async function game(a) {
    if (!a) return null;
    for (const d of [ymd(Date.now() - 86400e3), ymd(Date.now()), ymd(Date.now() + 86400e3)]) {
      const k = `${a.league}:${d}`;
      if (!cache[k]) cache[k] = await feed.list(a.league, d).catch(() => []);
      const g = cache[k].find((x) => String(x.id) === String(a.event));
      if (g) return g;
    }
    return null;
  }
  const want = await game(slots[refused]);
  if (!want) return console.log(JSON.stringify({ drop: null, reason: `no game assigned to slot ${refused}` }));
  const cands = [];
  for (const [k, a] of Object.entries(slots)) {
    if (k === refused || skip.has(k) || !DROPPABLE.includes(a.league)) continue;
    const g = await game(a);
    if (!g || g.state === 'post') continue;
    if (FILL.includes(want.league) && !FILL.includes(g.league)) continue;      // a free-slot game never pushes out an NBA game
    if (want.league === g.league && (g.winPct ?? 0.5) >= (want.winPct ?? 0.5)) continue;
    cands.push({ fill: FILL.includes(g.league) ? 1 : 0, slot: k, project: k === 'main' ? 'ScoreBuzz Main' : `Slot ${k}`, matchup: g.matchup, winPct: g.winPct, state: g.state });
  }
  cands.sort((a, b) => b.fill - a.fill || a.winPct - b.winPct || (a.state === 'pre') - (b.state === 'pre'));
  console.log(JSON.stringify({ refused: { slot: refused, matchup: want.matchup, league: want.league, winPct: want.winPct }, drop: cands[0] || null, reason: cands[0] ? undefined : 'no lower-ranked NBA game to drop' }, null, 1));
})();
