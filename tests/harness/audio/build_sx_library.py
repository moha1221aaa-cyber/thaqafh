"""مكتبة أصوات البث الكبيرة (طلب محمد 10 نوفمبر: أكثر من 50 صوت لكل زر، من مكتبات مختلفة، احترافية وبدون موسيقى):
   يختار لكل حدث ~40 عينة من حزم Sonniss GDC Game Audio Bundle (تسجيلات استوديو من عشرات الشركات، منسوخة في archive.org)
   ويضيفها لعينات Mixkit (build_sx_samples.py) والأنماط المولّدة (gen_sx.py): audio/sx_<حدث>_<رقم>.mp3 ويحدّث js/sfx-catalog.js.
   الفلترة: اسم الملف (يستبعد الموسيقى والنغمات والأجراس والكلام) ← مدة مناسبة للحدث ← تحليل الصوت (بدون قص/تشبع، بداية فورية، بدون نغمة ثابتة عالية)
   ← حد أقصى لكل حزمة عشان التنوع. كل عينة تتقص بدون صمت البداية وتتضبط قوتها (peak) وتتلاشى بالنهاية.
   الرخصة: Sonniss GDC bundles مجانية للاستخدام التجاري بدون نسب (audio/SX-CREDITS.txt).  تشغيل: python3 tests/harness/audio/build_sx_library.py [عدد لكل حدث] """
import os, re, sys, json, random, subprocess, urllib.parse, urllib.request, collections
from concurrent.futures import ThreadPoolExecutor
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..", "..", "..")
AUDIO = os.path.join(ROOT, "audio"); CATJS = os.path.join(ROOT, "js", "sfx-catalog.js")
TMP = os.path.join(os.environ.get("TMPDIR", "/tmp"), "sx_lib"); os.makedirs(TMP, exist_ok=True)
PER_EVENT = int(sys.argv[1]) if len(sys.argv) > 1 else 40
SR = 22050
BUNDLES = ["sonniss-gdc-2015-game-audio-bundle-normalized", "sonniss-gdc-2016-game-audio-bundle-normalized", "sonniss-gdc-2017-game-audio-bundle-normalized",
           "sonniss-gdc-2018-game-audio-bundle-normalized", "sonniss-gdc-2019-game-audio-bundle-normalized", "sonniss-gdc-2020-game-audio-bundle-normalized",
           "sonniss-gdc-2023-game-audio-bundle-normalized", "sonniss-gdc-2024-game-audio-bundle-normalized", "sonniss-gdc-2026-game-audio-bundle-normalized"]
BAD = re.compile(r"music|melod|chord|piano|guitar|violin|cello|string|harp|bell|chime|xylo|marimba|ukulele|banjo|choir|vocal|voice|song|jingle|ambien|drone|\bpad\b|tonal|\bnote\b|keyboard|organ|flute|trumpet|brass|speech|dialog|talk|scream|laugh|walla|moan|breath|cough|animal|bird|dog|cat\b|horse|insect|water|rain|wind\b|engine|car\b|vehicle|footstep|gun|shot|weapon|monster|creature|zombie|horror|scary|pain|death|die\b|kill|blood|gore", re.I)
# حدث: (regex مطلوب، أقل مدة، أكبر مدة، أقصى مركز طيفي أو None، أقل مركز طيفي، يسمح بنغمة ثابتة، مدة القص، peak dB)
EV = {
 "miss":  (r"thud|dull|drop|punch|knock|body|heavy hit|low hit|impact|kick|slam|bump|deflate|fall", 0.25, 2.5, 1400, 0, False, 1.9, -3),
 "h1":    (r"click|tap|pop|snap|knock|small|light|soft|tick|slap|clap|coin|clink|ping|knob|button|switch|latch|hit", 0.12, 1.4, None, 700, False, 1.5, -8),
 "h2":    (r"hit|impact|slap|snare|stinger|stab|clap|smack|thwack|crack|whoosh.?hit|strike|swish.?hit|metal|glass", 0.3, 2.6, None, 400, False, 2.0, -4),
 "h3":    (r"cinematic|boom|epic|big|huge|slam|explosion|impact|hit|stinger|reveal|trailer|massive|sub", 1.2, 6.0, None, 0, False, 3.2, -1),
 "strike":(r"buzz|error|fail|alarm|glitch|denied|reject|invalid|clang|hammer|shock|static|bad|wrong|negative|harsh|electric|zap", 0.3, 2.8, None, 300, True, 2.0, -1),
 "ok":    (r"coin|pick|collect|confirm|success|snap|pop|click|clink|reward|swish|slap|tap|spark|cash|register|drop", 0.2, 1.8, None, 600, False, 1.7, -3),
 "bad":   (r"fail|fall|drop|deflate|power.?down|shut|denied|descend|down|sad|thud|error|negative|glitch|wobble", 0.5, 3.2, None, 0, True, 2.3, -3),
 "time":  (r"alarm|siren|horn|whistle|gong|klaxon|buzzer|timer|clock|countdown|beep|ring", 0.6, 3.2, None, 300, True, 2.3, -1.5),
 "pass":  (r"whoosh|whsh|swish|swipe|flyby|fly.?by|pass.?by|swoosh|sweep|air", 0.2, 1.6, None, 0, False, 1.2, -9),
 "spin":  (r"riser|rise|build|swell|tension|sweep|tick|clock|spin|rotat|whir|turbine|accelerat|rev\b|countdown|loop", 3.4, 12, None, 0, True, 4.95, -3),
 "land":  (r"impact|slam|boom|hit|thud|stomp|crash|explosion|drum|timpani|cinematic|heavy", 0.8, 4.5, None, 0, False, 2.6, -1.5),
 "seg":   (r"transition|whoosh|stinger|reveal|logo|intro|sweep|impact|cinematic|riser|hit", 1.5, 6.0, None, 0, False, 3.6, -2),
 "round": (r"crowd|applaus|cheer|clap|audience|ovation|firework|celebrat|confetti|party|cannon|epic|big|win|victory", 1.5, 9.0, None, 0, False, 3.6, -1.5),
}
EXTRA_OK = {"round": r"crowd|applaus|cheer|clap|audience|ovation|walla|party"}   # كلمات تتجاوز فلتر الاستبعاد في الحدث
LABEL_AR = [(r"whoosh|whsh|swish|swoosh|flyby|pass.?by|swipe|sweep|air", "سويش"), (r"riser|rise|build|swell|tension", "تصاعد"), (r"clock|tick|timer|countdown", "تكتكة"),
            (r"alarm|siren|horn|whistle|klaxon|gong|beep|buzz", "صفارة"), (r"error|fail|denied|reject|glitch|wrong|negative", "خطأ"), (r"crowd|applaus|cheer|clap|audience|ovation", "جمهور"),
            (r"firework|confetti|party|cannon|celebrat", "احتفال"), (r"coin|clink|cash|pick|collect", "عملات"), (r"click|tap|knock|snap|pop|button|switch|latch", "نقرة"),
            (r"explosion|boom|sub|slam|stomp|crash|thud", "ضربة ثقيلة"), (r"stinger|reveal|logo|intro|transition|cinematic|trailer", "سينمائي"), (r"metal|clang|hammer|glass", "معدن وزجاج"),
            (r"impact|hit|punch|smack|slap|stab|strike", "ضربة")]

def meta(id):
    p = os.path.join(TMP, "meta_%s.json" % id)
    if not os.path.exists(p):
        req = urllib.request.Request("https://archive.org/metadata/" + id, headers={"User-Agent": "Mozilla/5.0"})
        open(p, "wb").write(urllib.request.urlopen(req, timeout=120).read())
    return json.load(open(p))
def dl(id, name):
    p = os.path.join(TMP, "dl", re.sub(r"[^\w.]+", "_", id[-12:] + "_" + name.rsplit("/", 1)[-1])[:150])
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if not os.path.exists(p) or os.path.getsize(p) < 500:
        url = "https://archive.org/download/%s/%s" % (id, urllib.parse.quote(name))
        for t in range(3):
            try: open(p, "wb").write(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()); break
            except Exception: p = None if t == 2 else p
    return p
def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)
def trim_head(a, db=-45):
    if not len(a): return a
    th = 10 ** (db / 20) * max(1e-9, np.abs(a).max()); idx = np.where(np.abs(a) > th)[0]
    return a[idx[0]:idx[-1] + 1] if len(idx) else a[:0]
def tonal(a):
    n = 1024; fr = []
    for i in range(0, min(len(a) - n, SR * 4), 512):
        s = np.abs(np.fft.rfft(a[i:i + n] * np.hanning(n))) ** 2
        if s.sum() < 1e-7 * n: continue
        pk = np.argmax(s[4:]) + 4; fr.append((s[pk] / s.sum(), pk))
    if len(fr) < 3: return 0.0, 0.0
    dom = np.array([x[0] for x in fr]); pk = np.array([x[1] for x in fr])
    return float(np.mean(dom > 0.3)), float(np.mean(np.abs(np.diff(pk)) <= 1))
def analyze(path):
    a = trim_head(load(path))
    if len(a) < SR * 0.1: return None
    pk = float(np.abs(a).max()); clip = float(np.mean(np.abs(a) >= 0.985))
    S = np.abs(np.fft.rfft(a * np.hanning(len(a)))); f = np.fft.rfftfreq(len(a), 1 / SR); cen = float((S * f).sum() / max(S.sum(), 1e-9))
    ton, stab = tonal(a); head = float(np.sqrt(np.mean(a[:int(SR * 0.08)] ** 2)) / max(np.sqrt(np.mean(a ** 2)), 1e-9))
    return dict(dur=len(a) / SR, pk=pk, clip=clip, cen=cen, ton=ton, stab=stab, head=head)
def peak_db(path):
    r = subprocess.run(["ffmpeg", "-i", path, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"max_volume: (-?[\d.]+) dB", r); return float(m.group(1)) if m else 0.0

# 1) الفهرس
files = {}
for b in BUNDLES:
    try: d = meta(b)
    except Exception as e: print("skip bundle", b, e); continue
    for x in d.get("files", []):
        nm = x["name"]
        if not nm.lower().endswith(".mp3") or x.get("source") != "derivative": continue
        try: secs = sum(float(v) * 60 ** i for i, v in enumerate(reversed(x["length"].split(":"))))
        except Exception: continue
        base = nm.rsplit("/", 1)[-1].lower()
        if base in files: continue
        parts = nm.split("/"); pack = parts[-2] if len(parts) > 1 else b
        files[base] = (b, nm, secs, pack)
print("catalog", len(files), flush=True)
rng = random.Random(20261110)
# 2) مرشحين لكل حدث
cands = {}
for ev, (rx, dmin, dmax, cmax, cmin, tonal_ok, cut, pk) in EV.items():
    pat = re.compile(rx, re.I); ok = []
    for base, (b, nm, secs, pack) in files.items():
        if not (dmin <= secs <= max(dmax, dmin) + 6 if ev in ("spin",) else dmin * 0.8 <= secs <= dmax + 3): continue
        text = nm.rsplit("/", 1)[-1] + " " + pack
        if BAD.search(text) and not (ev in EXTRA_OK and re.search(EXTRA_OK[ev], text, re.I)): continue
        if not pat.search(text): continue
        ok.append((b, nm, secs, pack))
    rng.shuffle(ok); cands[ev] = ok[:PER_EVENT * 5]
    print(ev, "candidates", len(ok), "->", len(cands[ev]), flush=True)
# 3) تحليل (تنزيل + قياس) بالتوازي
allc = {(b, nm): None for ev in cands for (b, nm, s, p) in cands[ev]}
def work(k):
    p = dl(*k)
    try: return k, (p, analyze(p) if p else None)
    except Exception: return k, (p, None)
with ThreadPoolExecutor(10) as ex:
    for i, (k, v) in enumerate(ex.map(work, list(allc))):
        allc[k] = v
        if i % 200 == 0: print("analyzed", i, "/", len(allc), flush=True)
# 4) انتقاء + معالجة
cat = {}; txt = open(CATJS, encoding="utf-8").read(); m = re.search(r"const SFX_SAMPLES = (\{.*\});", txt, re.S)
old = json.loads(m.group(1)); cat = {ev: [e for e in old.get(ev, []) if len(e) < 3] for ev in EV}    # يبقي Mixkit فقط ويعيد بناء Sonniss
for ev in EV:
    for fn in os.listdir(AUDIO):
        pass
used_credit = collections.Counter()
for ev, (rx, dmin, dmax, cmax, cmin, tonal_ok, cut, pk) in EV.items():
    n = max([e[0] for e in cat[ev]] + [6]) + 1
    # امسح ملفات Sonniss القديمة لهذا الحدث (أكبر من آخر Mixkit)
    keep = max([e[0] for e in cat[ev]] + [6])
    for fn in os.listdir(AUDIO):
        mm = re.match(r"sx_%s_(\d+)\.mp3$" % ev, fn)
        if mm and int(mm.group(1)) > keep: os.remove(os.path.join(AUDIO, fn))
    chosen = []; per_pack = collections.Counter(); per_stem = set()
    for (b, nm, secs, pack) in cands[ev]:
        p, f = allc[(b, nm)]
        if not p or not f: continue
        if f["clip"] > 0.004 or f["pk"] < 0.05: continue
        if f["dur"] < dmin * 0.7: continue
        if cmax and f["cen"] > cmax: continue
        if f["cen"] < cmin: continue
        if not tonal_ok and f["ton"] > 0.75 and f["stab"] > 0.88 and f["cen"] > 700: continue
        if ev in ("h1", "h2", "miss", "land", "h3", "ok", "pass") and f["head"] < 0.35: continue   # بداية فورية
        stem = re.sub(r"[\d_\- ]+", "", nm.rsplit("/", 1)[-1].lower())[:24]
        if per_pack[pack] >= 3 or stem in per_stem: continue
        per_pack[pack] += 1; per_stem.add(stem); chosen.append((b, nm, pack, p, f))
        if len(chosen) >= PER_EVENT: break
    for (b, nm, pack, p, f) in chosen:
        tmp = os.path.join(TMP, "cut.wav"); out = os.path.join(AUDIO, "sx_%s_%d.mp3" % (ev, n))
        dur = min(cut, f["dur"])
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", p, "-af", "silenceremove=start_periods=1:start_threshold=-45dB", "-t", "%.2f" % dur, "-ac", "1", "-ar", "44100", tmp], check=True)
        gain = pk - peak_db(tmp); fo = max(0.0, dur - 0.25)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-af", "volume=%.2fdB,alimiter=limit=0.95,afade=t=out:st=%.2f:d=0.25" % (gain, fo), "-b:a", "96k", out], check=True)
        text = nm.rsplit("/", 1)[-1] + " " + pack
        ar = next((lab for r, lab in LABEL_AR if re.search(r, text, re.I)), "مؤثر")
        lib = re.sub(r"\s+", " ", pack.split(" - ")[0])[:18]
        cat[ev].append([n, "%s · %s" % (ar, lib), "S"]); used_credit[pack] += 1; n += 1
    print(ev, "total", len(cat[ev]), flush=True)
open(CATJS, "w", encoding="utf-8").write("/* قائمة عينات أصوات البث (يولّدها build_sx_samples.py ثم build_sx_library.py): [الرقم، الاسم، S لعينات Sonniss] لكل حدث. الأرقام 1 إلى 6 المولّدة (SFX_STYLES) */\nconst SFX_SAMPLES = " + json.dumps(cat, ensure_ascii=False) + ";\n")
cr = open(os.path.join(AUDIO, "SX-CREDITS.txt"), encoding="utf-8").read().split("\n\n== Sonniss")[0].rstrip()
open(os.path.join(AUDIO, "SX-CREDITS.txt"), "w", encoding="utf-8").write(cr + "\n\n== Sonniss GDC Game Audio Bundle (2015 إلى 2026، عبر archive.org) ==\nتسجيلات استوديو من حزم شركات مختلفة، مجانية للاستخدام التجاري بدون نسب (Sonniss GDC Game Audio Bundle license)، وبدون إعادة بيعها كمكتبة أصوات. اتضبط مستواها وقُصّت.\nالحزم المستخدمة (" + str(len(used_credit)) + "): " + "; ".join("%s (%d)" % (k, v) for k, v in sorted(used_credit.items())) + "\n")
