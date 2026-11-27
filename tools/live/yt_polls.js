// Opens a "Who wins?" poll in the live chat of every ScoreBuzz broadcast shortly after it goes live.
// Runs from the "YouTube live polls" GitHub Action (started by every stream-plan commit, then looping) with the same sign-in as the tags job
// (repository secrets YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN). One poll per broadcast: the ids already
// done are kept in a small state file (first argument path, kept between runs by the workflow's cache).
// Football gets Home / Draw / Away, every other sport the two teams. Nothing else on the broadcast is touched.
//   node yt_polls.js <state.json>                 normal run
//   node yt_polls.js <state.json> --only <id>     one broadcast, whatever its age (test)
//   node yt_polls.js <state.json> --close <id>    close the running poll on one broadcast
//   node yt_polls.js <state.json> --force         every live broadcast without a poll, whatever its age
//   node yt_polls.js <state.json> --loop <min>    keep looking every 4 minutes for <min> minutes (what the Action runs)
// Quota: 1 unit per look + 20 per poll opened.
const fs = require('fs');
const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: secret, YT_REFRESH_TOKEN: refresh } = process.env;
const API = 'https://www.googleapis.com/youtube/v3';
const SOCCER = /\bMLS\b|premier league|\bEPL\b|champions league|\bUCL\b|europa league|conference league|la ?liga|serie a|ligue 1|bundesliga|eredivisie|championship|liga mx|liga profesional|primera|a-league|libertadores|sudamericana|brasileir|fa cup|efl cup|carabao|world cup|copa|euro\b|nations league|afc |saudi|scottish|primeira|super lig|friendl/i;
const MAX_AGE = 90 * 60e3;        /* a broadcast live for longer than this gets no "Who wins?" poll: the game is well under way */
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);

function pollFor(title) {
  const m = String(title).match(/^(.+?)\s+vs\.?\s+(.+?)\s+Live Score\b/i);
  if (!m) return null;
  const a = m[1].trim(), b = m[2].trim();
  if (!a || !b) return null;
  const opts = SOCCER.test(title) && !/\b(NFL|NBA|NHL|MLB|NCAA\w*|WNBA)\b/i.test(title) ? [a, 'Draw', b] : [a, b];
  return { questionText: cut(`Who wins? ${a} vs ${b}`, 100), options: opts.map((o) => ({ optionText: cut(o, 30) })) };
}

async function call(token, method, url, body) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`${method} ${url.split('?')[0].split('/').pop()}: ${j.error?.message || r.status}`); e.reason = j.error?.errors?.[0]?.reason || ''; e.status = r.status; throw e; }
  return j;
}

if (require.main !== module) { module.exports = { pollFor }; return; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let done = {}, stateFile = '';
const save = () => { if (!stateFile) return; fs.mkdirSync(require('path').dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(done)); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });      /* a newer run replaces this one: keep what was done */

async function pass(flag, one) {
  const now = Date.now();
  for (const k of Object.keys(done)) if (now - done[k].t > 3 * 864e5) delete done[k];
  const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }) })).json();
  if (!t.access_token) throw new Error(`oauth ${t.error}: ${t.error_description || ''}`);
  const tok = t.access_token;
  const j = await call(tok, 'GET', `${API}/liveBroadcasts?part=snippet&broadcastStatus=active&broadcastType=all&maxResults=50`);
  let failed = 0;
  for (const b of j.items || []) {
    const s = b.snippet || {};
    if (flag === '--close') {
      if (b.id !== one) continue;
      const p = done[b.id]?.poll;
      if (!p) { console.log(`no poll on record for ${b.id}`); continue; }
      try { await call(tok, 'POST', `${API}/liveChat/messages/transition?id=${encodeURIComponent(p)}&status=closed&part=snippet`); console.log(`CLOSED    ${b.id}  ${s.title}`); }
      catch (e) { console.log(`::warning::${b.id}: ${e.message}`); failed++; }
      continue;
    }
    if (flag === '--only' && b.id !== one) continue;
    if (done[b.id] && flag !== '--only') continue;
    const age = now - Date.parse(s.actualStartTime || s.scheduledStartTime || 0);
    if (flag !== '--only' && flag !== '--force' && !(age < MAX_AGE)) { done[b.id] = { t: now, skip: 'old' }; console.log(`too late  ${b.id}  ${s.title}`); continue; }
    const poll = pollFor(s.title);
    if (!poll) { done[b.id] = { t: now, skip: 'title' }; console.log(`::warning::${b.id}: could not read teams from "${s.title}"`); continue; }
    if (!s.liveChatId) { console.log(`no chat   ${b.id}  ${s.title}`); continue; }
    try {
      const r = await call(tok, 'POST', `${API}/liveChat/messages?part=snippet`, { snippet: { liveChatId: s.liveChatId, type: 'pollEvent', pollDetails: { metadata: poll } } });
      done[b.id] = { t: now, poll: r.id };
      console.log(`POLL      ${b.id}  ${s.title}  [${poll.options.map((o) => o.optionText).join(' / ')}]`);
    } catch (e) {
      /* a poll is already running (opened by hand), or chat is off: nothing to retry */
      if (/preconditionCheckFailed|liveChatDisabled|liveChatEnded|liveChatNotFound/.test(e.reason)) done[b.id] = { t: now, skip: e.reason };
      console.log(`::warning::${b.id}: ${e.message} ${e.reason}`); failed++;
    }
  }
  save();
  return failed;
}

(async () => {
  const file = process.argv[2], flag = process.argv[3], one = process.argv[4];
  if (!file) { console.log('::error::state file path missing'); process.exit(1); }
  if (!id || !secret || !refresh) { console.log('::error::YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN repository secrets are not set'); process.exit(1); }
  stateFile = file;
  try { done = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  if (flag === '--loop') {
    /* GitHub's own timer starts jobs hours late, so one run keeps looking every 4 minutes for <minutes> */
    const end = Date.now() + (Number(one) || 240) * 60e3;
    while (Date.now() < end) { try { await pass(); } catch (e) { console.log(`::warning::${e.message}`); } await sleep(4 * 60e3); }
    return;
  }
  try { if (await pass(flag, one)) process.exitCode = 1; } catch (e) { console.log(`::error::${e.message}`); process.exit(1); }
})();
