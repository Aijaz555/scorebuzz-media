// YouTube Data API helper for ScoreBuzz live streams: creates one broadcast per game with its own
// title, description and thumbnail, binds it to one of our reusable stream keys, and lets YouTube
// auto-start it when video arrives and auto-stop it when the video ends.
//
// Needs an OAuth client + refresh token for the channel (scope https://www.googleapis.com/auth/youtube),
// stored on the server only, in tools/live/live.config.json:
//   "youtubeApi": { "clientId": "...", "clientSecret": "...", "refreshToken": "..." }
// Get the refresh token once with:  node tools/live/youtube.js auth
// Without it, autopilot still streams (YouTube then reuses the last title on each key).
const fs = require('fs');
const path = require('path');
const http = require('http');

const API = 'https://www.googleapis.com/youtube/v3';
let token = null, tokenExp = 0;

async function accessToken(cfg) {
  if (token && Date.now() < tokenExp - 60000) return token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: 'refresh_token' }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`oauth: ${j.error || res.status}: ${j.error_description || ""}`);
  token = j.access_token; tokenExp = Date.now() + j.expires_in * 1000;
  return token;
}

async function call(cfg, method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${await accessToken(cfg)}`, ...(body && !Buffer.isBuffer(body) ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  const j = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`youtube ${method} ${url.split('?')[0].split('/').pop()}: ${j.error?.message || res.status}`);
  return j;
}

// stream key -> liveStream id (the reusable keys created in YouTube Studio)
let streamIds = null;
async function streamIdForKey(cfg, key) {
  if (!streamIds) {
    streamIds = {};
    let page = '';
    do {
      const j = await call(cfg, 'GET', `${API}/liveStreams?part=id,cdn&mine=true&maxResults=50${page ? `&pageToken=${page}` : ''}`);
      for (const s of j.items || []) streamIds[s.cdn?.ingestionInfo?.streamName] = s.id;
      page = j.nextPageToken;
    } while (page);
  }
  const id = streamIds[key];
  if (!id) throw new Error('stream key not found on the channel (create it in YouTube Studio > Go live > Stream)');
  return id;
}

// Create a public broadcast for a game, bind it to the key, set its thumbnail. Returns the broadcast id.
async function createBroadcast(cfg, { title, description, start, key, thumbnail }) {
  const b = await call(cfg, 'POST', `${API}/liveBroadcasts?part=snippet,status,contentDetails`, {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 4900), scheduledStartTime: new Date(Math.max(Date.now() + 60000, new Date(start).getTime())).toISOString() },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    contentDetails: { enableAutoStart: true, enableAutoStop: true, enableDvr: true, latencyPreference: 'normal', monitorStream: { enableMonitorStream: false } },
  });
  await call(cfg, 'POST', `${API}/liveBroadcasts/bind?id=${b.id}&part=id&streamId=${await streamIdForKey(cfg, key)}`);
  if (thumbnail && fs.existsSync(thumbnail)) {
    try {
      await call(cfg, 'POST', `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${b.id}`, fs.readFileSync(thumbnail), { 'content-type': 'image/jpeg' });
    } catch (e) { console.log(`thumbnail not set: ${e.message}`); }
  }
  return b.id;
}

// End a broadcast early (normally auto-stop does this when the video stops).
async function endBroadcast(cfg, id) {
  return call(cfg, 'POST', `${API}/liveBroadcasts/transition?broadcastStatus=complete&id=${id}&part=status`);
}

module.exports = { createBroadcast, endBroadcast };

// Diagnose problems with explanations:  node tools/live/youtube.js check
const HINTS = [
  [/invalid_grant/i, 'The saved sign-in has expired or was revoked. Usual cause: the OAuth consent screen is in "Testing", where Google expires refresh tokens after 7 days. Fix: Google Cloud > APIs & Services > OAuth consent screen > Publish app (In production), then run `node tools/live/youtube.js auth` again.'],
  [/invalid_client|unauthorized_client/i, 'The client ID/secret in live.config.json are wrong, or the OAuth client was deleted. Copy them again from Google Cloud > Credentials (type must be "Desktop app").'],
  [/access_denied|has not completed the Google verification|access blocked/i, 'Google blocked the sign-in. Add your Google account as a Test user on the OAuth consent screen, or publish the app; when Google warns "unverified app", click Advanced > Go to (unsafe).'],
  [/accessNotConfigured|has not been used in project|disabled/i, 'YouTube Data API v3 is not enabled in this Google Cloud project: APIs & Services > Library > YouTube Data API v3 > Enable (same project as the OAuth client).'],
  [/liveStreamingNotEnabled|not enabled for live streaming/i, 'Live streaming is not enabled on the channel: YouTube Studio > Go live, verify the phone number, then wait up to 24 hours.'],
  [/quotaExceeded|dailyLimitExceeded/i, 'Daily API quota used up (10,000 units). It resets at midnight Pacific time.'],
  [/insufficient|forbidden|403/i, 'The account you signed in with does not own/manage the ScoreBuzz channel, or the scope was wrong. Run auth again and pick the Google account (and brand account) that owns @scorebuzznet.'],
  [/redirect_uri_mismatch/i, 'The OAuth client is not a "Desktop app" client. Create a new OAuth client ID of type Desktop app and use its id/secret.'],
];
const hint = (m) => (HINTS.find(([re]) => re.test(m)) || [null, ''])[1];

async function check() {
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, 'live.config.json'), 'utf8'));
  const c = conf.youtubeApi || {};
  const ok = (m) => console.log(`OK    ${m}`), bad = (m) => { console.log(`FAIL  ${m}`); const h = hint(m); if (h) console.log(`      → ${h}`); };
  if (!c.clientId || !c.clientSecret) return bad('youtubeApi.clientId / clientSecret missing in tools/live/live.config.json');
  ok('client id and secret present');
  if (!c.refreshToken) return bad('no refreshToken yet: run `node tools/live/youtube.js auth`');
  try { await accessToken(c); ok('sign-in token refreshed'); } catch (e) { return bad(e.message); }
  try {
    const ch = await call(c, 'GET', `${API}/channels?part=snippet&mine=true`);
    const t = ch.items?.[0]?.snippet;
    t ? ok(`signed in as channel: ${t.title} ${t.customUrl || ''}`) : bad('this Google account has no YouTube channel: run auth again and choose the ScoreBuzz channel / brand account');
  } catch (e) { bad(e.message); }
  try {
    const j = await call(c, 'GET', `${API}/liveStreams?part=id,cdn,snippet&mine=true&maxResults=50`);
    const names = (j.items || []).map((s) => s.cdn?.ingestionInfo?.streamName);
    ok(`${names.length} stream key(s) on the channel`);
    for (const k of conf.keys || []) {
      const key = typeof k === 'string' ? k : k.youtube;
      if (!key) continue;
      names.includes(key) ? ok(`key …${key.slice(-4)} found`) : bad(`key …${key.slice(-4)} from live.config.json is not one of the channel's stream keys (copy it again from YouTube Studio > Go live > Stream)`);
    }
  } catch (e) { bad(e.message); }
  try { await call(c, 'GET', `${API}/liveBroadcasts?part=id&mine=true&maxResults=1`); ok('live broadcasts API reachable (live streaming enabled)'); } catch (e) { bad(e.message); }
}

// One-time: get a refresh token.  node tools/live/youtube.js auth
// Works without an SSH tunnel: after signing in, Google sends the browser to http://127.0.0.1:8788/?code=…
// which will NOT load on your computer — that's expected. Copy that whole address from the browser's
// address bar and paste it into this terminal.
async function auth() {
  const file = path.join(__dirname, 'live.config.json');
  const conf = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { clientId, clientSecret } = conf.youtubeApi || {};
  if (!clientId || !clientSecret) { console.error('put youtubeApi.clientId and clientSecret in tools/live/live.config.json first'); process.exit(1); }
  const redirect = 'http://127.0.0.1:8788';
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube', access_type: 'offline', prompt: 'consent' })}`;
  console.log(`\n1. Open this link on any computer or phone and sign in with the Google account that owns the ScoreBuzz channel:\n\n${url}\n`);
  console.log('2. If Google says the app is unverified: Advanced > Go to … (unsafe). Allow access.');
  console.log('3. The browser then shows "This site can\'t be reached" at 127.0.0.1:8788 — that is expected.');
  console.log('   Copy the WHOLE address from the address bar (it contains code=…) and paste it here, then press Enter:\n');
  const finish = async (code) => {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }) });
    const j = await r.json();
    if (!j.refresh_token) { const m = j.error ? `${j.error}: ${j.error_description || ''}` : JSON.stringify(j); console.error(`\nFAILED: ${m}`); const h = hint(m); if (h) console.error(`→ ${h}`); process.exit(1); }
    conf.youtubeApi.refreshToken = j.refresh_token;
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    console.log('\nConnected. Refresh token saved. Now run: node tools/live/youtube.js check && pm2 restart scorebuzz-live');
    process.exit(0);
  };
  // pasted URL (or bare code) on stdin
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => {
    const t = d.trim(); if (!t) return;
    let code = t;
    try { const u = new URL(t); code = u.searchParams.get('code') || ''; if (u.searchParams.get('error')) { console.error(`Google returned: ${u.searchParams.get('error')}`); console.error(`→ ${hint(u.searchParams.get('error'))}`); process.exit(1); } } catch (e) { /* bare code */ }
    if (!code) { console.log('No code= in that address. Paste the full address from the browser.'); return; }
    finish(decodeURIComponent(code));
  });
  // or an SSH tunnel (ssh -L 8788:127.0.0.1:8788 user@server) lets the browser hit this directly
  http.createServer((req, res) => {
    const code = new URL(req.url, redirect).searchParams.get('code');
    res.end(code ? 'ScoreBuzz is connected to YouTube. You can close this tab.' : 'no code');
    if (code) finish(code);
  }).listen(8788, '127.0.0.1').on('error', () => {});
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'auth') auth();
  else if (cmd === 'check') check().then(() => process.exit(0));
  else console.log('usage: node tools/live/youtube.js auth | check');
}
