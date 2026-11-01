"""Original pop/whoosh sound effect for results-board score drops (synthesised, royalty-free).
Usage: python3 tools/make_pop.py tools/music/pop.wav"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 44100
rng = np.random.default_rng(3)
n = int(0.32 * SR); t = np.arange(n) / SR
# short whoosh (filtered noise swell) into a pitched "pop"
noise = sosfilt(butter(2, [1500, 6000], 'bandpass', fs=SR, output='sos'), rng.standard_normal(n))
whoosh = noise * np.clip(t / 0.08, 0, 1) * np.exp(-np.clip(t - 0.08, 0, None) / 0.03) * 0.25
f = 900 * np.exp(-t / 0.05) + 220
pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-np.clip(t - 0.07, 0, None) / 0.06) * (t > 0.07)
click = rng.standard_normal(n) * np.exp(-np.clip(t - 0.07, 0, None) / 0.004) * (t > 0.07) * 0.4
x = whoosh + pop + click
x = x / np.max(np.abs(x)) * 0.9
wavfile.write(sys.argv[1], SR, (np.stack([x, x], 1) * 32767).astype(np.int16))
