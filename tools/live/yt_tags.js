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
  [/afc champions league/i, 'afc champions league', 'acl', 1], [/conference league/i, 'conference league', 'uecl', 1], [/liga mx/i, 'liga mx', 'liga mx', 1],
  [/liga profesional/i, 'liga profesional argentina', 'argentina', 1], [/colombian primera/i, 'liga betplay', 'colombia', 1], [/chilean primera/i, 'primera division chile', 'chile', 1],
  [/a-league/i, 'a-league', 'a league', 1], [/libertadores/i, 'copa libertadores', 'libertadores', 1], [/sudamericana/i, 'copa sudamericana', 'sudamericana', 1], [/brasileir[aã]o/i, 'brasileirao', 'brasileirao', 1],
  [/champions league|\bUCL\b/i, 'champions league', 'ucl', 1], [/europa league/i, 'europa league', 'europa league', 1],
  [/la ?liga/i, 'laliga', 'la liga', 1], [/serie a/i, 'serie a', 'serie a', 1], [/ligue 1/i, 'ligue 1', 'ligue 1', 1],
  [/bundesliga/i, 'bundesliga', 'bundesliga', 1], [/eredivisie/i, 'eredivisie', 'eredivisie', 1], [/championship/i, 'championship', 'efl championship', 1],
  [/fa cup/i, 'fa cup', 'fa cup', 1], [/world cup/i, 'world cup', 'world cup', 1],
];
const TWO_WORD = /(golden knights|trail blazers|red wings|maple leafs|blue jackets|white sox|red sox|blue jays|blue devils|crimson tide|fighting illini|fighting irish|golden bears|golden gophers|tar heels|yellow jackets|red raiders|horned frogs|nittany lions|sun devils|scarlet knights|demon deacons|black knights|mean green|green wave|golden eagles|blue raiders|red wolves|rainbow warriors|golden hurricane|thundering herd|ragin' cajuns|golden flashes)$/;
const last = (t) => { const s = t.trim().toLowerCase(); const m = s.match(TWO_WORD); return m ? m[1] : s.split(/\s+/).pop(); };

// "Miami Heat vs Cleveland Cavaliers NBA Live Scoreboard" / "Nice vs Paris Saint-Germain Ligue 1 Live Scoreboard" -> tag list
function tagsFor(title, description) {
  const m = title.match(/^(.+?)\s+(?:vs\.?|v|@)\s+(.+?)(?:\s+LIVE\b|\s*[|·]|\s+-\s|$)/i);
  if (!m) return null;
  const L = LEAGUES.find(([re]) => re.test(title));
  let t1 = m[1].trim(), t2 = m[2].trim();
  if (L) t2 = t2.replace(new RegExp('\\s+(?:' + L[0].source + ')\\s*$', 'i'), '').trim();      // the league name follows the second team
  if (!t1 || !t2) return null;
  const lg = L ? L[1] : '', short = L ? L[2] : '', soccer = L ? L[3] : 0;
  const a = t1.toLowerCase(), b = t2.toLowerCase();
  // the title carries the short names since 22 Nov 2026 ("Hurricanes vs Oilers Live Score | NHL Live Scoreboard"); the full
  // names are on the description's second line ("Carolina Hurricanes @ Edmonton Oilers NHL Live Scoreboard")
  let full = [];
  const dm = L && String(description || '').match(new RegExp('^(.+?)[ \\t]+(?:vs|@)[ \\t]+(.+?)[ \\t]+(?:' + L[0].source + ')[^\\n]*Live Scoreboard[ \\t]*$', 'im'));
  if (dm) { const f1 = dm[1].trim().toLowerCase(), f2 = dm[2].trim().toLowerCase(); full = [f1, f2].filter((f) => f !== a && f !== b); if (full.length) full.unshift(`${f1} vs ${f2}`); }
  const n1 = soccer ? a : last(t1), n2 = soccer ? b : last(t2);       // clubs are searched by their full name, US teams by nickname
  const tags = [
    // vidIQ research, 22 Nov 2026: people search "<a> vs <b> live", "... live match today", "... live score"; "live scoreboard" and
    // "play by play" have almost no searches, so the matchup phrases come first
    `${n1} vs ${n2}`, `${n1} vs ${n2} live`, `${n1} vs ${n2} live score`, `${n1} vs ${n2} live match today`, `${n2} vs ${n1} live`, `${a} vs ${b}`, a, b, ...full,
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


// What people really type into YouTube's search box for this game (its own search suggestions; free, no login). Used to
// research each stream's tags. Suggestions that promise what the stream is not (match video, highlights, a TV channel), or
// that are about betting, video games or old games, are left out. Any failure gives [] and the stream keeps its base tags.
const NOT_OURS = /\b(free|full (game|match)|highlights?|watch|reddit|hd|4k|stream|streams|streaming|tv|channel|replay|reaction|watch ?along|watch ?party|prediction|predictions|preview|odds|bet|bets|betting|picks?|parlay|props?|fantasy|2k\d*|fifa|pes|efootball|madden|fc ?2\d|simulation|sim|last (game|night|year|season)|fight|brawl|injury|radio|audio|commentary|hindi|espa[nñ]ol|20[01]\d|202[0-5])\b/i;
async function suggest(q) {
  try {
    const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const j = JSON.parse(Buffer.from(await r.arrayBuffer()).toString('latin1'));
    return (Array.isArray(j?.[1]) ? j[1] : []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  } catch { return []; }
}
// YouTube refuses the whole list ("invalid video keywords") when it is over 500 characters, counting a comma per tag and two
// quote marks around every tag with a space, or when a tag holds < > " or a comma. Keep to 460 to be safe; the list is in
// order of importance, so what does not fit is dropped from where it stands.
function fitTags(list) {
  const out = []; let len = 0;
  for (let t of list) {
    t = String(t).replace(/[<>",]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60 || out.includes(t)) continue;
    const cost = t.length + 1 + (t.includes(' ') ? 2 : 0);
    if (len + cost > 460) continue;
    out.push(t); len += cost;
  }
  return out;
}

// Only phrases made of the two teams plus plain "live game today" words pass: old scores ("4-4"), other competitions,
// video games ("sega genesis"), shows and other channels' names ("pitchside ...") do not describe this stream.
const PLAIN = new Set(['vs', 'v', 'live', 'today', 'tonight', 'now', 'game', 'match', 'score', 'scores', 'scoreboard', 'update', 'updates', 'result', 'results', 'the', 'fc', String(new Date().getUTCFullYear())]);
async function researched(base, extraWords = []) {
  const [m1, m2] = [base[0], base[1]];                 // "<a> vs <b>", "<a> vs <b> live"
  const [n1, n2] = m1.split(' vs ');
  const ok = new Set([...PLAIN, ...[n1, n2, ...extraWords].join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)]);
  const got = [...await suggest(m1), ...await suggest(m2)];
  const keep = [];
  for (const g of got) {
    if (g.length > 60 || NOT_OURS.test(g) || !/^[\x20-\x7e]+$/.test(g)) continue;
    if (!(g.includes(n1) && g.includes(n2))) continue;                     // about this game, not just one of the teams
    if (!g.split(/[^a-z0-9]+/).filter(Boolean).every((w) => ok.has(w))) continue;
    if (!base.includes(g) && !keep.includes(g)) keep.push(g);
  }
  // every base tag stays; what people type is added after the matchup phrases for as long as it fits YouTube's limit
  let len = base.reduce((n, t) => n + t.length + 1, 0);
  const fit = [];
  for (const g of keep) { if (fit.length >= 8 || len + g.length + 1 > 480) break; fit.push(g); len += g.length + 1; }
  return { tags: fitTags([...base.slice(0, 5), ...fit, ...base.slice(5)]), found: fit };
}

async function call(token, method, url, body) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url.split('?')[0].split('/').pop()}: ${j.error?.message || r.status}`);
  return j;
}

if (require.main !== module) { module.exports = { tagsFor, suggest, researched }; return; }

(async () => {
  if (process.argv[2] === '--try') { for (const t of process.argv.slice(3)) { const b = tagsFor(t); console.log(t, '\n ', b ? JSON.stringify((await researched(b, b.slice(5))).found) : 'no teams'); } return; }
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
      const base = tagsFor(s.title, s.description);
      if (!base) { console.log(`::warning::${item.id}: could not read teams from "${s.title}"`); continue; }
      const { tags, found } = await researched(base, base.slice(5));      // team full names and league words may appear in a phrase
      try {
        await call(tok, 'PUT', `${API}/videos?part=snippet`, { id: item.id, snippet: {
          title: s.title, description: s.description, categoryId: '17', tags,
          ...(s.defaultLanguage ? { defaultLanguage: s.defaultLanguage } : {}),
        } });
        console.log(`TAGGED    ${item.id}  ${s.title}  [${tags.length} tags, ${found.length} from YouTube search: ${found.join(' | ') || 'none'}]`);
      } catch (e) { console.log(`::warning::${item.id}: ${e.message}`); failed++; }
    }
  }
  if (failed) process.exitCode = 1;
})();
