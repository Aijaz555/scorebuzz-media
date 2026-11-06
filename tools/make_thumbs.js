// ScoreBuzz thumbnail generator: designed click-through thumbnails for Shorts and long videos.
// Usage: node tools/make_thumbs.js shorts/YYYY-MM-DD/shorts.json shorts/YYYY-MM-DD [id ...]
// Writes <id>.thumb.jpg: 1080x1920 for Shorts, 1280x720 for entries with "format": "video".
//
// Each entry in the JSON may carry a "thumb" object (falls back to the title if missing):
//   thumb: {
//     kicker:  "Champions League",          small label above the hook (league / event)
//     big:     "9–1",                       the giant number/score (keep it to <= 6 characters)
//     hook:    "NINE goals *away*",         2–5 words; wrap one word in *stars* to colour it
//     sticker: "RECORD",                    rotated corner sticker (RECORD, FINAL, TONIGHT, UPSET, LIVE…)
//     teams:   ["LEN", "COM"],              optional abbreviation badges either side of `big`
//     emoji:   "🤯"                          optional, one emoji next to the hook
//   }
// Rules (see PLAYBOOK "Thumbnails"): one idea, max ~5 words of text, a huge number, high contrast,
// key content inside the centre square (feeds crop Shorts), no logos/photos — original graphics only.
const leagueTheme = require('./league_theme');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SPORT = {
  football: { tag: 'FOOTBALL', color: '#BEFF3C', text: '#178A4C', emoji: '⚽' },
  nfl: { tag: 'NFL', color: '#4C8DFF', text: '#2F6FE0', emoji: '🏈' },
  nba: { tag: 'NBA', color: '#FF8A3D', text: '#E0681B', emoji: '🏀' },
  nhl: { tag: 'NHL', color: '#7FD1FF', text: '#1590C8', emoji: '🏒' },
  mlb: { tag: 'MLB', color: '#FF4D5E', text: '#D92D20', emoji: '⚾' },
  mma: { tag: 'UFC', color: '#FF4D5E', text: '#D92D20', emoji: '🥊' },
  racing: { tag: 'F1', color: '#FFD23F', text: '#B88A00', emoji: '🏁' },
  other: { tag: 'SPORTS', color: '#B48CFF', text: '#7B4FE0', emoji: '🏆' },
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hl = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

function fallback(v) {
  const t = String(v.title || '').replace(/#\w+/g, '').trim();
  const num = (t.match(/\d+[–-]\d+|\d+/) || [''])[0];
  return { kicker: '', big: num, hook: t.replace(num, '').split(/[:…]/)[0].trim().split(' ').slice(0, 5).join(' ') };
}

function html(v) {
  const LT = leagueTheme.theme(v.league); // league colour scheme (tools/league_theme.js)
  const s = leagueTheme.apply(SPORT[v.sport] || SPORT.other, LT);
  const th = { ...fallback(v), ...(v.thumb || {}) };
  const wide = v.format === 'video';
  const W = wide ? 1280 : 1080, H = wide ? 720 : 1920;
  const bigLen = String(th.big || '').length;
  const bigSize = wide ? (bigLen > 4 ? 200 : 250) : (bigLen > 5 ? 300 : bigLen > 3 ? 380 : 470);
  const teams = th.teams && th.teams.length === 2;
  const badge = (t) => `<div class="tb">${esc(t)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#070A18;font-family:'Inter Display',Inter,sans-serif;color:#fff}
  .burst{position:absolute;inset:-20%;background:
    radial-gradient(circle at 50% ${wide ? '50%' : '46%'},${s.color}55 0%,${s.color}18 28%,transparent 52%),
    repeating-conic-gradient(from 0deg at 50% ${wide ? '50%' : '46%'},#ffffff08 0deg 6deg,transparent 6deg 18deg)}
  .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,#000a 100%)}
  .stripe{position:absolute;left:-10%;right:-10%;height:${wide ? 120 : 200}px;top:${wide ? 70 : 8}%;background:${s.color};transform:rotate(-8deg);opacity:.12}
  header{position:absolute;top:${wide ? 30 : 70}px;left:${wide ? 40 : 60}px;right:${wide ? 40 : 60}px;display:flex;justify-content:space-between;align-items:center}
  .logo{font-size:${wide ? 40 : 58}px;font-weight:900;letter-spacing:-1.5px}.logo b{color:#BEFF3C}
  .tag{background:${s.color};color:#0A0E1E;font-weight:900;font-size:${wide ? 24 : 34}px;padding:${wide ? '6px 16px' : '10px 24px'};border-radius:999px;letter-spacing:1px}
  .wrap{position:absolute;${wide ? 'left:60px;right:60px;top:110px;bottom:60px' : 'left:50px;right:50px;top:360px;bottom:300px'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${wide ? 10 : 26}px;text-align:center}
  .kicker{display:inline-block;background:#FFD23F;color:#0A0E1E;font-weight:900;text-transform:uppercase;letter-spacing:3px;font-size:${wide ? 30 : 46}px;padding:${wide ? '6px 20px' : '10px 30px'};border-radius:14px;transform:rotate(-2deg);box-shadow:0 8px 0 #0008}
  .bigrow{display:flex;max-width:100%;align-items:center;justify-content:center;gap:${wide ? 30 : 30}px}
  .big{font-size:${bigSize}px;font-weight:900;line-height:.92;letter-spacing:-${Math.round(bigSize / 22)}px;
    background:linear-gradient(180deg,#FFFFFF 0%,#FFF27A 38%,#FFB800 70%,#FF5A2A 100%);-webkit-background-clip:text;color:transparent;
    filter:drop-shadow(0 ${wide ? 8 : 14}px 0 #000) drop-shadow(0 0 40px ${s.color}88);white-space:nowrap}
  .tb{width:${wide ? 120 : 170}px;height:${wide ? 120 : 170}px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:${wide ? 36 : 50}px;background:#13205A;border:${wide ? 7 : 10}px solid ${s.color};box-shadow:0 10px 0 #000a;flex:none}
  .hook{font-size:${wide ? 76 : 118}px;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:-2px;-webkit-text-stroke:${wide ? 2 : 3}px #000;paint-order:stroke fill;text-shadow:0 ${wide ? 6 : 10}px 0 #000;max-width:${wide ? 1160 : 980}px}
  .hook em{font-style:normal;color:${s.color}}
  .emoji{font-family:'Noto Color Emoji';font-size:${wide ? 70 : 120}px;line-height:1}
  .sticker{position:absolute;${wide ? 'right:40px;top:96px' : 'right:40px;top:230px'};background:#FF2D55;color:#fff;font-weight:900;font-size:${wide ? 34 : 54}px;letter-spacing:2px;padding:${wide ? '8px 20px' : '14px 30px'};border-radius:16px;transform:rotate(8deg);border:${wide ? 4 : 6}px solid #fff;box-shadow:0 10px 0 #0009;text-transform:uppercase}
  footer{position:absolute;bottom:${wide ? 24 : 110}px;left:0;right:0;text-align:center;font-weight:900;font-size:${wide ? 30 : 46}px;color:#BEFF3C;letter-spacing:-1px}

  /* light theme matching scorebuzz.net */
  body{background:#f2f2f2;color:#111}
  .burst{background:radial-gradient(circle at 50% ${wide ? '50%' : '46%'},${s.text}30 0%,${s.text}10 30%,transparent 55%),repeating-conic-gradient(from 0deg at 50% ${wide ? '50%' : '46%'},#00000008 0deg 6deg,transparent 6deg 18deg)}
  .vig{background:radial-gradient(ellipse at center,transparent 55%,#0000001a 100%)}
  .stripe{background:${s.text};opacity:.08}
  .hbar{position:absolute;left:0;right:0;top:0;height:${wide ? 92 : 200}px;background:#000}
  header{color:#fff}.logo b{color:#C6F432}
  .big{background:none;color:#111;-webkit-background-clip:border-box;filter:drop-shadow(0 ${wide ? 6 : 10}px 0 ${s.text}55)}
  .hook{color:#111;-webkit-text-stroke:0;text-shadow:none}.hook em{color:${s.text}}
  .tb{background:#111;color:#fff}
  .fbar{position:absolute;left:0;right:0;bottom:0;height:${wide ? 64 : 200}px;background:#000}
  footer{color:#C6F432;z-index:1}
  ${leagueTheme.css(LT)}
  </style></head><body>
  <div class="burst"></div><div class="stripe"></div><div class="vig"></div><div class="hbar"></div><div class="fbar"></div>
  <header><div class="logo">Score<b>Buzz</b></div><div class="tag">${s.emoji} ${esc(v.tagText || s.tag)}</div></header>
  ${th.sticker ? `<div class="sticker">${esc(th.sticker)}</div>` : ''}
  <div class="wrap">
    ${th.kicker ? `<div class="kicker">${esc(th.kicker)}</div>` : ''}
    ${th.big ? `<div class="bigrow">${teams ? badge(th.teams[0]) : ''}<div class="big">${esc(th.big)}</div>${teams ? badge(th.teams[1]) : ''}</div>` : ''}
    <div class="hook">${hl(th.hook)}${th.emoji ? ` <span class="emoji">${th.emoji}</span>` : ''}</div>
  </div>
  <footer>scorebuzz.net</footer>
  </body></html>`;
}

(async () => {
  const [, , file, outDir, ...only] = process.argv;
  const list = JSON.parse(fs.readFileSync(file, 'utf8')).filter((v) => !only.length || only.includes(v.id));
  const browser = await chromium.launch();
  for (const v of list) {
    const wide = v.format === 'video';
    const page = await browser.newPage({ viewport: { width: wide ? 1280 : 1080, height: wide ? 720 : 1920 } });
    await page.setContent(html(v), { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      // shrink the big number (and its team badges) and the hook until they fit the safe width
      const wrap = document.querySelector('.wrap'), max = wrap.clientWidth;
      const row = document.querySelector('.bigrow'), big = document.querySelector('.big');
      if (row) {
        let fs = parseFloat(getComputedStyle(big).fontSize);
        while (row.scrollWidth > max && fs > 80) { fs -= 6; big.style.fontSize = fs + 'px'; big.style.letterSpacing = -(fs / 22) + 'px'; }
      }
      const hook = document.querySelector('.hook');
      let hs = parseFloat(getComputedStyle(hook).fontSize);
      while ((hook.scrollWidth > max || hook.getBoundingClientRect().height > hs * 3.3) && hs > 40) { hs -= 4; hook.style.fontSize = hs + 'px'; }
    });
    const out = path.join(outDir, `${v.id}.thumb.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
    await page.close();
    console.log(out);
  }
  await browser.close();
})();
