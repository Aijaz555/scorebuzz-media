// Adds YouTube tags (and the Sports category) to every upcoming or live ScoreBuzz broadcast that has none.
// LiveReacting can't set YouTube tags, so this runs every 10 minutes from the "YouTube live tags" GitHub Action.
// Only tags and category change: title, description and thumbnail are left as they are.
// Credentials come from repository secrets: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
// Quota: 2 list calls + 1 per video checked, 50 units per video tagged (each video is tagged once).
const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: secret, YT_REFRESH_TOKEN: refresh } = process.env;
const API = 'https://www.googleapis.com/youtube/v3';

// [title pattern, league tag, short tag, football (soccer)?]
const LEAGUES = [
  [/\bNBA\b/i, 'nba', 'nba', 0], [/\bNHL\b/i, 'nhl', 'nhl', 0], [/\bNFL\b(?:\s+Week\s+\d+)?/i, 'nfl', 'nfl', 0],
  [/\bNCAAF\b|college football/i, 'college football', 'ncaaf', 0], [/\bNCAAB\b|college basketball/i, 'college basketball', 'ncaab', 0],
  [/\bMLB\b/i, 'mlb', 'mlb', 0], [/\bMLS\b/i, 'mls', 'mls', 1], [/premier league|\bEPL\b/i, 'premier league', 'epl', 1],
  [/champions league|\bUCL\b/i, 'champions league', 'ucl', 1], [/europa league/i, 'europa league', 'europa league', 1],
  [/la ?liga/i, 'laliga', 'la liga', 1], [/serie a/i, 'serie a', 'serie a', 1], [/ligue 1/i, 'ligue 1', 'ligue 1', 1],
  [/bundesliga/i, 'bundesliga', 'bundesliga', 1], [/eredivisie/i, 'eredivisie', 'eredivisie', 1], [/championship/i, 'championship', 'efl championship', 1],
  [/fa cup/i, 'fa cup', 'fa cup', 1], [/world cup/i, 'world cup', 'world cup', 1],
];
const TWO_WORD = /(golden knights|trail blazers|red wings|maple leafs|blue jackets|white sox|red sox|blue jays|blue devils|crimson tide|fighting illini|fighting irish|golden bears|golden gophers|tar heels|yellow jackets|red raiders|horned frogs|nittany lions|sun devils|scarlet knights|demon deacons|black knights|mean green|green wave|golden eagles|blue raiders|red wolves|rainbow warriors|golden hurricane|thundering herd|ragin' cajuns|golden flashes)$/;
const last = (t) => { const s = t.trim().toLowerCase(); const m = s.match(TWO_WORD); return m ? m[1] : s.split(/\s+/).pop(); };

// "Miami Heat vs Cleveland Cavaliers NBA Live Scoreboard" / "Nice vs Paris Saint-Germain Ligue 1 Live Scoreboard" -> tag list
function tagsFor(title) {
  const m = title.match(/^(.+?)\s+(?:vs\.?|v|@)\s+(.+?)(?:\s+LIVE\b|\s*[|·]|\s+-\s|$)/i);
  if (!m) return null;
  const L = LEAGUES.find(([re]) => re.test(title));
  let t1 = m[1].trim(), t2 = m[2].trim();
  if (L) t2 = t2.replace(new RegExp('\\s+(?:' + L[0].source + ')\\s*$', 'i'), '').trim();      // the league name follows the second team
  if (!t1 || !t2) return null;
  const lg = L ? L[1] : '', short = L ? L[2] : '', soccer = L ? L[3] : 0;
  const a = t1.toLowerCase(), b = t2.toLowerCase();
  const n1 = soccer ? a : last(t1), n2 = soccer ? b : last(t2);       // clubs are searched by their full name, US teams by nickname
  const tags = [
    `${n1} vs ${n2}`, `${n1} vs ${n2} live`, `${n2} vs ${n1}`, `${a} vs ${b}`, a, b,
    ...(soccer ? [`${a} live score`, `${b} live score`] : []),
    ...(lg ? [`${lg} live score`, `${short} live scoreboard`, `${lg} live today`, `${short} live`] : []),
    ...(soccer ? [lg === 'mls' ? 'soccer live score' : 'football live score'] : []),
    'live score', 'live scoreboard', 'play by play', 'scorebuzz',
  ];
  const out = [];
  let len = 0;
  for (const t of [...new Set(tags)]) { if (len + t.length + 1 > 480) break; out.push(t); len += t.length + 1; }
  return out;
}
if (require.main !== module) { module.exports = { tagsFor }; return; }

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
      if ((s.tags || []).some((t) => / vs /.test(t))) { console.log(`has tags  ${item.id}  ${s.title}`); continue; }      // the channel's default tags ("live now", "live score") do not count: a game needs its own
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
