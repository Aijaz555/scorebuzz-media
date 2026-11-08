// Match-day table videos (owner's request, 8 Nov 2026): which leagues have finished ALL of today's games and still
// need their "table updated today" video? Used by the scheduled task "ScoreBuzz match-day table videos".
// Usage: node tools/matchday_check.js                 -> prints READY <league> <YYYYMMDD> lines (and WAIT/DONE info)
//        node tools/matchday_check.js --mark <league> <YYYYMMDD> <note>   -> records a video as uploaded/scheduled
// Log: videos/matchday_log.json [{ league, date, note, at }]
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, '..', 'videos', 'matchday_log.json');
const LEAGUES = { epl: 'eng.1', laliga: 'esp.1', seriea: 'ita.1', bundesliga: 'ger.1', ligue1: 'fra.1' };
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
const a = process.argv.slice(2);
if (a[0] === '--mark') {
  log.push({ league: a[1], date: a[2], note: a.slice(3).join(' '), at: new Date().toISOString() });
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.log('marked', a[1], a[2]);
  process.exit(0);
}
const ukDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).replace(/-/g, '');
(async () => {
  const now = new Date();
  const dates = [ukDate(new Date(now - 864e5)), ukDate(now)];
  for (const [key, espn] of Object.entries(LEAGUES)) {
    for (const date of dates) {
      if (log.some((x) => x.league === key && x.date === date)) { console.log(`DONE  ${key} ${date}`); continue; }
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${espn}/scoreboard?dates=${date}`);
      if (!r.ok) { console.log(`ERROR ${key} ${date} ESPN ${r.status}`); continue; }
      const ev = ((await r.json()).events || []).filter((e) => ukDate(new Date(e.date)) === date && !/POSTPONED|CANCELED/.test(e.status.type.name));
      if (!ev.length) continue;
      const open = ev.filter((e) => !e.status.type.completed);
      const lastKo = ev.map((e) => e.date).sort().pop();
      const hoursSince = (now - new Date(lastKo)) / 36e5;
      if (open.length) console.log(`WAIT  ${key} ${date} ${open.map((e) => `${e.shortName} ${e.status.type.shortDetail}`).join(', ')}`);
      else if (hoursSince > 30) console.log(`OLD   ${key} ${date} (finished long ago, skipped)`);
      else console.log(`READY ${key} ${date} ${ev.length} games, last kick-off ${lastKo}`);
    }
  }
})();
