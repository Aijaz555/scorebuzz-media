// Table-channel style thumbnails (owner's request, 8 Nov 2026), 1280x720, modelled on popular "league table updated
// today" channels: a bright gradient banner "<LEAGUE> TABLE", a league-coloured FULL TIME panel (crest + score, VS,
// crest + score, Matchweek N), a mini standings table with crests, and a stadium photo on the right.
// Our rules still apply: club crests (ESPN) yes; NO league logo, NO player photos, only CC-licensed stadium photos
// from photos/ (credit shown).
// Usage: node tools/make_table_thumbs.js <videos.json> <dir> [id ...]
//   uses each entry's `tt` (written by tools/league_pack.js). Writes <id>.thumb.jpg (result style) and
//   <id>.fixtures.thumb.jpg (fixtures style).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const leagueTheme = require('./league_theme');
const assets = require('./media_assets');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/London' }).toUpperCase();

function miniTable(tt, T, rowH, fs) {
  const n = tt.table.length, rel = n - tt.zones.rel;
  return `<div class="mt" style="--rh:${rowH}px;--fs:${fs}px">
    <div class="mr mh"><span>#</span><span></span><span class="tn">TEAM</span><span>P</span><span>GD</span><span>PTS</span></div>
    ${tt.table.map((r) => `<div class="mr ${r.rank <= tt.zones.ucl ? 'up' : ''} ${r.rank > rel ? 'dn' : ''}">
      <span>${r.rank}</span><span>${r.logo ? `<img src="${r.logo}">` : ''}</span><span class="tn">${esc(r.team)}</span><span>${r.p}</span><span>${esc(r.gd)}</span><b>${r.pts}</b></div>`).join('')}
  </div>`;
}

function css(T) {
  return `*{margin:0;padding:0;box-sizing:border-box}
  body{width:1280px;height:720px;overflow:hidden;font-family:Inter,'Arial Black',sans-serif;background:${T.primary};position:relative}
  .ban{position:absolute;left:0;right:0;top:0;height:96px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(90deg,#FFD93B,#FF8A3D 25%,#FF4FA3 50%,#7C5CFF 75%,#3DDCFF);}
  .ban h1{font-size:64px;font-weight:900;letter-spacing:-1px;color:${T.primary};text-transform:uppercase;font-style:italic;
    text-shadow:3px 3px 0 #fff}
  .ft{position:absolute;left:0;top:96px;bottom:0;width:300px;background:${T.primary};color:#fff;display:flex;flex-direction:column;
    align-items:center;justify-content:space-between;padding:18px 0 22px}
  .ft .k{font-size:28px;font-weight:900;letter-spacing:1px}
  .ft .tm{display:flex;align-items:center;gap:22px}
  .ft .tm img{width:118px;height:118px;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))}
  .ft .tm b{font-size:124px;font-weight:900;line-height:1;width:80px;text-align:center}
  .ft .vs{font-size:52px;font-weight:900;color:${T.accent}}
  .ft .mw{font-size:30px;font-weight:900;color:${T.accent}}
  .tbl{position:absolute;left:300px;top:96px;bottom:0;width:430px;background:#fff;padding:8px 10px}
  .mt{display:flex;flex-direction:column}
  .mr{display:grid;grid-template-columns:30px 28px 1fr 34px 46px 46px;align-items:center;height:var(--rh);font-size:var(--fs);
    font-weight:700;color:#1b1b1b;border-bottom:1px solid #eee;text-align:center}
  .mr .tn{text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mr img{width:calc(var(--rh) - 6px);height:calc(var(--rh) - 6px);object-fit:contain;vertical-align:middle}
  .mr b{font-weight:900;color:${T.primary}}
  .mh{color:#777;font-size:calc(var(--fs) - 3px)}
  .mr.up{background:${T.accent}33}.mr.dn{background:#ff4d5e2e}
  .ph{position:absolute;left:730px;right:0;top:96px;bottom:0;overflow:hidden;background:${T.primary}}
  .ph img{width:100%;height:135%;object-fit:cover;object-position:50% 0}
  .ph .cr{position:absolute;right:8px;bottom:6px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:4px;max-width:520px}
  .ph .big{position:absolute;left:24px;right:24px;top:24px;display:flex;flex-direction:column;gap:10px}
  .pill{align-self:flex-start;background:${T.hot};color:#fff;font-weight:900;font-size:34px;padding:8px 20px;border-radius:12px;transform:rotate(-3deg);
    box-shadow:0 6px 0 rgba(0,0,0,.35)}
  .sb{position:absolute;left:24px;bottom:28px;font-size:34px;font-weight:900;color:#fff;text-shadow:0 3px 8px rgba(0,0,0,.7)}.sb b{color:#C6F432}
  /* fixtures style */
  .fx{position:absolute;left:0;top:96px;bottom:0;width:820px;background:linear-gradient(180deg,${T.primary},#000);padding:14px 22px;color:#fff}
  .fx .hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
  .fx .hd .d{font-size:36px;font-weight:900}.fx .hd .s{font-size:30px;font-weight:900;color:${T.accent}}
  .fr{display:grid;grid-template-columns:44px 1fr 64px 1fr 44px;align-items:center;gap:8px;height:46px;margin-bottom:7px}
  .fr img{width:42px;height:42px;object-fit:contain;background:#fff;border-radius:50%;padding:3px}
  .fr .t{background:${T.hot};height:42px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;text-transform:uppercase;
    border-radius:6px;white-space:nowrap;overflow:hidden}
  .fr .v{background:#fff;color:${T.primary};height:42px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:24px;border-radius:6px}
  .st{position:absolute;left:820px;right:0;top:96px;bottom:0;background:#fff;padding:8px 10px}
  .st h2{font-size:30px;font-weight:900;color:${T.primary};text-align:center;margin-bottom:4px}`;
}

async function build(v) {
  const tt = JSON.parse(JSON.stringify(v.tt));
  await assets.inlineCrests(tt);
  for (const r of tt.table) r.logo = await assets.crest(r.logo);
  const T = leagueTheme.theme(tt.league) || leagueTheme.theme('epl');
  const ph = assets.photo(tt.result.venue);
  const r = tt.result;
  const result = `<!doctype html><html><head><meta charset="utf-8"><style>${css(T)}</style></head><body>
    <div class="ban"><h1>${esc(tt.name)} Table</h1></div>
    <div class="ft"><div class="k">FULL TIME</div>
      <div class="tm"><img src="${r.homeLogo}"><b>${r.hs}</b></div><div class="vs">VS</div>
      <div class="tm"><img src="${r.awayLogo}"><b>${r.as}</b></div>
      <div class="mw">Matchweek ${tt.mw}</div></div>
    <div class="tbl">${miniTable(tt, T, Math.floor(600 / (tt.table.length + 1)), 17)}</div>
    <div class="ph">${ph ? `<img src="${ph.src}"><div class="cr">${esc(ph.credit)}</div>` : ''}
      <div class="big"><div class="pill">UPDATED TABLE</div></div>
      <div class="sb">Score<b>Buzz</b></div></div>
  </body></html>`;
  const fx = tt.fixtures.slice(0, 10);
  const fixtures = !fx.length ? null : `<!doctype html><html><head><meta charset="utf-8"><style>${css(T)}</style></head><body>
    <div class="ban"><h1>${esc(tt.name)} Fixtures</h1></div>
    <div class="fx"><div class="hd"><span class="d">MATCHWEEK ${tt.mw + 1} · ${day(fx[0].date)}${day(fx[fx.length - 1].date) !== day(fx[0].date) ? ' – ' + day(fx[fx.length - 1].date) : ''}</span><span class="s">${esc(tt.season)}</span></div>
      ${fx.map((f) => `<div class="fr"><img src="${f.homeLogo}"><div class="t">${esc(f.home)}</div><div class="v">VS</div><div class="t">${esc(f.away)}</div><img src="${f.awayLogo}"></div>`).join('')}
    </div>
    <div class="st"><h2>STANDINGS</h2>${miniTable(tt, T, Math.floor(560 / (tt.table.length + 1)), 15)}</div>
  </body></html>`;
  return { result, fixtures };
}

(async () => {
  const [json, dir, ...ids] = process.argv.slice(2);
  const list = JSON.parse(fs.readFileSync(json, 'utf8')).filter((v) => v.tt && (!ids.length || ids.includes(v.id)));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  for (const v of list) {
    const h = await build(v);
    for (const [name, doc] of [[`${v.id}.thumb.jpg`, h.result], [`${v.id}.fixtures.thumb.jpg`, h.fixtures]]) {
      if (!doc) continue;
      await page.setContent(doc, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 90 });
      console.log(path.join(dir, name));
    }
  }
  await browser.close();
})();
