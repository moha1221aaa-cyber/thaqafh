"""أصوات المسابقات (10 نوفمبر 2026، محمد: "ضايف أصوات سينمائية مو أصوات مسابقات، ضيف أصوات ومؤثرات حق مسابقات احترافية"):
   مكتبة بطابع برامج المسابقات التلفزيونية لكل حدث في البث: صفارة الغلط (buzzer)، رنة الجواب الصح (ding)، بوق انتهاء الوقت،
   تكتكة العجلة، ستينجر بداية الفقرة (نحاس + صنج)، فانفير الفوز مع تصفيق حقيقي. تصميم صوت (additive و FM بدون aliasing)
   + طبقات حقيقية من audio/ (تصفيق)، وريفيرب استوديو خفيف. ما فيه ألحان: ضربات قصيرة (ستينجر) بس.
   الملفات audio/sx_<حدث>_<رقم>.mp3 من 61، ويضيفها لـ js/sfx-catalog.js بعلامة "G" (قسم "أصوات مسابقات" في القائمة)،
   وأول واحد لكل حدث (61) هو الصوت الحالي (SG_DEF في segments.js).
   تشغيل: python3 tests/harness/audio/gen_gs.py  (numpy + ffmpeg)"""
import os, re, json, subprocess, math
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..", "..", "..")
AUDIO = os.path.join(ROOT, "audio"); CATJS = os.path.join(ROOT, "js", "sfx-catalog.js")
SR = 44100
FIRST = 61
LOUD = -15.0   # dBFS RMS للجزء المسموع
rng = np.random.default_rng(7)

def T(d): return np.arange(int(d * SR)) / SR
def env(n, a=0.005, d=0.1, s=0.6, r=0.1, hold=None):
    """ADSR بطول n عينة (hold = مدة الاستمرار قبل الـ release)"""
    t = np.arange(n) / SR
    tot = n / SR
    hold = tot - r if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel) ** 2
def mix(*parts):
    n = max(len(p[1]) + int(p[0] * SR) for p in parts)
    out = np.zeros(n)
    for off, x in parts:
        x = x.copy(); f = min(int(0.04 * SR), len(x) // 3)   # كل طبقة تخفت آخرها (بدون قطع مسموع)
        if f > 1: x[-f:] *= np.linspace(1, 0, f) ** 2
        i = int(off * SR); out[i:i + len(x)] += x
    return out
def additive(f, d, amps, ratios=None, decays=None, vib=0.0, bright=None):
    """مجموع هارمونيات (بدون aliasing): amps[i] للهارمونية ratios[i]*f، وdecays تخلي العالي يخفت أسرع، bright(t) قطع ناعم متغيّر"""
    t = T(d); out = np.zeros_like(t)
    ph_mod = vib * np.sin(2 * np.pi * 5.5 * t) if vib else 0
    for i, a in enumerate(amps):
        r = ratios[i] if ratios is not None else i + 1
        fr = f * r
        if fr > SR * 0.45 or a == 0: continue
        g = a
        if decays is not None: g = g * np.exp(-t / decays[i])
        if bright is not None: g = g / (1 + (fr / np.maximum(bright(t), 50)) ** 4)
        out += g * np.sin(2 * np.pi * fr * t + r * ph_mod + rng.uniform(0, 6.28))
    return out
def saw_amps(n): return [1.0 / h for h in range(1, n + 1)]
def sq_amps(n): return [(1.0 / h if h % 2 else 0) for h in range(1, n + 1)]
def biquad(x, kind, f, q=0.707, gain_db=0.0):
    w = 2 * math.pi * f / SR; c = math.cos(w); s = math.sin(w); al = s / (2 * q); A = 10 ** (gain_db / 40)
    if kind == "lp": b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "hp": b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "bp": b = [al, 0, -al]; a = [1 + al, -2 * c, 1 - al]
    else: b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]   # peaking
    b = [v / a[0] for v in b]; a = [1, a[1] / a[0], a[2] / a[0]]
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    b0, b1, b2 = b; a1, a2 = a[1], a[2]
    for i in range(len(x)):
        xi = x[i]; yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi; y[i] = yi
    return y
def norm(x, p=1.0):
    m = np.max(np.abs(x)) or 1; return x / m * p
def noise(d): return rng.standard_normal(int(d * SR))
def sweep_lp(x, f0, f1, curve=1.0):
    """لوباس متحرك (one-pole) من f0 إلى f1"""
    n = len(x); y = np.zeros(n); z = 0.0
    fs = f0 + (f1 - f0) * (np.arange(n) / max(n - 1, 1)) ** curve
    k = 1 - np.exp(-2 * np.pi * fs / SR)
    for i in range(n): z += k[i] * (x[i] - z); y[i] = z
    return y
def reverb(x, rt=0.9, wet=0.18, pre=0.012):
    n = int(rt * SR)
    ir = noise(rt) * np.exp(-6.9 * np.arange(n) / n)
    ir = biquad(ir, "lp", 6500); ir = norm(ir) * 0.06
    ir = np.concatenate([np.zeros(int(pre * SR)), ir])
    L = len(x) + len(ir)
    N = 1 << (L - 1).bit_length()
    w = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:L]
    out = np.concatenate([x, np.zeros(len(ir))]) * (1 - wet) + norm(w, np.max(np.abs(x)) * 0.9) * wet
    return out
def sat(x, k=1.5): return np.tanh(k * x) / np.tanh(k)
def load(name, d=None):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(AUDIO, name), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(float)
    if d: x = x[:int(d * SR)]; x *= np.minimum(1, (len(x) - np.arange(len(x))) / (0.4 * SR))
    return norm(x)
APPL = None
def applause(d, g=0.5):
    global APPL
    if APPL is None: APPL = load("applause.mp3")
    x = APPL[:int(d * SR)].copy()
    x *= np.minimum(1, np.arange(len(x)) / (0.05 * SR)) * np.minimum(1, (len(x) - np.arange(len(x))) / (0.8 * SR))
    return x * g

# ---------- اللبنات ----------
def ding(f, d=0.9, bright=1.0, fm=True):
    """رنة الجواب الصح الإلكترونية (FM): بداية لامعة وتخفت"""
    t = T(d)
    idx = (2.4 * bright) * np.exp(-t / 0.08) + 0.35
    mod = np.sin(2 * np.pi * f * 3.5 * t) if fm else 0
    car = np.sin(2 * np.pi * f * t + idx * mod)
    body = car * np.exp(-t / (d * 0.26)) * np.clip((d - t) / (d * 0.35), 0, 1)
    body += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / (d * 0.18))
    click = noise(0.004) * np.linspace(1, 0, int(0.004 * SR)) * 0.25
    out = mix((0, body * np.minimum(1, t / 0.002)), (0, biquad(click, "hp", 3000)))
    return out
def glock(f, d=1.0):
    """رنة معدن (ڤيبرافون/جلوك) بهارمونيات حقيقية"""
    return additive(f, d, [1, 0.45, 0.25, 0.12], [1, 2.76, 5.4, 8.93], [d * 0.35, d * 0.12, d * 0.06, d * 0.03]) * np.minimum(1, T(d) / 0.0015)
def buzzer(f=110, d=0.85, nasal=True, detune=1.012, grit=1.0):
    """صفارة الغلط الكلاسيكية: مربعة + منشار متقاربين، مع رنين أنفي (formant) وتشبّع"""
    n = int(d * SR)
    a = additive(f, d, sq_amps(60)) + 0.7 * additive(f * detune, d, saw_amps(60))
    if nasal:
        a = biquad(a, "pk", 700, 1.2, 9) ; a = biquad(a, "pk", 1700, 2.0, 6)
    a = sat(norm(a) * (1.6 * grit), 2.2)
    return a * env(n, 0.004, 0.2, 0.92, 0.03)
def thump(d=0.35, f0=140, f1=42, g=1.0):
    t = T(d); f = f1 + (f0 - f1) * np.exp(-t / 0.04)
    return g * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (d * 0.3)) * np.minimum(1, t / 0.001)
def cymbal(d=1.6, g=0.5, bright=7000):
    x = noise(d); x = biquad(biquad(x, "hp", bright * 0.7, 0.7), "hp", bright * 0.7, 0.7); x = biquad(x, "pk", 9500, 1.5, 4) + 0.15 * biquad(noise(d), "bp", 4200, 4)
    t = T(d); return g * x * np.exp(-t / (d * 0.32)) * np.minimum(1, t / 0.002) * 0.2
def snare(d=0.18, g=0.5):
    t = T(d); x = biquad(noise(d), "bp", 2200, 0.6) * np.exp(-t / 0.05)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03)
    return g * (norm(x) * 0.8 + tone * 0.5)
def brass(freqs, d=0.6, att=0.012, open_=3500, rel=0.25, g=1.0):
    """ضربة نحاس (stab) بكورد: منشار additive والفلتر يفتح ويقفل (مثل نحاس المسابقات)"""
    n = int(d * SR); out = np.zeros(n)
    for f in freqs:
        for dt in (0.997, 1.0, 1.004):
            out += additive(f * dt, d, saw_amps(40), bright=lambda t: 300 + open_ * np.exp(-t / 0.18) * np.minimum(1, t / att) + 600)
    out = sat(norm(out) * 1.3, 1.6)
    return g * out * env(n, att, 0.25, 0.55, rel)
def whoosh(d=0.5, f0=400, f1=4000, g=0.6):
    x = noise(d); t = T(d)
    y = sweep_lp(x, f0, f1, 0.7) - sweep_lp(x, f0 * 0.4, f1 * 0.4, 0.7) * 0.6
    sh = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return g * norm(y) * sh
def riser(d=2.0, f0=200, f1=2400, g=0.5):
    t = T(d); f = f0 * (f1 / f0) ** (t / d)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    nz = sweep_lp(noise(d), 300, 6000, 2.0) * 0.6
    return g * norm(s * 0.5 + nz) * (t / d) ** 2
def click(f=2600, g=0.8, d=0.03):
    t = T(d); x = biquad(noise(d), "bp", f, 3.0) * np.exp(-t / 0.004)
    tock = np.sin(2 * np.pi * f * 0.55 * t) * np.exp(-t / 0.012)
    return g * (norm(x) * 0.7 + tock * 0.5)
def beep(f, d=0.12, g=0.6, sq=False):
    n = int(d * SR)
    x = additive(f, d, sq_amps(15) if sq else [1, 0.2, 0.1])
    return g * norm(x) * env(n, 0.003, 0.05, 0.8, 0.02)
def sparkle(d=0.8, g=0.25, base=2800):
    out = np.zeros(int(d * SR))
    for k in range(14):
        f = base * 2 ** (rng.uniform(0, 1.6)); s = int(rng.uniform(0, d * 0.6) * SR)
        x = glock(f, min(0.35, d - s / SR)) * rng.uniform(0.3, 1)
        out[s:s + len(x)] += x[:len(out) - s]
    return g * norm(out)
def heart(d=1.0, g=0.6):
    return mix((0, thump(0.22, 90, 45, 1)), (0.16, thump(0.22, 80, 42, 0.7))) * g

N = lambda f: 440 * 2 ** ((f - 69) / 12)   # رقم نوتة MIDI ← تردد
C5, E5, G5, C6, E6, G6 = N(72), N(76), N(79), N(84), N(88), N(91)

def finish(x, peak_db=-1.0, verb=(0.9, 0.16), tail=0.05):
    if verb: x = reverb(x, *verb)
    x = x[:len(x)]
    # يشيل الصمت الزايد آخر الملف
    a = np.abs(x); thr = np.max(a) * 10 ** (-55 / 20); idx = np.where(a > thr)[0]
    if len(idx): x = x[:min(len(x), idx[-1] + int(0.05 * SR))]
    fade = int(tail * SR); x[-fade:] *= np.linspace(1, 0, fade)
    x[:64] *= np.linspace(0, 1, 64)
    # نفس الإحساس بالقوة لكل الأصوات: RMS للجزء المسموع (إطارات 50ms فوق -30 dB من الأعلى) على LOUD، وحد أقصى للذروة
    fr = int(0.05 * SR); m = len(x) // fr
    r = np.sqrt(np.mean(x[:m * fr].reshape(m, fr) ** 2, axis=1)) if m else np.array([np.sqrt(np.mean(x ** 2))])
    act = r[r > r.max() * 10 ** (-30 / 20)]
    g = 10 ** (LOUD / 20) / max(np.sqrt(np.mean(act ** 2)), 1e-9)
    x = x * g
    pk = np.max(np.abs(x)); lim = 10 ** (peak_db / 20)
    if pk > lim: x = sat(x / pk * 1.15, 1.0) * lim / sat(np.array([1.15]), 1.0)[0] if pk > lim * 1.6 else x / pk * lim
    return x

# ---------- الأحداث: (اسم بالعربي، دالة) ----------
EV = {}
EV["ok"] = [
    ("رنة الجواب الصحيح (دبل)", lambda: finish(mix((0, ding(C6, 0.7)), (0.11, ding(G6, 1.1))))),
    ("صح + نحاس قصير", lambda: finish(mix((0, ding(E6, 0.9)), (0, brass([C5, E5, G5], 0.45, g=0.55)), (0, thump(0.25, 160, 60, 0.5))))),
    ("صح لامع بثلاث رنات", lambda: finish(mix((0, ding(C6, 0.5)), (0.07, ding(E6, 0.5)), (0.14, ding(G6, 1.0)), (0.1, sparkle(0.8, 0.18))))),
    ("جرس استوديو صح", lambda: finish(mix((0, glock(G5, 1.2)), (0, glock(C6, 1.2) * 0.8), (0, thump(0.2, 200, 80, 0.4))))),
    ("صح مع تصفيق قصير", lambda: finish(mix((0, ding(C6, 0.7)), (0.11, ding(G6, 1.0)), (0.15, applause(1.6, 0.35))))),
    ("صح إلكتروني حديث", lambda: finish(mix((0, beep(N(84), 0.09, 0.7)), (0.09, beep(N(91), 0.28, 0.8)), (0.09, sparkle(0.6, 0.15))))),
    ("صح بضربة حماسية", lambda: finish(mix((0, thump(0.3, 180, 50, 0.9)), (0, snare(0.2, 0.5)), (0.01, ding(E6, 1.0)), (0.01, cymbal(1.0, 0.3))))),
    ("صح هادي (نقطة)", lambda: finish(ding(N(86), 0.9, 0.7))),
    ("تا-دا نحاس", lambda: finish(mix((0, brass([G5 / 2, C5, E5], 0.14, g=0.7)), (0.15, brass([C5, E5, G5, C6], 0.7, g=0.9)), (0.15, cymbal(1.2, 0.35))))),
    ("صح بلمعة", lambda: finish(mix((0, ding(G5, 0.6)), (0.09, ding(C6, 1.0)), (0, sparkle(1.0, 0.3))))),
]
EV["bad"] = [
    ("صفارة الغلط الكلاسيكية", lambda: finish(buzzer(110, 0.9), verb=(0.6, 0.1))),
    ("صفارة غلط دبل", lambda: finish(mix((0, buzzer(115, 0.28)), (0.36, buzzer(115, 0.5))), verb=(0.6, 0.1))),
    ("صفارة غلط واطية ثقيلة", lambda: finish(mix((0, buzzer(82, 1.0, grit=1.3)), (0, thump(0.4, 110, 40, 0.8))), verb=(0.6, 0.1))),
    ("غلط إلكتروني نازل", lambda: finish(mix((0, beep(N(64), 0.16, 0.8, True)), (0.17, beep(N(58), 0.4, 0.8, True))), verb=(0.6, 0.12))),
    ("صفارة غلط قصيرة", lambda: finish(buzzer(130, 0.45), verb=(0.5, 0.1))),
    ("غلط + ضربة", lambda: finish(mix((0, thump(0.3, 120, 45, 1)), (0.02, buzzer(98, 0.7))), verb=(0.6, 0.1))),
    ("صفارة غلط حادة", lambda: finish(buzzer(165, 0.75, detune=1.02), verb=(0.5, 0.1))),
    ("أوه لا (نحاس نازل)", lambda: finish(mix((0, brass([N(55), N(59)], 0.3, g=0.7)), (0.32, brass([N(53), N(56)], 0.7, open_=1800, g=0.7))))),
]
EV["strike"] = [
    ("استرايك: صفارة X الكبيرة", lambda: finish(mix((0, buzzer(98, 1.1, grit=1.5)), (0, thump(0.35, 140, 45, 0.9)), (0, cymbal(0.4, 0.15, 5000))), verb=(0.7, 0.12))),
    ("استرايك: صفارتين قويتين", lambda: finish(mix((0, buzzer(104, 0.32, grit=1.4)), (0.4, buzzer(104, 0.75, grit=1.4)), (0.4, thump(0.3, 130, 45, 0.8))), verb=(0.6, 0.1))),
    ("استرايك: إنذار أحمر", lambda: finish(mix((0, buzzer(220, 0.22, detune=1.03)), (0.25, buzzer(220, 0.22, detune=1.03)), (0.5, buzzer(147, 0.6, grit=1.4))), verb=(0.6, 0.1))),
    ("استرايك: صفارة + ضربة معدن", lambda: finish(mix((0, buzzer(92, 0.95, grit=1.4)), (0, glock(N(50), 0.8) * 0.5), (0, thump(0.4, 150, 40, 1))), verb=(0.7, 0.12))),
    ("استرايك: صفارة طويلة", lambda: finish(buzzer(86, 1.4, grit=1.6), verb=(0.6, 0.1))),
    ("استرايك: كسر إلكتروني", lambda: finish(mix((0, thump(0.35, 200, 40, 1)), (0, biquad(noise(0.25), "bp", 1200, 0.8) * np.exp(-T(0.25) / 0.06) * 0.6), (0.03, buzzer(120, 0.6, grit=1.5))), verb=(0.6, 0.12))),
]
EV["miss"] = [
    ("ولا حرف: بزر قصير واطي", lambda: finish(buzzer(90, 0.35, grit=0.9), verb=(0.5, 0.1))),
    ("ولا حرف: بيب نازل", lambda: finish(mix((0, beep(N(60), 0.12, 0.7, True)), (0.13, beep(N(55), 0.3, 0.7, True))), verb=(0.5, 0.12))),
    ("ولا حرف: ضربة مكتومة", lambda: finish(mix((0, thump(0.35, 120, 45, 1)), (0, beep(N(48), 0.25, 0.4, True))), verb=(0.5, 0.1))),
    ("ولا حرف: نوب إلكتروني", lambda: finish(mix((0, beep(N(57), 0.1, 0.7)), (0.1, beep(N(57), 0.25, 0.7))), verb=(0.5, 0.12))),
    ("ولا حرف: لوحة فاضية", lambda: finish(mix((0, click(1400, 0.8)), (0.05, thump(0.3, 100, 45, 0.7)), (0.05, buzzer(75, 0.3, grit=0.8) * 0.5)), verb=(0.6, 0.12))),
    ("ولا حرف: صفارة خفيفة", lambda: finish(buzzer(140, 0.3, nasal=True, grit=0.7), verb=(0.5, 0.1))),
]
EV["h1"] = [
    ("حرف: رنة لوحة واحدة", lambda: finish(mix((0, click(2400, 0.5)), (0.01, ding(N(79), 0.8))))),
    ("حرف: جرس بلاطة", lambda: finish(mix((0, click(1800, 0.5)), (0.01, glock(N(79), 1.0))))),
    ("حرف: بلينق", lambda: finish(ding(N(81), 0.7, 0.8))),
    ("حرف: كشف بلاطة", lambda: finish(mix((0, whoosh(0.18, 600, 5000, 0.4)), (0.12, ding(N(77), 0.8)), (0.12, thump(0.2, 180, 70, 0.4))))),
    ("حرف: نقطة إلكترونية", lambda: finish(mix((0, beep(N(79), 0.08, 0.7)), (0.08, beep(N(84), 0.2, 0.6))))),
    ("حرف: رنة + نحاس خفيف", lambda: finish(mix((0, ding(N(79), 0.8)), (0, brass([N(67), N(71)], 0.3, g=0.35))))),
]
EV["h2"] = [
    ("حرفين: رنتين صاعدة", lambda: finish(mix((0, ding(N(79), 0.5)), (0.12, ding(N(84), 1.0))))),
    ("حرفين: بلاطتين", lambda: finish(mix((0, click(2200, 0.5)), (0.01, glock(N(79), 0.6)), (0.14, click(2600, 0.5)), (0.15, glock(N(86), 1.0))))),
    ("حرفين: رنتين + ضربة", lambda: finish(mix((0, ding(N(81), 0.5)), (0.12, ding(N(88), 1.0)), (0.12, thump(0.3, 170, 55, 0.7)), (0.12, snare(0.2, 0.35))))),
    ("حرفين: نحاس قصير", lambda: finish(mix((0, brass([N(67), N(71), N(74)], 0.16, g=0.7)), (0.17, brass([N(72), N(76), N(79)], 0.55, g=0.85))))),
    ("حرفين: إلكتروني صاعد", lambda: finish(mix((0, beep(N(76), 0.08, 0.7)), (0.08, beep(N(81), 0.08, 0.7)), (0.16, beep(N(88), 0.3, 0.7)), (0.16, sparkle(0.5, 0.15))))),
    ("حرفين: لمعة", lambda: finish(mix((0, ding(N(84), 0.5)), (0.1, ding(N(91), 0.9)), (0.05, sparkle(0.7, 0.25))))),
]
EV["h3"] = [
    ("الكلمة كاملة: فانفير + تصفيق", lambda: finish(mix((0, ding(C6, 0.4)), (0.1, ding(E6, 0.4)), (0.2, ding(G6, 0.5)), (0.32, brass([C5, E5, G5, C6], 1.1, g=0.9)), (0.32, cymbal(1.6, 0.45)), (0.32, thump(0.4, 160, 50, 0.8)), (0.35, applause(3.0, 0.45))))),
    ("الكلمة كاملة: تا-دا كبيرة", lambda: finish(mix((0, brass([N(60), N(64), N(67)], 0.15, g=0.75)), (0.16, brass([N(60), N(64), N(67)], 0.15, g=0.75)), (0.32, brass([N(65), N(69), N(72), N(77)], 1.2, g=0.95)), (0.32, cymbal(1.8, 0.5)), (0.4, applause(2.6, 0.4))))),
    ("الكلمة كاملة: جاكبوت", lambda: finish(mix((0, ding(G6, 0.3)), (0.06, ding(C6 * 2, 0.3)), (0.12, ding(E6 * 2 / 2, 0.3)), (0.2, sparkle(1.8, 0.4)), (0.2, brass([C5, G5, C6, E6], 1.2, g=0.8)), (0.2, cymbal(1.6, 0.4)), (0.25, applause(2.6, 0.4))))),
    ("الكلمة كاملة: هتاف الجمهور", lambda: finish(mix((0, thump(0.5, 170, 45, 1)), (0, cymbal(2.0, 0.5)), (0, ding(G6, 1.2)), (0.05, applause(3.2, 0.6))))),
    ("الكلمة كاملة: رنات صاعدة + ضربة", lambda: finish(mix((0, ding(C6, 0.3)), (0.08, ding(E6, 0.3)), (0.16, ding(G6, 0.3)), (0.24, ding(C6 * 2, 1.2)), (0.24, thump(0.45, 180, 45, 1)), (0.24, snare(0.25, 0.5)), (0.24, cymbal(1.5, 0.45)), (0.3, applause(2.4, 0.35))))),
    ("الكلمة كاملة: فوز إلكتروني", lambda: finish(mix((0, beep(N(84), 0.07, 0.7)), (0.07, beep(N(88), 0.07, 0.7)), (0.14, beep(N(91), 0.07, 0.7)), (0.21, beep(N(96), 0.5, 0.8)), (0.21, sparkle(1.2, 0.3)), (0.21, thump(0.4, 170, 45, 0.8)), (0.25, applause(2.4, 0.35))))),
]
EV["time"] = [
    ("انتهى الوقت: بوق المسابقات", lambda: finish(mix((0, buzzer(147, 1.3, detune=1.008)), (0, buzzer(220, 1.3, detune=1.006) * 0.6)), verb=(0.7, 0.14))),
    ("انتهى الوقت: 3 بيبات + بوق", lambda: finish(mix((0, beep(N(81), 0.1, 0.7, True)), (0.25, beep(N(81), 0.1, 0.7, True)), (0.5, beep(N(81), 0.1, 0.7, True)), (0.75, buzzer(175, 0.9, detune=1.01))), verb=(0.6, 0.12))),
    ("انتهى الوقت: صفارة طويلة", lambda: finish(buzzer(196, 1.2, nasal=False, detune=1.005), verb=(0.6, 0.12))),
    ("انتهى الوقت: تكتكة ثم بوق", lambda: finish(mix((0, click(3000, 0.8)), (0.2, click(3000, 0.8)), (0.4, click(3000, 0.8)), (0.6, buzzer(130, 1.0, grit=1.2)), (0.6, thump(0.35, 130, 45, 0.8))), verb=(0.6, 0.12))),
    ("انتهى الوقت: إنذار رقمي", lambda: finish(mix(*[(i * 0.14, beep(N(88) if i % 2 == 0 else N(84), 0.12, 0.7, True)) for i in range(8)]), verb=(0.5, 0.1))),
    ("انتهى الوقت: هورن مزدوج", lambda: finish(mix((0, buzzer(165, 0.5, detune=1.01)), (0.6, buzzer(165, 0.9, detune=1.01))), verb=(0.6, 0.12))),
]
EV["pass"] = [
    ("انتقال الدور: سويش + بينق", lambda: finish(mix((0, whoosh(0.35, 500, 5000, 0.6)), (0.25, ding(N(84), 0.5, 0.6) * 0.6)))),
    ("انتقال الدور: سويب إلكتروني", lambda: finish(mix((0, whoosh(0.3, 800, 7000, 0.5)), (0.05, beep(N(79), 0.06, 0.4)), (0.12, beep(N(86), 0.12, 0.4))))),
    ("انتقال الدور: بلاطة تنقلب", lambda: finish(mix((0, click(1600, 0.6)), (0.05, whoosh(0.22, 700, 4000, 0.45)), (0.2, click(2400, 0.6))))),
    ("انتقال الدور: نبضة", lambda: finish(mix((0, thump(0.3, 160, 60, 0.6)), (0, whoosh(0.3, 300, 3000, 0.4))))),
    ("انتقال الدور: دبل بيب", lambda: finish(mix((0, beep(N(76), 0.07, 0.6)), (0.1, beep(N(76), 0.07, 0.6))))),
]
def wheel(d=4.9, f=2600, n=30, end=True, tickfx=None, g=0.9):
    parts = []
    for k in range(n):
        at = d * (1 - (1 - k / n) ** 2.2) - 0.05
        parts.append((max(0, at), (tickfx or (lambda: click(f, g)))()))
    if end: parts.append((d - 0.02, thump(0.3, 160, 60, 0.6)))
    return mix(*parts)
EV["spin"] = [
    ("العجلة: تكتكة المؤشر", lambda: finish(mix((0, whoosh(0.4, 400, 3000, 0.4)), (0, wheel())), verb=(0.6, 0.12))),
    ("العجلة: تكتكة + طبلة صاعدة", lambda: finish(mix((0, wheel(4.9, 2400, 26, False)), (0, mix(*[(4.9 * (1 - (1 - k / 60) ** 1.4), snare(0.12, 0.15 + 0.35 * k / 60)) for k in range(60)]))), verb=(0.7, 0.14))),
    ("العجلة: بيبات اختيار", lambda: finish(wheel(4.9, 0, 24, False, tickfx=lambda: beep(N(84 + rng.integers(0, 5)), 0.05, 0.6)), verb=(0.5, 0.12))),
    ("العجلة: دقات خشب", lambda: finish(mix((0, whoosh(0.4, 300, 2500, 0.4)), (0, wheel(4.9, 1300, 28))), verb=(0.6, 0.12))),
    ("العجلة: طبلة رول وصنج", lambda: finish(mix(*[(k * 0.055, snare(0.1, 0.12 + 0.5 * (k / 88) ** 1.5)) for k in range(88)], (4.85, cymbal(1.2, 0.5)), (4.85, thump(0.4, 150, 45, 0.9))), verb=(0.7, 0.14))),
    ("العجلة: تكتكة مع تشويق", lambda: finish(mix((0, wheel(4.9, 2800, 30, False)), (1.9, riser(3.0, 150, 1500, 0.35))), verb=(0.6, 0.12))),
]
EV["land"] = [
    ("وقوف الاختيار: تا-دا", lambda: finish(mix((0, brass([C5, E5, G5, C6], 0.9, g=0.9)), (0, cymbal(1.3, 0.4)), (0, thump(0.35, 160, 50, 0.8))))),
    ("وقوف الاختيار: رنة + ضربة", lambda: finish(mix((0, ding(G6, 1.1)), (0, thump(0.4, 170, 45, 1)), (0, snare(0.2, 0.4))))),
    ("وقوف الاختيار: صنج وكشف", lambda: finish(mix((0, cymbal(1.8, 0.6)), (0, thump(0.45, 150, 40, 1)), (0.02, glock(C6, 1.2) * 0.6)))),
    ("وقوف الاختيار: كشف لوحة", lambda: finish(mix((0, whoosh(0.25, 600, 6000, 0.5)), (0.18, ding(E6, 1.0)), (0.18, thump(0.3, 170, 60, 0.7)), (0.18, sparkle(0.8, 0.2))))),
    ("وقوف الاختيار: نحاس دبل", lambda: finish(mix((0, brass([N(67), N(71), N(74)], 0.14, g=0.75)), (0.16, brass([N(72), N(76), N(79), N(84)], 0.9, g=0.9)), (0.16, cymbal(1.2, 0.4))))),
    ("وقوف الاختيار: ضربة استوديو", lambda: finish(mix((0, thump(0.5, 190, 40, 1)), (0, snare(0.3, 0.6)), (0, cymbal(1.0, 0.35)), (0, beep(N(84), 0.3, 0.5))))),
]
EV["seg"] = [
    ("بداية الفقرة: ستينجر نحاس", lambda: finish(mix((0, riser(1.34, 200, 2000, 0.35)), (1.15, brass([N(60), N(64), N(67)], 0.15, g=0.8)), (1.32, brass([N(65), N(69), N(72), N(77)], 1.2, g=0.95)), (1.32, cymbal(1.8, 0.5)), (1.32, thump(0.45, 160, 45, 0.9))))),
    ("بداية الفقرة: أضواء الاستوديو", lambda: finish(mix((0, thump(0.6, 120, 35, 1)), (0, whoosh(0.9, 200, 4000, 0.5)), (0.05, cymbal(2.0, 0.4)), (0.05, sparkle(1.4, 0.3)), (0.05, brass([C5, G5, C6], 1.2, g=0.6))))),
    ("بداية الفقرة: طبلة وصنج", lambda: finish(mix(*[(k * 0.05, snare(0.1, 0.15 + 0.45 * k / 30)) for k in range(30)], (1.5, cymbal(2.0, 0.55)), (1.5, thump(0.5, 170, 45, 1)), (1.5, brass([C5, E5, G5, C6], 1.1, g=0.85))))),
    ("بداية الفقرة: نبضات تشويق", lambda: finish(mix((0, heart(1, 0.8)), (0.6, heart(1, 0.8)), (1.2, heart(1, 0.9)), (1.8, thump(0.5, 180, 40, 1)), (1.8, cymbal(1.8, 0.5)), (1.8, ding(C6, 1.4))))),
    ("بداية الفقرة: سويش ورنات", lambda: finish(mix((0, whoosh(0.6, 300, 6000, 0.6)), (0.45, ding(C6, 0.4)), (0.55, ding(E6, 0.4)), (0.65, ding(G6, 1.2)), (0.65, thump(0.4, 170, 50, 0.8)), (0.65, cymbal(1.5, 0.4))))),
    ("بداية الفقرة: تا-دا ثلاثية", lambda: finish(mix((0, brass([N(67), N(71), N(74)], 0.13, g=0.7)), (0.15, brass([N(67), N(71), N(74)], 0.13, g=0.7)), (0.3, brass([N(67), N(71), N(74)], 0.13, g=0.7)), (0.46, brass([N(72), N(76), N(79), N(84)], 1.2, g=0.95)), (0.46, cymbal(1.8, 0.5)), (0.46, thump(0.45, 160, 45, 0.9))))),
]
EV["round"] = [
    ("فوز الجولة: فانفير + تصفيق", lambda: finish(mix((0, brass([N(60), N(64), N(67)], 0.15, g=0.75)), (0.16, brass([N(62), N(65), N(69)], 0.15, g=0.75)), (0.32, brass([N(64), N(67), N(72), N(76)], 1.4, g=0.95)), (0.32, cymbal(2.0, 0.5)), (0.32, thump(0.5, 160, 45, 0.9)), (0.35, applause(3.3, 0.55))))),
    ("فوز الجولة: هتاف وتصفيق", lambda: finish(mix((0, thump(0.5, 170, 45, 1)), (0, cymbal(2.0, 0.5)), (0, ding(C6, 0.4)), (0.1, ding(G6, 1.2)), (0.05, applause(3.5, 0.7))))),
    ("فوز الجولة: جاكبوت", lambda: finish(mix((0, sparkle(2.2, 0.45)), (0, brass([C5, E5, G5, C6], 1.4, g=0.85)), (0, cymbal(2.0, 0.45)), (0, thump(0.5, 170, 45, 0.9)), (0.1, applause(3.3, 0.5))))),
    ("فوز الجولة: رنات وطبول", lambda: finish(mix(*[(k * 0.045, snare(0.1, 0.15 + 0.4 * k / 18)) for k in range(18)], (0.8, ding(C6, 0.3)), (0.88, ding(E6, 0.3)), (0.96, ding(G6, 1.4)), (0.8, cymbal(2.0, 0.55)), (0.8, thump(0.5, 170, 45, 1)), (0.85, applause(2.8, 0.5))))),
    ("فوز الجولة: تا-دا كبيرة", lambda: finish(mix((0, brass([N(65), N(69), N(72)], 0.15, g=0.75)), (0.16, brass([N(65), N(69), N(72)], 0.15, g=0.75)), (0.32, brass([N(70), N(74), N(77), N(82)], 1.4, g=0.95)), (0.32, cymbal(2.0, 0.5)), (0.4, applause(3.0, 0.5))))),
    ("فوز الجولة: تصفيق الاستوديو", lambda: finish(mix((0, thump(0.45, 160, 45, 0.8)), (0, ding(G6, 1.0)), (0, applause(3.6, 0.85))))),
]

# تسجيلات مسابقات حقيقية من Mixkit (رخصة Mixkit المجانية، بدون نسب) تنضاف بعد المولّدة بنفس القسم
MIXKIT = {
 "bad": [(3219, "غلط مسابقات (تسجيل)"), (3159, "غلط ميكانيكي (تسجيل)")],
 "strike": [(3219, "استرايك مسابقات (تسجيل)"), (3090, "بزر المسابقات (تسجيل)")],
 "time": [(921, "عد تنازلي مسابقات (تسجيل)"), (916, "بيبات ساعة العد (تسجيل)")],
 "land": [(960, "كشف بلاطة (تسجيل)"), (961, "كشف مسابقات (تسجيل)")],
 "seg": [(228, "طبول دخول الفقرة (تسجيل)"), (960, "كشف لوحة (تسجيل)")],
 "spin": [(1998, "عدّاد النقاط (تسجيل)")],
 "h1": [(958, "كشف مكافأة (تسجيل)")],
 "h3": [(1995, "جرس الجائزة (تسجيل)")],
}
def mixkit(i, dur):
    import urllib.request
    p = os.path.join(os.environ.get("TMPDIR", "/tmp"), "gs_mk_%d.mp3" % i)
    if not os.path.exists(p) or os.path.getsize(p) < 1000:
        req = urllib.request.Request("https://assets.mixkit.co/active_storage/sfx/%d/%d-preview.mp3" % (i, i), headers={"User-Agent": "Mozilla/5.0"})
        open(p, "wb").write(urllib.request.urlopen(req, timeout=30).read())
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(float)
    a = np.abs(x); st = np.argmax(a > a.max() * 0.02); x = x[max(0, st - 40):][:int(dur * SR)]
    return finish(x, verb=None, tail=0.25)
MAXDUR = {"spin": 5.0, "seg": 3.6, "round": 3.6, "h3": 3.2, "time": 2.4, "land": 2.6}

def save(x, path):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-b:a", "112k", path], input=pcm, check=True)

cat_src = open(CATJS, encoding="utf-8").read()
cat = json.loads(re.search(r"const SFX_SAMPLES = (\{.*\});", cat_src, re.S).group(1))
for ev, lst in EV.items():
    cat[ev] = [e for e in cat.get(ev, []) if not (len(e) > 2 and e[2] == "G")]
    for i, (label, fn) in enumerate(lst):
        n = FIRST + i
        save(fn(), os.path.join(AUDIO, "sx_%s_%d.mp3" % (ev, n)))
        cat[ev].append([n, label, "G"])
    for j, (mid, label) in enumerate(MIXKIT.get(ev, [])):
        n = FIRST + len(lst) + j
        try: save(mixkit(mid, MAXDUR.get(ev, 2.0)), os.path.join(AUDIO, "sx_%s_%d.mp3" % (ev, n)))
        except Exception as e: print("skip", mid, e); continue
        cat[ev].append([n, label, "G"])
    print(ev, len(cat[ev]), flush=True)
head = cat_src[:cat_src.index("const SFX_SAMPLES")]
open(CATJS, "w", encoding="utf-8").write(head + "const SFX_SAMPLES = " + json.dumps(cat, ensure_ascii=False) + ";\n")
