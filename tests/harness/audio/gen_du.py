"""صوت خلفية الفقرة الرابعة "ضد وند" (10 نوفمبر 2026، محمد: "خلفية تعطي جو التوتر والتخمين، بدون موسيقى"):
   audio/du_bed.mp3 حلقة 24 ث تتكرر بدون قطع: همهمة واطية (ضجة مفلترة تتموج)، ونبض قلب هادي (60 بالدقيقة)،
   وتكتكة ساعة خفيفة بين النبضات، وانتفاخ هواء واطي كل 8 ث. ما فيه أي نغمة أو لحن.
   تشغيل: python3 tests/harness/audio/gen_du.py  (numpy + ffmpeg)"""
import os, subprocess
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); AUDIO = os.path.join(HERE, "..", "..", "..", "audio")
SR = 44100; L = 24.0; N = int(L * SR)
rng = np.random.default_rng(11)
t = np.arange(N) / SR

def onepole_lp(x, f):
    k = 1 - np.exp(-2 * np.pi * f / SR); y = np.zeros_like(x); z = 0.0
    for i in range(len(x)): z += k * (x[i] - z); y[i] = z
    return y
def circ(x):   # حلقة: آخر 1.5 ث يندمج في أول 1.5 ث فما فيه قطع عند التكرار
    f = int(1.5 * SR); y = x[:N].copy(); tail = x[N:N + f]
    w = np.linspace(0, 1, f); y[:f] = y[:f] * w + tail * (1 - w)
    return y

# 1) همهمة واطية تتموج (ضجة مفلترة مرتين ~90Hz، ومستواها يتنفس كل 6 ث)
nz = rng.standard_normal(N + int(1.5 * SR))
rum = onepole_lp(onepole_lp(nz, 90), 90)
rum = circ(rum); rum /= np.max(np.abs(rum))
rum *= 0.55 + 0.25 * np.sin(2 * np.pi * t / 6.0)
# 2) نبض قلب (لب-دب) كل ثانية
def thump(d, f0, f1):
    tt = np.arange(int(d * SR)) / SR; f = f1 + (f0 - f1) * np.exp(-tt / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (d * 0.28)) * np.minimum(1, tt / 0.003)
heart = np.zeros(N)
for b in range(int(L)):
    for off, g in ((0.0, 1.0), (0.24, 0.7)):
        x = thump(0.25, 85, 42) * g; i = int((b + off) * SR); n = min(len(x), N - i); heart[i:i + n] += x[:n]
# 3) تكتكة ساعة خفيفة في نص الثانية
tick = np.zeros(N)
for b in range(int(L)):
    tt = np.arange(int(0.025 * SR)) / SR
    x = rng.standard_normal(len(tt)) * np.exp(-tt / 0.003)
    x = x - onepole_lp(x, 2500)   # يخلي التكة حادة وصغيرة
    i = int((b + 0.5) * SR); tick[i:i + len(x)] += x
tick /= np.max(np.abs(tick)) + 1e-9
# 4) انتفاخ هواء واطي كل 8 ث (يطلع وينزل)
sw = np.zeros(N)
for s0 in (2.0, 10.0, 18.0):
    d = 3.5; tt = np.arange(int(d * SR)) / SR
    x = onepole_lp(rng.standard_normal(len(tt)), 400) * np.sin(np.pi * tt / d) ** 2
    i = int(s0 * SR); sw[i:i + len(x)] += x / (np.max(np.abs(x)) + 1e-9)
mix = rum * 0.5 + heart * 0.55 + tick * 0.07 + sw * 0.18
mix /= np.max(np.abs(mix)); mix *= 0.8
pcm = (mix * 32767).astype(np.int16).tobytes()
out = os.path.join(AUDIO, "du_bed.mp3")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-b:a", "80k", out], input=pcm, check=True)
print("ok", out)
