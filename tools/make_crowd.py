"""Original, royalty-free crowd / audience ambience for ScoreBuzz live streams, one bed per sport,
synthesised from scratch (no samples, no recordings, nothing that can trigger a Content ID claim).
Usage: python3 tools/make_crowd.py tools/music/crowd [sport ...]

Each bed is ~3 minutes, loops seamlessly (crossfaded end into start) and stays "between plays": murmur,
swells, applause, chants, drums or organ. It never fakes game events (no goal horns, whistles or buzzers),
because it plays under a real live scoreboard and must not mislead viewers.
"""
import os, sys, subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
DUR = 180.0
XF = 6.0
rng = np.random.default_rng(7)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR / 2 - 100)], 'bandpass', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x)


def smooth_env(n, rate, lo=0.0, hi=1.0, seed=None):
    """random control signal changing about `rate` times per second"""
    r = np.random.default_rng(seed)
    k = max(4, int(n / SR * rate) + 2)
    pts = r.uniform(lo, hi, k)
    return np.interp(np.arange(n), np.linspace(0, n, k), pts)


def pink(n, r=rng):
    w = np.fft.rfft(r.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR); f[0] = f[1]
    return np.fft.irfft(w / np.sqrt(f), n)


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


# ---------- crowd building blocks ----------
def murmur(n, talkers=28, bright=1.0, seed=1):
    """many people talking: formant-filtered noise, each 'talker' with syllable-rate and phrase-rate envelopes"""
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    base = r.standard_normal(n)
    for i in range(talkers):
        fc = r.uniform(350, 1900) * bright
        x = bp(np.roll(base, r.integers(n)), fc * 0.6, fc * 1.6)
        syl = np.clip(smooth_env(n, r.uniform(4, 7), -0.6, 1, seed=r.integers(1e9)), 0, None)
        phrase = (smooth_env(n, 0.4, 0, 1, seed=r.integers(1e9)) > 0.45).astype(float)
        phrase = lp(phrase, 3)
        out += x * syl * phrase * r.uniform(0.5, 1)
    roar = bp(pink(n, r), 180, 3500)
    return norm(out) * 0.7 + norm(roar) * 0.45


def swells(n, per_min=5, size=(0.5, 1.0), seed=2):
    """crowd reactions: brighter roar rising quickly and fading (oohs, cheers)"""
    r = np.random.default_rng(seed)
    env = np.zeros(n)
    t = r.uniform(3, 12)
    while t < n / SR - 6:
        a, d, amp = r.uniform(0.3, 0.9), r.uniform(2, 5), r.uniform(*size)
        i0 = int(t * SR); ia, idd = int(a * SR), int(d * SR)
        seg = np.concatenate([np.linspace(0, 1, ia) ** 2, np.exp(-np.linspace(0, 4, idd))])
        env[i0:i0 + len(seg)] += seg[: n - i0] * amp
        t += r.exponential(60 / per_min) + 4
    noise = bp(pink(n, r), 400, 6000) + 0.5 * bp(r.standard_normal(n), 1500, 7000)
    return norm(noise) * env


def claps(n, times, per=40, spread=0.03, seed=3):
    """applause hits: each time gets `per` claps jittered by `spread` seconds"""
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    L = int(0.03 * SR)
    shape = np.exp(-np.linspace(0, 9, L))
    for t in times:
        for _ in range(per):
            i = int((t + r.normal(0, spread)) * SR)
            if 0 <= i < n - L:
                out[i:i + L] += r.standard_normal(L) * shape * r.uniform(0.3, 1)
    return bp(out, 900, 6000)


def applause(n, segments, rate=180, seed=4):
    """dense random clapping during (start, end, level) segments"""
    r = np.random.default_rng(seed)
    times = []
    lev = np.zeros(n)
    for s, e, a in segments:
        k = int((e - s) * rate)
        times += list(r.uniform(s, e, k))
        i0, i1 = int(s * SR), min(n, int(e * SR))
        w = np.ones(i1 - i0); f = min(len(w) // 3, int(0.8 * SR))
        w[:f] = np.linspace(0, 1, f); w[-f:] = np.linspace(1, 0, f)
        lev[i0:i1] = np.maximum(lev[i0:i1], w * a)
    return claps(n, times, per=1, spread=0, seed=seed) * lp(lev, 5)


VOWELS = {'a': [(730, 1), (1090, .5), (2440, .25)], 'o': [(570, 1), (840, .45), (2410, .2)],
          'e': [(530, 1), (1840, .5), (2480, .25)], 'u': [(300, 1), (870, .35), (2240, .15)]}


def chorus(n, notes, voices=40, vowel='o', seed=5):
    """many voices chanting together on pitch (voiced syllables, ragged timing). notes = [(start, dur, midi)]"""
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    for s, d, m in notes:
        for v in range(voices):
            f0 = 440 * 2 ** ((m - 69 + r.normal(0, 0.35)) / 12) * (0.5 if v % 3 else 1)
            y = syllable(f0, d * r.uniform(0.85, 1.05), vowel, r, shout=True)
            i0 = int((s + abs(r.normal(0, 0.04))) * SR)
            if i0 + len(y) < n: out[i0:i0 + len(y)] += y * r.uniform(0.4, 1)
    return out


def chorus_old(n, notes, voices=40, vowel='o', seed=5):
    """many voices singing/chanting together. notes = [(start, dur, midi)]"""
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    for s, d, m in notes:
        i0, L = int(s * SR), int(d * SR)
        if i0 >= n: continue
        L = min(L, n - i0)
        t = np.arange(L) / SR
        seg = np.zeros(L)
        for v in range(voices):
            f = 440 * 2 ** ((m - 69 + r.normal(0, 0.25)) / 12) * (2 if v % 3 == 0 else 1)
            ph = 2 * np.pi * np.cumsum(f * (1 + 0.006 * np.sin(2 * np.pi * r.uniform(4, 6) * t))) / SR
            saw = 2 * ((ph / (2 * np.pi) + r.uniform()) % 1) - 1
            dl = r.uniform(0, 0.08)
            e = np.clip((t - dl) / 0.06, 0, 1) * np.clip((d - t) / 0.12, 0, 1)
            seg += saw * e * r.uniform(0.5, 1)
        out[i0:i0 + L] += seg
    vo = sum(bp(out, f * 0.85, f * 1.15) * g for f, g in VOWELS[vowel])
    return hp(vo, 150)


def drum(n, times, f=70, decay=0.25, noise=0.3, seed=6):
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    L = int(decay * 3 * SR)
    t = np.arange(L) / SR
    body = np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * np.exp(-t * 30))) / SR) * np.exp(-t / decay)
    for tt in times:
        i = int(tt * SR)
        if i < n - L:
            hit = body + noise * lp(r.standard_normal(L), 2500) * np.exp(-t / 0.04)
            out[i:i + L] += hit * r.uniform(0.75, 1)
    return out


def organ(n, notes, seed=8):
    """stadium organ (drawbar style). notes = [(start, dur, midi)]"""
    out = np.zeros(n)
    for s, d, m in notes:
        i0, L = int(s * SR), int(d * SR)
        if i0 + L >= n: continue
        t = np.arange(L) / SR
        f = 440 * 2 ** ((m - 69) / 12)
        x = sum(a * np.sin(2 * np.pi * f * h * t) for h, a in [(0.5, .5), (1, 1), (2, .6), (3, .35), (4, .25), (6, .12)])
        x *= (1 + 0.15 * np.sin(2 * np.pi * 6.5 * t)) * np.clip(t / 0.01, 0, 1) * np.clip((d - t) / 0.03, 0, 1)
        out[i0:i0 + L] += x
    return out


def reverb(x, rt=2.0, wet=0.35, seed=9):
    r = np.random.default_rng(seed)
    L = int(rt * SR)
    ir = r.standard_normal(L) * np.exp(-np.arange(L) / SR * 6.9 / rt)
    ir = lp(ir, 5000)
    y = signal.fftconvolve(x, ir)[: len(x)]
    return x * (1 - wet) + norm(y, np.max(np.abs(x))) * wet


# ---------- voiced crowd (sounds like people, not like wind or rain) ----------
VOW = {'a': (730, 1090, 2440), 'e': (530, 1840, 2480), 'i': (300, 2200, 2950), 'o': (570, 840, 2410),
       'u': (320, 870, 2240), 'ae': (660, 1720, 2410), 'er': (490, 1350, 1690)}
_SOS = {}


def _formant_sos(v, scale):
    key = (v, round(scale, 2))
    if key not in _SOS:
        _SOS[key] = [signal.butter(1, [f * scale * 0.88, f * scale * 1.12], 'bandpass', fs=SR, output='sos') for f in VOW[v]]
    return _SOS[key]


def syllable(f0, dur, vowel, r, shout=False, glide=0.0):
    """one voiced syllable: glottal pulse train with jitter/vibrato through vowel formants, plus a consonant burst"""
    L = int(dur * SR); t = np.arange(L) / SR
    f = f0 * (1 + glide * t / dur + 0.01 * np.sin(2 * np.pi * r.uniform(4, 7) * t) + 0.004 * r.standard_normal(L).cumsum() / np.sqrt(L))
    ph = np.cumsum(f) / SR
    src = (2 * (ph % 1) - 1)
    src = lp(src, 3800 if shout else 2600, 1) + 0.04 * r.standard_normal(L)  # breathiness
    scale = 1.18 if f0 > 170 else 1.0
    sos = _formant_sos(vowel, scale)
    gains = (1, 0.6 if shout else 0.45, 0.3 if shout else 0.18)
    y = sum(signal.sosfilt(s_, src) * g for s_, g in zip(sos, gains))
    a = min(0.04, dur / 4)
    env = np.clip(t / a, 0, 1) * np.clip((dur - t) / (dur * 0.35), 0, 1)
    y *= env
    if r.random() < 0.6:  # consonant onset (s, t, k, h ...)
        cL = int(r.uniform(0.02, 0.06) * SR)
        y[:cL] += bp(r.standard_normal(cL), r.uniform(1800, 4000), 8000) * np.linspace(1, 0, cL) * 0.25
    return y


def babble(n, talkers=40, seed=1, pitch=1.0, rate=(3.5, 6.0), level=(0.3, 1.0)):
    """many people chatting: each talker speaks phrases of syllables with natural pauses"""
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    T = n / SR
    for k in range(talkers):
        f0 = (r.normal(118, 18) if r.random() < 0.6 else r.normal(205, 25)) * pitch
        g = r.uniform(*level)
        t = r.uniform(0, 3)
        while t < T - 1:
            nsyl = r.integers(3, 14)
            contour = np.linspace(1.08, 0.9, nsyl) * r.uniform(0.95, 1.08)
            for j in range(nsyl):
                d = 1 / r.uniform(*rate)
                i0 = int(t * SR)
                y = syllable(f0 * contour[j], d * 1.1, r.choice(list(VOW)), r)
                if i0 + len(y) < n:
                    out[i0:i0 + len(y)] += y * g * r.uniform(0.6, 1)
                t += d
            t += r.exponential(1.2) + 0.25
    return out


def cheer(n, times, voices=60, seed=2, dur=(1.4, 3.2), vowels=('a', 'e', 'ae', 'o')):
    """crowd reaction: lots of people shouting open vowels with rising pitch at once, ragged onsets"""
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    for t0 in times:
        vow = r.choice(vowels)
        for v in range(voices):
            f0 = (r.normal(165, 25) if r.random() < 0.6 else r.normal(300, 35))
            d = r.uniform(*dur)
            on = t0 + abs(r.normal(0, 0.18))
            y = syllable(f0, d, vow if r.random() < 0.7 else r.choice(vowels), r, shout=True, glide=r.uniform(-0.15, 0.2))
            i0 = int(on * SR)
            if i0 + len(y) < n:
                out[i0:i0 + len(y)] += y * r.uniform(0.3, 1)
    return out


def fan_whistles(n, seed=3, per_min=6):
    """two-finger whistles from individual fans"""
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    for t in poisson_times(n / SR, per_min, seed, 3):
        d = r.uniform(0.4, 1.1); L = int(d * SR); tt = np.arange(L) / SR
        f = r.uniform(2300, 3300) * (1 + r.uniform(-0.08, 0.12) * np.sin(np.pi * tt / d))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d) ** 0.6
        y += 0.15 * bp(r.standard_normal(L), 2000, 5000) * np.sin(np.pi * tt / d)
        i0 = int(t * SR)
        if i0 + L < n: out[i0:i0 + L] += y * r.uniform(0.3, 1)
    return out


def crowd_bed(n, seed, near=40, far=90, bright=1.0, rt=2.2, wet=0.45):
    """near talkers you can almost make out + a big distant babble mass + a little air"""
    r = np.random.default_rng(seed)
    nearv = babble(n, near, seed, level=(0.4, 1.0))
    farv = lp(babble(n, far, seed + 100, rate=(4, 7), level=(0.2, 0.7)), 1800 * bright)
    air = bp(pink(n, r), 150, 2500)
    x = norm(nearv) * 0.55 + norm(farv) * 0.6 + norm(air) * 0.12
    return reverb(x, rt, wet, seed)


def poisson_times(total, per_min, seed, min_gap=1.0):
    r = np.random.default_rng(seed)
    out, t = [], r.uniform(2, 10)
    while t < total - 3:
        out.append(t)
        t += r.exponential(60 / per_min) + min_gap
    return out


# ---------- sport-specific details ----------
def squeaks(n, seed=10):
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    for t in poisson_times(n / SR, 30, seed, 0.3):
        for _ in range(r.integers(1, 4)):
            L = int(r.uniform(0.05, 0.14) * SR); tt = np.arange(L) / SR
            f0, f1 = r.uniform(1500, 2600), r.uniform(2200, 3800)
            ff = np.linspace(f0, f1, L) if r.random() < .5 else np.linspace(f1, f0, L)
            x = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.sin(np.pi * tt / tt[-1]) ** 2
            i = int((t + r.uniform(0, 0.5)) * SR)
            if i < n - L: out[i:i + L] += x * r.uniform(0.3, 1)
    return out


def dribbles(n, seed=11):
    r = np.random.default_rng(seed)
    times = []
    for t in poisson_times(n / SR, 4, seed, 6):
        k, gap = r.integers(4, 12), r.uniform(0.42, 0.6)
        times += [t + i * gap for i in range(k)]
    return hp(drum(n, times, f=110, decay=0.05, noise=0.6, seed=seed), 60)


def skates(n, seed=12):
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    base = r.standard_normal(n)
    for t in poisson_times(n / SR, 40, seed, 0.2):
        L = int(r.uniform(0.15, 0.45) * SR); i = int(t * SR)
        if i < n - L:
            e = np.sin(np.linspace(0, np.pi, L)) ** 1.5
            out[i:i + L] += base[i:i + L] * e * r.uniform(0.3, 1)
    clicks = np.zeros(n)
    for t in poisson_times(n / SR, 25, seed + 1, 0.4):
        i = int(t * SR); L = int(0.04 * SR)
        if i < n - L: clicks[i:i + L] += r.standard_normal(L) * np.exp(-np.linspace(0, 12, L))
    return bp(out, 2500, 9000) * 0.6 + bp(clicks, 900, 3500) * 0.8


def bat_cracks(n, seed=13):
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    times = poisson_times(n / SR, 1.6, seed, 15)
    for t in times:
        i = int(t * SR); L = int(0.12 * SR); tt = np.arange(L) / SR
        x = r.standard_normal(L) * np.exp(-tt / 0.006) + 0.6 * np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt / 0.03)
        if i < n - L: out[i:i + L] += x
    return hp(out, 500), times


def build(sport):
    n = int((DUR + XF) * SR)
    T = n / SR
    r = np.random.default_rng(sum(map(ord, sport)))
    mix = []

    def stereo(x, width=0.3, seed=0):
        d = int(np.random.default_rng(seed).uniform(0.008, 0.02) * SR)
        return np.stack([x, (1 - width) * x + width * np.roll(x, d)])

    if sport == 'soccer':
        # big stadium: dense roar, an original terrace chant every so often, drums, oohs and applause
        mix.append(stereo(crowd_bed(n, 21, 36, 70, 0.9, 2.6, 0.5) * 0.6, seed=1))
        mix.append(stereo(reverb(swells(n, 4, seed=22), 2.6, 0.5) * 0.12, seed=2))
        mix.append(stereo(reverb(cheer(n, poisson_times(T, 3, 27, 10), 70, 28), 2.6, 0.5) * 0.3, seed=6))
        mix.append(stereo(reverb(fan_whistles(n, 29, 5), 2.6, 0.4) * 0.05, 0.6, seed=7))
        mel = [62, 62, 64, 66, 64, 62, 59, 62]  # original 2-bar terrace tune, sung on "oh"
        notes, drums = [], []
        for start in poisson_times(T, 0.5, 23, 45):
            beat = 60 / 112
            for rep in range(2):
                for k, m in enumerate(mel):
                    notes.append((start + (rep * 8 + k) * beat, beat * 0.95, m))
                drums += [start + (rep * 8 + k) * beat for k in (0, 2, 4, 6)]
        mix.append(stereo(reverb(chorus(n, notes, 50, 'o', 24), 2.6, 0.6) * 0.2, seed=3))
        mix.append(stereo(reverb(drum(n, drums, 65, 0.3, seed=25), 2.6, 0.55) * 0.18, seed=4))
        mix.append(stereo(reverb(applause(n, [(t, t + r.uniform(3, 6), 1) for t in poisson_times(T, 1.5, 26, 20)]), 2.2, 0.4) * 0.3, seed=5))
    elif sport == 'basketball':
        # indoor arena: closer murmur, sneaker squeaks, dribbles, "de-fense" style two-note chant with claps
        mix.append(stereo(crowd_bed(n, 31, 34, 50, 1.0, 1.7, 0.4) * 0.55, seed=1))
        mix.append(stereo(reverb(swells(n, 6, (0.4, 0.9), 32), 1.7, 0.4) * 0.1, seed=2))
        mix.append(stereo(reverb(cheer(n, poisson_times(T, 4, 39, 8), 50, 30), 1.7, 0.4) * 0.3, seed=8))
        mix.append(stereo(reverb(squeaks(n, 33), 1.4, 0.3) * 0.08, 0.5, seed=3))
        mix.append(stereo(reverb(dribbles(n, 34), 1.4, 0.3) * 0.22, seed=4))
        notes, cl = [], []
        for start in poisson_times(T, 1.2, 35, 30):
            beat = 60 / 120
            for rep in range(6):
                t0 = start + rep * 4 * beat
                notes += [(t0, beat * 0.8, 57), (t0 + beat, beat * 0.9, 55)]
                cl += [t0 + 2 * beat, t0 + 3 * beat]
        mix.append(stereo(reverb(chorus(n, notes, 36, 'e', 36), 1.7, 0.4) * 0.22, seed=5))
        mix.append(stereo(reverb(claps(n, cl, 60, 0.025, 37), 1.7, 0.4) * 0.25, seed=6))
        mix.append(stereo(reverb(applause(n, [(t, t + r.uniform(2, 4), 1) for t in poisson_times(T, 2, 38, 15)]), 1.6, 0.35) * 0.28, seed=7))
    elif sport == 'american_football':
        # huge outdoor stadium: deep roar, drumline cadences, big swells, applause
        mix.append(stereo(crowd_bed(n, 41, 36, 80, 0.85, 3.0, 0.55) * 0.6, seed=1))
        mix.append(stereo(reverb(swells(n, 5, (0.6, 1.1), 42), 3.0, 0.5) * 0.14, seed=2))
        mix.append(stereo(reverb(cheer(n, poisson_times(T, 3.5, 47, 9), 80, 48), 3.0, 0.55) * 0.32, seed=6))
        mix.append(stereo(reverb(fan_whistles(n, 49, 4), 3.0, 0.45) * 0.05, 0.6, seed=7))
        sn, bd = [], []
        for start in poisson_times(T, 1.5, 43, 20):
            s16 = 60 / 104 / 4
            pat = 'x.x.xx.x.xx.x.x.x.x.xx.x.x.xxxx.'
            for rep in range(4):
                for k, c in enumerate(pat):
                    if c == 'x': sn.append(start + (rep * 32 + k) * s16)
                    if k % 8 == 0: bd.append(start + (rep * 32 + k) * s16)
        snare = drum(n, sn, 190, 0.06, 1.4, 44)
        mix.append(stereo(reverb(hp(snare, 150) * 0.5 + drum(n, bd, 55, 0.35, 0.2, 45) * 0.6, 3.0, 0.45) * 0.3, seed=3))
        mix.append(stereo(reverb(applause(n, [(t, t + r.uniform(3, 6), 1) for t in poisson_times(T, 1.8, 46, 15)]), 2.6, 0.45) * 0.3, seed=4))
    elif sport == 'hockey':
        # arena: murmur, skate carves and stick/puck clicks, short original organ riffs, applause
        mix.append(stereo(crowd_bed(n, 51, 34, 50, 1.0, 1.8, 0.4) * 0.55, seed=1))
        mix.append(stereo(reverb(swells(n, 6, (0.4, 0.9), 52), 1.8, 0.4) * 0.1, seed=2))
        mix.append(stereo(reverb(cheer(n, poisson_times(T, 4, 58, 8), 50, 59), 1.8, 0.4) * 0.3, seed=7))
        mix.append(stereo(reverb(skates(n, 53), 1.5, 0.3) * 0.2, 0.5, seed=3))
        riffs = [[(0, .25, 67), (.25, .25, 72), (.5, .25, 76), (.75, .5, 79), (1.5, .25, 76), (1.75, .75, 79)],
                 [(0, .2, 60), (.2, .2, 64), (.4, .2, 67), (.6, .2, 72), (.8, .6, 71), (1.6, .6, 72)]]
        notes, cl = [], []
        for j, start in enumerate(poisson_times(T, 1.6, 54, 18)):
            for s, d, m in riffs[j % 2]:
                notes.append((start + s, d, m))
            cl += [start + 2.6, start + 3.0]
        mix.append(stereo(reverb(organ(n, notes, 55), 1.9, 0.45) * 0.12, seed=4))
        mix.append(stereo(reverb(claps(n, cl, 60, 0.03, 56), 1.8, 0.4) * 0.25, seed=5))
        mix.append(stereo(reverb(applause(n, [(t, t + r.uniform(2, 4), 1) for t in poisson_times(T, 2, 57, 15)]), 1.7, 0.35) * 0.28, seed=6))
    elif sport == 'baseball':
        # relaxed ballpark: easy murmur, the odd bat crack followed by a rise and applause, organ noodles
        mix.append(stereo(crowd_bed(n, 61, 40, 50, 0.95, 2.2, 0.4) * 0.55, seed=1))
        cracks, times = bat_cracks(n, 62)
        mix.append(stereo(reverb(cracks, 2.4, 0.4) * 0.25, seed=2))
        sw = np.zeros(n)
        noise = norm(bp(pink(n, r), 400, 6000))
        for t in times:
            i0 = int((t + 0.15) * SR); L = int(5 * SR)
            if i0 + L < n:
                e = np.concatenate([np.linspace(0, 1, int(1.2 * SR)) ** 2, np.exp(-np.linspace(0, 4, L - int(1.2 * SR)))])
                sw[i0:i0 + L] += e
        mix.append(stereo(reverb(noise * sw, 2.4, 0.5) * 0.1, seed=3))
        mix.append(stereo(reverb(cheer(n, [t + 0.3 for t in times], 50, 65, (1.5, 3.5)), 2.4, 0.5) * 0.3, seed=6))
        mix.append(stereo(reverb(applause(n, [(t + 1.2, t + r.uniform(4, 7), 1) for t in times]), 2.2, 0.4) * 0.28, seed=4))
        notes = []
        for start in poisson_times(T, 1.0, 63, 40):
            for k, m in enumerate([67, 69, 71, 72, 74, 72, 71, 69, 67, 64, 67]):
                notes.append((start + k * 0.32, 0.3, m))
        mix.append(stereo(reverb(organ(n, notes, 64), 2.2, 0.45) * 0.09, seed=5))
    else:
        raise SystemExit(f'unknown sport {sport}')

    x = sum(mix)
    # seamless loop: crossfade the extra tail into the head
    m = int(XF * SR); L = int(DUR * SR)
    fade = np.linspace(0, 1, m)
    y = x[:, :L].copy()
    y[:, :m] = x[:, :m] * fade + x[:, L:L + m] * (1 - fade)
    y = hp(y, 40)
    return norm(y, 0.89)


SPORTS = ['soccer', 'basketball', 'american_football', 'hockey', 'baseball']

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'tools/music/crowd'
    os.makedirs(out, exist_ok=True)
    for sport in (sys.argv[2:] or SPORTS):
        y = build(sport)
        wav = os.path.join(out, f'crowd-{sport}.wav')
        wavfile.write(wav, SR, (y.T * 32767).astype(np.int16))
        mp3 = wav[:-4] + '.mp3'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '192k', mp3], check=True)
        os.remove(wav)
        print('wrote', mp3)
