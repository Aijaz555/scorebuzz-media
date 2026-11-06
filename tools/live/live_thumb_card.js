// Eye-catching 1280x720 thumbnails for live scoreboard streams.
// Usage: node tools/live/live_thumb_card.js spec.json out_dir
// spec.json: [{ id, sport: football|nfl|nba|nhl|mlb, league: "PREMIER LEAGUE", venue: "<ESPN venue.fullName>" (stadium photo),
//               home: {name, abbr, logo}, away: {name, abbr, logo},   // per-game: big crests + VS
//               headline, sub,                                       // generic: no teams, big headline instead
//               theme: "pl" (Premier League palette: purple #37003C, pink #E90052, cyan #04F5FF, green #00FF85; league name
//               as plain text — never the official lion logo or the league's proprietary typeface), kickoff, note }]
// Look: stadium photo in the background (licence credit shown), dark vignette, huge red LIVE badge,
// glowing team crests, lime ScoreBuzz accents. Crests = ESPN team logos; photos = stadiums only, never people.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assets = require('../media_assets');

const ACCENT = { football: '#C6F432', nfl: '#4C8DFF', nba: '#FF8A3D', nhl: '#7FD1FF', mlb: '#FF4D5E' };
const ICON = { football: '⚽', nfl: '🏈', nba: '🏀', nhl: '🏒', mlb: '⚾' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function html(t) {
  const acc = ACCENT[t.sport] || '#C6F432';
  const ph = assets.photo(t.venue);
  const teams = t.home && t.away;
  const crest = async (x) => { const c = await assets.crest(x.logo); return c ? `<img src="${c}">` : `<b>${esc(x.abbr)}</b>`; };
  const nameSize = (n) => (String(n).length > 11 ? 54 : String(n).length > 8 ? 64 : 76);
  const centre = teams ? `
    <div class="vs">
      <div class="team"><div class="cr">${await crest(t.home)}</div><div class="nm" style="font-size:${nameSize(t.home.name)}px">${esc(t.home.name)}</div></div>
      <div class="v">VS</div>
      <div class="team"><div class="cr">${await crest(t.away)}</div><div class="nm" style="font-size:${nameSize(t.away.name)}px">${esc(t.away.name)}</div></div>
    </div>` : `
    <div class="gen"><div class="icon">${ICON[t.sport] || '🔴'}</div><div class="hl">${esc(t.headline || 'LIVE SCORES')}</div>
    <div class="gsub">${esc(t.sub || 'Score · Stats · Play-by-play')}</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1280px;height:720px;overflow:hidden;font-family:Inter,'Segoe UI',sans-serif;background:#05070d;color:#fff;position:relative}
  .bg{position:absolute;inset:0;background:${ph ? `url(${ph.src}) center/cover` : `radial-gradient(ellipse at 50% 60%,#1d2a4a,#05070d 70%)`};filter:saturate(1.25) contrast(1.1)}
  .shade{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,rgba(5,7,13,.35),rgba(5,7,13,.92) 75%),linear-gradient(180deg,rgba(5,7,13,.55),rgba(5,7,13,.2) 40%,rgba(5,7,13,.9))}
  .glow{position:absolute;left:50%;top:56%;width:900px;height:420px;transform:translate(-50%,-50%);background:radial-gradient(ellipse,${acc}55,transparent 65%);filter:blur(10px)}
  .top{position:absolute;left:36px;right:36px;top:42px;display:flex;justify-content:space-between;align-items:center}
  .logo{font-size:46px;font-weight:900;letter-spacing:-1.5px;text-shadow:0 4px 18px #000}.logo b{color:#C6F432}
  .live{display:flex;align-items:center;gap:14px;background:#E8112D;padding:12px 30px 12px 22px;border-radius:16px;font-size:58px;font-weight:900;letter-spacing:2px;box-shadow:0 0 0 6px #ffffff22,0 0 60px #E8112Dcc;transform:rotate(-3deg)}
  .live i{width:30px;height:30px;border-radius:50%;background:#fff;box-shadow:0 0 18px #fff}
  .lg{position:absolute;left:50%;top:128px;transform:translateX(-50%);background:${acc};color:#05070d;font-weight:900;font-size:30px;letter-spacing:3px;padding:8px 26px;border-radius:999px;white-space:nowrap;box-shadow:0 8px 30px #0008}
  .vs{position:absolute;left:0;right:0;top:200px;display:flex;justify-content:center;align-items:center;gap:40px}
  .team{width:440px;display:flex;flex-direction:column;align-items:center;gap:16px}
  .cr{width:250px;height:250px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 8px ${acc},0 0 70px ${acc}aa,0 20px 50px #000c}
  .cr img{width:76%;height:76%;object-fit:contain}.cr b{color:#05070d;font-size:84px;font-weight:900}
  .nm{font-weight:900;text-transform:uppercase;letter-spacing:-1px;line-height:1;text-align:center;text-shadow:0 4px 0 #000,0 0 30px #000}
  .v{font-size:120px;font-weight:900;font-style:italic;color:${acc};text-shadow:0 6px 0 #000,0 0 40px ${acc};margin-top:-70px}
  .gen{position:absolute;left:0;right:0;top:205px;text-align:center}
  .icon{font-size:96px;line-height:1;filter:drop-shadow(0 0 30px ${acc})}
  .hl{font-size:150px;font-weight:900;letter-spacing:-5px;line-height:.95;text-transform:uppercase;text-shadow:0 8px 0 #000,0 0 50px #000}
  .gsub{display:inline-block;margin-top:18px;font-size:40px;font-weight:900;color:#05070d;background:${acc};padding:8px 26px;border-radius:12px;text-transform:uppercase}
  .bar{position:absolute;left:0;right:0;bottom:0;height:62px;background:#000c;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;letter-spacing:1px}
  .bar b{color:#C6F432;margin-left:12px}
  .credit{position:absolute;right:10px;bottom:66px;font-size:12px;color:#fffa;text-shadow:0 1px 2px #000}
  ${t.theme === 'pl' ? `
  body{background:#37003C;font-family:'Inter Display',Inter,sans-serif}
  .bg{filter:saturate(.9) contrast(1.05)}
  .shade{background:radial-gradient(ellipse at 50% 50%,rgba(55,0,60,.25),rgba(38,0,42,.92) 78%),linear-gradient(180deg,rgba(55,0,60,.8),rgba(55,0,60,.35) 42%,rgba(30,0,34,.96))}
  .glow{background:radial-gradient(ellipse at 30% 50%,#E9005266,transparent 60%),radial-gradient(ellipse at 70% 50%,#04F5FF55,transparent 60%)}
  .live{background:#E90052;box-shadow:0 0 0 6px #ffffff22,0 0 60px #E90052cc}
  .lg{top:122px;background:linear-gradient(90deg,#04F5FF,#00FF85);color:#37003C;font-family:'Inter Display';font-weight:900;font-size:38px;letter-spacing:-.5px;padding:8px 30px;border-radius:12px;text-transform:none}
  .cr{box-shadow:0 0 0 8px #fff,0 0 0 16px #E90052,0 0 80px #04F5FFaa,0 20px 50px #000c}
  .v{color:#00FF85;text-shadow:0 6px 0 #37003C,0 0 40px #00FF85}
  .nm{font-family:'Inter Display'}
  .bar{background:#37003C;border-top:6px solid;border-image:linear-gradient(90deg,#E90052,#04F5FF,#00FF85) 1}
  .bar b{color:#00FF85}` : ''}
  .ko{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);display:flex;gap:14px;white-space:nowrap}
  .ko span{background:#fff;color:#37003C;font-weight:900;font-size:30px;padding:6px 20px;border-radius:10px;box-shadow:0 8px 24px #0009}
  .ko span.n{background:#E90052;color:#fff}
  </style></head><body>
  <div class="bg"></div><div class="shade"></div><div class="glow"></div>
  <div class="top"><div class="logo">Score<b>Buzz</b></div><div class="live"><i></i>LIVE</div></div>
  <div class="lg">${esc(t.league || 'LIVE SCOREBOARD')}</div>
  ${centre}
  ${t.kickoff || t.note ? `<div class="ko">${t.kickoff ? `<span>${esc(t.kickoff)}</span>` : ''}${t.note ? `<span class="n">${esc(t.note)}</span>` : ''}</div>` : ''}
  <div class="bar">LIVE SCORES · STATS · <b>scorebuzz.net</b></div>
  ${ph ? `<div class="credit">${esc(ph.credit)}</div>` : ''}
  </body></html>`;
}

(async () => {
  const [specFile, out] = process.argv.slice(2);
  const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  for (const t of specs) {
    await p.setContent(await html(t), { waitUntil: 'load' });
    await p.waitForTimeout(150);
    const f = path.join(out, `${t.id}.jpg`);
    await p.screenshot({ path: f, type: 'jpeg', quality: 90 });
    console.log(f);
  }
  await b.close();
})();
