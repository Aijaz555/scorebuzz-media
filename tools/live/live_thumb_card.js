// Eye-catching 1280x720 thumbnails for live scoreboard streams.
// Usage: node tools/live/live_thumb_card.js spec.json out_dir
// spec.json: [{ id, sport: football|nfl|nba|nhl|mlb, league: "PREMIER LEAGUE", venue: "<ESPN venue.fullName>" (stadium photo),
//               home: {name, abbr, logo}, away: {name, abbr, logo},   // per-game: big crests + VS
//               headline, sub,                                       // generic: no teams, big headline instead
//               leagueKey: epl|ucl|laliga|nfl|nba|... (tools/league_theme.js colours; theme: "pl" = epl) (Premier League palette: purple #37003C, pink #E90052, cyan #04F5FF, green #00FF85; league name
//               as plain text — never the official lion logo or the league's proprietary typeface), kickoff, note }]
// Look: stadium photo in the background (licence credit shown), dark vignette, huge red LIVE badge,
// glowing team crests, lime ScoreBuzz accents. Crests = ESPN team logos; photos = stadiums only, never people.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assets = require('../media_assets');
const leagueTheme = require('../league_theme');

const ACCENT = { football: '#C6F432', nfl: '#4C8DFF', nba: '#FF8A3D', nhl: '#7FD1FF', mlb: '#FF4D5E' };
const ICON = { football: '⚽', nfl: '🏈', nba: '🏀', nhl: '🏒', mlb: '⚾' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function html(t) {
  const LT = leagueTheme.theme(t.leagueKey || (t.theme === 'pl' ? 'epl' : null));
  if (LT) LT.key = leagueTheme.theme('epl') === LT ? 'epl' : '';
  const acc = LT ? LT.accent : (ACCENT[t.sport] || '#C6F432');
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
  ${LT ? `
  body{background:${LT.primary};font-family:'Inter Display',Inter,sans-serif}
  .bg{filter:saturate(.9) contrast(1.05)}
  .shade{background:radial-gradient(ellipse at 50% 50%,${LT.primary}40,${LT.primary}eb 78%),linear-gradient(180deg,${LT.primary}cc,${LT.primary}59 42%,${LT.primary}f5)}
  .glow{background:radial-gradient(ellipse at 30% 50%,${LT.hot}66,transparent 60%),radial-gradient(ellipse at 70% 50%,${LT.accent}55,transparent 60%)}
  .lg{top:122px;background:${LT.key === 'epl' ? 'linear-gradient(90deg,#04F5FF,#00FF85)' : LT.accent};color:${LT.ink === '#FFFFFF' ? LT.primary : LT.ink};font-family:'Inter Display';font-weight:900;font-size:38px;letter-spacing:-.5px;padding:8px 30px;border-radius:12px;text-transform:none;box-shadow:0 0 0 4px #fff3,0 8px 30px #0008}
  .cr{box-shadow:0 0 0 8px #fff,0 0 0 16px ${LT.hot},0 0 80px ${LT.accent}aa,0 20px 50px #000c}
  .v{color:${LT.accent === '#FFFFFF' || LT.accent === '#E8E8E8' || LT.accent === '#A2AAAD' || LT.ink === '#FFFFFF' ? '#fff' : LT.accent};text-shadow:0 6px 0 ${LT.primary},0 0 40px ${LT.accent}}
  .nm{font-family:'Inter Display'}
  .bar{background:${LT.primary};border-top:6px solid ${LT.hot}}` : ''}
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

// "arena" style (owner's reference, 7 Nov 2026): colour-graded arena photo, two huge glowing crests, brush "VS",
// small LIVE badge top-left. Crests = ESPN team logos (+ team.color for the glow); photo = the venue, never people.
async function arenaHtml(t) {
  const ph = assets.photo(t.venue);
  const glow = (c) => '#' + String(c || 'ffffff').replace('#', '');
  const crest = async (x) => (await assets.crest(x.logo)) || '';
  const [hl, al] = [await crest(t.home), await crest(t.away)];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1280px;height:720px;overflow:hidden;background:#140a2a;font-family:'Inter Display',Inter,sans-serif;position:relative}
  .bg{position:absolute;inset:-10px;background:${ph ? `url(${ph.src}) center 35%/cover` : '#241050'};filter:saturate(1.7) contrast(1.25) brightness(.85)}
  .dusk{position:absolute;inset:0;background:linear-gradient(180deg,#3b0f7acc 0%,#c2185b88 26%,#ff8a3d55 42%,transparent 58%);mix-blend-mode:overlay}
  .dusk2{position:absolute;inset:0;background:linear-gradient(180deg,#2a0a5a99 0%,transparent 35%,transparent 55%,#120626 100%)}
  .floor{position:absolute;left:0;right:0;bottom:0;height:300px;background:
    radial-gradient(ellipse at 22% 70%,${glow(t.home.color)}66,transparent 55%),radial-gradient(ellipse at 78% 70%,${glow(t.away.color)}66,transparent 55%),
    repeating-linear-gradient(90deg,#ffffff0a 0 3px,transparent 3px 22px);filter:blur(2px)}
  .lg{position:absolute;top:175px;width:400px;height:400px;display:flex;align-items:center;justify-content:center}
  .lg img{max-width:100%;max-height:100%;object-fit:contain;
    filter:drop-shadow(0 0 3px #fff) drop-shadow(0 0 3px #fff) drop-shadow(0 0 2px #fff) drop-shadow(0 0 28px var(--g)) drop-shadow(0 0 60px var(--g)) drop-shadow(0 18px 24px #000c)}
  .l{left:40px}.r{right:40px}
  .vs{position:absolute;left:50%;top:380px;transform:translate(-50%,-50%);width:360px;height:280px}
  .live{position:absolute;left:30px;top:26px;display:flex;align-items:center;gap:10px;background:#E10600;color:#fff;font-weight:900;font-style:italic;font-size:44px;padding:4px 20px 6px 16px;border-radius:10px;border:3px solid #fff;box-shadow:0 0 24px #E10600aa}
  .live i{width:20px;height:20px;border-radius:50%;background:#fff}
  .brand{position:absolute;right:26px;bottom:20px;font-size:26px;font-weight:900;color:#fff;letter-spacing:-.5px;text-shadow:0 2px 8px #000}.brand b{color:#C6F432}
  .credit{position:absolute;left:12px;bottom:8px;font-size:11px;color:#fff9;text-shadow:0 1px 2px #000}
  </style></head><body>
  <div class="bg"></div><div class="dusk"></div><div class="dusk2"></div><div class="floor"></div>
  <div class="lg l" style="--g:${glow(t.home.color)}">${hl ? `<img src="${hl}">` : ''}</div>
  <div class="lg r" style="--g:${glow(t.away.color)}">${al ? `<img src="${al}">` : ''}</div>
  <svg class="vs" viewBox="0 0 430 330">
    <defs><filter id="brush" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
    <g filter="url(#brush)">
      <polygon points="40,300 150,40 175,48 80,310" fill="#fff" opacity=".9"/>
      <polygon points="250,300 380,20 400,30 290,312" fill="#fff" opacity=".85"/>
      <text x="215" y="250" text-anchor="middle" font-family="Inter Display, Inter" font-weight="900" font-style="italic" font-size="250"
        fill="#fff" stroke="#111" stroke-width="10" paint-order="stroke" transform="skewX(-14) translate(60,0)">VS</text>
    </g>
  </svg>
  <div class="live"><i></i>LIVE</div>
  <div class="brand">Score<b>Buzz</b></div>
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
    await p.setContent(await (t.style === 'arena' ? arenaHtml(t) : html(t)), { waitUntil: 'load' });
    await p.evaluate(async () => { await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await p.waitForTimeout(600);
    const f = path.join(out, `${t.id}.jpg`);
    await p.screenshot({ path: f, type: 'jpeg', quality: 90 });
    console.log(f);
  }
  await b.close();
})();
