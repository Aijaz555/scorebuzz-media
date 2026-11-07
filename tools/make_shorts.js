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
//   board: { kicker, title, badge, rows: [{ home, homeAbbr, hs, away, awayAbbr, as, note }], first, step }
//          Results board (fixture list on a white card). Each score drops in with a bounce and a pop
//          sound, home then away, one fixture every `step` s (default 1.8) starting at `first` (default 1.0).
//          Set dur >= first + rows*step + ~1.0 so the full board holds before the next scene.
//   cta:   { title, sub }                                 Like / Comment / Share end card
// Pop sound-effect times are written to <id>.sfx.json; tools/add_music.sh mixes them in.
// Crests: homeLogo/awayLogo (ESPN team.logo URLs) on score scenes and board rows.
// Photo: optional video-level "venue" (ESPN venue.fullName) -> stadium photo band from photos/ (licence credit shown)
// behind hook/score/stat/text scenes of vertical Shorts. Stadium photos only: never players or other people.
const leagueTheme = require('./league_theme');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const assets = require('./media_assets');

const FPS = 30;
const SPORT = {
  football: { tag: 'FOOTBALL', color: '#BEFF3C', ink: '#0A0E1E', text: '#178A4C', emoji: '⚽' },
  nfl: { tag: 'NFL', color: '#4C8DFF', ink: '#fff', text: '#2F6FE0', emoji: '🏈' },
  nba: { tag: 'NBA', color: '#FF8A3D', ink: '#0A0E1E', text: '#E0681B', emoji: '🏀' },
  nhl: { tag: 'NHL', color: '#7FD1FF', ink: '#0A0E1E', text: '#1590C8', emoji: '🏒' },
  mlb: { tag: 'MLB', color: '#FF4D5E', ink: '#fff', text: '#D92D20', emoji: '⚾' },
  mma: { tag: 'UFC', color: '#E8E8E8', ink: '#0A0E1E', text: '#333333', emoji: '🥊' },
  racing: { tag: 'F1', color: '#FFD23F', ink: '#0A0E1E', text: '#B88A00', emoji: '🏁' },
  other: { tag: 'SPORTS', color: '#B48CFF', ink: '#0A0E1E', text: '#7B4FE0', emoji: '🏆' },
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
      const team = (n, ab, win, at, logo) => a(at, `tm ${win ? '' : 'dim'}`, `<div class="bd${logo ? ' img' : ''}">${logo ? `<img src="${logo}">` : esc(ab || initials(n))}</div><div class="nm">${esc(n)}</div>`);
      return `${sc.label ? a(0, 'label', esc(sc.label)) : ''}
        <div class="score">${team(sc.home, sc.homeAbbr, hs >= as, 0.2, sc.homeLogo)}
          <div class="mid">${a(0.5, 'sc' + (String(sc.homeScore).length + String(sc.awayScore).length > 4 ? ' long' : ''), `<span class="${as > hs ? 'dimtxt' : ''}" data-count="${hs}">0</span><i>–</i><span class="${hs > as ? 'dimtxt' : ''}" data-count="${as}">0</span>`)}${a(0.9, 'st', esc(sc.status || 'FINAL'))}</div>
          ${team(sc.away, sc.awayAbbr, as >= hs, 0.35, sc.awayLogo)}</div>
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
    case 'board': {
      const first = sc.first ?? 1.0, step = sc.step ?? 1.8;
      const badge = (n, ab, logo) => `<div class="bb${logo ? ' img' : ''}">${logo ? `<img src="${logo}">` : esc(ab || initials(n))}</div>`;
      const rows = sc.rows.map((r, i) => {
        const at = first + i * step;
        const hw = Number(r.hs) > Number(r.as), aw = Number(r.as) > Number(r.hs);
        return `<div class="br">
          <div class="bt h ${aw ? 'lose' : ''}"><span class="bn">${esc(r.home)}</span>${badge(r.home, r.homeAbbr, r.homeLogo)}</div>
          <div class="bx"><b class="pop" data-at="${at}">${esc(r.hs)}</b></div>
          <div class="bx"><b class="pop" data-at="${at + 0.35}">${esc(r.as)}</b></div>
          <div class="bt ${hw ? 'lose' : ''}">${badge(r.away, r.awayAbbr, r.awayLogo)}<span class="bn">${esc(r.away)}</span></div>
          ${r.note ? `<div class="bnote pop2" data-at="${at + 0.6}">${esc(r.note)}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="bhead">${a(0, 'bk', esc(sc.kicker || ''))}${a(0.1, 'btitle', esc(sc.title || ''))}${sc.badge ? a(0.25, 'bbadge', esc(sc.badge)) : ''}</div>
        ${a(0.3, 'bcard n' + Math.min(12, sc.rows.length) + (sc.rows.some((r) => String(r.hs).length > 2 || String(r.as).length > 2) ? ' s3' : ''), rows)}`;
    }
    case 'cta':
      return `${a(0, 'ctat', esc(sc.title || 'What did you make of these results?'))}
        <div class="ctab">${a(0.25, 'cb like', '♥<span>LIKE</span>')}${a(0.4, 'cb com', '💬<span>COMMENT</span>')}${a(0.55, 'cb shr', '↗<span>SHARE</span>')}</div>
        ${a(0.8, 'url', 'scorebuzz.net')}${sc.sub ? a(1.0, 'sub c', esc(sc.sub)) : ''}`;
    case 'outro':
      return `${a(0, 'title c', esc(sc.title || 'Live scores, tables & results'))}${a(0.3, 'url', 'scorebuzz.net')}${a(0.7, 'sub c', esc(sc.sub || 'Follow ScoreBuzz for daily updates'))}`;
    default:
      return `${sc.label ? a(0, 'label', esc(sc.label)) : ''}${a(0.1, 'title', esc(sc.title))}${sc.sub ? a(0.5, 'sub', esc(sc.sub)) : ''}`;
  }
}

function html(v) {
  const LT = leagueTheme.theme(v.league); // league colour scheme (tools/league_theme.js)
  const s = leagueTheme.apply(SPORT[v.sport] || SPORT.other, LT);
  const wide = v.format === 'video';
  const W = wide ? 1920 : 1080, H = wide ? 1080 : 1920;
  let t = 0;
  const pops = [];
  const scenes = v.scenes.map((sc) => {
    if (sc.type === 'board') {
      const first = sc.first ?? 1.0, step = sc.step ?? 1.8;
      sc.rows.forEach((r, i) => { pops.push(+(t + first + i * step).toFixed(3), +(t + first + i * step + 0.35).toFixed(3)); });
    }
    const wp = v._photo && !wide && ['hook', 'score', 'stat', 'text'].includes(sc.type || 'text');
    const out = `<section class="scene t-${sc.type}${wp ? ' wp' : ''}" data-start="${t}" data-dur="${sc.dur}">${scene(sc)}</section>`;
    t += sc.dur;
    return out;
  }).join('');
  return { total: t, W, H, pops, page: `<!doctype html><html><head><meta charset="utf-8"><style>
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
  .sc{font-size:${wide ? 150 : 160}px;font-weight:800;letter-spacing:-4px;display:flex;align-items:center;gap:20px;justify-content:center}.sc i{font-style:normal;color:#5A6390;font-size:100px}.sc.long{font-size:${wide ? 110 : 112}px;letter-spacing:-3px;gap:10px}.sc.long i{font-size:70px}
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
  .t-board{justify-content:flex-start;gap:26px;top:230px;bottom:250px}
  .bhead{text-align:center}
  .bk{font-size:40px;font-weight:800;letter-spacing:4px;color:#FFD23F;text-transform:uppercase}
  .btitle{font-size:76px;font-weight:900;letter-spacing:-1px;line-height:1.05;text-transform:uppercase}
  .bbadge{display:inline-block;margin-top:14px;background:#FFD23F;color:#0A0E1E;font-size:34px;font-weight:900;letter-spacing:3px;padding:8px 28px;border-radius:12px;text-transform:uppercase}
  .bcard{flex:1;display:flex;flex-direction:column;justify-content:space-evenly;background:#fff;border-radius:34px;padding:10px 22px;box-shadow:0 30px 80px #0008;color:#0A0E1E}
  .br{display:grid;grid-template-columns:1fr 104px 104px 1fr;gap:12px;align-items:center;padding:14px 0 20px;border-top:2px solid #E6E9F2;position:relative}
  .br:first-child{border-top:none}
  .bt{display:flex;align-items:center;gap:14px;font-size:36px;font-weight:800;line-height:1.05;min-width:0}
  .bt.h{justify-content:flex-end;text-align:right}
  .bt.lose{color:#8A92AD}
  .bn{overflow:hidden}
  .bb{flex:none;width:62px;height:62px;border-radius:50%;display:grid;place-items:center;font-size:20px;font-weight:900;color:#fff;background:#13205A;border:4px solid ${s.color}}
  .bx{height:96px;border-radius:18px;background:#0B1B4F;display:grid;place-items:center;box-shadow:inset 0 -6px 0 #06102f}
  .bx b{display:block;font-size:76px;font-weight:900;line-height:1;opacity:0;background:linear-gradient(180deg,#FFE27A 0%,#FFB800 45%,#FF3B3B 100%);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 5px 0 #7a1010)}
  .bnote{position:absolute;left:0;right:0;bottom:-4px;text-align:center;font-size:22px;letter-spacing:2px;font-weight:700;color:#5A6390;opacity:0}
  .bcard.s3 .br{grid-template-columns:1fr 148px 148px 1fr;gap:10px}.bcard.s3 .bx b{font-size:60px;letter-spacing:-2px}.bcard.s3 .bt{font-size:32px}
  .bcard.n9 .br,.bcard.n10 .br,.bcard.n11 .br,.bcard.n12 .br{padding:8px 0 16px}
  .bcard.n9 .bx,.bcard.n10 .bx,.bcard.n11 .bx,.bcard.n12 .bx{height:80px}
  .bcard.n9 .bx b,.bcard.n10 .bx b,.bcard.n11 .bx b,.bcard.n12 .bx b{font-size:62px}
  .bcard.n9 .bt,.bcard.n10 .bt,.bcard.n11 .bt,.bcard.n12 .bt{font-size:33px}
  .bcard.n9 .bb,.bcard.n10 .bb,.bcard.n11 .bb,.bcard.n12 .bb{width:52px;height:52px;font-size:17px}
  .t-cta{align-items:center;text-align:center}
  .ctat{font-size:88px;font-weight:900;line-height:1.05;letter-spacing:-2px;text-transform:uppercase;text-align:center}
  .ctab{display:flex;gap:34px;justify-content:center}
  .cb{width:240px;height:240px;border-radius:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:96px;font-weight:900;border:6px solid #0A0E1E;box-shadow:0 12px 0 #0A0E1E}
  .cb span{font-size:32px;letter-spacing:2px;color:#0A0E1E}
  .cb.like{background:#FF5C8A;color:#fff}.cb.com{background:#FFD23F}.cb.shr{background:#4FD8FF;color:#0A0E1E}
  .url{font-size:${wide ? 110 : 120}px;font-weight:800;color:#BEFF3C;letter-spacing:-3px;text-align:center}

  /* ===== light theme matching scorebuzz.net (#f2f2f2 page, white cards, black header/footer bars, lime "Buzz", blue accents) ===== */
  body{color:#1b1b1b;background:#f2f2f2}
  #glow{background:radial-gradient(ellipse at 80% 15%,${s.text}1c,transparent 50%),radial-gradient(ellipse at 10% 90%,#2f80ed14,transparent 50%)}
  #grid{background-image:linear-gradient(rgba(0,0,0,.03) 2px,transparent 2px),linear-gradient(90deg,rgba(0,0,0,.03) 2px,transparent 2px)}
  #hbar{position:absolute;left:0;right:0;top:0;height:${wide ? 140 : 220}px;background:#000;z-index:1}
  #fbar{position:absolute;left:0;right:0;bottom:0;height:${wide ? 120 : 240}px;background:#000;z-index:1}
  header{top:${wide ? 40 : 100}px;color:#fff}.logo b{color:#C6F432}
  #bar{background:#C6F432}
  footer{color:#bdbdbd}footer b{color:#C6F432}
  .kicker,.label{color:${s.text}}
  .hero,.title,.ctat,.btitle{color:#111}
  .sub,.note{color:#555}.note{border-left-color:${s.text}}
  .score,.table,.list{background:#fff;border-color:#e6e6e6;box-shadow:0 10px 36px rgba(0,0,0,.07)}
  .tm.dim{filter:none;opacity:.5}
  .bd{background:#f2f2f2;color:#111;border-color:${s.text}}
  .sc{color:#111}.sc i{color:#c4c4c4}.dimtxt{color:#a3a3a3}
  .st{color:${s.text};border-color:${s.text}55}
  .tr{border-top-color:#eeeeee}.tr span:last-child{color:${s.text}}
  .th{color:#8a8a8a}.th span:last-child{color:#8a8a8a}
  .tr.hi{background:${s.text}1a}.tr.dz{background:#e5393514}.tr.dz span:first-child{color:#d92d20}
  .row{border-top-color:#eeeeee}.row .m{color:${s.text}}
  .big b{color:${s.text}}.big span{color:#555}
  .bk{color:#2f80ed}
  .bbadge{background:#000;color:#C6F432}
  .bcard{box-shadow:0 20px 60px rgba(0,0,0,.12);border:2px solid #e6e6e6}
  .bx{background:#111;box-shadow:inset 0 -6px 0 #000}
  .bb{background:#111}
  .cb{border-color:#111;box-shadow:0 12px 0 #111}
  .url{color:#111}
  .bd.img,.bb.img{background:#fff}.bd img,.bb img{width:78%;height:78%;object-fit:contain}
  #ph{position:absolute;left:0;right:0;top:220px;height:640px;background-size:cover;background-position:center;opacity:0;z-index:0}
  #ph:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,#f2f2f2 100%)}
  #phc{position:absolute;right:24px;top:232px;z-index:3;font-size:20px;font-weight:600;color:#fff;background:rgba(0,0,0,.45);padding:4px 12px;border-radius:8px;max-width:820px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0}
  .scene.wp{top:780px;justify-content:flex-start}
  ${leagueTheme.css(LT)}
  </style></head><body><div id="glow"></div><div id="grid"></div>${v._photo && !wide ? `<div id="ph" style="background-image:url('${v._photo.src}')"></div><div id="phc">${esc(v._photo.credit)}</div>` : ''}<div id="hbar"></div><div id="fbar"></div><div id="bar"></div>
  <header><div class="logo">Score<b>Buzz</b></div><div class="tag">${s.emoji} ${esc(v.tagText || s.tag)}</div></header>
  ${scenes}
  <footer><span>Live scores · Tables · Results</span><b>scorebuzz.net</b></footer>
  <script>
  const TOTAL=${t};
  const ease=(x)=>1-Math.pow(1-Math.min(1,Math.max(0,x)),3);
  window.setFrame=(t)=>{
    document.getElementById('bar').style.width=(t/TOTAL*100)+'%';
    document.getElementById('glow').style.transform='translate('+(Math.sin(t/3)*40)+'px,'+(Math.cos(t/4)*40)+'px)';
    let phv=0;
    for(const sc of document.querySelectorAll('.scene')){
      const st=+sc.dataset.start,du=+sc.dataset.dur,l=t-st;
      const vis=l<0||l>=du?0:Math.min(1,l/0.25,(du-l)/0.25);
      if(sc.classList.contains('wp')) phv=Math.max(phv,vis);
      for(const id of ['ph','phc']){const e=document.getElementById(id); if(e) e.style.opacity=phv;}
      sc.style.opacity=vis; if(!vis) continue;
      for(const el of sc.querySelectorAll('.pop,.pop2')){
        const x=(l-(+el.dataset.at))/0.42;
        if(x<0){el.style.opacity=0;continue;}
        const k=Math.min(1,x), c1=1.9, c3=c1+1, back=1+c3*Math.pow(k-1,3)+c1*Math.pow(k-1,2);
        el.style.opacity=Math.min(1,x*3);
        if(el.classList.contains('pop')) el.style.transform='scale('+(3.2-2.2*back)+') rotate('+((1-k)*-14)+'deg)';
      }
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
  await assets.inlineCrests(v);
  v._photo = assets.photo(v.venue);
  const { page: doc, total, W, H, pops } = html(v);
  const sfx = path.join(outDir, `${v.id}.sfx.json`);
  if (pops.length) fs.writeFileSync(sfx, JSON.stringify(pops)); else if (fs.existsSync(sfx)) fs.unlinkSync(sfx);
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
  let thumbT = Math.min(total - 0.1, (v.scenes[0].dur || 2) + (v.scenes[1]?.dur || 2) - 0.6);
  let acc = 0;
  for (const sc of v.scenes) { if (sc.type === 'board') { thumbT = acc + sc.dur - 0.4; break; } acc += sc.dur; } // full results board
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
