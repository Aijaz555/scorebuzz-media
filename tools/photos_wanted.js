// Collects the venues of upcoming and recent games (ESPN) that have no stadium photo yet and writes
// photos/wanted.json; the "Stadium photos" GitHub Action then fetches freely licensed photos from
// Wikimedia Commons (the agent sandbox can't reach Commons). Usage: node tools/photos_wanted.js [daysBack] [daysAhead]
const fs = require('fs');
const path = require('path');
const LEAGUES = ['soccer/eng.1', 'soccer/esp.1', 'soccer/ita.1', 'soccer/fra.1', 'soccer/ger.1', 'soccer/usa.1', 'soccer/uefa.champions', 'soccer/uefa.europa',
  'football/nfl', 'football/college-football', 'basketball/nba', 'hockey/nhl', 'baseball/mlb'];
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
(async () => {
  const back = Number(process.argv[2] || 7), ahead = Number(process.argv[3] || 7);
  const dir = path.join(__dirname, '..', 'photos');
  const have = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'wanted.json' && f !== 'index.json').map((f) => f.replace(/\.json$/, '')));
  const want = new Map();
  for (const lg of LEAGUES) {
    for (let d = -back; d <= ahead; d++) {
      const ymd = new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
      let j; try { j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/${lg}/scoreboard?dates=${ymd}&limit=200${lg.includes('college') ? '&groups=80' : ''}`)).json(); } catch (e) { continue; }
      for (const ev of j.events || []) {
        const c = ev.competitions?.[0]; const v = c?.venue;
        if (!v?.fullName) continue;
        if (lg.includes('college') && !c.competitors.some((t) => (t.curatedRank?.current || 99) <= 25)) continue;
        const s = slug(v.fullName);
        if (!have.has(s)) want.set(s, { slug: s, name: v.fullName, city: v.address?.city || '', country: v.address?.country || '' });
      }
    }
  }
  fs.writeFileSync(path.join(dir, 'wanted.json'), JSON.stringify([...want.values()], null, 1) + '\n');
  console.log(`${want.size} venue(s) without a photo -> photos/wanted.json`);
})();
