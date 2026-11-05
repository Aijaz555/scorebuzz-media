// Runs in GitHub Actions ("Stadium photos" workflow): for every venue in photos/wanted.json, finds a
// freely licensed photo of the stadium on Wikimedia Commons and saves
//   photos/<slug>.jpg   (1600px wide)
//   photos/<slug>.json  { venue, file, page, author, license, licenseUrl, credit }
// Only licences that allow commercial reuse are accepted: CC0, public domain, CC BY, CC BY-SA
// (never NC/ND). The credit line must be shown on anything that uses the photo.
// Stadium/venue photos only: never photos of players or other people.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'photos');
const UA = 'ScoreBuzzMedia/1.0 (https://scorebuzz.net; stadium photos with attribution)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OK_LIC = /^(cc0|public domain|pd\b|pd-|cc[- ]by(-sa)?[- ]\d(\.\d)?)/i;
const BAD_LIC = /\bnc\b|\bnd\b|non-?commercial|no ?deriv/i;
const BAD_TITLE = /logo|crest|badge|map|plan|diagram|seat(ing)?[ _-]?chart|ticket|svg|kit|shirt|jersey|mascot|player|portrait|statue|celebrat|fans?\b|team photo|squad|interview|press conference|construction|demolition|model|render/i;
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function api(params) {
  const u = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const r = await fetch(u, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`commons ${r.status}`);
  return r.json();
}

// photos/blocked.json: {"<slug>": ["File:...jpg", ...]} files rejected on review (people, poor quality)
const BLOCKED = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'blocked.json'), 'utf8')); } catch (e) { return {}; } })();

async function find(v) {
  const queries = [`"${v.name}"`, `${v.name} ${v.city}`.trim(), `${v.name} stadium`];
  const seen = new Set(), cands = [];
  for (const q of queries) {
    let j;
    try {
      j = await api({ action: 'query', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '25', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600' });
    } catch (e) { continue; }
    for (const p of Object.values(j.query?.pages || {})) {
      if (seen.has(p.title) || (BLOCKED[v.slug] || []).includes(p.title)) continue; seen.add(p.title);
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const m = ii.extmetadata || {};
      const lic = strip(m.LicenseShortName?.value);
      if (!OK_LIC.test(lic) || BAD_LIC.test(lic) || BAD_TITLE.test(p.title)) continue;
      if (ii.mime !== 'image/jpeg' || ii.width < 1400 || ii.width < ii.height * 1.25) continue;
      const words = v.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !/stadium|stadio|estadio|stade|arena|park|field|center|centre|ground/.test(w));
      const t = p.title.toLowerCase();
      const hits = words.filter((w) => t.includes(w)).length;
      if (words.length && !hits) continue;
      const year = Number((strip(m.DateTimeOriginal?.value).match(/(19|20)\d\d/) || [0])[0]);
      cands.push({ p, ii, m, lic, score: hits * 10 + (year >= 2015 ? 5 : 0) + Math.min(5, ii.width / 1000) + (/interior|inside|pitch|stands|view/i.test(t) ? 2 : 0) });
    }
    if (cands.length >= 5) break;
  }
  cands.sort((a, b) => b.score - a.score);
  return cands[0] || null;
}

(async () => {
  const want = JSON.parse(fs.readFileSync(path.join(DIR, 'wanted.json'), 'utf8'));
  const max = Number(process.env.MAX || 400);
  let got = 0, miss = [];
  for (const v of want.slice(0, max)) {
    if (fs.existsSync(path.join(DIR, `${v.slug}.json`))) continue;
    try {
      const c = await find(v);
      if (!c) { miss.push(v.name); continue; }
      const img = await fetch(c.ii.thumburl || c.ii.url, { headers: { 'user-agent': UA } });
      if (!img.ok) { miss.push(v.name); continue; }
      fs.writeFileSync(path.join(DIR, `${v.slug}.jpg`), Buffer.from(await img.arrayBuffer()));
      const author = strip(c.m.Artist?.value) || 'Unknown author';
      const meta = {
        venue: v.name, city: v.city, file: c.p.title, page: c.ii.descriptionurl, author, license: c.lic,
        licenseUrl: strip(c.m.LicenseUrl?.value) || '', credit: `Photo: ${author.slice(0, 60)} / Wikimedia Commons, ${c.lic}`,
      };
      fs.writeFileSync(path.join(DIR, `${v.slug}.json`), JSON.stringify(meta, null, 1) + '\n');
      got++;
      console.log(`OK   ${v.name}  <-  ${c.p.title} (${c.lic})`);
    } catch (e) { miss.push(v.name); console.log(`ERR  ${v.name}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 300)); // be polite to the Commons API
  }
  // index of everything we have
  const index = {};
  for (const f of fs.readdirSync(DIR)) if (f.endsWith('.json') && !['wanted.json', 'index.json', 'blocked.json'].includes(f)) {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); index[f.replace(/\.json$/, '')] = { venue: m.venue, credit: m.credit };
  }
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  console.log(`\n${got} new photo(s); ${miss.length} venue(s) without a usable photo: ${miss.join(', ')}`);
})();
