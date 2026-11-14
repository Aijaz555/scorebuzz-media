// Adds YouTube tags (and the Sports category) to every upcoming or live ScoreBuzz broadcast that has none.
// LiveReacting can't set YouTube tags, so this runs every 10 minutes from the "YouTube live tags" GitHub Action.
// Only tags and category change: title, description and thumbnail are left as they are.
// Credentials come from repository secrets: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
// Quota: 2 list calls + 1 per video checked, 50 units per video tagged (each video is tagged once).
const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: secret, YT_REFRESH_TOKEN: refresh } = process.env;
const API = 'https://www.googleapis.com/youtube/v3';

const LEAGUES = [
  [/\bNBA\b/i, 'nba'], [/\bNHL\b/i, 'nhl'], [/\bNFL\b/i, 'nfl'], [/\bNCAAF\b|college football/i, 'college football', 'ncaaf'],
  [/\bMLB\b/i, 'mlb'], [/\bMLS\b/i, 'mls'], [/premier league|\bEPL\b/i, 'premier league'], [/champions league|\bUCL\b/i, 'champions league'],
  [/la ?liga/i, 'laliga'], [/serie a/i, 'serie a'], [/ligue 1/i, 'ligue 1'],
];
const TWO_WORD = /(golden knights|trail blazers|red wings|maple leafs|blue jackets|white sox|red sox|blue jays|blue devils|crimson tide|fighting illini|fighting irish|golden bears|golden gophers|tar heels|yellow jackets|red raiders|sun devils|horned frogs|nittany lions|scarlet knights|demon deacons|mean green|golden hurricane|rainbow warriors|black knights|green wave|red storm|golden eagles|blue hens|thundering herd|ragin cajuns)$/i;
const last = (t) => { const s = t.trim().toLowerCase(); const m = s.match(TWO_WORD); return m ? m[1] : s.split(/\s+/).pop(); };

// "Miami Heat vs Cleveland Cavaliers NBA Live Scoreboard" -> tag list
function tagsFor(title) {
  const m = title.match(/^(.+?)\s+(?:vs\.?|v|@)\s+(.+?)(?:\s+(?:NBA|NHL|NFL|NCAAF|MLB|MLS|Live|\||-|·)\b|$)/i);
  if (!m) return null;
  const [t1, t2] = [m[1].trim(), m[2].trim()];
  const L = LEAGUES.find(([re]) => re.test(title));
  const lg = L ? L[1] : '';
  const short = L?.[2] || lg;
  const n1 = last(t1), n2 = last(t2);
  const tags = [
    `${n1} vs ${n2}`, `${n1} vs ${n2} live`, `${n2} vs ${n1}`, `${t1} vs ${t2}`.toLowerCase(),
    t1.toLowerCase(), t2.toLowerCase(),
    ...(lg ? [`${lg} live score`, `${short} live scoreboard`, `${lg} live today`, `${short} live`] : []),
    'live score', 'live scoreboard', 'play by play', 'scorebuzz',
  ];
  const out = [];
  let len = 0;
  for (const t of [...new Set(tags)]) { if (len + t.length + 1 > 480) break; out.push(t); len += t.length + 1; }
  return out;
}

async function call(token, method, url, body) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url.split('?')[0].split('/').pop()}: ${j.error?.message || r.status}`);
  return j;
}

(async () => {
  if (!id || !secret || !refresh) { console.log('::error::YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN repository secrets are not set'); process.exit(1); }
  const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }) })).json();
  if (!t.access_token) { console.log(`::error::oauth ${t.error}: ${t.error_description || ''} (run the "YouTube login check" workflow for help)`); process.exit(1); }
  const tok = t.access_token;

  const ids = [];
  for (const status of ['active', 'upcoming']) {
    const j = await call(tok, 'GET', `${API}/liveBroadcasts?part=id&broadcastStatus=${status}&broadcastType=all&maxResults=50`);
    ids.push(...(j.items || []).map((b) => b.id));
  }
  if (!ids.length) return console.log('no upcoming or live broadcasts');

  let failed = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const v = await call(tok, 'GET', `${API}/videos?part=snippet&id=${ids.slice(i, i + 50).join(',')}`);
    for (const item of v.items || []) {
      const s = item.snippet;
      if (s.tags?.length) { console.log(`has tags  ${item.id}  ${s.title}`); continue; }
      const tags = tagsFor(s.title);
      if (!tags) { console.log(`::warning::${item.id}: could not read teams from "${s.title}"`); continue; }
      try {
        await call(tok, 'PUT', `${API}/videos?part=snippet`, { id: item.id, snippet: {
          title: s.title, description: s.description, categoryId: '17', tags,
          ...(s.defaultLanguage ? { defaultLanguage: s.defaultLanguage } : {}),
        } });
        console.log(`TAGGED    ${item.id}  ${s.title}  [${tags.length} tags]`);
      } catch (e) { console.log(`::warning::${item.id}: ${e.message}`); failed++; }
    }
  }
  if (failed) process.exitCode = 1;
})();
