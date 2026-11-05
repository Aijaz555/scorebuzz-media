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
  if (!res.ok) throw new Error(`oauth: ${j.error_description || j.error || res.status}`);
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

// One-time: get a refresh token.  node tools/live/youtube.js auth  (reads clientId/clientSecret from live.config.json)
if (require.main === module && process.argv[2] === 'auth') {
  const file = path.join(__dirname, 'live.config.json');
  const conf = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { clientId, clientSecret } = conf.youtubeApi || {};
  if (!clientId || !clientSecret) { console.error('put youtubeApi.clientId and clientSecret in tools/live/live.config.json first'); process.exit(1); }
  const redirect = 'http://127.0.0.1:8788';
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube', access_type: 'offline', prompt: 'consent' })}`;
  console.log(`1. On your own computer run:  ssh -L 8788:127.0.0.1:8788 <user>@<server>\n2. Open this link in that computer's browser and allow access:\n\n${url}\n`);
  http.createServer(async (req, res) => {
    const code = new URL(req.url, redirect).searchParams.get('code');
    if (!code) { res.end('no code'); return; }
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }) });
    const j = await r.json();
    if (!j.refresh_token) { res.end(`failed: ${JSON.stringify(j)}`); console.error(j); process.exit(1); }
    conf.youtubeApi.refreshToken = j.refresh_token;
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    res.end('ScoreBuzz is connected to YouTube. You can close this tab.');
    console.log('refresh token saved to tools/live/live.config.json');
    process.exit(0);
  }).listen(8788, '127.0.0.1');
}
