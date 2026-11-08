// League round-up videos (owner's request, 8 Nov 2026): one 16:9 video per league per matchweek with
// RESULTS -> updated STANDINGS table -> next FIXTURES, like table/fixture channels. All data from ESPN JSON.
// Usage: node tools/league_pack.js <out videos.json> <fromYYYYMMDD> <toYYYYMMDD> <league> [league ...]
//   leagues: epl laliga seriea bundesliga ligue1 (results window = from..to, fixtures = next 21 days after `to`)
// Then: node tools/make_shorts.js <json> <dir>; node tools/make_thumbs.js <json> <dir>;
//       node tools/music_pick.js <json> <dir> <id> (a different free track per video + credit line).
const fs = require('fs');

const L = {
  epl: { espn: 'eng.1', name: 'Premier League', tag: '#PremierLeague', zones: { ucl: 4, rel: 3 } },
  laliga: { espn: 'esp.1', name: 'LaLiga', tag: '#LaLiga', zones: { ucl: 4, rel: 3 } },
  seriea: { espn: 'ita.1', name: 'Serie A', tag: '#SerieA', zones: { ucl: 4, rel: 3 } },
  bundesliga: { espn: 'ger.1', name: 'Bundesliga', tag: '#Bundesliga', zones: { ucl: 4, rel: 2 } },
  ligue1: { espn: 'fra.1', name: 'Ligue 1', tag: '#Ligue1', zones: { ucl: 3, rel: 2 } },
};
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const chunk = (a, n) => { const k = Math.ceil(a.length / Math.ceil(a.length / n)); const o = []; for (let i = 0; i < a.length; i += k) o.push(a.slice(i, i + k)); return o; };
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const fmtUK = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const fmtET = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const sideOf = (c) => ({ h: c.competitors.find((x) => x.homeAway === 'home'), a: c.competitors.find((x) => x.homeAway === 'away') });
// ESPN rejects date ranges here: fetch one day at a time
async function days(base, from, to) {
  const d0 = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}T12:00:00Z`), d1 = new Date(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6)}T12:00:00Z`);
  const out = [], seen = new Set();
  for (let d = d0; d <= d1; d = new Date(d.getTime() + 864e5)) {
    for (const e of (await get(`${base}/scoreboard?dates=${ymd(d)}`)).events || []) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
  }
  return out;
}
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '');

async function pack(key, from, to) {
  const lg = L[key];
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg.espn}`;
  const all = await days(base, from, to);
  const open = all.filter((e) => !e.status.type.completed && !/POSTPONED|CANCELED/.test(e.status.type.name));
  if (open.length) throw new Error(`${key}: matchweek not finished (${open.map((e) => e.shortName).join(', ')})`);
  const done = all.filter((e) => e.status.type.completed && e.status.type.name !== 'STATUS_POSTPONED')
    .sort((x, y) => x.date.localeCompare(y.date));
  if (!done.length) throw new Error(`${key}: no finished games ${from}-${to}`);
  const st = await get(`https://site.api.espn.com/apis/v2/sports/soccer/${lg.espn}/standings`);
  const entries = st.children[0].standings.entries.map((e) => {
    const s = Object.fromEntries(e.stats.map((x) => [x.name, x.displayValue]));
    return { rank: +s.rank, logo: (e.team.logos || [])[0]?.href, team: e.team.shortDisplayName, abbr: e.team.abbreviation, p: +s.gamesPlayed, w: +s.wins, d: +s.ties, l: +s.losses, gd: s.pointDifferential, pts: +s.points };
  }).sort((x, y) => x.rank - y.rank);
  const gp = entries.map((e) => e.p).sort((x, y) => x - y)[Math.floor(entries.length / 2)];
  const toD = new Date(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6)}T12:00:00Z`);
  const f0 = new Date(toD.getTime() + 864e5), f1 = new Date(toD.getTime() + 21 * 864e5);
  const fx = (await days(base, ymd(f0), ymd(f1)))
    .filter((e) => e.status.type.state === 'pre').sort((x, y) => x.date.localeCompare(y.date));
  // the next round only: one game per pair of teams (10 in a 20-team league), cut at a gap of > 3 days
  const next = [];
  for (const e of fx) { if (next.length >= Math.floor(entries.length / 2) || (next.length && new Date(e.date) - new Date(next[next.length - 1].date) > 3 * 864e5)) break; next.push(e); }

  const res = done.map((e) => {
    const c = e.competitions[0], { h, a } = sideOf(c);
    const goals = (c.details || []).filter((d) => d.scoringPlay).map((d) => ({
      team: d.team?.id, who: (d.athletesInvolved || [])[0]?.shortName || (d.athletesInvolved || [])[0]?.displayName, min: d.clock?.displayValue,
      og: /own goal/i.test(d.type?.text || ''), pen: /penalty/i.test(d.type?.text || ''),
    }));
    return { date: e.date, home: h.team.shortDisplayName, ha: h.team.abbreviation, hl: h.team.logo, hs: +h.score, away: a.team.shortDisplayName, aa: a.team.abbreviation, al: a.team.logo, as: +a.score, venue: c.venue?.fullName, hid: h.team.id, aid: a.team.id, goals };
  });
  const scorers = (r, id) => {
    const m = new Map(); // one entry per scorer: "T. Barry 56', 61'"
    for (const g of r.goals.filter((x) => x.team === id)) { const k = `${g.who}${g.og ? ' (og)' : ''}`; m.set(k, [...(m.get(k) || []), `${g.min}${g.pen ? ' pen' : ''}`]); }
    return [...m].map(([k, v]) => `${k} ${v.join(', ')}`).join(' · ');
  };
  // headline games: most goals, then biggest margin (max 3)
  const top = [...res].sort((x, y) => (y.hs + y.as) - (x.hs + x.as) || Math.abs(y.hs - y.as) - Math.abs(x.hs - x.as)).slice(0, 3);

  const mw = `Matchweek ${gp}`;
  const scenes = []; const chapters = []; let t = 0;
  const push = (sc, chap) => { if (chap) chapters.push(`${mmss(Math.round(t))} ${chap}`); scenes.push(sc); t += sc.dur; };
  const leader = entries[0];
  // 2.5-3 min (owner, 8 Nov 2026): every result gets its own score card; card time stretches to hit ~165 s
  const n = entries.length, rel = n - lg.zones.rel, half = Math.ceil(n / 2);
  const second = entries[1], safe = entries[rel - 1];
  const fixedDur = 6 + 14 * chunk(res, 10).length + 15 + 15 + 8 + 8 + (next.length ? 11 * chunk(next, 5).length : 0) + 6;
  const cardDur = Math.max(7, Math.min(11, Math.round((165 - fixedDur) / res.length)));
  push({ type: 'hook', dur: 6, kicker: `${lg.name} · ${mw}`, title: 'Results, table & fixtures', sub: `${leader.team} top on ${leader.pts} points` }, 'Intro');
  chunk(res, 10).forEach((part, i) => push({ type: 'table', dur: 14, label: `${lg.name} · ${mw} results${i ? ' (cont.)' : ''}`, cols: ['', ''], rows: part.map((r) => ['', `${r.home} v ${r.away}`, r.hs, r.as]) }, i ? null : `${mw} results`));
  res.forEach((r, i) => {
    const hsco = scorers(r, r.hid), asco = scorers(r, r.aid);
    const note = [hsco && `${r.ha}: ${hsco}`, asco && `${r.aa}: ${asco}`].filter(Boolean).join('  |  ') || 'No goals';
    push({ type: 'score', dur: cardDur, label: `${lg.name} · ${fmtDay(r.date)}`, home: r.home, homeAbbr: r.ha, homeLogo: r.hl, homeScore: r.hs, away: r.away, awayAbbr: r.aa, awayLogo: r.al, awayScore: r.as, status: 'FULL TIME', note: note.length > 200 ? note.slice(0, 197) + '…' : note }, i ? null : 'Every game');
  });
  const row = (e) => [e.rank, e.team, e.p, e.w, e.d, e.l, e.gd, e.pts];
  push({ type: 'table', dur: 15, label: `${lg.name} table · after ${mw}`, cols: ['P', 'W', 'D', 'L', 'GD', 'PTS'], rows: entries.slice(0, half).map(row), highlight: entries.slice(0, lg.zones.ucl).map((e) => e.rank), note: `Top ${lg.zones.ucl}: Champions League places` }, `${lg.name} table`);
  push({ type: 'table', dur: 15, label: `${lg.name} table · after ${mw} (${half + 1}–${n})`, cols: ['P', 'W', 'D', 'L', 'GD', 'PTS'], rows: entries.slice(half).map(row), danger: entries.filter((e) => e.rank > rel).map((e) => e.rank), note: `Bottom ${lg.zones.rel}: relegation zone` });
  const gap = leader.pts - second.pts;
  push({ type: 'text', dur: 8, label: 'Title race', title: gap ? `${leader.team} lead by ${gap} point${gap > 1 ? 's' : ''}` : `${leader.team} top on goal difference`, sub: `${second.team} are second on ${second.pts} points after ${gp} games` }, 'Title race & relegation');
  const bottom = entries.slice(rel).map((e) => `${e.team} ${e.pts}`).join(' · ');
  push({ type: 'text', dur: 8, label: 'Relegation zone', title: `${entries[n - 1].team} bottom on ${entries[n - 1].pts} points`, sub: `In the drop zone: ${bottom}. ${safe.team} are first above it on ${safe.pts}.` });
  if (next.length) {
    chunk(next, 5).forEach((part, i) => push({ type: 'list', dur: 11, label: `${lg.name} · Matchweek ${gp + 1} fixtures (UK · ET)${i ? ' cont.' : ''}`, rows: part.map((e) => { const { h, a } = sideOf(e.competitions[0]); return [fmtDay(e.date), `${h.team.shortDisplayName} v ${a.team.shortDisplayName}`, `${fmtUK(e.date)} · ${fmtET(e.date)}`]; }) }, i ? null : `Matchweek ${gp + 1} fixtures`));
  }
  push({ type: 'cta', dur: 6, title: `Who wins the ${lg.name} this season?`, sub: 'Live scores, tables & fixtures every day' });

  const big = top[0];
  const nextLine = next.length ? `Next round starts ${fmtDay(next[0].date)}.` : '';
  const id = `${key}-mw${gp}`;
  return {
    id, sport: 'football', league: key, format: 'video', 
    title: `${lg.name} Results, Table & Fixtures | ${mw} ${new Date(toD).getFullYear()}/${String(new Date(toD).getFullYear() + 1).slice(2)} ⚽`.slice(0, 100),
    description: [
      `${lg.name} ${mw} results, the updated ${lg.name} table and the next fixtures. ${leader.team} lead on ${leader.pts} points after ${gp} games; the big result was ${big.home} ${big.hs}–${big.as} ${big.away}. ${nextLine}`.trim(),
      `All ${mw} scores: ${res.map((r) => `${r.home} ${r.hs}–${r.as} ${r.away}`).join(', ')}.`,
      chapters.join('\n'),
      `${lg.name} live scores, table and fixtures: https://scorebuzz.net`,
      `${lg.tag} #Football #${slug(lg.name)}table #ScoreBuzz`,
    ].join('\n\n'),
    tags: [`${lg.name.toLowerCase()} table`, `${lg.name.toLowerCase()} standings`, `${lg.name.toLowerCase()} results`, `${lg.name.toLowerCase()} fixtures`, `${lg.name.toLowerCase()} ${mw.toLowerCase()}`, `${lg.name.toLowerCase()} results today`, `${big.home} vs ${big.away}`, `${leader.team} ${lg.name.toLowerCase()}`, 'scorebuzz'],
    // table-channel style thumbnails (tools/make_table_thumbs.js): result + mini table, and next fixtures + mini table
    tt: {
      league: key, name: lg.name, mw: gp, season: `${new Date(toD).getFullYear()}/${String(new Date(toD).getFullYear() + 1).slice(2)}`, zones: lg.zones,
      result: { home: big.home, homeLogo: big.hl, hs: big.hs, away: big.away, awayLogo: big.al, as: big.as, venue: big.venue },
      table: entries.map((e) => ({ rank: e.rank, team: e.team, logo: e.logo, p: e.p, gd: e.gd, pts: e.pts })),
      fixtures: next.map((e) => { const { h, a } = sideOf(e.competitions[0]); return { date: e.date, home: h.team.shortDisplayName, homeLogo: h.team.logo, away: a.team.shortDisplayName, awayLogo: a.team.logo }; }),
    },
    thumb: { kicker: `${lg.name} · ${mw}`, big: `${leader.pts} PTS`, hook: `${leader.team} *top*`, sticker: 'TABLE', emoji: '⚽' },
    scenes,
  };
}

(async () => {
  const [out, from, to, ...keys] = process.argv.slice(2);
  if (!out || !from || !to || !keys.length) { console.error('usage: league_pack.js out.json from to league...'); process.exit(1); }
  const list = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  for (const k of keys) {
    try {
      const v = await pack(k, from, to);
      const i = list.findIndex((x) => x.id === v.id); if (i >= 0) list[i] = v; else list.push(v);
      console.log(`${v.id}: ${v.scenes.length} scenes, ${v.scenes.reduce((s, x) => s + x.dur, 0)} s`);
    } catch (e) { console.error(`${k}: ${e.message}`); }
  }
  fs.writeFileSync(out, JSON.stringify(list, null, 2));
})();
