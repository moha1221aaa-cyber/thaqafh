"""يولّد خيارات أصوات البث (audio/sx_<حدث>_<رقم>.mp3): 13 حدث × 6 أنماط، والمنظم يختار من الإعدادات (js/sfx.js).
   الأنماط: 1 نحاسي، 2 سينمائي، 3 ماريمبا، 4 إلكتروني، 5 أوركسترا، 6 بيانو كهربائي.
   كل نمط له نفس السلم الصاعد في أزرار الفقرة 3 (حرف صحيح واطي هادي، حرفين أعلى وحماسي، ثلاث حروف الأقوى).
   تشغيل: python3 tests/harness/audio/gen_sx.py   (numpy + ffmpeg، يكتب في audio/) """
import subprocess, os, sys, numpy as np
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "audio")
rng = np.random.default_rng(11)

def envl(n, a=0.004, d=0.3, hold=0.0):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1.0) * np.where(t < a + hold, 1.0, np.exp(-(t - a - hold) / d))

def lp_noise(n, lp):
    x = rng.standard_normal(n); k = np.exp(-np.arange(256) / max(1.0, SR / lp / 2)); k /= k.sum()
    return np.convolve(x, k, mode="same")

# ---------- الآلات: كل واحدة (تردد، مدة، تقصير) ← موجة ----------
def brass(f, dur, k=1.0, hold=0.0):
    n = int(SR * dur); t = np.arange(n) / SR; cut = f * (1.5 + 6 * np.exp(-t / 0.09)); y = np.zeros(n)
    H = int(min(30, (SR / 2 - 200) / f))
    for dv in (0, 0.0035, -0.0035):
        for h in range(1, H + 1):
            y += (1.0 / h) / (1 + (h * f * (1 + dv) / cut) ** 4) * np.sin(2 * np.pi * h * f * (1 + dv) * t + h * 0.3)
    return y * envl(n, 0.004, 0.28 * k, hold) / 3

def pad(f, dur, k=1.0, hold=0.0):
    n = int(SR * dur); t = np.arange(n) / SR; cut = f * (1.2 + 2.5 * np.exp(-t / 0.25)); y = np.zeros(n)
    H = int(min(20, (SR / 2 - 200) / f))
    for dv in (0, 0.006, -0.006, 0.012):
        for h in range(1, H + 1):
            y += (1.0 / h) / (1 + (h * f * (1 + dv) / cut) ** 4) * np.sin(2 * np.pi * h * f * (1 + dv) * t)
    return y * envl(n, 0.03, 0.5 * k, hold) / 4

def mallet(f, dur, k=1.0, hold=0.0):
    n = int(SR * dur); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / (0.32 * k)) + 0.45 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / (0.11 * k)) + 0.15 * np.sin(2 * np.pi * f * 9.14 * t) * np.exp(-t / (0.04 * k))
    knock = lp_noise(n, 3000) * np.exp(-t / 0.012) * 0.35
    return (y + knock) * envl(n, 0.001, 10)

def pluck(f, dur, k=1.0, hold=0.0):
    n = int(SR * dur); t = np.arange(n) / SR; cut = f * (1.2 + 12 * np.exp(-t / 0.07)); y = np.zeros(n)
    H = int(min(30, (SR / 2 - 200) / f))
    for dv in (0, 0.01, -0.01):
        for h in range(1, H + 1):
            y += (1.0 / h) / (1 + (h * f * (1 + dv) / cut) ** 4) * np.sin(2 * np.pi * h * f * (1 + dv) * t)
    return y * envl(n, 0.002, 0.2 * k, hold) / 3

def strings(f, dur, k=1.0, hold=0.0):
    n = int(SR * dur); t = np.arange(n) / SR; vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t); y = np.zeros(n)
    H = int(min(16, (SR / 2 - 200) / f)); cut = f * (2 + 3 * np.exp(-t / 0.3))
    for dv in (0, 0.005, -0.005):
        for h in range(1, H + 1):
            y += (1.0 / h) / (1 + (h * f / cut) ** 4) * np.sin(2 * np.pi * h * f * (1 + dv) * vib * t)
    return y * envl(n, 0.03, 0.55 * k, hold) / 3

def epiano(f, dur, k=1.0, hold=0.0):
    n = int(SR * dur); t = np.arange(n) / SR; idx = 0.4 + 2.2 * np.exp(-t / 0.12)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 14 * t) * 0.3) + 0.5 * np.sin(2 * np.pi * f * 2 * t + idx * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t / 0.25)
    return y * envl(n, 0.003, 0.45 * k, hold) / 1.5

INST = {1: brass, 2: pad, 3: mallet, 4: pluck, 5: strings, 6: epiano}

# ---------- أدوات مساعدة ----------
def place(b, y, at, g=1.0):
    i = int(at * SR)
    if i < len(b): b[i:i + len(y)] += g * y[:len(b) - i]

def boom(f0, f1, dur, dec=0.12):
    n = int(SR * dur); t = np.arange(n) / SR; f = f1 + (f0 - f1) * np.exp(-t / dec)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * envl(n, 0.002, dur / 3.5)

def noise(dur, lp=3000, d=0.06, a=0.001):
    n = int(SR * dur); return lp_noise(n, lp) * envl(n, a, d)

def sweep_noise(dur, f0, f1, vol=0.5):
    """سويش: ضجيج مفلتر ينفتح تدريجياً (بدون فحيح عالي)"""
    n = int(SR * dur); t = np.arange(n) / SR; p = (t / dur) ** 2
    a = lp_noise(n, min(f0, 4500)); b = lp_noise(n, min(f1, 4500)); a /= a.std() + 1e-9; b /= b.std() + 1e-9
    return vol * (a * (1 - p) + b * p) * np.minimum(t / (dur * 0.9), 1.0) * np.minimum((dur - t) / 0.05, 1.0)

def tone_sweep(f0, f1, dur, vol=0.4, wave="saw"):
    n = int(SR * dur); t = np.arange(n) / SR; f = f0 + (f1 - f0) * (t / dur) ** 2; ph = 2 * np.pi * np.cumsum(f) / SR
    y = (2 * ((ph / (2 * np.pi)) % 1) - 1) if wave == "saw" else np.sign(np.sin(ph))
    return vol * y * np.minimum(t / 0.05, 1.0) * np.minimum((dur - t) / 0.08, 1.0)

def clickk(s):
    n = int(SR * 0.05)
    if s == 3: return mallet(900, 0.05, 0.3) * 0.8
    if s == 4: return np.sign(np.sin(2 * np.pi * 1800 * np.arange(n) / SR)) * envl(n, 0.0005, 0.008) * 0.5
    if s == 6: return epiano(1200, 0.05, 0.3) * 0.6
    return noise(0.04, 4500, 0.008) * 0.9

def add(*ys):
    n = max(len(y) for y in ys); o = np.zeros(n)
    for y in ys: o[:len(y)] += y
    return o

def hit_low(s, dur=0.9):
    if s == 1: return add(boom(150, 55, dur), noise(0.1, 900, 0.05) * 0.4)
    if s == 2: return add(boom(110, 32, dur, 0.25) * 1.3, noise(0.25, 400, 0.15) * 0.4)
    if s == 3: return add(mallet(110, dur * 0.6, 0.8) * 1.2, boom(90, 60, 0.3) * 0.5)
    if s == 4: return add(tone_sweep(320, 45, dur * 0.7, 0.9, "saw"), boom(100, 40, dur) * 0.4)
    if s == 5: return add(boom(95, 52, dur, 0.18) * 1.1, noise(0.2, 700, 0.12) * 0.45)
    return add(epiano(98, dur, 1.4) * 0.8, boom(80, 50, 0.4) * 0.5)

def write(name, y, peak_db):
    y = np.tanh(np.asarray(y, dtype=np.float64) * 1.2); y /= np.abs(y).max() + 1e-9; y *= 10 ** (peak_db / 20)
    raw = (y * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-af",
                    "aecho=0.9:0.85:55|110:0.22|0.12,alimiter=limit=0.95,afade=t=out:st=%f:d=0.15" % max(0, len(y) / SR - 0.15), "-b:a", "96k", os.path.join(OUT, name + ".mp3")], input=raw, check=True)

# ---------- الأحداث ----------
def ev_h1(s, I): n = int(SR * 0.7); b = np.zeros(n); place(b, I(392.0, 0.65, 0.7), 0); return b, -7
def ev_h2(s, I):
    n = int(SR * 1.2); b = np.zeros(n); place(b, I(523.25, 0.4, 0.6), 0); place(b, I(783.99, 0.85, 1.0), 0.15)
    place(b, sweep_noise(0.6, 3000, 8000, 0.015), 0.15); place(b, boom(110, 70, 0.3) * 0.3, 0.15); return b, -3
def ev_h3(s, I):
    n = int(SR * 2.2); b = np.zeros(n)
    for i, f in enumerate((523.25, 659.25, 783.99)): place(b, I(f, 0.3, 0.45), i * 0.1)
    for f in (1046.5, 783.99, 659.25, 523.25): place(b, I(f, 1.6, 1.6, 0.25), 0.32, 1.0 if f > 1000 else 0.7)
    place(b, hit_low(s, 0.7) * 0.9, 0.32); place(b, noise(0.3, 5000, 0.1) * 0.2, 0.32); place(b, sweep_noise(1.2, 3000, 9000, 0.02), 0.32); return b, -0.5
def ev_miss(s, I): n = int(SR * 0.8); b = np.zeros(n); place(b, hit_low(s, 0.7), 0); return b, -3.5
def ev_strike(s, I):
    n = int(SR * 1.0); t = np.arange(n) / SR; b = np.zeros(n)
    if s == 1: b += 0.55 * (np.sign(np.sin(2 * np.pi * 110 * t)) + 0.8 * np.sign(np.sin(2 * np.pi * 117 * t))) * (np.sin(2 * np.pi * 9 * t) > -0.2) * envl(n, 0.003, 0.5, 0.35)
    elif s == 2:
        for f in (90, 95, 134): place(b, pad(f, 0.95, 1.4) * 1.2, 0)
    elif s == 3:
        for i in range(3): place(b, mallet(150 + i * 3, 0.3, 0.5) * 1.1, i * 0.17)
        place(b, (np.sign(np.sin(2 * np.pi * 120 * t)) * 0.3) * envl(n, 0.003, 0.4), 0)
    elif s == 4: b += 0.6 * np.sign(np.sin(2 * np.pi * 150 * t)) * (np.sin(2 * np.pi * 14 * t) > 0) * envl(n, 0.002, 0.5, 0.3)
    elif s == 5:
        f = 240 - 100 * (t / 0.9); ph = 2 * np.pi * np.cumsum(f) / SR; cut = 600 + 500 * np.sin(2 * np.pi * 4 * t)
        y = sum((1.0 / h) * np.sin(h * ph) / (1 + (h * f / cut) ** 4) for h in range(1, 14)); b += 0.7 * y * envl(n, 0.02, 0.6, 0.3)
    else:
        for f in (196, 208, 277): place(b, epiano(f, 0.9, 1.2), 0)
        b += 0.2 * np.sign(np.sin(2 * np.pi * 100 * t)) * (np.sin(2 * np.pi * 10 * t) > 0) * envl(n, 0.003, 0.4)
    place(b, boom(120, 45, 0.5) * 0.8, 0); return b, -0.8
def ev_ok(s, I):
    n = int(SR * 0.95); b = np.zeros(n)
    for f in (261.63, 329.63, 392.0): place(b, I(f, 0.9, 0.8, 0.06), 0)
    place(b, I(523.25, 0.7, 0.7), 0); place(b, boom(140, 80, 0.25) * 0.4, 0); return b, -2
def ev_bad(s, I):
    n = int(SR * 0.9); b = np.zeros(n); place(b, I(392.0, 0.4, 0.5), 0); place(b, I(293.66, 0.5, 0.8), 0.18); place(b, hit_low(s, 0.5) * 0.7, 0.18); return b, -3
def ev_time(s, I):
    n = int(SR * 1.5); t = np.arange(n) / SR; b = np.zeros(n)
    if s == 1: place(b, brass(330, 1.45, 3.0, 0.8) * 1.4, 0); place(b, brass(247, 1.45, 3.0, 0.8) * 1.0, 0)
    elif s == 2: place(b, boom(70, 38, 1.4, 0.5) * 1.3, 0); place(b, tone_sweep(180, 90, 1.2, 0.3), 0)
    elif s == 3:
        for i, g in enumerate((0, 0.35, 0.6, 0.78, 0.9)): place(b, mallet(200, 0.25, 0.5), g)
    elif s == 4:
        for i in range(2): place(b, tone_sweep(900, 450, 0.6, 0.45, "sq"), i * 0.65)
    elif s == 5:
        for i in range(10): place(b, boom(110, 90, 0.2, 0.05) * 0.6, 0.6 + i * 0.07)
        place(b, strings(220, 0.8, 1.2) * 1.4, 0.7); place(b, boom(90, 50, 0.7) * 1.2, 0.7)
    else:
        for g in (0, 0.28, 0.56): place(b, epiano(659.25, 0.3, 0.5), g)
        place(b, epiano(880, 0.8, 1.0), 0.84)
    return b, -1.5
def ev_pass(s, I): n = int(SR * 0.45); b = np.zeros(n); place(b, sweep_noise(0.3, 1500, 7000, 0.5), 0); place(b, clickk(s), 0.02); place(b, I(987.77, 0.3, 0.4) * 0.45, 0.04); return b, -8
def ev_land(s, I):
    n = int(SR * 1.6); b = np.zeros(n); place(b, hit_low(s, 1.1) * 1.1, 0); place(b, I(392.0, 0.9, 1.0), 0.02, 0.6); place(b, I(587.33, 0.9, 1.0), 0.02, 0.45)
    place(b, noise(0.25, 6000, 0.08) * 0.25, 0); return b, -1
def ev_seg(s, I):
    n = int(SR * 3.0); b = np.zeros(n); place(b, sweep_noise(1.1, 400, 7000, 0.5), 0); place(b, tone_sweep(110, 440, 1.1, 0.25), 0)
    place(b, hit_low(s, 1.2) * 1.1, 1.1)
    for f in (261.63, 392.0, 523.25): place(b, I(f, 1.6, 1.4, 0.2), 1.12, 0.8)
    return b, -1.5
def ev_round(s, I):
    n = int(SR * 3.0); b = np.zeros(n)
    for i, f in enumerate((523.25, 659.25, 783.99)): place(b, I(f, 0.35, 0.5), i * 0.16)
    for f in (1046.5, 783.99, 659.25, 523.25): place(b, I(f, 2.0, 2.0, 0.4), 0.55, 1.0 if f > 1000 else 0.7)
    place(b, hit_low(s, 1.0) * 0.9, 0.55); place(b, sweep_noise(1.5, 3000, 9000, 0.03), 0.55); return b, -1
def ev_spin(s, I):
    n = int(SR * 4.95); b = np.zeros(n); t = 0.0; k = 0
    while t < 4.7:
        p = t / 4.8
        gap = 0.045 + 0.2 * (p ** 3) if p > 0.6 else 0.045 + 0.02 * (p / 0.6)
        place(b, clickk(s) * (0.5 + 0.5 * (1 - p)), t); t += gap
    place(b, sweep_noise(4.6, 300, 4200, 0.35), 0.1); place(b, tone_sweep(90, 520, 4.6, 0.12, "saw"), 0.1)
    return b, -3

EVENTS = {"h1": ev_h1, "h2": ev_h2, "h3": ev_h3, "miss": ev_miss, "strike": ev_strike, "ok": ev_ok, "bad": ev_bad, "time": ev_time,
          "pass": ev_pass, "land": ev_land, "seg": ev_seg, "round": ev_round, "spin": ev_spin}

if __name__ == "__main__":
    only = sys.argv[1:] 
    for ev, fn in EVENTS.items():
        if only and ev not in only: continue
        for s in range(1, 7):
            y, pk = fn(s, INST[s]); write("sx_%s_%d" % (ev, s), y, pk)
        print("done", ev, flush=True)
