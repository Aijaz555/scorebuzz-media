// Live data feed for ScoreBuzz score streams.
// Reads ESPN's public JSON (site.api.espn.com) and turns it into one simple shape the
// scoreboard page understands. ESPN's API is unofficial and undocumented: if a field moves,
// fix it here, nowhere else.
//
// Mock mode: set SCOREBUZZ_MOCK=1 to read tools/live/fixtures/<league>.json instead of ESPN.
const fs = require('fs');
const path = require('path');

const LEAGUES = {
  nba: { path: 'basketball/nba', label: 'NBA', sport: 'nba', periods: 4, otLabel: 'OT' },
  nfl: { path: 'football/nfl', label: 'NFL', sport: 'nfl', periods: 4, otLabel: 'OT' },
  nhl: { path: 'hockey/nhl', label: 'NHL', sport: 'nhl', periods: 3, otLabel: 'OT' },
  ncaaf: { path: 'football/college-football', label: 'NCAAF', sport: 'nfl', periods: 4, otLabel: 'OT' },
  mlb: { path: 'baseball/mlb', label: 'MLB', sport: 'mlb', periods: 9, otLabel: 'X' },
  epl: { path: 'soccer/eng.1', label: 'PREMIER LEAGUE', name: 'Premier League', sport: 'football', periods: 2, soccer: true },
  ucl: { path: 'soccer/uefa.champions', label: 'CHAMPIONS LEAGUE', name: 'Champions League', sport: 'football', periods: 2, soccer: true },
  laliga: { path: 'soccer/esp.1', label: 'LALIGA', name: 'LaLiga', sport: 'football', periods: 2, soccer: true },
  seriea: { path: 'soccer/ita.1', label: 'SERIE A', name: 'Serie A', sport: 'football', periods: 2, soccer: true },
  bundesliga: { path: 'soccer/ger.1', label: 'BUNDESLIGA', name: 'Bundesliga', sport: 'football', periods: 2, soccer: true },
  mls: { path: 'soccer/usa.1', label: 'MLS', sport: 'football', periods: 2, soccer: true },
};

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const MOCK = process.env.SCOREBUZZ_MOCK === '1';
const cache = new Map();

async function getJSON(url, ttlMs = 8000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const res = await fetch(url, { headers: { 'user-agent': 'ScoreBuzz live scoreboard (scorebuzz.net)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const v = await res.json();
  cache.set(url, { t: Date.now(), v });
  return v;
}

function mock(league) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${league}.json`), 'utf8'));
}

// date: optional YYYYMMDD
async function scoreboard(league, date) {
  const L = LEAGUES[league];
  if (!L) throw new Error(`unknown league ${league}. Use one of: ${Object.keys(LEAGUES).join(', ')}`);
  if (MOCK) return mock(league).scoreboard;
  return getJSON(`${BASE}/${L.path}/scoreboard${date ? `?dates=${date}` : ''}`);
}

async function summary(league, eventId) {
  if (MOCK) return mock(league).summary || {};
  try {
    return await getJSON(`${BASE}/${LEAGUES[league].path}/summary?event=${eventId}`, 10000);
  } catch {
    return {}; // play-by-play is a bonus; the scoreboard still works without it
  }
}

const hex = (c, d) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : d);

function team(c) {
  const t = c.team || {};
  return {
    id: t.id,
    name: t.shortDisplayName || t.name || t.displayName || '?',
    full: t.displayName || t.name || '?',
    abbr: t.abbreviation || (t.name || '?').slice(0, 3).toUpperCase(),
    color: hex(t.color, '#2A3570'),
    alt: hex(t.alternateColor, '#FFFFFF'),
    score: c.score ?? '0',
    record: (c.records || []).find((r) => r.type === 'total' || r.name === 'overall')?.summary || c.records?.[0]?.summary || '',
    lines: (c.linescores || []).map((l) => l.displayValue ?? String(l.value ?? '')),
  };
}

// Top performer per category for both teams: [{ cat, home: {name, value}, away: {name, value} }]
function leaders(comp) {
  const by = {};
  const order = [];
  for (const c of comp.competitors || []) {
    for (const cat of (c.leaders || []).slice(0, 3)) {
      const top = cat.leaders?.[0];
      if (!top) continue;
      const k = cat.abbreviation || cat.shortDisplayName || cat.name || '';
      if (!by[k]) { by[k] = { cat: k }; order.push(k); }
      by[k][c.homeAway] = { name: top.athlete?.shortName || top.athlete?.displayName || '', value: top.displayValue || String(top.value ?? '') };
    }
  }
  return order.map((k) => by[k]);
}

function periodLabel(n, L) {
  if (!n) return '';
  if (L.sport === 'mlb') return `INN ${n}`;
  if (n > L.periods) return n - L.periods > 1 ? `OT${n - L.periods}` : 'OT';
  return `${L.sport === 'nhl' ? 'P' : 'Q'}${n}`;
}

function plays(sum, comp, teamsById, L) {
  let list = [];
  if (L.soccer) {
    // goals and cards from the scoreboard; commentary from the summary when available
    list = (comp.details || []).map((d) => ({
      clock: d.clock?.displayValue || '',
      text: `${d.type?.text || 'Event'}${d.athletesInvolved?.length ? ` · ${d.athletesInvolved.map((a) => a.displayName).join(', ')}` : ''}`,
      team: teamsById[d.team?.id] || '',
      big: !!d.scoringPlay || !!d.redCard,
    }));
    if (Array.isArray(sum.keyEvents) && sum.keyEvents.length) {
      list = sum.keyEvents.map((k) => ({
        clock: k.clock?.displayValue || '',
        text: k.text || k.type?.text || '',
        team: teamsById[k.team?.id] || '',
        big: !!k.scoringPlay,
      }));
    }
  } else {
    const raw = sum.plays || sum.drives?.current?.plays || [];
    list = raw.map((p) => ({
      clock: [periodLabel(p.period?.number, L), p.clock?.displayValue].filter(Boolean).join(' '),
      text: p.text || p.type?.text || '',
      team: teamsById[p.team?.id] || '',
      big: !!p.scoringPlay && (L.sport !== 'nba' || (p.scoreValue || 0) >= 3),
    }));
  }
  return list.filter((p) => p.text).slice(-5).reverse();
}

function statusText(st, L) {
  const s = st?.type || {};
  if (s.state === 'pre') return 'UPCOMING';
  if (s.completed) return (s.shortDetail || 'FINAL').toUpperCase();
  if (L.soccer) return (st.displayClock || s.shortDetail || '').toUpperCase();
  return (s.shortDetail || `${st.period} ${st.displayClock}`).toUpperCase();
}

async function game(league, eventId) {
  const L = LEAGUES[league];
  const sb = await scoreboard(league);
  const ev = (sb.events || []).find((e) => String(e.id) === String(eventId));
  if (!ev) throw new Error(`event ${eventId} is not on today's ${league} scoreboard`);
  const comp = ev.competitions[0];
  const home = team(comp.competitors.find((c) => c.homeAway === 'home'));
  const away = team(comp.competitors.find((c) => c.homeAway === 'away'));
  const teamsById = { [home.id]: home.abbr, [away.id]: away.abbr };
  const sum = ev.status?.type?.state === 'pre' ? {} : await summary(league, eventId);
  const sit = comp.situation || {};
  return {
    league,
    label: L.label,
    sport: L.sport,
    soccer: !!L.soccer,
    periods: L.periods,
    id: ev.id,
    state: ev.status?.type?.state || 'pre', // pre | in | post
    status: statusText(ev.status, L),
    start: ev.date,
    venue: comp.venue?.fullName || '',
    broadcast: (comp.broadcasts || []).flatMap((b) => b.names || []).join(' · '),
    home,
    away,
    leaders: leaders(comp),
    situation: L.sport === 'nfl' && sit.downDistanceText
      ? { text: sit.downDistanceText, possession: teamsById[sit.possession] || '', redZone: !!sit.isRedZone }
      : null,
    lastPlay: sit.lastPlay?.text || '',
    plays: plays(sum, comp, teamsById, L),
    ticker: (sb.events || []).filter((e) => e.id !== ev.id).map((e) => {
      const c = e.competitions[0];
      const h = c.competitors.find((x) => x.homeAway === 'home');
      const a = c.competitors.find((x) => x.homeAway === 'away');
      const pre = e.status?.type?.state === 'pre';
      return {
        a: a.team.abbreviation, as: pre ? '' : a.score,
        h: h.team.abbreviation, hs: pre ? '' : h.score,
        st: pre ? new Date(e.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
          : (e.status?.type?.shortDetail || '').toUpperCase(),
      };
    }),
    updated: new Date().toISOString(),
  };
}

// Today's games for a league, with a ready-made YouTube title and description.
async function list(league, date) {
  const L = LEAGUES[league];
  const sb = await scoreboard(league, date);
  return (sb.events || []).map((e) => {
    const c = e.competitions[0];
    const h = c.competitors.find((x) => x.homeAway === 'home').team;
    const a = c.competitors.find((x) => x.homeAway === 'away').team;
    // US leagues: away vs home ("Knicks at Celtics" order); football: home v away
    const [t1, t2] = L.soccer ? [h, a] : [a, h];
    // Same pattern as the channels that do this well: "<Team> vs <Team> | NBA Live Scoreboard & Play-by-Play".
    // Say "Scoreboard" plainly so nobody expects game footage.
    const week = e.week?.number || sb.week?.number;
    const tag = league === 'nfl' && week ? `NFL Week ${week}` : L.name || L.label;
    const title = `${t1.displayName} vs ${t2.displayName} | ${tag} Live Scoreboard & Play-by-Play`;
    return {
      league, id: e.id, start: e.date, state: e.status?.type?.state,
      matchup: `${t1.displayName} vs ${t2.displayName}`,
      title: title.length > 100 ? `${t1.displayName} vs ${t2.displayName} | ${tag} Live Scoreboard` : title,
      description: [
        `Live score updates for ${t1.displayName} vs ${t2.displayName} (${L.label}): score, clock, period scores, top performers and play-by-play, updated every few seconds.`,
        '',
        'This stream is a live scoreboard. It does not show game footage.',
        '',
        'More live scores, fixtures and results: https://scorebuzz.net',
        '',
        `#${(L.name || L.label).replace(/\s/g, '')} #LiveScore #ScoreBuzz`,
      ].join('\n'),
    };
  });
}

module.exports = { LEAGUES, game, list, scoreboard };
