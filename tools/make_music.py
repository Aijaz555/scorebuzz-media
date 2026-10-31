"""Original, royalty-free music beds for ScoreBuzz TikToks/Shorts, synthesised from scratch
(no samples, no third-party audio). Usage: python3 tools/make_music.py tools/music

Writes three 24-second loops (44.1 kHz stereo WAV):
  hype.wav    140 bpm half-time trap: 808 bass, claps, rolling hi-hats (results, upsets, NFL)
  anthem.wav  124 bpm stadium stomp: four-on-the-floor, claps, power-chord synth (big wins, goal-fests)
  drama.wav   96 bpm cinematic: toms, low drone, risers (late drama, records, near misses)
"""
import sys, os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
rng = np.random.default_rng(7)


def t(n):
    return np.arange(n) / SR


def env(n, a=0.002, d=0.2):
    x = t(n)
    e = np.exp(-x / d)
    att = int(a * SR)
    if att > 0:
        e[:att] *= np.linspace(0, 1, att)
    return e


def filt(x, kind, f):
    sos = butter(2, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x)


def kick(dur=0.35, f0=150, f1=45):
    n = int(dur * SR)
    f = f1 + (f0 - f1) * np.exp(-t(n) / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.001, 0.12) * 1.0


def clap(dur=0.25):
    n = int(dur * SR)
    x = filt(rng.standard_normal(n), 'band', [900, 3500])
    e = env(n, 0.001, 0.07)
    for k in (0.01, 0.02):  # the "flam" of a hand clap
        i = int(k * SR)
        e[i:] += 0.6 * env(n - i, 0.001, 0.05)
    return x * e * 0.5


def hat(dur=0.05, open_=False):
    n = int((0.25 if open_ else dur) * SR)
    return filt(rng.standard_normal(n), 'high', 7000) * env(n, 0.001, 0.12 if open_ else 0.02) * 0.25


def tom(f=110, dur=0.6):
    n = int(dur * SR)
    fr = f * (1 + 0.6 * np.exp(-t(n) / 0.05))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(n, 0.002, 0.25) * 0.9


def saw(f, n, detune=0.0):
    ph = (np.cumsum(np.full(n, f * (1 + detune))) / SR) % 1.0
    return 2 * ph - 1


def note(f, dur, kind='808'):
    n = int(dur * SR)
    if kind == '808':
        x = np.sin(2 * np.pi * f * t(n)) + 0.3 * np.sin(4 * np.pi * f * t(n))
        return np.tanh(1.8 * x) * env(n, 0.003, dur * 0.7) * 0.55
    if kind == 'pad':
        x = sum(saw(f, n, d) for d in (-0.006, 0, 0.007)) / 3
        x = filt(x, 'low', 1800)
        a = np.minimum(1, t(n) / 0.15) * np.minimum(1, (dur - t(n)) / 0.2 + 0.05)
        return x * a * 0.18
    if kind == 'power':
        x = sum(saw(f * m, n, d) for m, d in ((1, 0), (1.5, 0.004), (2, -0.003))) / 3
        x = filt(np.tanh(2 * x), 'low', 2600)
        return x * env(n, 0.005, dur * 0.8) * 0.22
    if kind == 'drone':
        x = sum(saw(f, n, d) for d in (-0.004, 0.0, 0.005)) / 3
        x = filt(x, 'low', 600)
        a = np.minimum(1, t(n) / 0.8)
        return x * a * 0.25


def place(buf, s, start):
    i = int(start * SR)
    j = min(len(buf), i + len(s))
    if i < len(buf):
        buf[i:j] += s[: j - i]


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def riser(dur):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    for k in range(8):  # sweep a band-pass upwards in steps
        a, b = k * n // 8, (k + 1) * n // 8
        lo = 400 * 2 ** (k * 0.6)
        out[a:b] = filt(x, 'band', [lo, min(lo * 2.5, 18000)])[a:b]
    return out * np.linspace(0, 1, n) ** 2 * 0.25


def master(L, R):
    st = np.stack([L, R], 1)
    st = np.tanh(st * 1.2)
    st /= np.max(np.abs(st)) + 1e-9
    rms = np.sqrt(np.mean(st ** 2))
    st *= min(0.18 / rms, 0.95)  # roughly -15 dBFS RMS: sits under nothing, loud enough on phones
    # 30 ms fades so the loop and the video cut cleanly
    f = int(0.03 * SR)
    st[:f] *= np.linspace(0, 1, f)[:, None]
    st[-f:] *= np.linspace(1, 0, f)[:, None]
    return (np.clip(st, -1, 1) * 32767).astype(np.int16)


def hype(sec=24):
    bpm = 140; b = 60 / bpm; n = int(sec * SR)
    L = np.zeros(n); R = np.zeros(n)
    prog = [57, 53, 48, 55]  # A minor: Am F C G (bass roots, MIDI)
    bars = int(sec / (4 * b))
    for bar in range(bars):
        t0 = bar * 4 * b
        root = prog[bar % 4]
        for kpos in (0, 1.5, 2.75):
            place(L, kick(), t0 + kpos * b)
        place(L, clap(), t0 + 2 * b)
        place(L, note(hz(root - 12), 1.4 * b), t0)
        place(L, note(hz(root - 12), 0.9 * b), t0 + 1.5 * b)
        place(L, note(hz(root - 5 - 12), 1.0 * b), t0 + 2.75 * b)
        for s in range(8):
            h = hat()
            place(R if s % 2 else L, h, t0 + s * b / 2)
        if bar % 2 == 1:  # hi-hat roll into the next bar
            for s in range(6):
                place(R, hat(0.03) * 0.8, t0 + 3.5 * b + s * b / 12)
        for iv in (0, 3, 7):  # minor triad pad
            p = note(hz(root + 12 + iv), 4 * b, 'pad')
            place(L, p, t0); place(R, p, t0)
    return master(L + 0.2 * R, R + 0.2 * L)


def anthem(sec=24):
    bpm = 124; b = 60 / bpm; n = int(sec * SR)
    L = np.zeros(n); R = np.zeros(n)
    prog = [52, 48, 55, 50]  # E minor feel: Em C G D
    bars = int(sec / (4 * b))
    for bar in range(bars):
        t0 = bar * 4 * b
        root = prog[bar % 4]
        for q in range(4):
            place(L, kick(0.3, 120, 50) * 0.9, t0 + q * b)
            place(R, hat(open_=True) * 0.5, t0 + q * b + b / 2)
        for q in (1, 3):
            c = clap(); place(L, c, t0 + q * b); place(R, c, t0 + q * b + 0.008)
        for e in range(8):  # driving eighth-note power chords
            p = note(hz(root), b / 2 * 0.95, 'power')
            place(L if e % 2 else R, p, t0 + e * b / 2)
            place(R if e % 2 else L, 0.6 * p, t0 + e * b / 2)
        place(L, note(hz(root - 12), 4 * b, '808') * 0.6, t0)
        if bar % 4 == 3:
            r = riser(4 * b); place(L, r, t0); place(R, r, t0)
    return master(L, R)


def drama(sec=24):
    bpm = 96; b = 60 / bpm; n = int(sec * SR)
    L = np.zeros(n); R = np.zeros(n)
    prog = [50, 46, 53, 48]  # D minor: Dm Bb F C
    bars = int(sec / (4 * b))
    for bar in range(bars):
        t0 = bar * 4 * b
        root = prog[bar % 4]
        d = note(hz(root - 12), 4 * b, 'drone')
        place(L, d, t0); place(R, d, t0)
        for iv in (0, 3, 7, 12):
            p = note(hz(root + iv), 4 * b, 'pad') * 0.8
            place(L, p, t0); place(R, p, t0 + 0.01)
        # cinematic tom pattern: boom . boom-boom . | boom
        for pos, f in ((0, 90), (1.5, 110), (2, 110), (3, 80), (3.5, 140), (3.75, 160)):
            place(L if pos % 1 else R, tom(f), t0 + pos * b)
            place(R if pos % 1 else L, 0.7 * tom(f), t0 + pos * b)
        place(L, kick(0.5, 100, 35), t0)
        if bar % 2 == 1:
            r = riser(4 * b); place(L, r, t0); place(R, r * 0.8, t0)
    return master(L, R)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'tools/music'
    os.makedirs(out, exist_ok=True)
    for name, fn in (('hype', hype), ('anthem', anthem), ('drama', drama)):
        wavfile.write(os.path.join(out, f'{name}.wav'), SR, fn())
        print('wrote', os.path.join(out, f'{name}.wav'))
