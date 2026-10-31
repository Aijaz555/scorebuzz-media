// List games for one or more leagues, with ESPN event ids, start times and a ready-made
// YouTube title + description for each stream.
//   node tools/live/games.js nba nfl epl [--date YYYYMMDD] [--json]
const feed = require('./feed');

const args = process.argv.slice(2);
const di = args.indexOf('--date');
const date = di >= 0 ? args[di + 1] : undefined;
const json = args.includes('--json');
const leagues = args.filter((a, i) => !a.startsWith('--') && !(di >= 0 && i === di + 1));

const t = (d, tz) => new Date(d).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' });

(async () => {
  const all = [];
  for (const l of leagues.length ? leagues : ['nba', 'nfl', 'nhl', 'epl', 'ucl']) {
    try { all.push(...(await feed.list(l, date))); } catch (e) { console.error(`${l}: ${e.message}`); }
  }
  all.sort((a, b) => new Date(a.start) - new Date(b.start));
  if (json) return console.log(JSON.stringify(all, null, 2));
  for (const g of all) {
    console.log(`${g.league.padEnd(6)} ${g.id.padEnd(11)} ${t(g.start, 'America/New_York')} ET | ${t(g.start, 'Europe/London')} UK | ${t(g.start, 'Asia/Karachi')} PKT  [${g.state}]`);
    console.log(`       ${g.title}`);
  }
})();
