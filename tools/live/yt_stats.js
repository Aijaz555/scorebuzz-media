// Prints views per finished live broadcast (last ~200), grouped by competition, so the stream plan can follow what
// is watched. Read-only. Run from the "YouTube stream stats" Action (same sign-in as the tags job).
const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: secret, YT_REFRESH_TOKEN: refresh } = process.env;
const API = 'https://www.googleapis.com/youtube/v3';
(async () => {
  const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }) })).json();
  if (!t.access_token) { console.log(`::error::oauth ${t.error}`); process.exit(1); }
  const get = async (u) => (await fetch(`${API}/${u}`, { headers: { authorization: `Bearer ${t.access_token}` } })).json();
  const ids = []; let page = '';
  for (let i = 0; i < 6; i++) {
    const j = await get(`liveBroadcasts?part=id&broadcastStatus=completed&broadcastType=all&maxResults=50${page ? `&pageToken=${page}` : ''}`);
    ids.push(...(j.items || []).map((b) => b.id)); page = j.nextPageToken; if (!page) break;
  }
  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await get(`videos?part=snippet,statistics,liveStreamingDetails,status&id=${ids.slice(i, i + 50).join(',')}`);
    for (const x of v.items || []) {
      const d = x.liveStreamingDetails || {};
      const hrs = d.actualStartTime && d.actualEndTime ? (Date.parse(d.actualEndTime) - Date.parse(d.actualStartTime)) / 36e5 : 0;
      const m = x.snippet.title.match(/\|\s*(.+?)\s+Live Scoreboard/i) || x.snippet.title.match(/\s(NBA|NHL|NFL|MLB|MLS|[A-Z][A-Za-z ]+League|LaLiga|Serie A|Ligue 1|Bundesliga)\s+Live/);
      rows.push({ lg: (m ? m[1] : '?').replace(/\s+Week \d+/, ''), views: Number(x.statistics?.viewCount || 0), hrs, title: x.snippet.title, day: (d.actualStartTime || '').slice(0, 10), priv: x.status?.privacyStatus });
    }
  }
  const by = {};
  for (const r of rows) { const b = (by[r.lg] = by[r.lg] || { n: 0, views: 0, hrs: 0, list: [] }); b.n++; b.views += r.views; b.hrs += r.hrs; b.list.push(r.views); }
  console.log(`broadcasts: ${rows.length}, from ${rows.map((r) => r.day).filter(Boolean).sort()[0]}`);
  console.log('LEAGUE | streams | views | views per stream | median | views per stream-hour');
  for (const [k, b] of Object.entries(by).sort((a, c) => c[1].views / c[1].n - a[1].views / a[1].n)) {
    const s = b.list.sort((a, c) => a - c);
    console.log(`ROW ${k} | ${b.n} | ${b.views} | ${(b.views / b.n).toFixed(1)} | ${s[Math.floor(s.length / 2)]} | ${(b.views / (b.hrs || 1)).toFixed(1)}`);
  }
  console.log('TOP 25');
  for (const r of [...rows].sort((a, c) => c.views - a.views).slice(0, 25)) console.log(`TOP ${r.views} | ${r.day} | ${r.title}`);
})();
