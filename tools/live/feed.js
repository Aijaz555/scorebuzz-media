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
  uel: { path: 'soccer/uefa.europa', label: 'EUROPA LEAGUE', name: 'Europa League', sport: 'football', periods: 2, soccer: true },
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
      let value = top.displayValue || String(top.value ?? '');
      // football season leaders come as "188/233, 2425 YDS, 25 TD, 1 INT": keep the yards so it fits the panel
      if (value.length > 9) value = (value.match(/[\d,]+ YDS/) || [value.split(',')[0]])[0].replace(' YDS', '');
      by[k][c.homeAway] = { name: top.athlete?.shortName || top.athlete?.displayName || '', value };
    }
  }
  return order.map((k) => by[k]);
}

// football: goalscorers in the "game leaders" panel (cat = ball icon, value = minute)
function soccerLeaders(home, away) {
  const n = Math.min(4, Math.max(home.scorers?.length || 0, away.scorers?.length || 0));
  return Array.from({ length: n }, (_, i) => ({ cat: 'GOAL', home: home.scorers[i], away: away.scorers[i] }));
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
      // keep the moments that matter (goals, cards, penalties, half/full time) ahead of substitutions
      const key = list.filter((x) => x.big || /goal|card|penalty|half|kick|end|start|var/i.test(`${x.type} ${x.text}`) && !/substitution/i.test(x.text));
      if (key.length >= 4) list = key;
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
// football: the full stat list for the match-centre stats view
function teamStatsAll(sum, home, away) {
  const teams = sum.boxscore?.teams || [];
  const side = (id) => teams.find((t) => String(t.team?.id) === String(id))?.statistics || [];
  const hs = side(home.id), as = side(away.id);
  const want = [['possessionPct', 'Possession %'], ['totalShots', 'Shots'], ['shotsOnTarget', 'On target'], ['wonCorners', 'Corners'], ['totalPasses', 'Passes'], ['passPct', 'Pass accuracy'], ['totalCrosses', 'Crosses'], ['foulsCommitted', 'Fouls'], ['offsides', 'Offsides'], ['yellowCards', 'Yellow cards'], ['redCards', 'Red cards'], ['saves', 'Saves']];
  return want.map(([n, label]) => {
    const h = hs.find((x) => x.name === n), a = as.find((x) => x.name === n);
    if (!h || !a) return null;
    const pct = n === 'passPct';
    const f = (x) => (pct ? `${Math.round(parseFloat(x.displayValue) * 100)}%` : x.displayValue);
    return { label, home: f(h), away: f(a), h: num(h.displayValue) ?? 0, a: num(a.displayValue) ?? 0 };
  }).filter(Boolean);
}
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

// ---------- football match centre: momentum, shot map, lineups, table, form ----------
const SHOT = { 'shot-on-target': 'on', 'shot-off-target': 'off', 'shot-blocked': 'blocked', goal: 'goal', 'penalty---scored': 'goal', 'own-goal': 'goal' };
function teamOf(p, home, away, comp) {
  const n = p.team?.displayName || '';
  for (const c of comp.competitors || []) {
    if ([c.team?.displayName, c.team?.name, c.team?.shortDisplayName].includes(n)) return c.homeAway === 'home' ? 'home' : 'away';
  }
  return '';
}
function soccerCentre(sum, comp, home, away) {
  const com = (sum.commentary || []).filter((c) => c.play);
  // attack momentum per minute: shots, corners and actions deep in the opponent's half push the bar
  const W = { goal: 12, 'shot-on-target': 6, 'shot-off-target': 4, 'shot-blocked': 3, 'corner-awarded': 3, offside: 1.5, foul: 0.6 };
  const raw = {};
  const shots = [];
  for (const c of com) {
    const p = c.play, side = teamOf(p, home, away, comp);
    if (!side) continue;
    const min = Math.max(1, Math.round((p.clock?.value ?? c.time?.value ?? 0) / 60));
    const type = p.type?.type || '';
    const depth = p.fieldPositionX != null ? Math.max(0, (p.fieldPositionX - 50) / 50) : 0;
    let w = (W[type] || 0) + depth * 2;
    if (type === 'foul') w = depth * 1.5; // a foul is won by the other side: count it for the attacker only when deep
    if (w) { raw[min] = raw[min] || { home: 0, away: 0 }; raw[min][side] += w; }
    if (SHOT[type] && p.fieldPositionX != null) {
      shots.push({ side, kind: SHOT[type], x: p.fieldPositionX, y: p.fieldPositionY ?? 50, min: c.time?.displayValue || p.clock?.displayValue || '',
        who: (p.participants?.[0]?.athlete?.displayName || '').split(' ').pop() });
    }
  }
  const last = Math.max(0, ...Object.keys(raw).map(Number));
  const momentum = [];
  for (let m = 1; m <= Math.max(last, 1); m++) {
    let h = 0, a = 0;
    for (let k = m - 2; k <= m; k++) { h += raw[k]?.home || 0; a += raw[k]?.away || 0; } // 3-minute rolling window
    momentum.push({ min: m, v: Math.round((h - a) * 10) / 10 });
  }
  // lineups: lines from the formation, players placed left→right by their position code
  const lineRank = (ab) => /^G/.test(ab) ? 0 : /^(CD|LB|RB|LWB|RWB|D|SW|CB)/.test(ab) ? 1 : /^DM/.test(ab) ? 2 : /^(CM|LM|RM|M\b|M$)/.test(ab) ? 3 : /^(AM|CAM)/.test(ab) ? 4 : 5;
  const lat = (ab) => /(^L|-L$)/.test(ab) ? 0 : /(^R|-R$)/.test(ab) ? 2 : 1;
  const lineups = {};
  for (const r of sum.rosters || []) {
    const side = r.homeAway === 'home' ? 'home' : 'away';
    const st = (pl) => Object.fromEntries((pl.stats || []).map((x) => [x.name, Number(x.displayValue) || 0]));
    const P = (pl) => { const s = st(pl); return { n: pl.jersey || '', name: pl.athlete?.lastName || pl.athlete?.shortName || '', pos: pl.position?.abbreviation || '',
      g: s.totalGoals || 0, a: s.goalAssists || 0, yc: s.yellowCards || 0, rc: s.redCards || 0, out: !!pl.subbedOut, in: !!pl.subbedIn }; };
    const starters = (r.roster || []).filter((x) => x.starter).map(P);
    if (starters.length < 11) continue;
    const counts = String(r.formation || '').split('-').map(Number).filter(Boolean);
    starters.sort((x, y) => lineRank(x.pos) - lineRank(y.pos) || (Number(x.n) - Number(y.n)));
    const gk = starters.filter((x) => lineRank(x.pos) === 0).slice(0, 1);
    const outfield = starters.filter((x) => !gk.includes(x));
    const lines = [gk];
    let i = 0;
    for (const c of (counts.reduce((a, b) => a + b, 0) === outfield.length ? counts : [outfield.length])) { lines.push(outfield.slice(i, i + c).sort((x, y) => lat(x.pos) - lat(y.pos))); i += c; }
    lineups[side] = { formation: r.formation || '', lines, subsIn: (r.roster || []).filter((x) => x.subbedIn).map(P) };
  }
  // league table rows around both teams
  let table = [];
  const ents = sum.standings?.groups?.[0]?.standings?.entries || [];
  if (ents.length) {
    const rows = ents.map((e) => { const s = Object.fromEntries((e.stats || []).map((x) => [x.name, x.displayValue])); return { id: String(e.id), team: e.team, pos: Number(s.rank) || 0, gp: s.gamesPlayed, gd: s.pointDifferential, pts: s.points }; })
      .sort((a, b) => a.pos - b.pos).map((r, k) => ({ ...r, pos: r.pos || k + 1 }));
    const idx = rows.map((r, k) => ([String(home.id), String(away.id)].includes(r.id) ? k : -1)).filter((k) => k >= 0);
    const keep = new Set();
    for (const k of idx) for (let d = -1; d <= 1; d++) if (rows[k + d]) keep.add(k + d);
    for (let k = 0; keep.size < 7 && k < rows.length; k++) keep.add(k);
    table = [...keep].sort((a, b) => a - b).slice(0, 7).map((k) => ({ ...rows[k], hl: [String(home.id), String(away.id)].includes(rows[k].id) }));
  }
  const form = {};
  for (const f of sum.lastFiveGames || []) {
    const side = String(f.team?.id) === String(home.id) ? 'home' : 'away';
    form[side] = (f.events || []).slice(0, 5).map((e) => e.gameResult || '').join('');
  }
  return { momentum, shots, lineups, table, tableName: sum.standings?.header || '', form };
}

async function game(league, eventId) {
  const L = LEAGUES[league];
  let sb = await scoreboard(league);
  let ev = (sb.events || []).find((e) => String(e.id) === String(eventId));
  if (!ev && !MOCK) {
    // ESPN's default scoreboard rolls over to the next US day around 6-11am ET, and a stream may start
    // before that: look the game's date up in its summary and load that day's scoreboard instead.
    try {
      const s0 = await summary(league, eventId);
      const d = s0?.header?.competitions?.[0]?.date;
      if (d) {
        const ymd = new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
        sb = await scoreboard(league, ymd);
        ev = (sb.events || []).find((e) => String(e.id) === String(eventId));
      }
    } catch (e) { /* fall through to the error below */ }
  }
  if (!ev) throw new Error(`event ${eventId} is not on the ${league} scoreboard`);
  const comp = ev.competitions[0];
  const home = team(comp.competitors.find((c) => c.homeAway === 'home'));
  const away = team(comp.competitors.find((c) => c.homeAway === 'away'));
  const teamsById = { [home.id]: home.abbr, [away.id]: away.abbr };
  const sum = ev.status?.type?.state === 'pre' && !L.soccer ? {} : await summary(league, eventId);
  const sit = comp.situation || {};
  if (L.soccer) {
    // football: ESPN's scoreboard has no half-by-half linescores, so build them from the goals,
    // and show each side's goalscorers where US sports show game leaders
    const goals = (comp.details || []).filter((d) => d.scoringPlay).map((d) => ({
      min: parseInt(d.clock?.displayValue, 10) || 0, label: d.clock?.displayValue || '',
      team: String(d.team?.id), who: (d.athletesInvolved?.[0]?.shortName || '') + (d.ownGoal ? ' (OG)' : d.penaltyKick ? ' (pen)' : ''),
      half: /^45'\+|^([0-9]|[1-3][0-9]|4[0-5])'/.test(d.clock?.displayValue || '') ? 0 : 1,
    }));
    const st = ev.status?.type?.state;
    for (const t of [home, away]) {
      if (!t.lines.length && st !== 'pre') {
        const h1 = goals.filter((g) => g.team === String(t.id) && g.half === 0).length;
        const h2 = goals.filter((g) => g.team === String(t.id) && g.half === 1).length;
        t.lines = (ev.status?.period || 1) >= 2 || st === 'post' ? [String(h1), String(h2)] : [String(h1)];
      }
      t.scorers = goals.filter((g) => g.team === String(t.id)).map((g) => ({ name: g.who, value: g.label }));
    }
  }
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
    leaders: L.soccer ? soccerLeaders(home, away) : leaders(comp),
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
    centre: L.soccer ? soccerCentre(sum, comp, home, away) : null,
    statsAll: L.soccer ? teamStatsAll(sum, home, away) : [],
    box: box(sum, L, home, away),
    shots: shots(sum, teamsById, L),
    run: L.soccer ? null : run(sum, home, away),
    mlb: L.sport === 'mlb' && ev.status?.type?.state === 'in' ? mlbSit(sit) : null,
    drive: sum.drives?.current?.description || '',
    detail: ev.status?.type?.detail || '',
    period: ev.status?.period || 0,
    clock: ev.status?.displayClock || '',
    // football: elapsed match time in seconds (ESPN's clock stops at 45:00/90:00 in stoppage time, so the
    // displayed "45'+2'" is used when it is later), for the ticking mm:ss clock in the overlay
    clockSec: L.soccer ? Math.max(Number(ev.status?.clock) || 0, ((s) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/); return m ? (Number(m[1]) + Number(m[2] || 0)) * 60 : 0; })(ev.status?.displayClock)) : null,
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
      abbrs: [a.abbreviation, h.abbreviation].filter(Boolean),
      // best (lowest) top-25 ranking of the two teams, college only (99 = unranked)
      rank: Math.min(...c.competitors.map((x) => x.curatedRank?.current || 99).map((r) => (r > 0 && r < 26 ? r : 99))),
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
