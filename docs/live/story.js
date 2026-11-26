/* ScoreBuzz stream "match story" (owner, 26 Nov 2026): what makes every live stream its own broadcast.
   1. PRE-MATCH SHOW   before the start, written preview slides for this game (what's at stake, form, head to head, players to
                       watch, team news, line-ups) in the strip under the tracker.
   2. LIVE COMMENTARY  during play, a commentary card written in our own words from the play feed, with running context
                       (runs, lead changes, milestones, shot counts) and match facts when play is quiet.
   3. REPORTS          at every break (half-time, end of a quarter, intermission) and at the end, a report over the tracker:
                       written summary, key stats, top performers and, at the end, the table.
   center.html calls SBStory.frame(ctx) on every render when settings "story" is on (URL story=1) and places what comes back.
   Every sentence is built from the feed's facts (ESPN summary JSON); nothing is copied from ESPN's commentary text. */
(() => {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1 && n % 10) || 0] || 'th');
  const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const pick = (arr, seed) => arr[hash(seed) % arr.length];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const num = (v) => parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')) || 0;
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = (n) => WORDS[n] ?? String(n);
  const NTHW = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const nth = (n) => NTHW[n] || ord(n);
  const an = (n) => (/^(8|11|18|8\d)$/.test(String(n)) ? 'an' : 'a');
  const poss = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);
  const inMin = (m) => { const k = parseInt(m, 10); return !k ? '' : /\+/.test(m) ? (k >= 90 ? 'in stoppage time' : `in ${k === 45 ? 'first-half ' : ''}added time`) : `in the ${ord(k)} minute`; };
  // keep whole sentences while they fit (the cards clamp lines, so never let a sentence be cut in half)
  const fit = (parts, max) => { let out = ''; for (const p of parts.filter(Boolean)) { if (out && (out + ' ' + p).length > max) break; out = out ? out + ' ' + p : p; } return out; };
  let G = null, CUR = '';
  const fresh = () => ({ n: 0, first: true, sc: [0, 0], t: { h: {}, a: {} }, pl: new Map(), line: null, q: null, run: null, leadCh: 0, ties: 0, lastLeader: '', goals: [], rt: 0, rk: '', pt: 0 });
  const inc = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; return o[k]; };
  const P = (name, sd) => { if (!name) return {}; let p = G.pl.get(name); if (!p) { p = { name, sd }; G.pl.set(name, p); } return p; };

  // ---------- shared helpers on the frame's context ----------
  let C = null;
  const FOOT = () => C.kind === 'foot', US = () => !FOOT();
  const T = (sd) => (sd === 'h' ? C.H : C.A), other = (sd) => (sd === 'h' ? 'a' : 'h');
  const side = (id) => (String(id ?? '') === C.H.id ? 'h' : String(id ?? '') === C.A.id ? 'a' : '');
  const tn = (sd) => (FOOT() ? T(sd).nick : 'the ' + T(sd).nick);          // "Lille lead" / "the Knicks lead"
  const Tn = (sd) => cap(tn(sd));
  const last = (name) => { const w = String(name || '').trim().split(' '); if (w.length === 2 && /-/.test(w[1]) && !/-/.test(w[0])) return w.join(' '); /* "Shin Min-Ha": family name first, so the full name */ return w.length > 1 && /^(Jr\.?|Sr\.?|II|III|IV)$/.test(w[w.length - 1]) ? w.slice(-2).join(' ') : w.length > 2 && /^(de|van|von|da|di|del|St\.|Mac|Le|La)$/i.test(w[w.length - 2]) ? w.slice(-2).join(' ') : w[w.length - 1]; };
  const scoreLine = (h = G.sc[0], a = G.sc[1]) => {
    if (FOOT()) return `${C.H.nick} ${h}-${a} ${C.A.nick}.`;
    if (h === a) return h ? `Tied at ${h}.` : 'No score yet.';
    const [w, l] = h > a ? ['h', 'a'] : ['a', 'h']; return `${T(w).nick} ${Math.max(h, a)}, ${T(l).nick} ${Math.min(h, a)}.`;
  };
  const leadLine = (h = G.sc[0], a = G.sc[1]) => (h === a ? (h ? `It is level at ${h}-${a}.` : 'It is still goalless.') : `${Tn(h > a ? 'h' : 'a')} lead ${Math.max(h, a)}-${Math.min(h, a)}.`);
  const perLong = (p) => C.perLong(p);

  // ---------- 1. PRE-MATCH SHOW ----------
  const stat = (e, k) => (e?.stats || []).find((x) => x.name === k)?.displayValue;
  const entries = () => (C.s.standings?.groups || []).flatMap((g) => (g.standings?.entries || []).map((e) => ({ ...e, grp: g.header || '' })));
  const entry = (sd) => entries().find((e) => String(e.id) === T(sd).id);
  const rec = (sd, k) => (C.comp(sd).record || []).find((r) => r.type === k)?.summary;
  const l5 = (sd) => (C.s.lastFiveGames || []).find((g) => String(g.team?.id) === T(sd).id)?.events || [];
  const formLine = (sd) => {
    const ev = [...l5(sd)].sort((x, y) => new Date(x.gameDate) - new Date(y.gameDate)); if (ev.length < 3) return ''; const nw = (n) => (n ? word(n) : 'none');
    const w = ev.filter((e) => e.gameResult === 'W').length, d = ev.filter((e) => e.gameResult === 'D').length, l = ev.length - w - d;
    let run = 1; const lastR = ev[ev.length - 1].gameResult; for (let i = ev.length - 2; i >= 0 && ev[i].gameResult === lastR; i--) run++;
    const streak = run >= 3 ? ` and come in on a run of ${word(run)} straight ${lastR === 'W' ? 'wins' : lastR === 'L' ? 'defeats' : 'draws'}` : '';
    const lg = ev[ev.length - 1], opp = lg.opponent?.displayName || lg.opponent?.abbreviation || '';
    const lastTxt = opp ? ` Last time out: ${lastR === 'W' ? 'beat' : lastR === 'L' ? 'lost to' : 'drew with'} ${opp} ${lg.score}.` : '';
    if (w === ev.length || l === ev.length) return `${Tn(sd)} have ${w ? 'won' : 'lost'} their last ${word(ev.length)} games.${lastTxt}`;
    return `${Tn(sd)} have ${FOOT() ? `won ${nw(w)}, drawn ${nw(d)} and lost ${nw(l)}` : `won ${nw(w)} and lost ${nw(l)}`} of their last ${word(ev.length)}${streak}.${lastTxt}`;
  };
  const stakes = () => {
    const out = [];
    if (FOOT()) {
      const E = entries(), n = E.length;
      for (const sd of ['h', 'a']) { const e = entry(sd); if (!e) continue; const r = num(stat(e, 'rank')), pts = stat(e, 'points'), gp = stat(e, 'gamesPlayed');
        out.push(`${T(sd).nick} are ${ord(r)}${n ? ` of ${n}` : ''} on ${pl(num(pts), 'point')} from ${pl(num(gp), 'game')}.`); }
      const eh = entry('h'), ea = entry('a');
      if (eh && ea) { const gap = Math.abs(num(stat(eh, 'points')) - num(stat(ea, 'points'))), up = num(stat(eh, 'points')) >= num(stat(ea, 'points')) ? 'h' : 'a';
        out.push(gap === 0 ? 'They start the night level on points.' : `${T(up).nick} start ${pl(gap, 'point')} ahead of ${T(other(up)).nick}; ${gap <= 3 ? `a win for ${T(other(up)).nick} would ${gap === 3 ? 'pull them level' : 'take them above'}.` : `${T(other(up)).nick} need a result to close the gap.`}`); }
    } else {
      for (const sd of ['a', 'h']) { const r = rec(sd, 'total'); if (!r) continue; const e = entry(sd), st = stat(e, 'streak'), where = sd === 'h' ? rec('h', 'home') : rec('a', 'road');
        const strk = st && /^[WL]\d+$/.test(st) && +st.slice(1) >= 2 ? `, ${st[0] === 'W' ? 'winners' : 'losers'} of ${word(+st.slice(1))} straight` : '';
        out.push(`${Tn(sd)} are ${r}${strk}${where ? ` (${where} ${sd === 'h' ? 'at home' : 'on the road'})` : ''}.`); }
      const eh = entry('h'), ea = entry('a');
      if (eh && ea && eh.grp === ea.grp && eh.grp) out.push(`It is a divisional game: both play in the ${eh.grp.replace(/^\d{4}(-\d{2})?\s+/, '').replace(/ Standings$/, '')}.`);
      const note = C.s.header?.gameNote; if (note) out.unshift(`${note}.`);
    }
    return out;
  };
  const h2h = () => {
    const ss = (C.s.seasonseries || [])[0]; if (!ss) return [];
    const done = (ss.events || []).filter((e) => e.status === 'post' || e.statusType?.completed).sort((x, y) => new Date(y.date) - new Date(x.date)), out = [];
    const res = (e) => { const x = e.competitors || [], hm = x.find((k) => k.homeAway === 'home'), aw = x.find((k) => k.homeAway === 'away'); if (!hm || !aw) return '';
      const day = new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      return `${hm.team.displayName} ${hm.score}-${aw.score} ${aw.team.displayName} (${day})`; };
    if (FOOT()) {
      let w = { h: 0, a: 0, d: 0 };
      for (const e of done) { const x = e.competitors || [], win = x.find((k) => k.winner); if (!win) w.d++; else w[side(win.team.id) || 'd']++; }
      if (done.length) { out.push(`Last ${word(done.length)} meetings: ${T('h').nick} ${pl(w.h, 'win')}, ${T('a').nick} ${pl(w.a, 'win')}, ${pl(w.d, 'draw')}.`); out.push(`Most recent: ${res(done[0])}.`); }
    } else {
      const tot = ss.totalCompetitions || (ss.events || []).length, nth = done.length + 1;
      const NTH = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
      if (tot) out.push(`This is the ${NTH[nth] || ord(nth)} of ${word(tot)} meetings between these teams this season.`);
      if (done.length) out.push(`Last time: ${res(done[0])}.`);
    }
    return out;
  };
  const leaders = (sd) => (C.s.leaders || []).find((l) => String(l.team?.id) === T(sd).id)?.leaders || [];
  const lead1 = (sd, k) => { const l = leaders(sd).find((x) => x.name === k)?.leaders?.[0]; return l ? { name: l.athlete?.displayName, v: l.displayValue } : null; };
  const watch = () => {
    const out = [];
    for (const sd of US() ? ['a', 'h'] : ['h', 'a']) {
      if (FOOT()) { const g = lead1(sd, 'goalsLeaders'), a = lead1(sd, 'assistsLeaders'); const gv = g && (/Goals: (\d+)/.exec(g.v) || [])[1], av = a && (/Assists: (\d+)/.exec(a.v) || [])[1];
        if (g && +gv > 0) out.push(`${g.name} is ${T(sd).nick}'s top scorer in the competition with ${pl(+gv, 'goal')}${a && +av > 0 && a.name !== g.name ? `; ${a.name} has ${pl(+av, 'assist')}` : ''}.`); }
      else if (C.kind === 'nba') { const p = lead1(sd, 'pointsPerGame'), r = lead1(sd, 'reboundsPerGame'), a = lead1(sd, 'assistsPerGame');
        if (p) out.push(`${p.name} leads ${tn(sd)} with ${p.v} points a game${r && r.name !== p.name ? `; ${r.name} pulls down ${r.v} rebounds` : a && a.name !== p.name ? `; ${a.name} hands out ${a.v} assists` : ''}.`); }
      else if (C.kind === 'nhl') { const p = lead1(sd, 'points'), g = lead1(sd, 'goals');
        if (p) out.push(`${p.name} leads ${tn(sd)} with ${p.v} points${g && g.name !== p.name ? `; ${g.name} has ${g.v} goals` : g ? ` (${g.v} goals)` : ''}.`); }
      else { const qb = lead1(sd, 'passingYards'), rb = lead1(sd, 'rushingYards'); const y = (v) => (/([\d,]+) YDS/.exec(v || '') || [])[1], td = (v) => (/(\d+) TD/.exec(v || '') || [])[1];
        if (qb) out.push(`${qb.name} has thrown for ${y(qb.v)} yards and ${td(qb.v) || 0} touchdowns for ${tn(sd)}${rb ? `; ${rb.name} has run for ${y(rb.v)}` : ''}.`); }
    }
    return out;
  };
  const teamNews = () => {
    const out = [];
    for (const sd of ['a', 'h']) { const inj = (C.s.injuries || []).find((i) => String(i.team?.id) === T(sd).id)?.injuries || [];
      const outs = inj.filter((i) => /^(Out|Injured Reserve|Suspension)/i.test(i.status)).map((i) => last(i.athlete?.displayName)), dtd = inj.filter((i) => /Day-To-Day|Questionable|Doubtful/i.test(i.status)).map((i) => last(i.athlete?.displayName));
      if (outs.length || dtd.length) out.push(`${Tn(sd)}: ${[outs.length ? `${outs.slice(0, 4).join(', ')}${outs.length > 4 ? ` and ${outs.length - 4} more` : ''} out` : '', dtd.length ? `${dtd.slice(0, 3).join(', ')} questionable` : ''].filter(Boolean).join('; ')}.`); }
    return out;
  };
  const xi = (sd) => { const r = (C.s.rosters || []).find((x) => String(x.team?.id) === T(sd).id); const st = (r?.roster || []).filter((p) => p.starter); if (st.length !== 11) return '';
    return `${T(sd).nick}${r.formation ? ` (${r.formation})` : ''}: ${st.map((p) => last(p.athlete?.displayName)).join(', ')}.`; };
  function preview(now) {
    const start = FOOT() || C.kind === 'nfl' ? 'Kick-off' : C.kind === 'nhl' ? 'Puck drop' : 'Tip-off';
    const slides = [];
    const add = (k, parts, max = 225) => { const t = fit(parts, max); if (t) slides.push([k, t]); };
    add("WHAT'S AT STAKE", stakes());
    if (FOOT()) { add('STARTING LINE-UP', [xi('h')], 400); add('STARTING LINE-UP', [xi('a')], 400); }
    add('FORM GUIDE', [formLine(FOOT() ? 'h' : 'a')], 240); add('FORM GUIDE', [formLine(FOOT() ? 'a' : 'h')], 240);
    add(FOOT() ? 'HEAD TO HEAD' : 'SEASON SERIES', h2h());
    add('PLAYERS TO WATCH', watch(), 240);
    if (US()) add('TEAM NEWS', teamNews(), 240);
    add('THE DETAILS', [`${start} ${C.when}${C.venue ? ` at ${C.venue}` : ''}.`, `Live score, ${FOOT() ? 'line-ups, stats' : 'play-by-play, stats'} and the live tracker stay on this stream until the final ${FOOT() ? 'whistle' : C.kind === 'nhl' ? 'horn' : C.kind === 'nba' ? 'buzzer' : 'whistle'}.`]);
    if (!slides.length) return null;
    if (!G.pt) G.pt = now;
    const i = Math.floor((now - G.pt) / 10000) % slides.length, [k, t] = slides[i];
    return `<div class="sbs pre"><div class="k"><b>MATCH PREVIEW</b><span>${esc(k)}</span><i>${slides.map((_, j) => `<u class="${j === i ? 'on' : ''}"></u>`).join('')}</i></div><div class="t ${t.length > 190 ? 'sm' : ''}">${esc(t)}</div></div>`;
  }

  // ---------- 2. LIVE COMMENTARY: one step per new play, per sport ----------
  const say = (t, p) => ({ t, p });
  // football (ESPN commentary entries: play.type.type, play.team.displayName, participants)
  const footSide = (x) => { const id = x.play?.team?.id; if (id && side(id)) return side(id); const n = String(x.play?.team?.displayName || '').toLowerCase(); return !n ? '' : n === C.H.full.toLowerCase() ? 'h' : n === C.A.full.toLowerCase() ? 'a' : C.H.full.toLowerCase().includes(n) || n.includes(C.H.nick.toLowerCase()) ? 'h' : C.A.full.toLowerCase().includes(n) || n.includes(C.A.nick.toLowerCase()) ? 'a' : ''; };
  function stepFoot(x) {
    const ty = x.play?.type?.type || '', txt = x.text || '', sd = footSide(x), who = x.play?.participants?.[0]?.athlete?.displayName || '', min = x.time?.displayValue || '', tl = G.t;
    const how = /penalty/i.test(ty + txt) && /goal|penalty---scored/.test(ty) ? 'from the penalty spot' : /header/i.test(ty + ' ' + txt) ? 'with a header' : /free kick/i.test(txt) && /direct|from a/i.test(txt) ? 'from a free kick' : /outside the box/i.test(txt) ? 'from outside the box' : /very close range|six yard box/i.test(txt) ? 'from close range' : '';
    const ast = (/Assisted by ([^.]+?)(?: with| following|\.)/.exec(txt) || [])[1];
    const m = /^(?:Goal!|Own Goal)[^.]*?(\d+),[^.]*?(\d+)\./.exec(txt);
    if (/^(goal|penalty---scored)/.test(ty) || ty === 'own-goal') {
      const og = ty === 'own-goal', before = [...G.sc]; if (m) G.sc = [+m[1], +m[2]]; else if (sd) G.sc[sd === 'h' ? 0 : 1]++;
      const ben = G.sc[0] > before[0] ? 'h' : G.sc[1] > before[1] ? 'a' : sd; if (!ben) return null;
      const d0 = (ben === 'h' ? 1 : -1) * (before[0] - before[1]);
      const eff = d0 === 0 ? `puts ${T(ben).nick} in front` : d0 === -1 ? `brings ${T(ben).nick} level` : d0 < -1 ? `pulls one back for ${T(ben).nick}` : d0 === 1 ? `doubles ${T(ben).nick}'s lead` : `makes it ${Math.max(...G.sc)}-${Math.min(...G.sc)} to ${T(ben).nick}`;
      G.goals.push({ sd: ben, who: og ? `${last(who)} (og)` : last(who), min });
      if (og) return say(fit([`OWN GOAL! ${who} turns the ball into his own net ${inMin(min)}, and that ${eff}.`, scoreLine()], 170), 3);
      const n = inc(P(who, ben), 'g'); inc(G.t[ben], 'sh'); inc(G.t[ben], 'sot');
      return say(fit([`GOAL! ${who} ${eff} ${how ? how + ' ' : ''}${inMin(min)}.`, n === 2 ? 'That is his second of the night.' : n === 3 ? 'That is a hat-trick!' : ast ? `${last(ast)} with the assist.` : '', scoreLine()], 175), 3);
    }
    if (/penalty---(missed|saved)/.test(ty)) return say(`Penalty ${/saved/.test(ty) ? 'saved' : 'missed'}! ${who} cannot convert from the spot for ${T(sd)?.nick || 'his side'}. ${leadLine()}`, 3);
    if (/^var/.test(ty) || ty === 'deleted-after-review') return /No Goal/i.test(txt) ? say(`VAR check complete: no goal. ${leadLine()}`, 3) : null;
    if (!sd && !/kickoff|halftime|end|start/.test(ty)) return null;
    const me = tl[sd] || {}, op = tl[other(sd)] || {};
    if (ty === 'shot-on-target') { inc(me, 'sh'); const n = inc(me, 'sot'); const kp = (/saved[^.]*? by ([^(]+?) \(/.exec(txt) || [])[1]; if (kp) inc(P(kp.trim(), other(sd)), 'sv');
      return say(fit([pick([`${who} tests the goalkeeper ${how || 'with a shot on target'}${kp ? `, but ${last(kp.trim())} keeps it out` : ''}.`, `${kp ? `${last(kp.trim())} saves from ${who}` : `${who} forces a save`}${how ? ` (${how.replace(/^with a |^from /, '')})` : ''}.`], x.play?.id), `That is ${T(sd).nick}'s ${nth(n)} effort on target.`], 150), 2); }
    if (ty === 'shot-hit-woodwork') { inc(me, 'sh'); return say(`Off the woodwork! ${who} hits the frame of the goal for ${T(sd).nick}. ${leadLine()}`, 2); }
    if (ty === 'shot-off-target') { const n = inc(me, 'sh'); return say(fit([`${who} ${/header/i.test(txt) ? 'heads' : 'shoots'} ${/high/i.test(txt) ? 'over the bar' : 'wide'} for ${T(sd).nick}.`, `Attempts so far: ${C.H.nick} ${tl.h.sh || 0}, ${C.A.nick} ${tl.a.sh || 0}.`], 150), 1); }
    if (ty === 'shot-blocked') { const n = inc(me, 'sh'); return say(`${who} has a shot blocked. That is ${pl(n, 'attempt')} for ${T(sd).nick} so far.`, 1); }
    if (ty === 'corner-awarded') { const n = inc(me, 'co'); return say(`Corner to ${T(sd).nick}, their ${nth(n)} of the match. ${T(other(sd)).nick} have had ${word(op.co || 0)}.`, 1); }
    if (ty === 'yellow-card') { inc(me, 'yc'); const tot = (tl.h.yc || 0) + (tl.a.yc || 0); return say(`Yellow card for ${who} of ${T(sd).nick}. ${tot === 1 ? 'The first booking of the match.' : `That is ${pl(tot, 'booking')} so far.`}`, 2); }
    if (/red-card|second-yellow/.test(ty)) { inc(me, 'rc'); return say(`RED CARD! ${who} is sent off and ${T(sd).nick} are down to ${word(11 - me.rc)} men. ${leadLine()}`, 3); }
    if (ty === 'substitution') { const r = /\.\s*(.+?) replaces (.+?)\.?$/.exec(txt); return r ? say(`Change for ${T(sd).nick}: ${r[1]} comes on for ${r[2].replace(/ because of.*$/, '')}.`, 1) : null; }
    if (ty === 'offside') { const n = inc(me, 'off'); return say(`The flag is up against ${T(sd).nick}. They have been caught offside ${n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`}.`, 1); }
    if (ty === 'foul' || ty === 'handball') { if (/^(Foul|Handball) by/i.test(txt)) { const fs = footSideByName(txt) || sd; inc(tl[fs] || me, 'fo'); } return null; }
    if (ty === 'kickoff' || /start-2nd|second-half-begins/.test(ty) || /Half begins/i.test(txt)) return say(/Second Half/i.test(txt) ? `The second half is under way. ${leadLine()}` : `We are under way${C.venue ? ` at ${C.venue.split(',')[0]}` : ''}. ${C.H.nick} against ${C.A.nick}.`, 2);
    if (ty === 'halftime' || /First Half ends/i.test(txt)) { const r = /(\d+), [^.]*?(\d+)\./.exec(txt); if (r) G.sc = [+r[1], +r[2]]; return say(`Half-time. ${scoreLine()} ${breakLine()}`, 3); }
    if (/Match ends|Second Half ends/i.test(txt)) { const r = /(\d+), [^.]*?(\d+)\./.exec(txt); if (r) G.sc = [+r[1], +r[2]]; return say(`Full time. ${scoreLine()}`, 3); }
    return null;
  }
  const footSideByName = (t) => { const m = /\(([^)]+)\)\.?$/.exec(t || ''); if (!m) return ''; const n = m[1].toLowerCase(); return n === C.H.full.toLowerCase() ? 'h' : n === C.A.full.toLowerCase() ? 'a' : ''; };
  const breakLine = () => { const t = G.t, hs = t.h.sh || 0, as = t.a.sh || 0; return hs + as ? `Attempts: ${C.H.nick} ${hs} (${t.h.sot || 0} on target), ${C.A.nick} ${as} (${t.a.sot || 0} on target).` : ''; };

  // basketball
  function stepNba(p) {
    const ty = (p.type?.text || '').replace(/\n/g, ' '), txt = p.text || '', sd = side(p.team?.id), per = p.period?.number || 1, me = G.t[sd] || {}, key = p.id;
    const who = C.names.get(String(p.participants?.[0]?.athlete?.id))?.name || (/^(.+?) (?:makes|misses|blocks|enters|offensive|defensive|personal|shooting|bad|lost|traveling)/.exec(txt) || [])[1] || '';
    const isFT = /Free Throw/i.test(ty), three = p.pointsAttempted === 3 || / three point /i.test(txt);
    if (/End Period|End Game/i.test(ty)) { const top = topScorer(); return say(fit([`End of the ${perLong(per)}.`, scoreLine(), top ? `${last(top.name)} leads all scorers with ${top.pts}.` : ''], 160), 3); }
    if (!sd) return null;
    if (p.scoringPlay) {
      const v = p.scoreValue || 0, before = [...G.sc]; G.sc = [p.homeScore ?? before[0], p.awayScore ?? before[1]];
      const me2 = P(who, sd), pts0 = me2.pts || 0; me2.pts = pts0 + v; inc(me, 'pts', v); me.q = me.q || {}; inc(me.q, per, v);
      if (isFT) { inc(me, 'ftm'); inc(me, 'fta'); } else { inc(me, 'fgm'); inc(me, 'fga'); if (three) { inc(me, 'tpm'); inc(me, 'tpa'); inc(me2, 'tp'); } }
      const as = (/\((.+?) assists?\)/.exec(txt) || [])[1]; if (as) { inc(P(as, sd), 'ast'); inc(me, 'ast'); }
      if (!G.run || G.run.sd !== sd) G.run = { sd, pts: v, said: 0 }; else G.run.pts += v;
      const sgn = sd === 'h' ? 1 : -1, d0 = sgn * (before[0] - before[1]), d1 = sgn * (G.sc[0] - G.sc[1]);
      let ctx = '';
      if (d1 > 0 && G.lastLeader && G.lastLeader !== sd) { G.leadCh++; ctx = `${Tn(sd)} take the lead, ${Math.max(...G.sc)}-${Math.min(...G.sc)}.`; }
      else if (d1 === 0 && d0 !== 0) { G.ties++; ctx = `We are tied at ${G.sc[0]}.`; }
      if (d1 > 0) G.lastLeader = sd;
      if (!ctx && G.run.pts >= 8 && G.run.pts >= G.run.said + 4) { G.run.said = G.run.pts; ctx = `That makes it ${an(G.run.pts)} ${G.run.pts}-0 run for ${tn(sd)}.`; }
      const mile = [50, 40, 30, 20].find((k) => pts0 < k && me2.pts >= k);
      if (!ctx && mile) ctx = `${last(who)} is up to ${me2.pts} points.`;
      if (!ctx && d1 >= 10 && d1 > (me.maxLead || 0) && d1 >= (me.saidLead || 0) + 4) { me.saidLead = d1; ctx = `${Tn(sd)} lead by ${d1}, their biggest of the night.`; }
      if (d1 > (me.maxLead || 0)) me.maxLead = d1;
      const shot = isFT ? `${who} scores from the line.` : three ? pick([`${who} hits from three.`, `${who} knocks down the three.`, `${who} connects from deep.`], key) : /Dunk/i.test(ty) ? pick([`${who} throws it down.`, `${who} finishes with the dunk.`], key) : /Layup/i.test(ty) ? pick([`${who} scores at the rim.`, `${who} lays it in.`], key) : pick([`${who} hits the jumper.`, `${who} scores for ${tn(sd)}.`], key);
      const asT = as && !isFT ? `${last(as)} with the assist.` : '';
      if (isFT && !ctx) return null;
      return say(fit([shot, ctx || asT, ctx ? '' : scoreLine()], 150), ctx ? 3 : three || /Dunk/i.test(ty) ? 2 : 1);
    }
    if (isFT) { inc(me, 'fta'); return null; }
    if (p.shootingPlay) { inc(me, 'fga'); if (three) inc(me, 'tpa'); const b = /^(.+?) blocks (.+?)(?: 's|'s)/.exec(txt); if (b) { inc(G.t[other(sd)], 'blk'); inc(P(b[1], other(sd)), 'blk'); return say(`${b[1]} blocks ${poss(last(b[2]))} shot. ${scoreLine()}`, 2); } return null; }
    if (/Rebound/i.test(ty)) { if (p.participants?.length) { inc(me, 'reb'); inc(P(who, sd), 'reb'); } return null; }
    if (/Turnover/i.test(ty)) { inc(me, 'to'); const st = (/\((.+?) steals\)/.exec(txt) || [])[1]; if (st) { inc(G.t[other(sd)], 'stl'); return say(`${st} comes up with the steal. ${Tn(other(sd))} have forced ${pl(me.to, 'turnover')}.`, 1); } return null; }
    if (/Foul/i.test(ty)) { inc(me, 'pf'); return null; }
    if (/Timeout/i.test(ty)) { const r = G.run; return say(`Timeout, ${T(sd).nick}.${r && r.sd !== sd && r.pts >= 6 ? ` ${Tn(r.sd)} are on ${an(r.pts)} ${r.pts}-0 run.` : ` ${scoreLine()}`}`, r && r.sd !== sd && r.pts >= 6 ? 2 : 1); }
    return null;
  }
  // American football: the feed's official yards and passer lines when live; our own running counts in a replay
  const nflYds = (sd) => { const o = !C.replay && C.live1('totalYards'); return o ? o[sd === 'h' ? 0 : 1] : (G.t[sd].py || 0) + (G.t[sd].ru || 0); };
  const gameLead = (sd, k) => { if (C.replay) return null; const l = (C.s.leaders || []).find((x) => String(x.team?.id) === T(sd).id)?.leaders?.find((x) => x.name === k)?.leaders?.[0]; return l?.athlete?.displayName ? { name: l.athlete.displayName, v: l.displayValue || '' } : null; };
  const nflQB = (sd) => { const o = gameLead(sd, 'passingYards'); if (o) return { name: o.name, py: num((/([\d,]+) YDS/.exec(o.v) || [])[1]), ptd: num((/(\d+) TD/.exec(o.v) || [])[1]) }; return [...G.pl.values()].filter((p) => p.py && p.sd === sd && !p.rec).sort((x, y) => y.py - x.py)[0]; };
  const topScorer = (sd) => [...G.pl.values()].filter((p) => p.pts && (!sd || p.sd === sd)).sort((x, y) => y.pts - x.pts)[0];

  // hockey
  function stepNhl(p) {
    const ty = p.type?.text || '', txt = p.text || '', sd = side(p.team?.id), per = p.period?.number || 1, me = G.t[sd] || {}, op = G.t[other(sd)] || {};
    const part = (k) => (p.participants || []).filter((x) => x.type === k), nm = (x) => x?.athlete?.displayName || '';
    if (/Period Start/i.test(ty)) return per === 1 ? say(`The puck is down${C.venue ? ` at ${C.venue.split(',')[0]}` : ''}. ${Tn('a')} at ${tn('h')}.`, 2) : say(`The ${perLong(per)} is under way. ${scoreLine()}`, 2);
    if (/Period End|End of Game/i.test(ty)) return say(fit([`End of the ${perLong(per)}.`, scoreLine(), `Shots on goal: ${C.A.nick} ${G.t.a.sog || 0}, ${C.H.nick} ${G.t.h.sog || 0}.`], 160), 3);
    if (!sd) return null;
    if (p.scoringPlay || ty === 'Goal') {
      const before = [...G.sc]; G.sc = [p.homeScore ?? before[0], p.awayScore ?? before[1]]; inc(me, 'sog');
      const sc = part('scorer')[0] || p.participants?.[0], who = nm(sc), as = part('assister').map(nm), str = p.strength?.text || '', n = inc(P(who, sd), 'g'); as.forEach((a) => inc(P(a, sd), 'a'));
      if (/Power Play/i.test(str)) inc(me, 'ppg');
      const d0 = (sd === 'h' ? 1 : -1) * (before[0] - before[1]);
      const eff = d0 === 0 ? `${Tn(sd)} take the lead.` : d0 === -1 ? `${Tn(sd)} are level.` : d0 < -1 ? `${Tn(sd)} pull one back.` : `${Tn(sd)} extend their lead.`;
      return say(fit([`GOAL! ${who} scores${/Power Play/i.test(str) ? ' on the power play' : /Short/i.test(str) ? ' shorthanded' : /Empty/i.test(str) ? ' into the empty net' : ''}${n === 1 && sc?.ytdGoals ? `, his ${ord(sc.ytdGoals)} of the season` : n === 2 ? ', his second of the night' : n === 3 ? ' to complete the hat-trick' : ''}.`, as.length ? `Assisted by ${as.map(last).join(' and ')}.` : 'Unassisted.', eff, scoreLine()], 190), 3);
    }
    if (p.type?.penaltyMinutes) { const min = +p.type.penaltyMinutes || 2, who = nm(p.participants?.[0]); inc(me, 'pim', min); if (min === 2 || min === 4) inc(op, 'ppo');
      return say(fit([`Penalty on ${who} of ${tn(sd)}: ${min} minutes for ${ty.toLowerCase()}.`, min <= 4 ? `${Tn(other(sd))} go to the power play${(op.ppo || 0) > 1 ? `; they are ${op.ppg || 0} for ${op.ppo - 1} so far` : ''}.` : ''], 170), 2); }
    if (ty === 'Shot') { const n = inc(me, 'sog'), who = nm(part('shooter')[0] || p.participants?.[0]), gk = (/saved by (.+)$/.exec(txt) || [])[1]; inc(P(who, sd), 'sh'); if (gk) inc(P(gk.trim(), other(sd)), 'sv');
      return n % 3 === 0 || !G.line ? say(fit([gk ? `${last(gk.trim())} turns away ${who}.` : `${who} gets a shot through.`, `Shots on goal: ${C.A.nick} ${G.t.a.sog || 0}, ${C.H.nick} ${G.t.h.sog || 0}.`], 150), 1) : null; }
    if (ty === 'Hit') { inc(me, 'hit'); return null; }
    if (ty === 'Face Off') { inc(me, 'fo'); return null; }
    if (ty === 'Giveaway') { inc(me, 'gv'); return null; }
    if (ty === 'Takeaway') { inc(me, 'tk'); return null; }
    if (ty === 'Blocked') { inc(me, 'blk'); return null; }
    return null;
  }

  // American football (events = { p: play, d: drive, off: offence team id })
  const AB = "[A-Z][a-z]{0,2}\\.\\s?(?:[A-Z][a-z]{1,3}\\.\\s?)?[A-Z][A-Za-z'\\-]+(?:\\s(?:Jr|Sr|II|III|IV)\\b\\.?)?";
  const full = (ab) => { if (!ab) return ''; const k = ab.replace(/[\s.]/g, '').toLowerCase(); return C.short.get(k) || ab.replace(/\.(?=\S)/g, '. '); };
  const grab = (re, t) => full((new RegExp(re).exec(t) || [])[1]);
  function stepNfl(e) {
    const p = e.p, ty = p.type?.text || '', txt = (p.text || '').replace(/^(?:\([^)]*\)\s*)+/, ''), sd = side(e.off), df = other(sd), y = p.statYardage || 0, st = p.start || {}, per = p.period?.number || 1, me = G.t[sd] || {}, dt = G.t[df] || {};
    const before = [...G.sc]; G.sc = [p.homeScore ?? before[0], p.awayScore ?? before[1]];
    const scored = G.sc[0] > before[0] ? 'h' : G.sc[1] > before[1] ? 'a' : '';
    if (/End Period|End of Half|End of Game/i.test(ty)) return say(fit([/Half/i.test(ty) ? 'That is half-time.' : /Game/i.test(ty) ? 'That is the final.' : `End of the ${perLong(per)}.`, scoreLine()], 150), 3);
    if (/Two-minute warning/i.test(ty)) return say(`Two-minute warning. ${scoreLine()}`, 2);
    if (!sd) return null;
    const qb = grab(`^(${AB}) pass`, txt), wr = grab(`pass[^.]*? to (${AB})`, txt), rb = grab(`^(${AB}) (?:left|right|up|scrambles|rushes|kneels|sneaks)`, txt);
    const third = st.down === 3, fourth = st.down === 4, conv = (third || fourth) && y >= (st.distance || 99);
    if (third && /Rush|Pass|Sack/i.test(ty) && !p.isPenalty) { inc(me, 't3a'); if (conv || /Touchdown/i.test(ty)) inc(me, 't3c'); }
    if (/Touchdown/i.test(ty)) {
      const s2 = scored || sd, drv = s2 === sd ? /(\d+) plays?, (\d+) yards?/.exec(e.d?.description || '') : null;
      if (/Passing/i.test(ty)) { inc(me, 'py', y); inc(me, 'cmp'); inc(me, 'att'); if (qb) { const q = P(qb, sd); inc(q, 'py', y); inc(q, 'ptd'); } if (wr) { const w = P(wr, sd); inc(w, 'ry', y); inc(w, 'rec'); inc(w, 'rtd'); } }
      else if (/Rushing/i.test(ty)) { inc(me, 'ru', y); inc(me, 'car'); if (rb) { const r = P(rb, sd); inc(r, 'ru', y); inc(r, 'rutd'); } }
      const how = /Passing/i.test(ty) && qb && wr ? `${qb} finds ${wr} from ${pl(y, 'yard')} out.` : /Rushing/i.test(ty) && rb ? `${rb} runs it in from ${pl(y, 'yard')} out.` : /Interception/i.test(ty) ? 'A pick-six.' : /Fumble/i.test(ty) ? 'A fumble returned all the way.' : /Kickoff|Punt/i.test(ty) ? 'Returned all the way.' : '';
      return say(fit([`TOUCHDOWN, ${T(s2).nick}!`, how, drv ? `That caps a ${drv[1]}-play, ${drv[2]}-yard drive.` : '', scoreLine()], 180), 3);
    }
    if (/Field Goal Good/i.test(ty)) { const k = grab(`^(${AB}) \\d+ yard`, txt); return say(fit([k ? `${k} is good from ${y} yards.` : `The ${y}-yard field goal is good for ${tn(sd)}.`, scoreLine()], 150), 3); }
    if (/Field Goal Missed|Blocked Field Goal/i.test(ty)) { const k = grab(`^(${AB}) \\d+ yard`, txt); return say(`No good! ${k || `The kick for ${tn(sd)}`} ${/Blocked/i.test(ty) ? 'is blocked' : `misses from ${y} yards`}. ${scoreLine()}`.replace(/^(No good! [A-Z][^T].*?) is blocked/, '$1 has the kick blocked'), 3); }
    if (/Interception/i.test(ty)) { inc(me, 'to'); inc(me, 'att'); const by = grab(`INTERCEPTED by (${AB})`, txt); return say(fit([`INTERCEPTED! ${by ? `${by} picks off ${qb || 'the pass'}.` : `${Tn(df)} pick it off.`}`, `${Tn(df)} take over.`, scoreLine()], 160), 3); }
    if (/Fumble Recovery \(Opponent\)/i.test(ty)) { inc(me, 'to'); return say(`FUMBLE! ${Tn(df)} come up with the ball. ${scoreLine()}`, 3); }
    if (/^Sack/i.test(ty)) { inc(me, 'py', y); inc(dt, 'sk'); const sq = grab(`^(${AB}) sacked`, txt), by = grab(`\\((${AB})[;)]`, txt); return say(`${sq || 'The quarterback'} is sacked for a loss of ${Math.abs(y)}${by ? ` by ${by}` : ''}. ${dt.sk > 1 ? `That is sack number ${dt.sk} for ${tn(df)}.` : ''}`, 2); }
    if (/Pass Reception/i.test(ty)) { inc(me, 'py', y); inc(me, 'cmp'); inc(me, 'att'); if (qb) inc(P(qb, sd), 'py', y); if (wr) { const w = P(wr, sd); inc(w, 'ry', y); inc(w, 'rec'); }
      if (y >= 20) return say(qb && wr ? `${qb} hits ${wr} for ${y} yards. ${Tn(sd)} are on the move.` : `A ${y}-yard completion for ${tn(sd)}.`, 2);
      if (conv) return say(`${Tn(sd)} convert on ${ord(st.down)} and ${st.distance}: ${wr || 'a catch'} for ${y}.`, 1);
      return null; }
    if (/Pass Incompletion/i.test(ty)) { inc(me, 'att'); if (fourth) return say(`Turnover on downs! ${Tn(sd)} come up empty on 4th and ${st.distance}. ${Tn(df)} take over.`, 3); if (third) return say(`Incomplete on 3rd and ${st.distance} for ${tn(sd)}.`, 1); return null; }
    if (/^Rush/i.test(ty)) { inc(me, 'ru', y); inc(me, 'car'); if (rb) { const r = P(rb, sd); inc(r, 'ru', y); inc(r, 'car'); }
      if (y >= 15) return say(rb ? `${rb} breaks free for ${y} yards.` : `${Tn(sd)} break off a ${y}-yard run.`, 2);
      if (conv) return say(`${Tn(sd)} convert on ${ord(st.down)} and ${st.distance} on the ground.`, 1);
      if (fourth && !conv) return say(`Stopped! ${Tn(sd)} are turned away on 4th and ${st.distance}. ${Tn(df)} take over.`, 3);
      return null; }
    if (/^Punt/i.test(ty)) { inc(me, 'punt'); return say(`${Tn(sd)} punt it away. ${scoreLine()}`, 1); }
    if (/^Penalty/i.test(ty) || p.isPenalty) { const m = /PENALTY on ([A-Z]{2,3})-[^,]+, ([^,]+), (\d+) yards/.exec(p.text || ''); if (m) { const ps = m[1] === C.H.abbr ? 'h' : m[1] === C.A.abbr ? 'a' : ''; if (ps) { inc(G.t[ps], 'pen'); inc(G.t[ps], 'peny', +m[3]); return say(`Flag: ${m[2].toLowerCase()} on ${tn(ps)}, ${m[3]} yards.`, 1); } } return null; }
    return null;
  }
  const nflEvents = (s) => { const ds = [...(s.drives?.previous || []), ...(s.drives?.current ? [s.drives.current] : [])], seen = new Set(), out = [];
    for (const d of ds) for (const p of d.plays || []) { if (seen.has(p.id)) continue; seen.add(p.id); out.push({ p, d, off: String(p.start?.team?.id || d.team?.id || ''), id: p.id }); }
    return out; };
  const eventsOf = () => (FOOT() ? (C.s.commentary || []).filter((x) => x.text) : C.kind === 'nfl' ? nflEvents(C.s) : C.s.plays || []);
  const stepOf = () => (FOOT() ? stepFoot : C.kind === 'nba' ? stepNba : C.kind === 'nhl' ? stepNhl : stepNfl);
  const HOLD = [0, 7000, 10000, 15000];
  function feed(now) {
    const ev = eventsOf(), step = stepOf();
    if (ev.length < G.n) { const k = fresh(); k.rt = G.rt; k.rk = G.rk; G = k; }      // a replay started again
    let best = null;
    for (; G.n < ev.length; G.n++) { let l = null; try { l = step(ev[G.n]); } catch (e) { /* one odd play never stops the stream */ } if (l && l.t && (!best || l.p >= best.p)) best = l; }
    if (G.first) { G.first = false; if (C.live && !C.brk) best = say(fit([opening(), scoreLine()], 170), 2); }      // page opened in the middle of a game: start with where the game stands
    if (best) { const c = G.line; if (!c || best.p >= c.p || now - c.at > HOLD[c.p]) { G.line = { ...best, at: now }; G.q = null; } else G.q = best; }
    else if (G.q && G.line && now - G.line.at > HOLD[G.line.p]) { G.line = { ...G.q, at: now }; G.q = null; }
  }
  const opening = () => (FOOT() ? `${C.H.nick} against ${C.A.nick}${C.venue ? ` at ${C.venue.split(',')[0]}` : ''}.` : `${Tn('a')} at ${tn('h')}${C.venue ? `, ${C.venue.split(',')[0]}` : ''}.`);
  // match facts shown when nothing has happened for a while
  function facts() {
    const t = G.t, out = [], H = C.H.nick, A = C.A.nick;
    if (FOOT()) {
      if ((t.h.sh || 0) + (t.a.sh || 0)) out.push(`Attempts: ${H} ${t.h.sh || 0} (${t.h.sot || 0} on target), ${A} ${t.a.sh || 0} (${t.a.sot || 0} on target).`);
      if ((t.h.co || 0) + (t.a.co || 0)) out.push(`Corners: ${H} ${t.h.co || 0}, ${A} ${t.a.co || 0}. Offsides: ${t.h.off || 0} and ${t.a.off || 0}.`);
      const pos = C.live1('possessionPct'); if (pos) out.push(`Possession: ${H} ${Math.round(pos[0])}%, ${A} ${Math.round(pos[1])}%.`);
      if (G.goals.length) out.push(`Scorers: ${G.goals.map((g) => `${g.who} ${g.min}`).join(', ')}.`);
      if ((t.h.yc || 0) + (t.a.yc || 0)) out.push(`Bookings: ${H} ${t.h.yc || 0}, ${A} ${t.a.yc || 0}.`);
    } else if (C.kind === 'nba') {
      const a = topScorer('a'), h = topScorer('h'); if (a && h) out.push(`${a.name} has ${a.pts} for ${tn('a')}; ${h.name} leads ${tn('h')} with ${h.pts}.`);
      if ((t.h.tpm || 0) + (t.a.tpm || 0)) out.push(`Threes: ${A} ${t.a.tpm || 0} of ${t.a.tpa || 0}, ${H} ${t.h.tpm || 0} of ${t.h.tpa || 0}.`);
      if (G.leadCh + G.ties) out.push(`${pl(G.leadCh, 'lead change')} and ${pl(G.ties, 'tie')} so far.`);
      if ((t.h.reb || 0) + (t.a.reb || 0)) out.push(`Rebounds: ${A} ${t.a.reb || 0}, ${H} ${t.h.reb || 0}. Turnovers: ${t.a.to || 0} and ${t.h.to || 0}.`);
      const q = C.per, qa = t.a.q?.[q] || 0, qh = t.h.q?.[q] || 0; if (qa + qh >= 10 && qa !== qh) out.push(`${Tn(qa > qh ? 'a' : 'h')} are winning the ${perLong(q)} ${Math.max(qa, qh)}-${Math.min(qa, qh)}.`);
    } else if (C.kind === 'nhl') {
      if ((t.h.sog || 0) + (t.a.sog || 0)) out.push(`Shots on goal: ${A} ${t.a.sog || 0}, ${H} ${t.h.sog || 0}.`);
      if ((t.h.hit || 0) + (t.a.hit || 0)) out.push(`Hits: ${A} ${t.a.hit || 0}, ${H} ${t.h.hit || 0}.`);
      const fo = (t.h.fo || 0) + (t.a.fo || 0); if (fo >= 10) out.push(`Face-offs: ${Tn((t.a.fo || 0) >= (t.h.fo || 0) ? 'a' : 'h')} have won ${Math.round(100 * Math.max(t.a.fo || 0, t.h.fo || 0) / fo)}% of the draws.`);
      for (const sd of ['a', 'h']) { const g = [...G.pl.values()].filter((p) => p.sv && p.sd === sd).sort((x, y) => y.sv - x.sv)[0]; if (g && g.sv >= 5) out.push(`${g.name} has made ${g.sv} saves for ${tn(sd)}.`); }
      if ((t.h.ppo || 0) + (t.a.ppo || 0)) out.push(`Power plays: ${A} ${t.a.ppg || 0} for ${t.a.ppo || 0}, ${H} ${t.h.ppg || 0} for ${t.h.ppo || 0}.`);
    } else {
      const yd = nflYds; if (yd('h') + yd('a')) out.push(`Total yards: ${A} ${yd('a')}, ${H} ${yd('h')}.`);
      if ((t.h.t3a || 0) + (t.a.t3a || 0)) out.push(`Third downs: ${A} ${t.a.t3c || 0} of ${t.a.t3a || 0}, ${H} ${t.h.t3c || 0} of ${t.h.t3a || 0}.`);
      if ((t.h.to || 0) + (t.a.to || 0)) out.push(`Turnovers: ${A} ${t.a.to || 0}, ${H} ${t.h.to || 0}.`);
      for (const sd of ['a', 'h']) { const q = nflQB(sd); if (q && q.py >= 40) out.push(`${q.name} has ${q.py} passing yards${q.ptd ? ` and ${pl(q.ptd, 'touchdown')}` : ''} for ${tn(sd)}.`); }
    }
    return out;
  }
  function commCard(now, brk) {
    let label = 'LIVE COMMENTARY', text = G.line?.t || '', big = (G.line?.p || 0) >= 3;
    if (brk) { label = brk === 'ft' ? 'FINAL WORD' : 'AT THE BREAK'; text = fit(summary(brk), 170); big = false; }
    else if (!text || now - (G.line?.at || 0) > 20000) { const f = facts(); if (f.length) { label = 'MATCH FACTS'; text = f[Math.floor(now / 9000) % f.length]; big = false; } }
    if (!text) text = fit([opening(), scoreLine()], 170);
    return `<div class="sbs cm ${big ? 'big' : ''}"><div class="k"><b>${esc(label)}</b><span>${esc(C.clk)}${C.sub ? ' · ' + esc(C.sub) : ''}</span></div><div class="t ${text.length > 135 ? 'sm' : ''}">${esc(text)}</div></div>`;
  }

  // ---------- 3. REPORTS: break and final ----------
  const liveStat = (k) => { const v = C.live1(k); return v; };
  function statRows() {
    const t = G.t, pct = (m, a) => (a ? Math.round(100 * m / a) : 0), R = [];
    const row = (label, h, a, hv = h, av = a, low = false) => R.push({ label, h, a, hv: num(hv), av: num(av), low });
    if (FOOT()) { const pos = liveStat('possessionPct'); if (pos && !C.replay) row('Possession', Math.round(pos[0]) + '%', Math.round(pos[1]) + '%');
      row('Shots', t.h.sh || 0, t.a.sh || 0); row('On target', t.h.sot || 0, t.a.sot || 0); row('Corners', t.h.co || 0, t.a.co || 0); row('Fouls', t.h.fo || 0, t.a.fo || 0, undefined, undefined, true); row('Offsides', t.h.off || 0, t.a.off || 0, undefined, undefined, true); row('Yellow cards', t.h.yc || 0, t.a.yc || 0, undefined, undefined, true); }
    else if (C.kind === 'nba') { const f = (sd) => `${t[sd].fgm || 0}/${t[sd].fga || 0}`, th = (sd) => `${t[sd].tpm || 0}/${t[sd].tpa || 0}`;
      row('Field goals', f('h'), f('a'), pct(t.h.fgm, t.h.fga), pct(t.a.fgm, t.a.fga)); row('Three-pointers', th('h'), th('a'), t.h.tpm || 0, t.a.tpm || 0); row('Free throws', `${t.h.ftm || 0}/${t.h.fta || 0}`, `${t.a.ftm || 0}/${t.a.fta || 0}`, t.h.ftm || 0, t.a.ftm || 0);
      row('Rebounds', t.h.reb || 0, t.a.reb || 0); row('Assists', t.h.ast || 0, t.a.ast || 0); row('Turnovers', t.h.to || 0, t.a.to || 0, undefined, undefined, true); }
    else if (C.kind === 'nhl') { row('Shots on goal', t.h.sog || 0, t.a.sog || 0); row('Power play', `${t.h.ppg || 0}/${t.h.ppo || 0}`, `${t.a.ppg || 0}/${t.a.ppo || 0}`, t.h.ppg || 0, t.a.ppg || 0); row('Face-offs won', t.h.fo || 0, t.a.fo || 0); row('Hits', t.h.hit || 0, t.a.hit || 0); row('Takeaways', t.h.tk || 0, t.a.tk || 0); row('Penalty minutes', t.h.pim || 0, t.a.pim || 0, undefined, undefined, true); }
    else { const yd = (sd) => (t[sd].py || 0) + (t[sd].ru || 0), off = !C.replay && liveStat('totalYards');
      if (off) { const g = (k) => C.liveS(k) || ['-', '-']; row('Total yards', off[0], off[1]); row('Passing yards', ...g('netPassingYards')); row('Rushing yards', ...g('rushingYards')); row('First downs', ...g('firstDowns')); row('Third downs', ...g('thirdDownEff'), t.h.t3c || 0, t.a.t3c || 0); row('Turnovers', ...g('turnovers'), undefined, undefined, true); }
      else { row('Total yards', yd('h'), yd('a')); row('Passing yards', t.h.py || 0, t.a.py || 0); row('Rushing yards', t.h.ru || 0, t.a.ru || 0); row('Third downs', `${t.h.t3c || 0}/${t.h.t3a || 0}`, `${t.a.t3c || 0}/${t.a.t3a || 0}`, t.h.t3c || 0, t.a.t3c || 0); row('Sacks', t.h.sk || 0, t.a.sk || 0); row('Turnovers', t.h.to || 0, t.a.to || 0, undefined, undefined, true); } }
    return R;
  }
  function performers(sd) {
    const ps = [...G.pl.values()].filter((p) => p.sd === sd), out = [];
    const push = (p, line) => { if (p && !out.some((o) => o.name === p.name)) out.push({ name: p.name, line }); };
    if (FOOT()) { ps.filter((p) => p.g).sort((x, y) => y.g - x.g).forEach((p) => push(p, pl(p.g, 'goal'))); const k = ps.filter((p) => p.sv).sort((x, y) => y.sv - x.sv)[0]; if (k) push(k, pl(k.sv, 'save')); }
    else if (C.kind === 'nba') ps.filter((p) => p.pts).sort((x, y) => y.pts - x.pts).slice(0, 3).forEach((p) => push(p, [`${p.pts} pts`, p.reb ? `${p.reb} reb` : '', p.ast ? `${p.ast} ast` : ''].filter(Boolean).join(' · ')));
    else if (C.kind === 'nhl') { ps.filter((p) => p.g || p.a).sort((x, y) => (y.g || 0) * 2 + (y.a || 0) - (x.g || 0) * 2 - (x.a || 0)).slice(0, 2).forEach((p) => push(p, [p.g ? pl(p.g, 'goal') : '', p.a ? pl(p.a, 'assist') : ''].filter(Boolean).join(' · '))); const k = ps.filter((p) => p.sv).sort((x, y) => y.sv - x.sv)[0]; if (k) push(k, pl(k.sv, 'save')); if (out.length < 3) ps.filter((p) => p.sh).sort((x, y) => y.sh - x.sh).slice(0, 3 - out.length).forEach((p) => push(p, pl(p.sh, 'shot'))); }
    else if (gameLead(sd, 'passingYards')) { for (const k of ['passingYards', 'rushingYards', 'receivingYards']) { const o = gameLead(sd, k); if (o) push({ name: o.name }, o.v.replace(/ YDS/g, ' yds').replace(/ REC/g, ' rec').replace(/ CAR/g, ' car')); } }
    else { const q = ps.filter((p) => p.py && !p.rec).sort((x, y) => y.py - x.py)[0]; if (q) push(q, `${q.py} pass yds${q.ptd ? ` · ${q.ptd} TD` : ''}`); const r = ps.filter((p) => p.ru).sort((x, y) => y.ru - x.ru)[0]; if (r) push(r, `${r.ru} rush yds${r.rutd ? ` · ${r.rutd} TD` : ''}`); const w = ps.filter((p) => p.rec).sort((x, y) => y.ry - x.ry)[0]; if (w) push(w, `${w.rec} rec · ${w.ry} yds${w.rtd ? ` · ${w.rtd} TD` : ''}`); }
    return out.slice(0, 3);
  }
  function summary(kind) {
    const [h, a] = G.sc, t = G.t, out = [], fin = kind === 'ft', H = C.H.nick, A = C.A.nick, w = h > a ? 'h' : a > h ? 'a' : '';
    if (FOOT()) {
      const by = (sd) => { const m = new Map(); G.goals.filter((g) => g.sd === sd).forEach((g) => m.set(g.who, [...(m.get(g.who) || []), g.min])); return [...m].map(([n, ms]) => `${n} (${ms.join(', ')})`).join(', '); };
      out.push(fin ? (w ? `${T(w).nick} beat ${T(other(w)).nick} ${Math.max(h, a)}-${Math.min(h, a)}${C.venue ? ` at ${C.venue.split(',')[0]}` : ''}.` : `${H} and ${A} share the points after a ${h}-${a} draw.`) : (w ? `${T(w).nick} lead ${Math.max(h, a)}-${Math.min(h, a)} at the break.` : h ? `It is ${h}-${a} at the break.` : 'Goalless at the break.'));
      for (const sd of ['h', 'a']) if (by(sd)) out.push(`${T(sd).nick}: ${by(sd)}.`);
      const hs = t.h.sh || 0, as = t.a.sh || 0; if (hs + as) { const d = hs >= as ? 'h' : 'a'; out.push(hs === as ? `Both sides had ${pl(hs, 'attempt')}.` : `${T(d).nick} had ${Math.max(hs, as)} of the ${hs + as} attempts, ${t[d].sot || 0} of them on target.`); }
      if ((t.h.rc || 0) + (t.a.rc || 0)) out.push(`${T((t.h.rc || 0) ? 'h' : 'a').nick} ${fin ? 'finished' : 'are down'} ${fin ? 'with' : 'to'} ${word(11 - (t.h.rc || t.a.rc))} men.`);
    } else {
      const unit = C.kind === 'nba' ? perLong(C.per) : C.kind === 'nhl' ? perLong(C.per) : perLong(C.per);
      out.push(fin ? `${Tn(w || 'h')} beat ${tn(other(w || 'h'))} ${Math.max(h, a)}-${Math.min(h, a)}${C.venue ? ` at ${C.venue.split(',')[0]}` : ''}.` : w ? `${Tn(w)} lead ${Math.max(h, a)}-${Math.min(h, a)} ${C.half ? 'at half-time' : `after the ${unit}`}.` : `It is tied at ${h} ${C.half ? 'at half-time' : `after the ${unit}`}.`);
      if (C.kind === 'nba') { const top = topScorer(); if (top) out.push(`${top.name} ${fin ? 'led' : 'leads'} all scorers with ${top.pts}${top.reb >= 8 ? ` and ${top.reb} rebounds` : top.ast >= 6 ? ` and ${top.ast} assists` : ''}.`); const o = topScorer(other(top?.sd || 'h')); if (o) out.push(`${o.name} ${fin ? 'had' : 'has'} ${o.pts} for ${tn(o.sd)}.`);
        const fg = (sd) => (t[sd].fga ? Math.round(100 * (t[sd].fgm || 0) / t[sd].fga) : 0); out.push(`Shooting: ${A} ${fg('a')}%, ${H} ${fg('h')}%.`); if (G.leadCh >= 4) out.push(`The lead changed hands ${G.leadCh} times.`); }
      else if (C.kind === 'nhl') { for (const sd of w ? [w, other(w)] : ['a', 'h']) { const sc = [...G.pl.values()].filter((p) => p.g && p.sd === sd).sort((x, y) => y.g - x.g); if (sc.length) out.push(`${T(sd).nick} goals: ${sc.map((p) => last(p.name) + (p.g > 1 ? ` ${p.g}` : '')).join(', ')}.`); }
        out.push(`Shots on goal: ${A} ${t.a.sog || 0}, ${H} ${t.h.sog || 0}.`); const g = w && [...G.pl.values()].filter((p) => p.sv && p.sd === w).sort((x, y) => y.sv - x.sv)[0]; if (g && fin) out.push(`${g.name} made ${g.sv} saves for the winners.`); }
      else { const yd = nflYds; for (const sd of w ? [w, other(w)] : ['a', 'h']) { const q = nflQB(sd); if (q) out.push(`${q.name}: ${q.py} passing yards${q.ptd ? `, ${pl(q.ptd, 'touchdown')}` : ''}.`); }
        out.push(`Total yards: ${A} ${yd('a')}, ${H} ${yd('h')}.`); if ((t.h.to || 0) + (t.a.to || 0)) out.push(`Turnovers: ${A} ${t.a.to || 0}, ${H} ${t.h.to || 0}.`); }
    }
    return out;
  }
  function tableRows() {
    const E = entries(); if (!E.length) return null;
    if (FOOT()) { const idx = [E.findIndex((e) => String(e.id) === C.H.id), E.findIndex((e) => String(e.id) === C.A.id)].filter((i) => i >= 0); if (!idx.length) return null;
      const keep = new Set(); idx.forEach((i) => { for (let j = Math.max(0, i - 1); j <= Math.min(E.length - 1, i + 1); j++) keep.add(j); });
      return { cols: ['P', 'W', 'D', 'L', 'GD', 'PTS'], rows: [...keep].sort((x, y) => x - y).slice(0, 6).map((i) => ({ rank: stat(E[i], 'rank'), team: E[i].team, me: idx.includes(i), v: ['gamesPlayed', 'wins', 'ties', 'losses', 'pointDifferential', 'points'].map((k) => stat(E[i], k) ?? '') })) }; }
    const mine = E.filter((e) => [C.H.id, C.A.id].includes(String(e.id))), same = mine.length === 2 && mine[0].grp === mine[1].grp, grp = same ? mine[0].grp : '', rk = (e) => E.filter((x) => x.grp === e.grp).indexOf(e) + 1, rows = same ? E.filter((e) => e.grp === grp).slice(0, 8) : mine;
    const cols = C.kind === 'nhl' ? [['W', 'wins'], ['L', 'losses'], ['OTL', 'otLosses'], ['PTS', 'points']] : C.kind === 'nba' ? [['W', 'wins'], ['L', 'losses'], ['PCT', 'winPercent'], ['STRK', 'streak']] : [['W', 'wins'], ['L', 'losses'], ['T', 'ties'], ['PF', 'pointsFor'], ['PA', 'pointsAgainst']];
    return { title: (grp || '').replace(/^\d{4}(-\d{2})?\s+/, '').replace(/ Standings$/, ''), cols: cols.map((c) => c[0]), rows: rows.map((e) => ({ rank: rk(e), team: same ? e.team : `${e.team} (${e.grp.replace(/^\d{4}(-\d{2})?\s+/, '').replace(/ (Division )?Standings$/, '')})`, me: [C.H.id, C.A.id].includes(String(e.id)), v: cols.map((c) => stat(e, c[1]) ?? '') })) };
  }
  function report(now, kind) {
    const key = kind + C.per; if (G.rk !== key) { G.rk = key; G.rt = now; }
    const fin = kind === 'ft', L = C.L, R = C.R, lsd = L.id === C.H.id ? 'h' : 'a', rsd = other(lsd), sc = (sd) => G.sc[sd === 'h' ? 0 : 1];
    const title = fin ? (FOOT() ? 'FULL-TIME REPORT' : 'FINAL REPORT') : FOOT() || C.half ? 'HALF-TIME REPORT' : C.kind === 'nhl' ? `${ord(C.per).toUpperCase()} INTERMISSION REPORT` : `END OF THE ${perLong(C.per).toUpperCase()}`;
    const slides = [];
    slides.push(['THE STORY SO FAR', `<div class="sum ${fit(summary(kind), 430).length > 300 ? 'sm' : ''}">${esc(fit(summary(kind), 430))}</div>`]);
    if (fin) slides[0][0] = 'THE STORY OF THE GAME';
    const rows = statRows().filter((r) => r.h !== undefined);
    if (rows.length) slides.push(['KEY STATS', `<div class="stt">${rows.slice(0, 6).map((r) => { const l = lsd === 'h' ? [r.h, r.hv] : [r.a, r.av], rr = lsd === 'h' ? [r.a, r.av] : [r.h, r.hv], tot = l[1] + rr[1], lw = tot ? Math.round(100 * l[1] / tot) : 50, lb = r.low ? l[1] < rr[1] : l[1] > rr[1], rb = r.low ? rr[1] < l[1] : rr[1] > l[1];
      return `<div class="r"><b class="${lb ? 'w' : ''}">${esc(l[0])}</b><div class="m"><span>${esc(r.label)}</span><div class="bar"><i style="width:${lw}%;background:${L.mark}"></i><i style="width:${100 - lw}%;background:${R.mark}"></i></div></div><b class="${rb ? 'w' : ''}">${esc(rr[0])}</b></div>`; }).join('')}</div>`]);
    const pf = (sd) => performers(sd).map((p) => { const head = C.heads.get(p.name) || ''; return `<div class="pp">${head ? `<img src="${esc(head)}" onerror="this.style.visibility='hidden'">` : `<div class="in" style="background:${T(sd).mark}">${esc(p.name.split(' ').map((x) => x[0]).slice(0, 2).join(''))}</div>`}<div><div class="n">${esc(p.name)}</div><div class="l">${esc(p.line)}</div></div></div>`; }).join('');
    if (performers('h').length + performers('a').length) slides.push([fin ? 'TOP PERFORMERS' : 'STANDOUT SO FAR', `<div class="pf"><div><div class="tm">${esc(L.nick)}</div>${pf(lsd) || '<div class="no">-</div>'}</div><div><div class="tm">${esc(R.nick)}</div>${pf(rsd) || '<div class="no">-</div>'}</div></div>`]);
    const tb = fin && tableRows();
    if (tb) slides.push([FOOT() ? 'THE TABLE' : (tb.title || 'STANDINGS').toUpperCase(), `<div class="tb"><div class="h"><span></span><span></span>${tb.cols.map((c) => `<span>${esc(c)}</span>`).join('')}</div>${tb.rows.map((r) => `<div class="${r.me ? 'me' : ''}"><span>${esc(r.rank)}</span><span>${esc(r.team)}</span>${r.v.map((v) => `<span>${esc(v)}</span>`).join('')}</div>`).join('')}<div class="nt">Table as published by the league feed; it can take a few minutes to include this result.</div></div>`]);
    const i = Math.floor((now - G.rt) / 9000) % slides.length;
    return `<div class="sbs rp"><div class="hd"><b>${esc(title)}</b><span>${esc(slides[i][0])}</span><i>${slides.map((_, j) => `<u class="${j === i ? 'on' : ''}"></u>`).join('')}</i></div>
      <div class="scl"><img src="${esc(L.logoD || '')}" onerror="this.style.visibility='hidden'"><span>${esc(L.abbr)}</span><em>${sc(lsd)}</em><s>-</s><em>${sc(rsd)}</em><span>${esc(R.abbr)}</span><img src="${esc(R.logoD || '')}" onerror="this.style.visibility='hidden'"></div>
      <div class="bd">${slides[i][1]}</div></div>`;
  }

  // ---------- frame ----------
  const CSS = `.pbp.st1{grid-template-columns:1fr}.pbp.st2{grid-template-columns:2fr 1fr}
.sbs.pre,.sbs.cm{border-radius:12px;background:linear-gradient(90deg,#132a6b,#0c1a45);padding:12px 20px;border-left:6px solid var(--lime);overflow:hidden}
.sbs .k{display:flex;align-items:center;gap:14px;font:800 24px 'Barlow Condensed',sans-serif;letter-spacing:1.5px;white-space:nowrap}
.sbs .k b{background:var(--lime);color:#0a1430;padding:2px 12px;border-radius:6px}.sbs .k span{color:#dbe5ff;overflow:hidden;text-overflow:ellipsis}
.sbs .k i,.sbs .hd i{margin-left:auto;display:flex;gap:6px}.sbs u{width:12px;height:12px;border-radius:50%;background:#33488a;display:block}.sbs u.on{background:var(--lime)}
.sbs.pre .t{margin-top:10px;font:600 28px/1.3 Inter,sans-serif;color:#f4f7ff;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.sbs.pre .t.sm{font-size:25px;line-height:1.28}
.sbs.cm .t{margin-top:8px;font:600 27px/1.28 Inter,sans-serif;color:#f4f7ff;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.sbs.cm .t.sm{font-size:23px;line-height:1.3;-webkit-line-clamp:4}
.sbs.cm.big{background:linear-gradient(90deg,#c6f432,#8fbf12);border-left-color:#fff}.sbs.cm.big .t{color:#0a1430;font-weight:800}.sbs.cm.big .k b{background:#0a1430;color:var(--lime)}.sbs.cm.big .k span{color:#0a1430}
.sbs.rp{position:absolute;inset:0;background:linear-gradient(180deg,#0f1d44,#070d22);display:flex;flex-direction:column}
.sbs.rp .hd{display:flex;align-items:center;gap:16px;padding:14px 22px;font:800 30px 'Barlow Condensed',sans-serif;letter-spacing:2px;background:#0a1430;border-bottom:3px solid var(--lime)}
.sbs.rp .hd b{color:var(--lime)}.sbs.rp .hd span{color:#dbe5ff;font-size:26px}
.sbs.rp .scl{display:flex;align-items:center;justify-content:center;gap:18px;padding:12px 0 4px;font:800 44px 'Barlow Condensed',sans-serif}
.sbs.rp .scl img{width:58px;height:58px;object-fit:contain}.sbs.rp .scl span{color:#dbe5ff;font-size:36px;letter-spacing:1px}.sbs.rp .scl em{font-style:normal;font-size:64px;color:#fff;min-width:60px;text-align:center}.sbs.rp .scl s{text-decoration:none;color:var(--mute)}
.sbs.rp .bd{flex:1;padding:8px 34px 18px;display:flex;flex-direction:column;justify-content:center;min-height:0}
.sbs.rp .sum{font:600 34px/1.34 Inter,sans-serif;color:#f4f7ff;text-align:center}.sbs.rp .sum.sm{font-size:29px}
.sbs .stt .r{display:grid;grid-template-columns:150px 1fr 150px;align-items:center;gap:18px;margin:7px 0}
.sbs .stt b{font:800 38px 'Barlow Condensed',sans-serif;color:#b9c6ea;text-align:center}.sbs .stt b.w{color:#fff}
.sbs .stt .m span{display:block;text-align:center;font:700 21px Inter,sans-serif;color:var(--mute);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}
.sbs .stt .bar{display:flex;height:14px;border-radius:7px;overflow:hidden;gap:4px}.sbs .stt .bar i{display:block;height:100%;border-radius:7px}
.sbs .pf{display:grid;grid-template-columns:1fr 1fr;gap:26px}.sbs .pf .tm{font:800 28px 'Barlow Condensed',sans-serif;letter-spacing:1.5px;color:var(--lime);margin-bottom:6px;text-transform:uppercase}
.sbs .pp{display:flex;align-items:center;gap:14px;background:#13245a;border-radius:12px;padding:8px 14px;margin-bottom:8px}.sbs .pp img,.sbs .pp .in{width:76px;height:58px;object-fit:cover;object-position:top;border-radius:8px;background:#0a1430;flex:none}
.sbs .pp .in{display:flex;align-items:center;justify-content:center;font:800 28px 'Barlow Condensed',sans-serif;color:#fff;width:58px;border-radius:50%}
.sbs .pp .n{font:800 30px 'Barlow Condensed',sans-serif;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:330px}.sbs .pp .l{font:600 22px Inter,sans-serif;color:#dbe5ff}
.sbs .pf .no{color:var(--mute);font:600 24px Inter,sans-serif}
.sbs .tb>div{display:grid;grid-template-columns:54px 1fr repeat(var(--n),84px);align-items:center;font:700 28px 'Barlow Condensed',sans-serif;padding:6px 14px;border-radius:8px;color:#dbe5ff}
.sbs .tb>div span{text-align:center}.sbs .tb>div span:nth-child(2){text-align:left;font-size:30px}.sbs .tb .h{color:var(--mute);font-size:22px;letter-spacing:1px}
.sbs .tb .me{background:#1b3380;color:#fff}.sbs .tb .nt{display:block;font:500 18px Inter,sans-serif;color:var(--mute);padding-top:8px}`;
  function frame(c) {
    if (!document.getElementById('sbsCss')) { const st = document.createElement('style'); st.id = 'sbsCss'; st.textContent = CSS; document.head.appendChild(st); }
    const k = c.league + ':' + c.event; if (CUR !== k || !G) { CUR = k; G = fresh(); }
    C = c; const now = c.now || Date.now();
    // names and headshots from the box score (basketball plays carry ids only; American football plays carry "J.Love")
    C.names = new Map(); C.heads = new Map(); C.short = new Map();
    for (const b of c.s.boxscore?.players || []) for (const st of b.statistics || []) for (const a of st.athletes || []) { const at = a.athlete || {}; if (!at.displayName) continue;
      C.names.set(String(at.id), { name: at.displayName }); if (at.headshot?.href) C.heads.set(at.displayName, at.headshot.href);
      const w = at.displayName.split(' '); C.short.set((w[0][0] + w.slice(1).join('')).replace(/[\s.]/g, '').toLowerCase(), at.displayName); }
    for (const l of c.s.leaders || []) for (const g of l.leaders || []) for (const x of g.leaders || []) { const at = x.athlete || {}; if (at.displayName && at.headshot?.href && !C.heads.has(at.displayName)) C.heads.set(at.displayName, at.headshot.href); }
    const tstats = (id) => (c.s.boxscore?.teams || []).find((t) => String(t.team?.id) === id)?.statistics || [];
    C.liveS = (key) => { const h = tstats(c.H.id).find((x) => x.name === key)?.displayValue, a = tstats(c.A.id).find((x) => x.name === key)?.displayValue; return h == null || a == null ? null : [h, a]; };
    C.live1 = (key) => { const v = C.liveS(key); return v ? [num(v[0]), num(v[1])] : null; };
    C.comp = (sd) => (c.s.header?.competitions?.[0]?.competitors || []).find((x) => x.homeAway === (sd === 'h' ? 'home' : 'away')) || {};
    if (c.pre) { const p = preview(now); return p ? { pbp: p, cls: 'st1', keep: 0 } : null; }
    feed(now);
    // the board's score (Goalserve first) can be ahead of the play feed: say the goal at once, the scorer follows when the feed has it
    if (!C.replay && C.live && C.kind !== 'nba') { const b = [c.H.score, c.A.score], o = G.board; G.board = b;
      if (o && (b[0] > o[0] || b[1] > o[1]) && (b[0] > G.sc[0] || b[1] > G.sc[1])) { const sd = b[0] > o[0] ? 'h' : 'a';
        G.line = { t: `${C.kind === 'nfl' ? `${Tn(sd)} score!` : `GOAL! ${Tn(sd)} score.`} ${scoreLine(b[0], b[1])}`, p: 3, at: now }; G.q = null; } }
    if (!C.replay && (C.live || C.fin)) G.sc = [c.H.score, c.A.score];
    if (!C.replay) { // the feed's official team numbers replace our running counts whenever it has them
      const MAP = FOOT() ? { sh: 'totalShots', sot: 'shotsOnTarget', co: 'wonCorners', fo: 'foulsCommitted', off: 'offsides', yc: 'yellowCards' } : C.kind === 'nba' ? { reb: 'totalRebounds', ast: 'assists', to: 'turnovers', blk: 'blocks', stl: 'steals' } : C.kind === 'nhl' ? { sog: 'shotsTotal', hit: 'hits', fo: 'faceoffsWon', gv: 'giveaways', tk: 'takeaways', pim: 'penaltyMinutes', ppg: 'powerPlayGoals', ppo: 'powerPlayOpportunities' } : {};
      for (const [k, key] of Object.entries(MAP)) { const v = C.live1(key); if (v && (v[0] + v[1] > 0 || !((G.t.h[k] || 0) + (G.t.a[k] || 0)))) { G.t.h[k] = v[0]; G.t.a[k] = v[1]; } }
      if (C.kind === 'nba') for (const [m, at, key] of [['fgm', 'fga', 'fieldGoalsMade-fieldGoalsAttempted'], ['tpm', 'tpa', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'], ['ftm', 'fta', 'freeThrowsMade-freeThrowsAttempted']]) { const v = C.liveS(key); if (!v) continue; ['h', 'a'].forEach((sd, i) => { const r = /^(\d+)-(\d+)$/.exec(v[i]); if (r) { G.t[sd][m] = +r[1]; G.t[sd][at] = +r[2]; } }); }
    }      // the board's own score wins (it can be ahead of the play feed)
    const kind = c.fin ? 'ft' : c.brk ? 'brk' : '';
    const out = { pbp: commCard(now, kind), cls: 'st2', keep: 1, trk: kind ? report(now, kind) : null };
    if (out.trk) out.trk = out.trk.replace('class="tb"', `class="tb" style="--n:${(tableRows()?.cols || []).length || 4}"`);
    return out;
  }
  window.SBStory = { frame, _state: () => G };
})();
