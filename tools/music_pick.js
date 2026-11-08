// Put a DIFFERENT free music track under each YouTube video (owner, 8 Nov 2026), instead of the same bed every time.
// Tracks: tools/music/library/*.mp3 (Kevin MacLeod, CC BY 4.0, list in tracks.json, downloaded by the "Music library"
// GitHub Action). Picks the least recently used track, loops/cuts it to the video length with a fade-out, mixes in the
// board pops if <id>.sfx.json exists, and appends the required credit line to the entry's description.
// Usage: node tools/music_pick.js <videos.json> <dir> <id> [id ...]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const LIB = path.join(__dirname, 'music', 'library');
const LOG = path.join(LIB, 'used.json'); // [{ date, id, track }]
const meta = JSON.parse(fs.readFileSync(path.join(LIB, 'tracks.json'), 'utf8'));
const have = meta.tracks.filter((t) => fs.existsSync(path.join(LIB, `${t}.mp3`)));
if (!have.length) { console.error('no tracks in tools/music/library yet: run the "Music library" workflow (music.yml) and git pull'); process.exit(1); }

const [json, dir, ...ids] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(json, 'utf8'));
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
const lastUse = (t) => { for (let i = log.length - 1; i >= 0; i--) if (log[i].track === t) return i; return -1; };

for (const id of ids) {
  const v = list.find((x) => x.id === id);
  const mp4 = path.join(dir, `${id}.mp4`);
  if (!v || !fs.existsSync(mp4)) { console.error(`${id}: missing entry or mp4`); continue; }
  // least recently used; random among never-used
  const fresh = have.filter((t) => lastUse(t) < 0);
  const track = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : [...have].sort((a, b) => lastUse(a) - lastUse(b))[0];
  const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString());
  const fo = Math.max(0, d - 2.5).toFixed(2);
  const sfx = mp4.replace(/\.mp4$/, '.sfx.json');
  const tmp = mp4.replace(/\.mp4$/, '.music.tmp.mp4');
  const args = ['-loglevel', 'error', '-y', '-i', mp4, '-stream_loop', '-1', '-i', path.join(LIB, `${track}.mp3`)];
  let fc = `[1:a]volume=0.55,afade=t=in:d=1.5,afade=t=out:st=${fo}:d=2.5,atrim=0:${d}[aout]`;
  if (fs.existsSync(sfx)) {
    const ts = JSON.parse(fs.readFileSync(sfx, 'utf8'));
    args.push('-i', path.join(__dirname, 'music', 'pop.wav'));
    fc = `[1:a]volume=0.55,afade=t=in:d=1.5,afade=t=out:st=${fo}:d=2.5[bed];[2:a]asplit=${ts.length}${ts.map((_, i) => `[p${i}]`).join('')};`
      + ts.map((t, i) => { const ms = Math.max(0, Math.round((t - 0.07) * 1000)); return `[p${i}]adelay=${ms}|${ms}[q${i}];`; }).join('')
      + `[bed]${ts.map((_, i) => `[q${i}]`).join('')}amix=inputs=${ts.length + 1}:normalize=0,alimiter=limit=0.95,atrim=0:${d}[aout]`;
  }
  args.push('-filter_complex', fc, '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-t', String(d), '-movflags', '+faststart', tmp);
  execFileSync('ffmpeg', args);
  fs.renameSync(tmp, mp4);
  const credit = `Music: "${track}" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License (http://creativecommons.org/licenses/by/4.0/)`;
  v.description = String(v.description || '').replace(/\n*Music: ".*$/m, '').trimEnd() + `\n\n${credit}`;
  v.music = track;
  log.push({ date: new Date().toISOString().slice(0, 10), id, track });
  console.log(`${id}: ${track}`);
}
fs.writeFileSync(json, JSON.stringify(list, null, 2));
fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
