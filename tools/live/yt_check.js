// Checks the YouTube login saved in GitHub secrets (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN).
// Prints the channel it signs in as and the granted scopes. Never prints the secrets.
const env = (k) => String(process.env[k] || '').trim().replace(/^["']|["']$/g, '');
const hints = {
  unauthorized_client: 'The refresh token was made with a different OAuth client than YT_CLIENT_ID. Make the token in OAuth Playground with "Use your own OAuth credentials" ticked, using this same client id/secret.',
  invalid_grant: 'The refresh token is wrong, revoked or expired. Make a new one (Google app must be "In production", not "Testing", or tokens expire after 7 days). Copy the Refresh token (starts with 1//), not the Authorization code or Access token.',
  invalid_client: 'YT_CLIENT_ID or YT_CLIENT_SECRET is wrong (or the client was deleted). Copy both again from Google Cloud > Credentials.',
};
(async () => {
  const id = env('YT_CLIENT_ID'), secret = env('YT_CLIENT_SECRET'), refresh = env('YT_REFRESH_TOKEN');
  for (const [k, v] of Object.entries({ YT_CLIENT_ID: id, YT_CLIENT_SECRET: secret, YT_REFRESH_TOKEN: refresh })) if (!v) { console.log(`MISSING secret ${k}`); process.exit(1); }
  console.log(`client id looks ${/\.apps\.googleusercontent\.com$/.test(id) ? 'ok' : 'WRONG (should end in .apps.googleusercontent.com)'}`);
  console.log(`refresh token looks ${refresh.startsWith('1//') ? 'ok (starts with 1//)' : 'WRONG (a refresh token starts with 1//)'}`);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok) { console.log(`LOGIN FAILED: ${j.error} ${j.error_description || ''}`); console.log(`FIX: ${hints[j.error] || 'see tools/live/LIVE.md'}`); process.exit(1); }
  console.log(`login ok, scopes: ${j.scope}`);
  const c = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${j.access_token}` } })).json();
  if (c.error) { console.log(`YOUTUBE API ERROR: ${c.error.message}`); if (/not been used|disabled/i.test(c.error.message)) console.log('FIX: enable "YouTube Data API v3" in the same Google Cloud project.'); process.exit(1); }
  const ch = (c.items || [])[0];
  if (!ch) { console.log('Signed in, but this Google account has no YouTube channel. Sign in again and pick the ScoreBuzz channel when Google asks to choose an account.'); process.exit(1); }
  console.log(`SIGNED IN AS CHANNEL: ${ch.snippet.title} (${ch.id})`);
  if (ch.id !== 'UCEqYnHP5uOa11Zspr7TNmOA') { console.log('WARNING: this is not ScoreBuzz (UCEqYnHP5uOa11Zspr7TNmOA). Sign in again and pick the ScoreBuzz channel.'); process.exit(1); }
  console.log('ALL GOOD: thumbnails, tags and the live vote can use this login.');
})().catch((e) => { console.log(`ERROR: ${e.message}`); process.exit(1); });
