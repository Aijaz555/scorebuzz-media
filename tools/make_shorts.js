// ScoreBuzz video generator: animated YouTube Shorts (1080x1920) and long videos (1920x1080).
// Usage: node tools/make_shorts.js shorts/YYYY-MM-DD/shorts.json shorts/YYYY-MM-DD [id ...]
//
// shorts.json: [{
//   id, sport (football|nfl|nba|nhl|mlb|mma|racing|other), format: "short" (default) | "video",
//   title, description, tags: [...], time (PKT publish time, YYYY-MM-DDTHH:MM:SS),
//   voice: optional path to an MP3 voiceover (otherwise a silent track is added),
//   scenes: [ { type, dur (seconds), ...fields } ]
// }]
// Scene types:
//   hook:  { kicker, title, sub }                         big opening line (keep it 2-3s)
//   score: { label, home, homeAbbr, homeScore, away, awayAbbr, awayScore, status, note }
//   table: { label, cols: ["W","D","L","PTS"], rows: [[pos, team, ...vals]], highlight: [pos...], danger: [pos...], note }
//   list:  { label, title, rows: [[left, mid, right]], note }
//   stat:  { label, value, unit, text }                   value counts up if numeric
//   text:  { label, title, sub }
//   outro: { title, sub }                                 "Follow" / scorebuzz.net call to action
// Original graphics only: no logos, photos or match footage.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const FPS = 30;
const SPORT = {
  football: { tag: 'FOOTBALL', color: '#BEFF3C', ink: '#0A0E1E', emoji: '⚽' },
  nfl: { tag: 'NFL', color: '#4C8DFF', ink: '#fff', emoji: '🏈' },
  nba: { tag: 'NBA', color: '#FF8A3D', ink: '#0A0E1E', emoji: '🏀' },
  nhl: { tag: 'NHL', color: '#7FD1FF', ink: '#0A0E1E', emoji: '🏒' },
  mlb: { tag: 'MLB', color: '#FF4D5E', ink: '#fff', emoji: '⚾' },
  mma: { tag: 'UFC', color: '#E8E8E8', ink: '#0A0E1E', emoji: '🥊' },
  racing: { tag: 'F1', color: '#FFD23F', ink: '#0A0E1E', emoji: '🏁' },
  other: { tag: 'SPORTS', color: '#B48CFF', ink: '#0A0E1E', emoji: '🏆' },
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const initials = (n) => {
  const w = String(n).replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean);
  return (w.length > 1 ? w.map((x) => x[0]).join('').slice(0, 3) : String(n).slice(0, 3)).toUpperCase();
};
// a(): element that animates in `at` seconds after its scene starts
const a = (at, cls, inner, extra = '') => `<div class="a ${cls}" data-at="${at}" ${extra}>${inner}</div>`;

function scene(sc) {
  switch (sc.type) {
    case 'hook':
      return `${sc.kicker ? a(0, 'kicker', esc(sc.kicker)) : ''}${a(0.15, 'hero', esc(sc.title))}${sc.sub ? a(0.6, 'sub', esc(sc.sub)) : ''}`;
    case 'score': {
      const hs = Number(sc.homeScore), as = Number(sc.awayScore);
      const team = (n, ab, win, at) => a(at, `tm ${win ? '' : 'dim'}`, `<div class="bd">${esc(ab || initials(n))}</div><div class="nm">${esc(n)}</div>`);
      return `${sc.label ? a(0, 'label', esc(sc.label)) : ''}
        <div class="score">${team(sc.home, sc.homeAbbr, hs >= as, 0.2)}
          <div class="mid">${a(0.5, 'sc', `<span class="${as > hs ? 'dimtxt' : ''}" data-count="${hs}">0</span><i>–</i><span class="${hs > as ? 'dimtxt' : ''}" data-count="${as}">0</span>`)}${a(0.9, 'st', esc(sc.status || 'FINAL'))}</div>
          ${team(sc.away, sc.awayAbbr, as >= hs, 0.35)}</div>
        ${sc.note ? a(1.3, 'note', esc(sc.note)) : ''}`;
    }
    case 'table': {
      const cols = sc.cols || [];
      const hi = new Set(sc.highlight || []), dz = new Set(sc.danger || []);
      const head = `<div class="tr th"><span></span><span></span>${cols.map((c) => `<span>${esc(c)}</span>`).join('')}</div>`;
      const step = Math.min(0.12, 2.2 / Math.max(1, sc.rows.length));
      const rows = sc.rows.map((r, i) => a(0.3 + i * step, `tr ${hi.has(r[0]) ? 'hi' : ''} ${dz.has(r[0]) ? 'dz' : ''}`,
        r.map((c, j) => `<span class="${j === 1 ? 'tn' : ''}">${esc(c)}</span>`).join(''), `style="--n:${cols.length}"`)).join('');
      return `${sc.label ? a(0, 'label', esc(sc.label)) : ''}<div class="table" style="--n:${cols.length}">${head}${rows}</div>${sc.note ? a(0.6 + sc.rows.length * step, 'note', esc(sc.note)) : ''}`;
    }
    case 'list': {
      const rows = sc.rows.map((r, i) => a(0.4 + i * 0.25, 'row', `<span class="l">${esc(r[0])}</span><span class="m">${esc(r[1])}</span><span class="r">${esc(r[2])}</span>`)).join('');
      return `${sc.label ? a(0, 'label', esc(sc.label)) : ''}${sc.title ? a(0.1, 'title', esc(sc.title)) : ''}<div class="list">${rows}</div>${sc.note ? a(0.6 + sc.rows.length * 0.25, 'note', esc(sc.note)) : ''}`;
    }
    case 'stat': {
      const num = /^-?\d+(\.\d+)?$/.test(String(sc.value));
      return `${sc.label ? a(0, 'label', esc(sc.label)) : ''}${a(0.2, 'big', `<b ${num ? `data-count="${sc.value}"` : ''}>${num ? 0 : esc(sc.value)}</b>${sc.unit ? `<span>${esc(sc.unit)}</span>` : ''}`)}${sc.text ? a(0.8, 'title', esc(sc.text)) : ''}`;
    }
    case 'outro':
      return `${a(0, 'title c', esc(sc.title || 'Live scores, tables & results'))}${a(0.3, 'url', 'scorebuzz.net')}${a(0.7, 'sub c', esc(sc.sub || 'Follow ScoreBuzz for daily updates'))}`;
    default:
      return `${sc.label ? a(0, 'label', esc(sc.label)) : ''}${a(0.1, 'title', esc(sc.title))}${sc.sub ? a(0.5, 'sub', esc(sc.sub)) : ''}`;
  }
}

function html(v) {
  const s = SPORT[v.sport] || SPORT.other;
  const wide = v.format === 'video';
  const W = wide ? 1920 : 1080, H = wide ? 1080 : 1920;
  let t = 0;
  const scenes = v.scenes.map((sc) => {
    const out = `<section class="scene t-${sc.type}" data-start="${t}" data-dur="${sc.dur}">${scene(sc)}</section>`;
    t += sc.dur;
    return out;
  }).join('');
  return { total: t, W, H, page: `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;font-family:Inter,sans-serif;color:#F3F5FB;background:#0A0E1E;overflow:hidden;position:relative}
  #glow{position:absolute;inset:-20%;background:radial-gradient(ellipse at 80% 15%,${s.color}38,transparent 50%),radial-gradient(ellipse at 10% 90%,#3D7BFF2e,transparent 50%)}
  #grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.035) 2px,transparent 2px);background-size:120px 120px}
  header{position:absolute;top:${wide ? 50 : 110}px;left:72px;right:72px;display:flex;justify-content:space-between;align-items:center;z-index:2}
  .logo{font-size:${wide ? 48 : 60}px;font-weight:800;letter-spacing:-1.5px}.logo b{color:#BEFF3C}
  .tag{background:${s.color};color:${s.ink};font-weight:800;font-size:30px;letter-spacing:1.5px;padding:12px 26px;border-radius:999px}
  #bar{position:absolute;top:0;left:0;height:12px;background:${s.color};z-index:3}
  footer{position:absolute;bottom:${wide ? 44 : 150}px;left:72px;right:72px;display:flex;justify-content:space-between;font-size:30px;font-weight:700;color:#AEB6D2;z-index:2}
  footer b{color:#BEFF3C}
  .scene{position:absolute;left:${wide ? 120 : 72}px;right:${wide ? 120 : 72}px;top:${wide ? 150 : 260}px;bottom:${wide ? 130 : 300}px;display:flex;flex-direction:column;justify-content:center;gap:${wide ? 28 : 40}px;opacity:0}
  .a{opacity:0}
  .kicker,.label{font-size:${wide ? 32 : 38}px;font-weight:800;letter-spacing:3px;color:${s.color};text-transform:uppercase}
  .hero{font-size:${wide ? 120 : 132}px;font-weight:800;letter-spacing:-3px;line-height:1.02}
  .title{font-size:${wide ? 72 : 78}px;font-weight:800;letter-spacing:-2px;line-height:1.08}
  .sub,.note{font-size:${wide ? 40 : 46}px;line-height:1.35;color:#C3CAE3;font-weight:500}
  .note{border-left:8px solid ${s.color};padding-left:28px}
  .c{text-align:center}
  .score{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:#121833cc;border:3px solid #232B50;border-radius:36px;padding:60px 24px}
  .tm{text-align:center}.tm.dim{filter:brightness(.6)}
  .bd{width:170px;height:170px;border-radius:50%;margin:0 auto 22px;display:grid;place-items:center;font-size:50px;font-weight:800;background:#1E2754;border:5px solid ${s.color}}
  .nm{font-size:44px;font-weight:700;line-height:1.1}
  .mid{text-align:center;padding:0 10px}
  .sc{font-size:${wide ? 150 : 160}px;font-weight:800;letter-spacing:-4px;display:flex;align-items:center;gap:20px;justify-content:center}.sc i{font-style:normal;color:#5A6390;font-size:100px}
  .dimtxt{color:#7C86AC}
  .st{display:inline-block;margin-top:12px;font-size:30px;font-weight:800;letter-spacing:2px;color:${s.color};border:3px solid ${s.color}66;padding:8px 22px;border-radius:999px}
  .table{background:#121833cc;border:3px solid #232B50;border-radius:28px;overflow:hidden}
  .tr{display:grid;grid-template-columns:70px 1fr repeat(var(--n),${wide ? 110 : 92}px);align-items:center;padding:0 26px;height:${wide ? 52 : 66}px;font-size:${wide ? 30 : 36}px;font-weight:600;border-top:2px solid #232B50}
  .tr span{text-align:center}.tr .tn{text-align:left;font-weight:700}
  .tr span:last-child{font-weight:800;color:${s.color}}
  .th{height:56px;font-size:26px;color:#8C95BA;border-top:none;letter-spacing:1px}.th span:last-child{color:#8C95BA}
  .tr.hi{background:${s.color}2a}.tr.dz{background:#FF4D5E26}.tr.dz span:first-child{color:#FF6B78}
  .list{background:#121833cc;border:3px solid #232B50;border-radius:30px;overflow:hidden}
  .row{display:grid;grid-template-columns:1fr auto 1fr;gap:22px;align-items:center;padding:34px 30px;font-size:44px;font-weight:700;border-top:2px solid #232B50}
  .row:first-child{border-top:none}.row .l{text-align:right}.row .m{font-weight:800;color:${s.color};min-width:200px;text-align:center}
  .big{display:flex;align-items:baseline;gap:24px;flex-wrap:wrap}.big b{font-size:${wide ? 260 : 300}px;font-weight:800;color:${s.color};letter-spacing:-8px;line-height:1}.big span{font-size:56px;font-weight:700;color:#C3CAE3}
  .url{font-size:${wide ? 110 : 120}px;font-weight:800;color:#BEFF3C;letter-spacing:-3px;text-align:center}
  </style></head><body><div id="glow"></div><div id="grid"></div><div id="bar"></div>
  <header><div class="logo">Score<b>Buzz</b></div><div class="tag">${s.emoji} ${esc(v.tagText || s.tag)}</div></header>
  ${scenes}
  <footer><span>Live scores · Tables · Results</span><b>scorebuzz.net</b></footer>
  <script>
  const TOTAL=${t};
  const ease=(x)=>1-Math.pow(1-Math.min(1,Math.max(0,x)),3);
  window.setFrame=(t)=>{
    document.getElementById('bar').style.width=(t/TOTAL*100)+'%';
    document.getElementById('glow').style.transform='translate('+(Math.sin(t/3)*40)+'px,'+(Math.cos(t/4)*40)+'px)';
    for(const sc of document.querySelectorAll('.scene')){
      const st=+sc.dataset.start,du=+sc.dataset.dur,l=t-st;
      const vis=l<0||l>=du?0:Math.min(1,l/0.25,(du-l)/0.25);
      sc.style.opacity=vis; if(!vis) continue;
      for(const el of sc.querySelectorAll('.a')){
        const p=ease((l-(+el.dataset.at))/0.45);
        el.style.opacity=p; el.style.transform='translateY('+((1-p)*50)+'px)';
        for(const c of el.querySelectorAll('[data-count]')){
          const target=+c.dataset.count, q=ease((l-(+el.dataset.at))/1.0);
          c.textContent=Number.isInteger(target)?Math.round(target*q):(target*q).toFixed(1);
        }
      }
    }
  };
  </script></body></html>` };
}

async function render(browser, v, outDir) {
  const { page: doc, total, W, H } = html(v);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(doc, { waitUntil: 'load' });
  const out = path.join(outDir, `${v.id}.mp4`);
  const audio = v.voice && fs.existsSync(v.voice)
    ? ['-i', v.voice]
    : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...audio,
    '-t', String(total), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.setFrame(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exit ${c}`)) : res())));
  // thumbnail: the frame 0.6s before the end of the first non-hook scene, or mid-video
  const thumbT = Math.min(total - 0.1, (v.scenes[0].dur || 2) + (v.scenes[1]?.dur || 2) - 0.6);
  await page.evaluate((t) => window.setFrame(t), thumbT);
  await page.screenshot({ path: path.join(outDir, `${v.id}.jpg`), type: 'jpeg', quality: 90 });
  await page.close();
  return { out, total };
}

(async () => {
  const [, , input, outDir, ...only] = process.argv;
  const vids = JSON.parse(fs.readFileSync(input, 'utf8')).filter((v) => !only.length || only.includes(v.id));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const v of vids) {
    const t0 = Date.now();
    const { out, total } = await render(browser, v, outDir);
    console.log(`${out}  ${total}s  (${((Date.now() - t0) / 1000).toFixed(0)}s to render)`);
  }
  await browser.close();
})();
