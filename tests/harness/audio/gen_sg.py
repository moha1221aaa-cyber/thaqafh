"""يولّد مؤثرات أزرار فقرتي الحروف والكلمات (audio/sg_*.mp3) بدون أي مكتبة خارجية: numpy + ffmpeg.
   طلب محمد (10 نوفمبر 2026): كل زر صوت مختلف، وأزرار الفقرة 3 سلم صاعد (يزيد التردد والحماس): حرف صحيح هادي ومنخفض، حرفين أعلى وحماسي، ثلاث حروف الأقوى.
   الأصوات ضربات نحاسية قصيرة (stabs) بدايتها من الصفر بدون قطع، وعليها صدى خفيف.
   تشغيل:  python3 tests/harness/audio/gen_sg.py   (يكتب في audio/) """
import subprocess, os, numpy as np
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "audio")
rng = np.random.default_rng(7)

def env(n, a=0.004, d=0.35, hold=0.0):
    t = np.arange(n) / SR
    e = np.minimum(t / a, 1.0) * np.where(t < a + hold, 1.0, np.exp(-(t - a - hold) / d))
    return e

def stab(f, dur, bright=6.0, decay=0.28, voices=(0.0, 0.0035, -0.0035), hold=0.0):
    """نغمة نحاسية: موجة منشارية بأكثر من صوت (detune) وفلتر ينفتح ويقفل بسرعة"""
    n = int(SR * dur); t = np.arange(n) / SR
    cut = f * (1.5 + bright * np.exp(-t / 0.09))
    y = np.zeros(n)
    H = int(min(30, (SR / 2 - 200) / f))
    for dv in voices:
        ff = f * (1 + dv)
        for h in range(1, H + 1):
            w = (1.0 / h) / (1.0 + (h * ff / cut) ** 4)
            y += w * np.sin(2 * np.pi * h * ff * t + h * 0.3)
    y *= env(n, 0.004, decay, hold) / len(voices)
    return y

def place(buf, y, at):
    i = int(at * SR); buf[i:i + len(y)] += y[:len(buf) - i]

def thump(f0, f1, dur, vol=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.08)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return vol * np.sin(ph) * env(n, 0.002, dur / 4)

def noise_burst(dur, lp=2500, vol=0.5, d=0.05):
    n = int(SR * dur); x = rng.standard_normal(n)
    k = np.exp(-np.arange(200) / (SR / lp / 2)); k /= k.sum()
    x = np.convolve(x, k, mode="same")
    return vol * x * env(n, 0.001, d)

def shimmer(dur, vol=0.25):
    """تلميع صاعد (ضجيج مفلتر يطلع تردده)"""
    n = int(SR * dur); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    f = 2500 + 6000 * (t / dur)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * x
    return vol * y * env(n, 0.05, dur / 2.5)

def write(name, y, peak_db):
    y = np.asarray(y, dtype=np.float64)
    y = np.tanh(y * 1.2)
    y /= np.abs(y).max() + 1e-9
    y *= 10 ** (peak_db / 20)
    raw = (y * 32767).astype("<i2").tobytes()
    tmp = os.path.join(OUT, "_t.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-af",
                    "aecho=0.9:0.85:55|110:0.25|0.14,alimiter=limit=0.95,afade=t=out:st=%f:d=0.15" % max(0, len(y) / SR - 0.15), "-b:a", "128k", os.path.join(OUT, name + ".mp3")],
                   input=raw, check=True)

# ولا حرف: ضربة واطية جافة (تنزل)، ما فيها نغمة صاعدة
n = int(SR * 0.7); b = np.zeros(n)
place(b, thump(150, 55, 0.6, 1.0), 0); place(b, noise_burst(0.12, 900, 0.5, 0.05), 0)
write("sg_miss", b, -3.5)
# استرايك: صفارة خطأ خشنة مختلفة تماماً (موجة مربعة ثقيلة متقطعة) + ضربة
n = int(SR * 0.95); t = np.arange(n) / SR; b = np.zeros(n)
sq = np.sign(np.sin(2 * np.pi * 110 * t)) + 0.8 * np.sign(np.sin(2 * np.pi * 117 * t))
gate = (np.sin(2 * np.pi * 9 * t) > -0.2).astype(float)
b += 0.55 * sq * gate * env(n, 0.003, 0.5, 0.35)
place(b, thump(120, 45, 0.5, 0.9), 0)
write("sg_strike", b, -0.8)
# حرف صحيح: نغمة وحدة واطية وهادية (صول 4)
n = int(SR * 0.7); b = np.zeros(n)
place(b, stab(392.0, 0.65, bright=2.5, decay=0.2), 0); place(b, stab(196.0, 0.5, bright=1.5, decay=0.18) * 0.5, 0)
write("sg_h1", b, -7)
# حرفين صحيحة: نغمتين تصعدان وأحد وأحمس (دو 5 ← صول 5)
n = int(SR * 1.15); b = np.zeros(n)
place(b, stab(523.25, 0.4, bright=6, decay=0.16), 0.0); place(b, stab(783.99, 0.8, bright=8, decay=0.3), 0.15)
place(b, thump(110, 70, 0.3, 0.35), 0.15); place(b, shimmer(0.7, 0.05), 0.15)
write("sg_h2", b, -3)
# ثلاث حروف صحيحة: سلم صاعد أسرع لين وتر نهائي عالي + ضربة وتلميع = الأقوى
n = int(SR * 2.1); b = np.zeros(n)
for i, f in enumerate([523.25, 659.25, 783.99]):
    place(b, stab(f, 0.3, bright=8, decay=0.12), i * 0.1)
for f in (1046.5, 783.99, 659.25, 523.25):
    place(b, stab(f, 1.6, bright=10, decay=0.55, hold=0.25) * (1.0 if f > 1000 else 0.7), 0.32)
place(b, thump(130, 48, 0.6, 0.9), 0.32); place(b, noise_burst(0.3, 5000, 0.2, 0.1), 0.32); place(b, shimmer(1.3, 0.08), 0.32)
write("sg_h3", b, -0.5)
# جواب صح (الأسئلة وفقرة الحروف): وتر قصير نظيف بداية حادة من الصفر وبدون رنين
n = int(SR * 0.95); b = np.zeros(n)
for f in (261.63, 329.63, 392.0):
    place(b, stab(f, 0.9, bright=5, decay=0.22, hold=0.06), 0.0)
place(b, stab(523.25, 0.7, bright=6, decay=0.18), 0.0) 
place(b, thump(140, 80, 0.25, 0.4), 0.0)
write("sg_ok", b, -2)
print("done")
