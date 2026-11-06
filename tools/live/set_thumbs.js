// Uploads thumbs/live/<videoId>.jpg as the YouTube thumbnail of each video (thumbnails.set, 50 quota units each).
// Runs inside the "Live thumbnails" GitHub Action; credentials come from repository secrets, never from the repo:
//   YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN  (OAuth "Desktop app" client, scope .../auth/youtube,
//   refresh token from `node tools/live/youtube.js auth` signed in as the account that owns @scorebuzznet)
// Usage: VIDEO_IDS=id1,id2 node tools/live/set_thumbs.js
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'thumbs', 'live');
const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: secret, YT_REFRESH_TOKEN: refresh, VIDEO_IDS = '' } = process.env;

const HINTS = [
  [/invalid_grant/i, 'Refresh token expired/revoked (consent screen in "Testing" expires tokens after 7 days): publish the OAuth app, run `node tools/live/youtube.js auth` again and update YT_REFRESH_TOKEN.'],
  [/forbidden|permission|403/i, 'Custom thumbnails need a phone-verified channel (YouTube Studio > Settings > Channel > Feature eligibility), and the token must belong to the account that owns @scorebuzznet.'],
  [/accessNotConfigured|has not been used/i, 'Enable "YouTube Data API v3" in the same Google Cloud project as the OAuth client.'],
  [/quotaExceeded/i, 'Daily API quota used up; it resets at midnight Pacific time.'],
];

(async () => {
  if (!id || !secret || !refresh) { console.log('::error::YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN repository secrets are not set'); process.exit(1); }
  const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }) })).json();
  if (!t.access_token) { const m = `${t.error}: ${t.error_description || ''}`; console.log(`::error::oauth ${m} ${(HINTS.find(([r]) => r.test(m)) || [])[1] || ''}`); process.exit(1); }
  const doneFile = path.join(DIR, 'done.json');
  const done = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : {};
  let failed = 0;
  for (const v of VIDEO_IDS.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!/^[\w-]{11}$/.test(v)) { console.log(`skip bad id ${v}`); continue; }
    const f = path.join(DIR, `${v}.jpg`);
    if (!fs.existsSync(f)) { console.log(`::warning::${v}: no thumbs/live/${v}.jpg`); failed++; continue; }
    const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${v}`, { method: 'POST',
      headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'image/jpeg' }, body: fs.readFileSync(f) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { console.log(`OK ${v}`); done[v] = new Date().toISOString(); }
    else { const m = j.error?.message || String(r.status); console.log(`::warning::${v}: ${m} ${(HINTS.find(([re]) => re.test(m)) || [])[1] || ''}`); failed++; }
  }
  fs.writeFileSync(doneFile, JSON.stringify(done, null, 1) + '\n');
  if (failed) process.exitCode = 1;
})();
