// ScoreBuzz Facebook card generator.
// Usage: node tools/make_cards.js posts.json out_dir
// posts.json: [{ id, sport, kind: "score"|"headline"|"list", label, ... }]
//   score:    { home, homeScore, away, awayScore, status, headline, sub }
//   headline: { headline, sub }
//   list:     { headline, rows: [[left, mid, right], ...], sub }
// Renders 1080x1350 PNGs named <id>.png. No logos or photos: original graphics only.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SPORT = {
  football: { tag: 'FOOTBALL', color: '#BEFF3C', ink: '#0A0E1E', emoji: '⚽' },
  nfl: { tag: 'NFL', color: '#4C8DFF', ink: '#fff', emoji: '🏈' },
  nba: { tag: 'NBA', color: '#FF8A3D', ink: '#0A0E1E', emoji: '🏀' },
  nhl: { tag: 'NHL', color: '#7FD1FF', ink: '#0A0E1E', emoji: '🏒' },
  mlb: { tag: 'MLB', color: '#FF4D5E', ink: '#fff', emoji: '⚾' },
  mma: { tag: 'UFC', color: '#E8E8E8', ink: '#0A0E1E', emoji: '🥊' },
  racing: { tag: 'RACING', color: '#FFD23F', ink: '#0A0E1E', emoji: '🏁' },
  other: { tag: 'SPORTS', color: '#B48CFF', ink: '#0A0E1E', emoji: '🏆' },
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function initials(name) {
  const w = String(name).replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] + (w[2] ? w[2][0] : '') : String(name).slice(0, 3)).toUpperCase();
}

function body(p, s) {
  if (p.kind === 'score') {
    const hw = Number(p.homeScore) > Number(p.awayScore), aw = Number(p.awayScore) > Number(p.homeScore);
    return `
      <div class="score">
        <div class="tm ${aw ? 'dim' : ''}"><div class="bd">${esc(p.homeAbbr || initials(p.home))}</div><div class="nm">${esc(p.home)}</div></div>
        <div class="mid"><div class="sc"><span class="${aw ? 'dim' : ''}">${esc(p.homeScore)}</span><i>–</i><span class="${hw ? 'dim' : ''}">${esc(p.awayScore)}</span></div><div class="st">${esc(p.status || 'FINAL')}</div></div>
        <div class="tm ${hw ? 'dim' : ''}"><div class="bd">${esc(p.awayAbbr || initials(p.away))}</div><div class="nm">${esc(p.away)}</div></div>
      </div>
      <h1 class="h small">${esc(p.headline)}</h1>
      ${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}`;
  }
  if (p.kind === 'list') {
    const rows = (p.rows || []).map((r) => `<div class="row"><span class="l">${esc(r[0])}</span><span class="m">${esc(r[1])}</span><span class="r">${esc(r[2])}</span></div>`).join('');
    return `<h1 class="h med">${esc(p.headline)}</h1><div class="list">${rows}</div>${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}`;
  }
  const len = String(p.headline).length;
  const cls = len > 70 ? 'med' : len > 40 ? 'big' : 'huge';
  return `<h1 class="h ${cls}">${esc(p.headline)}</h1>${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}${p.stat ? `<div class="stat"><b>${esc(p.stat[0])}</b><span>${esc(p.stat[1])}</span></div>` : ''}`;
}

function html(p) {
  const s = SPORT[p.sport] || SPORT.other;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1080px;height:1350px;font-family:Inter,sans-serif;color:#F3F5FB;background:#0A0E1E;overflow:hidden;position:relative}
  .glow{position:absolute;inset:0;background:radial-gradient(ellipse at 85% 10%,${s.color}33,transparent 55%),radial-gradient(ellipse at 0% 100%,#3D7BFF26,transparent 55%)}
  .lines{position:absolute;left:60px;right:60px;top:220px;bottom:220px;border:3px solid rgba(255,255,255,.05);border-radius:18px}
  .lines:after{content:'';position:absolute;left:50%;top:0;bottom:0;border-left:3px solid rgba(255,255,255,.05)}
  header{position:absolute;top:64px;left:72px;right:72px;display:flex;justify-content:space-between;align-items:center}
  .logo{font-size:52px;font-weight:800;letter-spacing:-1.5px}.logo b{color:#BEFF3C}
  .tag{background:${s.color};color:${s.ink};font-weight:800;font-size:28px;letter-spacing:1.5px;padding:12px 24px;border-radius:999px}
  .label{position:absolute;top:190px;left:72px;font-size:28px;font-weight:700;letter-spacing:2px;color:${s.color}}
  main{position:absolute;top:250px;left:72px;right:72px;bottom:190px;display:flex;flex-direction:column;justify-content:center;gap:34px}
  .h{font-weight:800;letter-spacing:-2px;line-height:1.05}
  .huge{font-size:104px}.big{font-size:84px}.med{font-size:64px;letter-spacing:-1.2px}.small{font-size:56px;letter-spacing:-1px;text-align:center}
  .sub{font-size:36px;line-height:1.35;color:#AEB6D2;font-weight:500}
  .score{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:#121833;border:2px solid #232B50;border-radius:28px;padding:44px 30px}
  .tm{text-align:center}.tm.dim{opacity:.55}
  .bd{width:132px;height:132px;border-radius:50%;margin:0 auto 18px;display:grid;place-items:center;font-size:40px;font-weight:800;background:#1E2754;border:3px solid ${s.color}}
  .nm{font-size:34px;font-weight:700;line-height:1.15}
  .mid{text-align:center;padding:0 16px}
  .sc{font-size:120px;font-weight:800;letter-spacing:-3px;display:flex;align-items:center;gap:18px}.sc i{font-style:normal;color:#5A6390;font-size:80px}
  .sc .dim{color:#7C86AC}
  .st{display:inline-block;margin-top:8px;font-size:24px;font-weight:800;letter-spacing:2px;color:${s.color};border:2px solid ${s.color}55;padding:6px 16px;border-radius:999px}
  .list{background:#121833;border:2px solid #232B50;border-radius:24px;overflow:hidden}
  .row{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;padding:22px 30px;font-size:34px;font-weight:600;border-top:2px solid #232B50}
  .row:first-child{border-top:none}
  .row .l{text-align:right}.row .m{font-weight:800;color:${s.color};min-width:150px;text-align:center}
  .stat{display:flex;align-items:baseline;gap:20px}.stat b{font-size:120px;font-weight:800;color:${s.color};letter-spacing:-3px}.stat span{font-size:36px;color:#AEB6D2;font-weight:600}
  footer{position:absolute;bottom:64px;left:72px;right:72px;display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:700;color:#AEB6D2}
  footer b{color:#BEFF3C}
  </style></head><body><div class="glow"></div><div class="lines"></div>
  <header><div class="logo">Score<b>Buzz</b></div><div class="tag">${s.emoji} ${esc(p.tagText || s.tag)}</div></header>
  ${p.label ? `<div class="label">${esc(p.label)}</div>` : ''}
  <main>${body(p, s)}</main>
  <footer><span>Live scores · Tables · Results</span><b>scorebuzz.net</b></footer>
  </body></html>`;
}

(async () => {
  const [, , input, outDir] = process.argv;
  const posts = JSON.parse(fs.readFileSync(input, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  for (const p of posts) {
    await page.setContent(html(p), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(outDir, `${p.id}.png`) });
  }
  await browser.close();
  console.log(`rendered ${posts.length} cards to ${outDir}`);
})();
