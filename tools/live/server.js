// Local server for the live scoreboard.
//   node tools/live/server.js [port]          (default 8787)
// Open http://localhost:8787/?league=nba&event=<ESPN event id>  (1920x1080 page)
// JSON:  /api/game?league=nba&event=<id>     /api/games?league=nba[&date=YYYYMMDD]
const http = require('http');
const fs = require('fs');
const path = require('path');
const feed = require('./feed');

function start(port = 8787) {
  const page = path.join(__dirname, 'scoreboard.html');
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    try {
      if (u.pathname === '/') return send(200, fs.readFileSync(page, 'utf8'), 'text/html; charset=utf-8');
      if (u.pathname === '/api/game') return send(200, await feed.game(u.searchParams.get('league'), u.searchParams.get('event')));
      if (u.pathname === '/api/games') return send(200, await feed.list(u.searchParams.get('league'), u.searchParams.get('date')));
      send(404, { error: 'not found' });
    } catch (e) {
      send(502, { error: String(e.message || e) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', (e) => (e.code === 'EADDRINUSE' ? resolve(null) : reject(e))); // already running: reuse it
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || 8787);
  start(port).then((s) => console.log(s ? `scoreboard server on http://localhost:${port}` : `port ${port} already in use`));
}
module.exports = { start };
