"""Synthesise Ittro's interface sounds as 16-bit mono WAV files (44.1 kHz)."""
import math, os, struct, sys, wave

OUT = sys.argv[1]
RATE = 44100

def env(i, n, attack, release):
    """Linear attack, exponential-ish release, so nothing clicks."""
    a = int(attack * RATE); r = int(release * RATE)
    if i < a:
        return i / max(a, 1)
    if i > n - r:
        return max(0.0, (n - i) / max(r, 1)) ** 2
    return 1.0

def tone(freq, dur, attack=0.005, release=0.06, harmonics=((1, 1.0),), glide_to=None, tremolo=0.0):
    n = int(dur * RATE); out = []; phase = 0.0
    for i in range(n):
        t = i / RATE
        f = freq if glide_to is None else freq * (glide_to / freq) ** (i / n)
        phase += 2 * math.pi * f / RATE
        s = sum(a * math.sin(h * phase) for h, a in harmonics)
        if tremolo:
            s *= 1 - tremolo * (0.5 + 0.5 * math.sin(2 * math.pi * 6 * t))
        out.append(s * env(i, n, attack, release))
    return out

def silence(dur):
    return [0.0] * int(dur * RATE)

def bell(freq, dur):
    # A soft bell: fundamental plus a quiet octave and twelfth, long decay.
    n = int(dur * RATE)
    return [sum(a * math.sin(2 * math.pi * freq * h * i / RATE) for h, a in ((1, 1.0), (2, 0.25), (3, 0.08)))
            * min(1.0, i / (0.004 * RATE)) * math.exp(-i / (0.18 * RATE)) for i in range(n)]

def mix(*parts):
    """Overlay parts given as (offset_seconds, samples)."""
    end = max(int(o * RATE) + len(s) for o, s in parts)
    out = [0.0] * end
    for o, s in parts:
        k = int(o * RATE)
        for i, v in enumerate(s):
            out[k + i] += v
    return out

def write(name, samples, peak_db):
    peak = max(abs(v) for v in samples) or 1.0
    gain = 10 ** (peak_db / 20) / peak
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v * gain)) * 32767)) for v in samples))
    return path, len(samples) / RATE

os.makedirs(OUT, exist_ok=True)
SOFT = ((1, 1.0), (2, 0.12))
made = [
    # State sounds: quiet, short, each with its own pitch and shape.
    write("heard.wav", tone(988, 0.09, release=0.07, harmonics=SOFT), -14),
    write("listening.wav", tone(659, 0.09, harmonics=SOFT) + silence(0.035) + tone(880, 0.11, harmonics=SOFT), -12),
    write("working-tick.wav", tone(1568, 0.028, attack=0.001, release=0.024), -22),
    write("lost.wav", tone(440, 0.38, release=0.12, harmonics=SOFT, glide_to=247), -12),
    write("proximity-tick.wav", tone(1175, 0.03, attack=0.001, release=0.025, harmonics=((1, 1.0), (3, 0.15))), -16),
    write("helper-pulse.wav", tone(330, 0.16, attack=0.03, release=0.12, harmonics=SOFT), -24),
    write("pausing.wav", tone(784, 0.12, harmonics=SOFT) + tone(659, 0.12, harmonics=SOFT) + tone(523, 0.22, release=0.16, harmonics=SOFT), -14),
    write("waking.wav", tone(523, 0.1, harmonics=SOFT) + tone(659, 0.1, harmonics=SOFT) + tone(784, 0.16, release=0.1, harmonics=SOFT), -12),
    # Verdict chimes: louder, played with the vibration and the first word.
    write("yes.wav", mix((0, bell(784, 0.6)), (0.11, bell(1175, 0.7))), -4),
    write("no.wav", mix((0, bell(523, 0.5)), (0.14, bell(392, 0.6)), (0.28, bell(311, 0.7))), -4),
    write("not-sure.wav", tone(392, 0.45, attack=0.02, release=0.2, harmonics=SOFT, tremolo=0.35), -6),
]
for p, d in made:
    print(f"{os.path.basename(p)}\t{d:.2f} s")
