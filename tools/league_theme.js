// League colour themes (owner's request, 7 Nov 2026): every card, Short, Reel and thumbnail about one competition uses
// that competition's own colour scheme (close to its official brand palette) instead of the generic ScoreBuzz look.
// COLOURS ONLY: never the league's logo, wordmark artwork or proprietary typeface (trademarks); the league name is
// written as plain text. Club crests (ESPN team.logo) stay as before.
// Set "league" on an item in posts.json / shorts.json / videos.json to one of the keys below.
const THEMES = {
  epl:        { name: 'Premier League',   primary: '#37003C', accent: '#00FF85', ink: '#37003C', text: '#37003C', hot: '#E90052', tint: '#F5EEF6' },
  ucl:        { name: 'Champions League', primary: '#0B1446', accent: '#7FD6FF', ink: '#0B1446', text: '#1F3A9E', hot: '#C9D3E6', tint: '#EEF1FA' },
  uel:        { name: 'Europa League',    primary: '#161616', accent: '#F26F21', ink: '#161616', text: '#D9581A', hot: '#F26F21', tint: '#FAF1EA' },
  uecl:       { name: 'Conference League', primary: '#101010', accent: '#19E68C', ink: '#101010', text: '#0E9E5C', hot: '#19E68C', tint: '#ECF8F1' },
  laliga:     { name: 'LaLiga',           primary: '#121212', accent: '#FF4B44', ink: '#FFFFFF', text: '#E0352E', hot: '#FF4B44', tint: '#FBEFEE' },
  seriea:     { name: 'Serie A',          primary: '#0B1F4B', accent: '#00C3E3', ink: '#0B1F4B', text: '#0057B8', hot: '#00C3E3', tint: '#EDF2FA' },
  bundesliga: { name: 'Bundesliga',       primary: '#D20515', accent: '#FFFFFF', ink: '#D20515', text: '#C00012', hot: '#D20515', tint: '#F8EFEF', logo: '#FFFFFF' },
  ligue1:     { name: 'Ligue 1',          primary: '#091C3E', accent: '#DAE025', ink: '#091C3E', text: '#1A3A7A', hot: '#DAE025', tint: '#EEF1F6' },
  mls:        { name: 'MLS',              primary: '#0B0B0B', accent: '#E8E8E8', ink: '#0B0B0B', text: '#1B1B1B', hot: '#A7A9AC', tint: '#F3F3F3' },
  nfl:        { name: 'NFL',              primary: '#013369', accent: '#D50A0A', ink: '#FFFFFF', text: '#013369', hot: '#D50A0A', tint: '#EEF2F8' },
  ncaaf:      { name: 'College Football', primary: '#1B365D', accent: '#F2C14E', ink: '#1B365D', text: '#1B365D', hot: '#F2C14E', tint: '#F1F3F7' },
  nba:        { name: 'NBA',              primary: '#1D428A', accent: '#C8102E', ink: '#FFFFFF', text: '#1D428A', hot: '#C8102E', tint: '#EEF2FA' },
  nhl:        { name: 'NHL',              primary: '#111111', accent: '#A2AAAD', ink: '#111111', text: '#111111', hot: '#A2AAAD', tint: '#F2F3F4' },
  mlb:        { name: 'MLB',              primary: '#041E42', accent: '#BF0D3E', ink: '#FFFFFF', text: '#041E42', hot: '#BF0D3E', tint: '#EEF1F6' },
  ufc:        { name: 'UFC',              primary: '#111111', accent: '#D20A0A', ink: '#FFFFFF', text: '#D20A0A', hot: '#D20A0A', tint: '#F6F0F0' },
  f1:         { name: 'Formula 1',        primary: '#15151E', accent: '#E10600', ink: '#FFFFFF', text: '#E10600', hot: '#E10600', tint: '#F6F0F0' },
};
const ALIAS = { 'premier-league': 'epl', 'eng.1': 'epl', 'uefa.champions': 'ucl', 'uefa.europa': 'uel', 'uefa.europa.conf': 'uecl', 'esp.1': 'laliga', 'ita.1': 'seriea', 'ger.1': 'bundesliga', 'fra.1': 'ligue1', 'usa.1': 'mls', 'college-football': 'ncaaf', cfb: 'ncaaf', racing: 'f1', mma: 'ufc' };

function theme(key) {
  if (!key) return null;
  const k = String(key).toLowerCase();
  return THEMES[k] || THEMES[ALIAS[k]] || null;
}

// Overrides the sport colours (s = { color, ink, text }) with the league's.
function apply(s, t) {
  return t ? { ...s, tag: t.name.toUpperCase(), color: t.accent, ink: t.ink, text: t.text } : s;
}

// Extra CSS appended last inside <style>: league-coloured header/footer bars, page tint, chips and accents.
// Selectors cover make_cards.js, make_shorts.js and make_thumbs.js (unknown ones are harmless).
function css(t) {
  if (!t) return '';
  return `
  /* league theme: ${t.name} */
  body{background:${t.tint}}
  .bar,.fbar,#hbar,#fbar,.hbar{background:${t.primary}}
  #bar{background:${t.hot}}
  .logo b,footer b,.url{color:${t.logo || '#C6F432'}} /* ScoreBuzz lime stays readable on every dark league bar */
  .tag{background:${t.accent};color:${t.ink};box-shadow:0 0 0 3px ${t.primary}}
  .kicker{background:${t.hot};color:${t.hot === '#A7A9AC' || t.hot === '#C9D3E6' || t.hot === '#DAE025' || t.hot === '#00FF85' || t.hot === '#19E68C' || t.hot === '#F2C14E' || t.hot === '#A2AAAD' || t.hot === '#00C3E3' ? t.primary : '#FFFFFF'}}
  .bbadge{background:${t.primary};color:#fff}
  .tb,.bb{background:${t.primary};color:#fff}
  .glow,#glow{background:radial-gradient(ellipse at 85% 15%,${t.hot}26,transparent 50%),radial-gradient(ellipse at 5% 95%,${t.primary}1f,transparent 55%)}
  .burst{background:radial-gradient(circle at 50% 50%,${t.hot}33 0%,${t.primary}12 32%,transparent 56%)}
  .stripe{background:${t.primary};opacity:.1}`;
}

module.exports = { THEMES, theme, apply, css };
