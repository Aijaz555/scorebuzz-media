// Shared helpers for cards / Shorts: team crests and stadium photos, inlined as data URIs so the
// headless browser never needs network access.
//   crest:  any https image URL (use ESPN's team.logo from the scoreboard/summary JSON, e.g.
//           https://a.espncdn.com/i/teamlogos/soccer/500/364.png). Cached in tools/.cache/logos.
//   photo:  a venue name as ESPN writes it (competitions[0].venue.fullName), looked up in photos/<slug>.jpg,
//           fetched from Wikimedia Commons by the "Stadium photos" GitHub Action with its licence + credit
//           in photos/<slug>.json. The credit MUST be shown on the image (the generators do this).
// Never pass photos of players or other people: stadium/venue photos and crests only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache', 'logos');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function crest(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, crypto.createHash('md5').update(url).digest('hex') + path.extname(new URL(url).pathname || '.png'));
  if (!fs.existsSync(f)) {
    try {
      const r = await fetch(url.replace(/^http:/, 'https:'));
      if (!r.ok) return null;
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    } catch (e) { return null; }
  }
  const ext = path.extname(f).slice(1).toLowerCase();
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext || 'png'};base64,${fs.readFileSync(f).toString('base64')}`;
}

function photo(venue) {
  if (!venue) return null;
  const s = slug(venue);
  const jpg = path.join(ROOT, 'photos', `${s}.jpg`), meta = path.join(ROOT, 'photos', `${s}.json`);
  if (!fs.existsSync(jpg) || !fs.existsSync(meta)) return null;
  const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
  return { src: `data:image/jpeg;base64,${fs.readFileSync(jpg).toString('base64')}`, credit: m.credit, venue: m.venue };
}

// Resolve every *Logo field (homeLogo, awayLogo, rows[].homeLogo …) to a data URI, in place.
async function inlineCrests(obj) {
  if (Array.isArray(obj)) { for (const x of obj) await inlineCrests(x); return obj; }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (/Logo$/.test(k) && typeof obj[k] === 'string') obj[k] = await crest(obj[k]);
      else if (typeof obj[k] === 'object') await inlineCrests(obj[k]);
    }
  }
  return obj;
}

module.exports = { crest, photo, inlineCrests, slug };
