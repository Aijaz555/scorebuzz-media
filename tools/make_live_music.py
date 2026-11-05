"""Original, royalty-free background music for ScoreBuzz live streams, synthesised from scratch
(no samples, no third-party audio, nothing that can trigger a Content ID claim).
Usage: python3 tools/make_live_music.py tools/music/live

Writes ~3-minute arranged tracks (intro / groove / lift / breakdown / groove / outro) in different keys,
tempos and styles, as 192k MP3s. Played as a shuffled, looping audio playlist under the scoreboard
(LiveReacting audioPlaylist layer at low volume), so a 3-hour stream doesn't repeat a 24-second loop.
"""
import os, sys, subprocess
import numpy as np
from scipy.io import wavfile
sys.path.insert(0, os.path.dirname(__file__))
import make_music as m

SR = m.SR


def pluck(f, dur):
    n = int(dur * SR)
    x = (m.saw(f, n) + 0.5 * m.saw(f * 2, n, 0.003)) / 1.5
    return m.filt(x, 'low', 2400) * m.env(n, 0.002, dur * 0.35) * 0.16


TRACKS = [
    # name, style, bpm, key root (MIDI), progression (semitones from root, minor-ish), lead pattern
    ('kickoff', 'anthem', 122, 52, [0, -4, 3, -2], [0, 7, 12, 7, 3, 7, 12, 15]),
    ('primetime', 'hype', 140, 57, [0, -4, -9, -2], [12, 10, 7, 3, 7, 10, 12, 15]),
    ('overtime', 'drama', 96, 50, [0, -4, 3, -2], [0, 3, 7, 10, 7, 3, 0, -2]),
    ('matchday', 'groove', 110, 55, [0, 5, -2, 3], [7, 12, 14, 12, 10, 7, 5, 7]),
    ('fourth-quarter', 'hype', 145, 53, [0, 3, -2, -4], [0, 3, 7, 12, 10, 7, 3, 7]),
    ('stadium', 'anthem', 128, 48, [0, -3, 5, 3], [12, 7, 3, 7, 12, 15, 12, 10]),
    ('halftime', 'groove', 100, 58, [0, -2, -4, -5], [3, 7, 10, 12, 10, 7, 3, 0]),
    ('final-whistle', 'drama', 90, 45, [0, 3, -4, -2], [0, 7, 3, 10, 7, 12, 10, 7]),
]
# sections in bars: (name, bars, layers)
FORM = [('intro', 8, {'pad', 'hat'}), ('a', 16, {'pad', 'hat', 'kick', 'clap', 'bass'}),
        ('b', 16, {'pad', 'hat', 'kick', 'clap', 'bass', 'lead', 'chord'}), ('break', 8, {'pad', 'drone', 'lead'}),
        ('a', 16, {'pad', 'hat', 'kick', 'clap', 'bass', 'lead'}), ('b', 16, {'pad', 'hat', 'kick', 'clap', 'bass', 'lead', 'chord'}),
        ('outro', 8, {'pad', 'hat', 'drone'})]


def track(style, bpm, key, prog, lead):
    b = 60 / bpm
    bars = sum(x[1] for x in FORM)
    n = int((bars * 4 * b + 3) * SR)
    L = np.zeros(n); R = np.zeros(n)
    bar = 0
    for name, nb, lay in FORM:
        for k in range(nb):
            t0 = bar * 4 * b
            root = key + prog[(bar // 2) % 4]
            last = k == nb - 1
            if 'pad' in lay:
                for iv in (0, 3, 7):
                    p = m.note(m.hz(root + 12 + iv), 4 * b, 'pad') * (0.7 if style == 'drama' else 0.55)
                    m.place(L, p, t0); m.place(R, p, t0 + 0.012)
            if 'drone' in lay:
                d = m.note(m.hz(root - 12), 4 * b, 'drone') * 0.7
                m.place(L, d, t0); m.place(R, d, t0)
            if 'hat' in lay:
                step = 4 if style == 'hype' else 2
                for s in range(4 * step):
                    m.place(R if s % 2 else L, m.hat() * (0.7 if s % 2 else 1), t0 + s * b / step)
            if 'kick' in lay:
                pos = {'hype': (0, 1.5, 2.75), 'anthem': (0, 1, 2, 3), 'drama': (0, 2.5), 'groove': (0, 1.75, 2.5)}[style]
                for p_ in pos:
                    m.place(L, m.kick() * 0.85, t0 + p_ * b); m.place(R, m.kick() * 0.85, t0 + p_ * b)
            if 'clap' in lay:
                for q in ((2,) if style == 'hype' else (1, 3)):
                    c = m.clap() if style != 'drama' else m.tom(120) * 0.6
                    m.place(L, c, t0 + q * b); m.place(R, c, t0 + q * b + 0.008)
            if 'bass' in lay:
                if style == 'groove':
                    for e, o in enumerate((0, 0, 12, 0, 7, 0, 10, 12)):
                        m.place(L, m.note(m.hz(root - 12 + o), b / 2 * 0.9) * 0.8, t0 + e * b / 2)
                else:
                    m.place(L, m.note(m.hz(root - 12), 2 * b) * 0.9, t0)
                    m.place(L, m.note(m.hz(root - 12), 1.5 * b) * 0.8, t0 + 2.5 * b)
            if 'chord' in lay and style in ('anthem', 'hype'):
                for e in range(8):
                    p = m.note(m.hz(root), b / 2 * 0.9, 'power') * 0.55
                    m.place(L if e % 2 else R, p, t0 + e * b / 2)
            if 'lead' in lay:
                for e, iv in enumerate(lead):
                    if (bar + e) % 3 == 2 and name != 'b':
                        continue  # leave gaps so it breathes
                    p = pluck(m.hz(root + 12 + iv), b / 2)
                    m.place(R if e % 2 else L, p, t0 + e * b / 2); m.place(L if e % 2 else R, 0.5 * p, t0 + e * b / 2 + 0.11)
            if last and name in ('a', 'intro', 'break'):
                r = m.riser(4 * b) * 0.7; m.place(L, r, t0); m.place(R, r, t0)
            bar += 1
    st = np.stack([L, R], 1)
    st = np.tanh(st * 1.1)
    st /= np.max(np.abs(st)) + 1e-9
    st *= min(0.16 / np.sqrt(np.mean(st ** 2)), 0.9)
    f = int(2 * SR)
    st[:f] *= np.linspace(0, 1, f)[:, None]
    st[-int(3 * SR):] *= np.linspace(1, 0, int(3 * SR))[:, None]
    return (np.clip(st, -1, 1) * 32767).astype(np.int16)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'tools/music/live'
    os.makedirs(out, exist_ok=True)
    for name, style, bpm, key, prog, lead in TRACKS:
        wav = os.path.join(out, f'{name}.wav')
        wavfile.write(wav, SR, track(style, bpm, key, prog, lead))
        mp3 = os.path.join(out, f'scorebuzz-{name}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '192k', mp3], check=True, stdin=subprocess.DEVNULL)
        os.remove(wav)
        print('wrote', mp3)
