// Stream one game's live scoreboard to YouTube (or record it to a file for testing).
//
//   node tools/live/stream.js --league nba --event 401810001 --key xxxx-xxxx-xxxx-xxxx-xxxx
//   node tools/live/stream.js --league nba --event 401810001 --out test.mp4 --minutes 1
//
// Options:
//   --league   nba | nfl | nhl | ncaaf | mlb | epl | ucl | laliga | seriea | bundesliga | mls
//   --event    ESPN event id (list them with games.js)
//   --key      YouTube stream key (YouTube Studio > Go live > Stream). Or set YT_STREAM_KEY.
//   --rtmp     ingest URL, default rtmp://a.rtmp.youtube.com/live2
//   --out      write to a local file instead of streaming (for testing)
//   --minutes  stop after N minutes (default: 20 min after the game ends, max 6 h)
//   --port     scoreboard server port (default 8787; shared by all streams on the machine)
//
// How it works: headless Chromium renders scoreboard.html at 1920x1080, we screenshot it
// twice a second and ffmpeg turns that into a 30 fps H.264 stream with a silent audio track
// (YouTube rejects streams with no audio). Uses about 0.5 CPU core per stream.
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { start } = require('./server');

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const league = arg('league');
const event = arg('event');
const key = arg('key', process.env.YT_STREAM_KEY);
const rtmp = arg('rtmp', 'rtmp://a.rtmp.youtube.com/live2');
const out = arg('out');
const port = Number(arg('port', 8787));
const maxMin = Number(arg('minutes', 360));
const IN_FPS = 2;

if (!league || !event || (!key && !out)) {
  console.error('usage: stream.js --league nba --event <id> (--key <stream key> | --out file.mp4) [--minutes N]');
  process.exit(1);
}

(async () => {
  await start(port);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://127.0.0.1:${port}/?league=${league}&event=${event}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 }).catch(() => console.warn('no data yet, streaming the waiting screen'));

  const target = out || `${rtmp}/${key}`;
  const ff = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(IN_FPS), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-vf', 'fps=30,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-b:v', '3000k', '-maxrate', '3000k', '-bufsize', '6000k',
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-shortest',
    '-f', out ? (out.endsWith('.flv') ? 'flv' : 'mp4') : 'flv', '-y', target,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.on('exit', (c) => { console.log(`ffmpeg exited (${c})`); process.exit(c ? 1 : 0); });

  const t0 = Date.now();
  let endedAt = null, frame = 0, stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    ff.stdin.end();
    await browser.close().catch(() => {});
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  console.log(`${out ? 'recording' : 'streaming'} ${league} ${event} → ${out || rtmp + '/****'}`);

  let last = null;
  while (!stopping) {
    // keep a steady 2 fps: if a screenshot is slow, repeat the previous frame
    const due = t0 + (frame * 1000) / IN_FPS;
    const shot = Date.now() <= due + 400
      ? await page.screenshot({ type: 'jpeg', quality: 85 }).catch(() => last)
      : last;
    if (shot) { last = shot; if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once('drain', r)); }
    frame++;
    const wait = t0 + (frame * 1000) / IN_FPS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    if (frame % (IN_FPS * 30) === 0) {
      const state = await page.evaluate(() => window.__state).catch(() => null);
      if (state === 'post' && !endedAt) { endedAt = Date.now(); console.log('game final, ending stream in 20 min'); }
      const mins = (Date.now() - t0) / 60000;
      if (mins >= maxMin || (endedAt && Date.now() - endedAt > 20 * 60000)) await stop();
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
