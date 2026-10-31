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
    logo: t.logo || t.logos?.[0]?.href || '', // ESPN team logo / national flag URL
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

// Soccer live tracker: last actions with pitch coordinates from ESPN commentary.
// fieldPositionX/Y are 0-100 from the acting team's view (attacking towards x=100);
// we draw home attacking right, so away actions are mirrored.
function tracker(sum, comp, home, away) {
  const byName = {};
  for (const c of comp.competitors || []) {
    const ab = c.homeAway === 'home' ? home.abbr : away.abbr;
    for (const n of [c.team?.displayName, c.team?.name, c.team?.shortDisplayName]) if (n) byName[n] = ab;
  }
  const out = [];
  for (const c of sum.commentary || []) {
    const p = c.play;
    if (!p || p.fieldPositionX == null || p.fieldPositionY == null) continue;
    const t = byName[p.team?.displayName] || '';
    if (!t) continue;
    const isHome = t === home.abbr;
    const x = isHome ? p.fieldPositionX : 100 - p.fieldPositionX;
    const y = isHome ? p.fieldPositionY : 100 - p.fieldPositionY;
    const who = p.participants?.[0]?.athlete?.displayName || '';
    out.push({ id: String(p.id || c.sequence), min: c.time?.displayValue || p.clock?.displayValue || '', team: t, home: isHome,
      x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)), type: p.type?.text || '', who, att: p.fieldPositionX });
  }
  const seen = new Set();
  return out.filter((e) => !seen.has(e.id) && seen.add(e.id)).slice(-6);
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
      id: `${d.clock?.displayValue}-${d.type?.text}`,
      type: d.scoringPlay ? 'Goal' : d.type?.text || '',
    }));
    if (Array.isArray(sum.keyEvents) && sum.keyEvents.length) {
      list = sum.keyEvents.map((k) => ({
        clock: k.clock?.displayValue || '',
        text: k.text || k.type?.text || '',
        team: teamsById[k.team?.id] || '',
        big: !!k.scoringPlay,
        id: k.id || `${k.clock?.displayValue}-${k.type?.text}`,
        type: k.scoringPlay ? 'Goal' : k.type?.text || '',
      }));
    }
  } else {
    const raw = sum.plays || sum.drives?.current?.plays || [];
    list = raw.map((p) => ({
      id: p.id || p.sequenceNumber || '',
      type: p.type?.text || '',
      value: p.scoreValue || 0,
      clock: [periodLabel(p.period?.number, L), p.clock?.displayValue].filter(Boolean).join(' '),
      text: p.text || p.type?.text || '',
      team: teamsById[p.team?.id] || '',
      big: !!p.scoringPlay && (L.sport !== 'nba' || (p.scoreValue || 0) >= 3),
    }));
  }
  return list.filter((p) => p.text).slice(-7).reverse();
}


// ---- extra panels (all optional: each returns null/[] when ESPN doesn't provide the data) ----

const STAT_PICK = {
  nba: ['fieldGoalPct', 'threePointFieldGoalPct', 'freeThrowPct', 'totalRebounds', 'assists', 'turnovers', 'steals', 'blocks'],
  nfl: ['totalYards', 'netPassingYards', 'rushingYards', 'firstDowns', 'turnovers', 'possessionTime', 'thirdDownEff'],
  nhl: ['shotsTotal', 'powerPlayGoals', 'faceoffPercent', 'hits', 'blockedShots', 'takeaways', 'giveaways'],
  mlb: ['hits', 'errors', 'homeRuns', 'strikeouts', 'walks', 'leftOnBase'],
  football: ['possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners', 'foulsCommitted', 'saves', 'offsides'],
};
const num = (v) => { const n = parseFloat(String(v).replace('%', '')); return Number.isFinite(n) ? n : null; };

// Team stat comparison rows: [{ label, home, away, h, a }] (h/a numeric for the bars)
function teamStats(sum, L, home, away) {
  const teams = sum.boxscore?.teams || [];
  const side = (id) => teams.find((t) => String(t.team?.id) === String(id))?.statistics || [];
  const hs = side(home.id), as = side(away.id);
  if (!hs.length || !as.length) return [];
  const want = STAT_PICK[L.sport] || [];
  let names = want.filter((n) => hs.some((x) => x.name === n));
  if (names.length < 3) names = hs.filter((x) => num(x.displayValue) !== null && !String(x.displayValue).includes('-')).map((x) => x.name);
  return names.slice(0, 6).map((n) => {
    const h = hs.find((x) => x.name === n) || {}, a = as.find((x) => x.name === n) || {};
    const toNum = (x) => (n === 'possessionTime' ? (([m, sec]) => m * 60 + +sec)(String(x.displayValue || '0:0').split(':').map(Number)) : num(x.displayValue));
    return { label: (h.label || h.abbreviation || n).replace(/Percentage/i, '%'), home: h.displayValue ?? '–', away: a.displayValue ?? '–', h: toNum(h) ?? 0, a: toNum(a) ?? 0 };
  });
}

// Home win probability over the game, 0..100, max ~120 points (NBA, NFL, NCAAF)
function winProb(sum) {
  const wp = sum.winprobability || [];
  if (!wp.length) return null;
  const step = Math.max(1, Math.ceil(wp.length / 120));
  const series = wp.filter((_, i) => i % step === 0 || i === wp.length - 1).map((w) => Math.round((w.homeWinPercentage ?? 0.5) * 1000) / 10);
  return { home: series[series.length - 1], series };
}

// Score margin (home - away) after each scoring play: game-flow chart
function flow(sum) {
  const raw = (sum.plays || []).filter((p) => p.scoringPlay && p.homeScore != null);
  if (raw.length < 2) return null;
  const step = Math.max(1, Math.ceil(raw.length / 150));
  return [0, ...raw.filter((_, i) => i % step === 0 || i === raw.length - 1).map((p) => p.homeScore - p.awayScore)];
}

// NFL/NCAAF ball position on a 0..100 field drawn away end-zone left, home end-zone right
function field(sit, home, away, teamsById) {
  if (!sit || !sit.possessionText) return null;
  const m = String(sit.possessionText).match(/([A-Z&]+)\s+(\d+)/i);
  if (!m) return null;
  const side = m[1].toUpperCase(), yd = Number(m[2]);
  const ball = side === home.abbr ? 100 - yd : side === away.abbr ? yd : 50;
  const poss = teamsById[sit.possession] || '';
  const dir = poss === away.abbr ? 1 : -1; // away team attacks towards the home end zone (right)
  return { ball, firstDown: sit.distance ? Math.max(0, Math.min(100, ball + dir * sit.distance)) : null, poss, dir, text: sit.downDistanceText || '' };
}

// Football timeline: goals and cards with minute for the 0-90' bar
function timeline(comp, teamsById) {
  return (comp.details || []).map((d) => ({
    min: parseInt(d.clock?.displayValue, 10) || 0,
    team: teamsById[d.team?.id] || '',
    kind: d.scoringPlay ? 'goal' : d.redCard ? 'red' : d.yellowCard ? 'yellow' : 'other',
    who: d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName || '',
  })).filter((x) => x.kind !== 'other');
}

// Top players per team from the box score: { cols: [...], home: [[name, ...]], away: [...] }
const BOX = { nba: { sort: 'PTS', cols: ['PTS', 'REB', 'AST'] }, nhl: { sort: 'PTS', cols: ['G', 'A', 'SOG'] } };
function box(sum, L, home, away) {
  const cfg = BOX[L.sport];
  if (!cfg) return null;
  const pick = (id) => {
    const g = (sum.boxscore?.players || []).find((x) => String(x.team?.id) === String(id))?.statistics?.[0];
    if (!g) return [];
    const labels = g.labels || g.names || [];
    const idx = (k) => labels.indexOf(k);
    if (idx(cfg.sort) < 0) return [];
    return (g.athletes || []).filter((a) => a.stats?.length)
      .map((a) => ({ name: a.athlete?.shortName || a.athlete?.displayName || '', v: cfg.cols.map((c) => a.stats[idx(c)] ?? '–'), s: num(a.stats[idx(cfg.sort)]) || 0 }))
      .sort((x, y) => y.s - x.s).slice(0, 4).map((x) => [x.name, ...x.v]);
  };
  const h = pick(home.id), a = pick(away.id);
  return h.length || a.length ? { cols: cfg.cols, home: h, away: a } : null;
}

// NBA/NHL shot chart: last 60 shooting plays with court coordinates.
// ESPN NBA coordinates are feet on a half court (x 0-50 across, y 0-47 from the baseline);
// free throws and missing locations come through as huge negative numbers and are dropped.
function shots(sum, teamsById, L) {
  if (!['nba', 'nhl'].includes(L.sport)) return [];
  return (sum.plays || [])
    .filter((p) => (p.shootingPlay || /shot/i.test(p.type?.text || '')) && p.coordinate && Math.abs(p.coordinate.x) < 200 && Math.abs(p.coordinate.y) < 200)
    .slice(-60)
    .map((p) => ({ x: p.coordinate.x, y: p.coordinate.y, made: !!p.scoringPlay, team: teamsById[p.team?.id] || '', v: p.scoreValue || 0 }));
}

// Current scoring run, e.g. { team: 'MEM', for: 10, against: 0 } when one side has scored the last 8+ points
function run(sum, home, away) {
  const sp = (sum.plays || []).filter((p) => p.scoringPlay && p.homeScore != null);
  if (sp.length < 3) return null;
  let h = 0, a = 0, last = sp[sp.length - 1];
  for (let i = sp.length - 1; i > 0; i--) {
    const dh = sp[i].homeScore - sp[i - 1].homeScore, da = sp[i].awayScore - sp[i - 1].awayScore;
    if ((dh > 0 && a > 0) || (da > 0 && h > 0)) break;
    h += Math.max(0, dh); a += Math.max(0, da);
  }
  const best = Math.max(h, a);
  if (best < 8 || !last) return null;
  return { team: h > a ? home.abbr : away.abbr, for: best, against: 0 };
}

// MLB at-bat situation
function mlbSit(sit) {
  if (sit.balls == null && sit.outs == null) return null;
  return {
    balls: sit.balls ?? 0, strikes: sit.strikes ?? 0, outs: sit.outs ?? 0,
    bases: [!!sit.onFirst, !!sit.onSecond, !!sit.onThird],
    batter: sit.batter?.athlete?.shortName || '', pitcher: sit.pitcher?.athlete?.shortName || '',
  };
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
    stats: teamStats(sum, L, home, away),
    winProb: winProb(sum),
    flow: flow(sum),
    field: L.sport === 'nfl' && ev.status?.type?.state === 'in' ? field(sit, home, away, teamsById) : null,
    timeline: L.soccer ? timeline(comp, teamsById) : [],
    tracker: L.soccer && sum.commentary ? tracker(sum, comp, home, away) : [],
    box: box(sum, L, home, away),
    shots: shots(sum, teamsById, L),
    run: L.soccer ? null : run(sum, home, away),
    mlb: L.sport === 'mlb' && ev.status?.type?.state === 'in' ? mlbSit(sit) : null,
    drive: sum.drives?.current?.description || '',
    detail: ev.status?.type?.detail || '',
    period: ev.status?.period || 0,
    clock: ev.status?.displayClock || '',
    ticker: (sb.events || []).filter((e) => e.id !== ev.id).map((e) => {
      const c = e.competitions[0];
      const h = c.competitors.find((x) => x.homeAway === 'home');
      const a = c.competitors.find((x) => x.homeAway === 'away');
      const pre = e.status?.type?.state === 'pre';
      return {
        a: a.team.abbreviation, as: pre ? '' : a.score, al: a.team.logo || '',
        h: h.team.abbreviation, hs: pre ? '' : h.score, hl: h.team.logo || '',
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
