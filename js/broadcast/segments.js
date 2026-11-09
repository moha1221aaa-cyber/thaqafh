/* فقرات المواجهة (9 نوفمبر 2026، طلب محمد): كل مواجهة 3 فقرات ورا بعض
   1) الأسئلة بالجرس (5 جولات، الكود القديم في engine.js و screen.js)
   2) عجلة الحروف (3 جولات): عجلة تصنيفات (قابلة للزيادة) ← عجلة حروف ← كل متسابق بدوره يذكر من التصنيف بالحرف.
      اللي ينتهي وقته أو يغلط يخسر الجولة والثاني ياخذ النقطة
   3) خمّن الكلمة (3 جولات): عجلة نوع الكلمة ← الكلمة تطلع للمقدم بس ← المتسابقين بالدور يخمّنون، والنظام يحسب
      "كم حرف صحيح في مكانه وكم حرف صحيح بمكان غلط". 3 استرايك = خسارة الجولة
   قرار محمد: إذا انتهى الوقت ما ينتقل شي لحاله، المقدم هو اللي يقرر صح أو خطأ (الوقت يظهر بس).
   النقاط تنضاف لنفس نقاط الأسئلة (s1 و s2)، وd.sp فيها تفصيل كل فقرة للنتيجة.
   الحالة في وثيقة البث: d.seg (1 الأسئلة، 2، 3) و d.phase "s2" أو "s3" و d.sg (حالة الجولة الحالية، المنظم بس يكتبها).
   الكلمة السرية ما تنكتب في الوثيقة العامة: liveSecrets/seg_<id> (المنظم بس)، وتنكشف في sg.reveal لما تنتهي الجولة.
   كل أزرار المقدم في لوحة تحت الشاشة (#sgDock) خارج الرسم الجزئي، فخانة التخمين ما تنمسح مع تحديثات الشاشة. */
const SG_ROUNDS = 3;
const SG_TURN2_MS = 10000;   /* وقت كل دور في فقرة الحروف */
const SG_TURN3_MS = 10000;   /* وقت كل دور في فقرة الكلمات (طلب محمد 9 نوفمبر: 10 ث) */
const SG_LEN = 3;            /* الكلمة دايم 3 حروف */
let SG_SPIN_MS = 4800;       /* مدة لفة العجلة (let: الاختبار يقصرها) */
const SG_STRIKES = 3;
const SG_CATS2 = ["أكلات", "مدن", "دول", "جمادات", "حيوانات", "نباتات", "أسماء أندية"];
const SG_CATS3 = ["اسم إنسان", "اسم حيوان", "جماد", "فعل", "كلمات معنوية أو أخرى"];
const SG_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
const SG_WORDS = {
    "اسم إنسان": ["علي", "عمر", "سعد", "فهد", "ريم", "منى", "هند", "نوف", "هدى", "نور", "جود", "لين", "رند", "سما", "ياسر", "وعد", "ضحى", "سلا", "غيد", "لمى", "حمد", "زيد", "أحمد"],
    "اسم حيوان": ["أسد", "نمر", "ذئب", "فيل", "قرد", "ضبع", "جمل", "كلب", "فأر", "صقر", "نسر", "ديك", "حوت", "وعل", "ظبي", "نمل", "نحل", "بط", "غنم", "ثور", "حمل", "بوم", "قطه", "هرة", "فرس", "بغل", "دجاج", "ضفدع"],
    "جماد": ["باب", "قلم", "مقص", "صحن", "كوب", "سقف", "ثوب", "حجر", "طبق", "حبل", "سلم", "لوح", "قدر", "ورق", "كأس", "بيت", "كيس", "سيف", "مرآة", "شمع", "سجاد", "علم", "رمح", "عصا", "قفل", "دلو", "جرس", "نار", "مال", "ساعة", "كتاب"],
    "فعل": ["كتب", "أكل", "شرب", "ركض", "قفز", "جلس", "نام", "لعب", "فتح", "غسل", "سمع", "رمى", "مشى", "بكى", "ضحك", "وقف", "سبح", "رسم", "قرأ", "طبخ", "خرج", "دخل", "حمل", "كسر", "نظر", "قفل", "سقط", "صعد", "نزل", "طار", "ذهب", "جاء", "أخذ"],
    "كلمات معنوية أو أخرى": ["حلم", "أمل", "صبر", "عدل", "كرم", "صدق", "فرح", "حزن", "خوف", "غضب", "شوق", "ألم", "علم", "عقل", "وقت", "زمن", "قدر", "ثقة", "حظ", "سر", "حب", "أمن", "سلم", "نور", "ظل", "شك", "عزم", "هدف", "رأي"]
};
/* الكلمة دايم 3 حروف: أي كلمة بغير هالطول تنشال */
Object.keys(SG_WORDS).forEach(k => { SG_WORDS[k] = SG_WORDS[k].filter(w => sgNorm(w).length === SG_LEN); });
const SG = { words: {}, secTried: {}, prevKey: "", prevSnap: null, wheelAt: 0, lastSec: -1, dockSig: "" };

/* ===== أدوات صافية (تنختبر بدون واجهة) ===== */
/* نفس الحرف بدون تشكيل: أ إ آ ← ا، ى ← ي، ة ← ه، ؤ ← و، ئ ← ي. وكل غير الحروف العربية ينشال */
function sgNorm(s) {
    return String(s || "").replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
        .replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[^ء-غف-ي]/g, "");
}
function sgLS(k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    return null;
}
function sgCats2() {
    const l = sgLS("sg_cats2");
    const ok = Array.isArray(l) ? l.filter(x => typeof x === "string" && x.trim()).slice(0, 40) : [];
    return ok.length >= 2 ? ok : SG_CATS2.slice();
}
function sgOther(n) { return n === 1 ? 2 : 1; }
/* جولة جديدة. used/ul = اللي طلع قبل في هالمواجهة (التصنيف والحرف ما يتكرر لين تخلص الخيارات) */
function sgNewRound(seg, r, now, prev) {
    const p = prev || {};
    return {
        r: r, st: "cat", at: now, n: 0, first: r % 2 === 0 ? 1 : 2,
        items: seg === 2 ? sgCats2() : SG_CATS3.slice(), used: (p.used || []).slice(), ul: (p.ul || []).slice(),
        cat: "", letter: "", wheel: null, turn: 0, tEnd: 0, cnt: 0, win: 0, why: "", gs: [], sk: [0, 0], len: 0, reveal: ""
    };
}
/* تحديث حالة الجولة (n يزيد مع كل تغيير: يمنع ضغطتين على نفس الزر) */
function sgUpd(x, patch, extra, now) {
    const sg = Object.assign({}, x.sg, patch, { n: (x.sg.n || 0) + 1, at: now });
    return Object.assign({ sg: sg }, extra || {});
}
/* نقطة لفائز الجولة، وتفصيلها في d.sp (g2 و g3) للنتيجة */
function sgAward(d, winner, seg) {
    if (winner !== 1 && winner !== 2) return {};
    const u = {}, k = "s" + winner;
    u[k] = (d[k] || 0) + 1;
    const s1 = u.s1 != null ? u.s1 : (d.s1 || 0), s2 = u.s2 != null ? u.s2 : (d.s2 || 0);
    u.bh1 = Math.max(d.bh1 || 0, s2 - s1);
    u.bh2 = Math.max(d.bh2 || 0, s1 - s2);
    const sp = Object.assign({}, d.sp || {}), key = "g" + seg, cur = (sp[key] || [0, 0]).slice();
    cur[winner - 1]++;
    sp[key] = cur; u.sp = sp;
    return u;
}
/* عشوائي حقيقي من المتصفح (crypto) بدل Math.random، وبدون انحياز */
function sgRand(n) {
    if (n <= 1) return 0;
    try {
        const a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
        do { crypto.getRandomValues(a); } while (a[0] >= lim);
        return a[0] % n;
    } catch (e) { return Math.floor(Math.random() * n); }
}
function sgPickIdx(items, avoid) {
    const all = items.map((_, i) => i), free = all.filter(i => (avoid || []).indexOf(items[i]) === -1);
    const pool = free.length ? free : all;
    return pool[sgRand(pool.length)];
}
/* اللفة: النتيجة (i) والترتيب على البكرة (seed) وبداية الشريط (s) وعدد اللفات (loops) كلها عشوائية في كل مرة،
   فالجديد ما يتوقعه أحد من اللي قبله (المنظم يكتبها، وكل الأجهزة ترسم نفس الشي) */
function sgWheelObj(kind, items, i, now) {
    return { k: kind, i: i, at: now, n: items.length, seed: sgRand(4294967295) + 1, loops: 4 + sgRand(4), s: sgRand(items.length) };
}
function sgShuffle(n, seed) {
    const a = Array.from({ length: n }, (_, k) => k);
    let t = seed >>> 0;
    const rnd = () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
    for (let k = n - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const x = a[k]; a[k] = a[j]; a[j] = x; }
    return a;
}
function sgWheelDone(w) { return !!w && bcNow() >= w.at + SG_SPIN_MS + 200; }
/* كلمة جديدة للتصنيف (ما تتكرر: آخر 200 كلمة تنحفظ في جهاز المنظم) */
function sgNewWord(cat, avoid) {
    const bank = SG_WORDS[cat] || [];
    if (!bank.length) return "";
    const used = sgLS("sg_used_words") || [];
    let pool = bank.filter(w => used.indexOf(w) === -1 && w !== avoid);
    if (!pool.length) pool = bank.filter(w => w !== avoid);
    const w = pool[sgRand(pool.length)];
    sgLS("sg_used_words", used.concat([w]).slice(-200));
    return w;
}

/* ===== الدخول للفقرات والخروج منها (engine.js يناديها) ===== */
function sgEnter(d, seg, now) {
    return { scene: "playing", seg: seg, phase: "s" + seg, deadline: 0, lastAnswer: null, sg: sgNewRound(seg, 0, now, null) };
}
function sgNextUpd(x, now) {
    const sg = x.sg;
    if (sg.r + 1 < SG_ROUNDS) return { phase: "s" + x.seg, sg: sgNewRound(x.seg, sg.r + 1, now, sg) };
    if (x.seg === 2) return sgEnter(x, 3, now);
    return bcFinishUpd(x, now);
}

/* ===== أفعال المقدم (كلها transaction على وثيقة البث، والمنظم بس) ===== */
function sgCur() { const d = liveMatchesCache[openLiveId]; return (d && isAdmin && d.status === "live" && d.scene === "playing" && d.sg && (d.seg === 2 || d.seg === 3)) ? d : null; }
function sgAct(build) {
    const id = openLiveId, d0 = sgCur();
    if (!id || !d0) return Promise.resolve();
    const dock = document.getElementById("sgDock");
    if (dock) dock.classList.add("busy");
    return liveTx(id, (x, now) => {
        if (x.status !== "live" || x.scene !== "playing" || x.seg !== d0.seg || x.cur !== d0.cur || !x.sg
            || x.sg.r !== d0.sg.r || x.sg.st !== d0.sg.st || x.sg.n !== d0.sg.n) return null;
        return build(x, now);
    }).then(u => { if (!u) { sgBusyOff(); bcRedrawAll(); } })
      .catch(err => { sgBusyOff(); roomToast("تعذّر: " + (err && err.message), "alert"); bcRedrawAll(); });
}
function sgBusyOff() { const dock = document.getElementById("sgDock"); if (dock) dock.classList.remove("busy"); }
function sgToastWait() { roomToast("انتظر الاختيار يخلص", "hourglass"); }

/* لفّ العجلة الأولى (التصنيف) */
async function sgSpin() {
    const d0 = sgCur();
    if (!d0 || d0.sg.st !== "cat" || d0.sg.wheel) return;
    const sg = d0.sg, i = sgPickIdx(sg.items, sg.used), cat = sg.items[i];
    if (d0.seg === 3) {
        /* الكلمة تنختار وتنحفظ عند المنظم قبل ما تنكتب نتيجة العجلة */
        const word = sgNewWord(cat);
        if (word) await sgSetWord(d0, word);
        return sgAct((x, now) => sgUpd(x, { wheel: sgWheelObj("cat", x.sg.items, i, now), cat: cat, len: SG_LEN }, null, now));
    }
    return sgAct((x, now) => sgUpd(x, { wheel: sgWheelObj("cat", x.sg.items, i, now), cat: cat }, null, now));
}
/* عجلة الحروف (الفقرة الثانية) */
function sgToLetter() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 2 || d0.sg.st !== "cat" || !d0.sg.wheel) return;
    if (!sgWheelDone(d0.sg.wheel)) return sgToastWait();
    sgAct((x, now) => sgUpd(x, { st: "letter", wheel: null, used: x.sg.used.concat([x.sg.cat]) }, null, now));
}
function sgSpinLetter() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 2 || d0.sg.st !== "letter") return;
    if (d0.sg.wheel && !sgWheelDone(d0.sg.wheel)) return sgToastWait();
    const i = sgPickIdx(SG_LETTERS, d0.sg.ul);
    sgAct((x, now) => sgUpd(x, { wheel: sgWheelObj("letter", SG_LETTERS, i, now), letter: SG_LETTERS[i] }, null, now));
}
/* يبدأ اللعب بعد ما تقف العجلة */
function sgStart() {
    const d0 = sgCur();
    if (!d0 || !d0.sg.wheel || !(d0.sg.st === "letter" || (d0.seg === 3 && d0.sg.st === "cat"))) return;
    if (!sgWheelDone(d0.sg.wheel)) return sgToastWait();
    if (d0.seg === 3 && !sgWordOf(d0)) return roomToast("اكتب الكلمة أول (كلمة من عندي)", "alert");
    const ms = d0.seg === 2 ? SG_TURN2_MS : SG_TURN3_MS;
    sgAct((x, now) => sgUpd(x, { st: "play", turn: x.sg.first, tEnd: now + ms, ul: x.sg.letter ? x.sg.ul.concat([x.sg.letter]) : x.sg.ul, used: x.seg === 3 ? x.sg.used.concat([x.sg.cat]) : x.sg.used }, null, now));
}
/* نهاية الجولة: win = رقم الفائز (0 بدون نقطة) */
function sgEndRound(x, now, win, why, extra) {
    return sgUpd(x, Object.assign({ st: "done", win: win, why: why, tEnd: 0 }, extra || {}), sgAward(x, win, x.seg), now);
}
/* الفقرة الثانية: جواب المتسابق صح ← الدور للثاني */
function sgOk() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 2 || d0.sg.st !== "play") return;
    sgAct((x, now) => sgUpd(x, { turn: sgOther(x.sg.turn), tEnd: now + SG_TURN2_MS, cnt: (x.sg.cnt || 0) + 1 }, null, now));
}
/* غلط (أو انتهى وقته وما جاوب) ← يخسر الجولة والثاني ياخذ النقطة */
function sgBad() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 2 || d0.sg.st !== "play") return;
    sgAct((x, now) => sgEndRound(x, now, sgOther(x.sg.turn), "wrong"));
}
function sgSkip() {
    const d0 = sgCur();
    if (!d0 || d0.sg.st !== "play") return;
    sgAct((x, now) => sgEndRound(x, now, 0, "skip", x.seg === 3 ? { reveal: sgWordOf(x) || "" } : null));
}
function sgNext() {
    const d0 = sgCur();
    if (!d0 || d0.sg.st !== "done") return;
    sgAct((x, now) => sgNextUpd(x, now));
}

/* ----- تصنيفات الفقرة الثانية: إضافة وحذف (تنحفظ في جهاز المنظم للمواجهات الجاية) ----- */
async function sgCatAdd() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 2 || d0.sg.st !== "cat" || d0.sg.wheel) return;
    const t = await uiPrompt("اسم التصنيف الجديد (مثل: ماركات سيارات):", "");
    const name = String(t || "").replace(/\s+/g, " ").trim().slice(0, 24);
    if (!name) return;
    if (sgNorm(name).length < 2) return roomToast("الاسم قصير", "alert");
    if (d0.sg.items.some(c => sgNorm(c) === sgNorm(name))) return roomToast("التصنيف موجود", "alert");
    if (d0.sg.items.length >= 40) return roomToast("وصلت أقصى عدد تصنيفات (40)", "alert");
    const items = d0.sg.items.concat([name]);
    sgLS("sg_cats2", items);
    sgAct((x, now) => sgUpd(x, { items: items }, null, now));
}
function sgCatDel(i) {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 2 || d0.sg.st !== "cat" || d0.sg.wheel) return;
    if (d0.sg.items.length <= 2) return roomToast("لازم يبقى تصنيفين على الأقل", "alert");
    const items = d0.sg.items.filter((_, k) => k !== i);
    sgLS("sg_cats2", items);
    sgAct((x, now) => sgUpd(x, { items: items }, null, now));
}

/* ----- الفقرة الثالثة: الكلمة السرية ----- */
function sgWKey(d) { return openLiveId + "|" + d.cur + "|" + d.sg.r; }
function sgWordOf(d) { return d && d.sg ? (SG.words[sgWKey(d)] || "") : ""; }
function sgSetWord(d, word) {
    SG.words[sgWKey(d)] = word;
    if (!firebaseDB) return Promise.resolve();
    return firebaseDB.collection("liveSecrets").doc("seg_" + openLiveId).set({ ["w" + d.cur + "_" + d.sg.r]: word }, { merge: true }).catch(() => {});
}
/* لو المنظم أعاد تحميل الصفحة: الكلمة ترجع من liveSecrets */
function sgLoadWord(d) {
    if (!isAdmin || !firebaseDB || !d.sg || d.seg !== 3 || !d.sg.len) return;
    const key = sgWKey(d);
    if (SG.words[key] || (SG.secTried[key] && bcNow() - SG.secTried[key] < 4000)) return;
    SG.secTried[key] = bcNow();
    firebaseDB.collection("liveSecrets").doc("seg_" + openLiveId).get().then(s => {
        const v = s.exists ? (s.data() || {})["w" + d.cur + "_" + d.sg.r] : "";
        if (v && !SG.words[key]) { SG.words[key] = v; sgDockPaint(liveMatchesCache[openLiveId]); }
    }).catch(() => {});
}
async function sgReword() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 3 || !d0.sg.cat) return;
    if (d0.sg.st === "cat" && !sgWheelDone(d0.sg.wheel)) return sgToastWait();
    if (d0.sg.st === "play" && (d0.sg.gs.length || d0.sg.sk[0] || d0.sg.sk[1])) return roomToast("بدأ التخمين، ما تتغير الكلمة", "alert");
    if (d0.sg.st !== "cat" && d0.sg.st !== "play") return;
    const word = sgNewWord(d0.sg.cat, sgWordOf(d0));
    if (!word) return roomToast("ما فيه كلمات جاهزة لهذا التصنيف، اكتب كلمتك", "alert");
    await sgSetWord(d0, word);
    sgAct((x, now) => sgUpd(x, { len: SG_LEN }, null, now));
}
async function sgCustomWord() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 3 || !d0.sg.cat) return;
    if (d0.sg.st === "cat" && !sgWheelDone(d0.sg.wheel)) return sgToastWait();
    if (d0.sg.st === "play" && (d0.sg.gs.length || d0.sg.sk[0] || d0.sg.sk[1])) return roomToast("بدأ التخمين، ما تتغير الكلمة", "alert");
    if (d0.sg.st !== "cat" && d0.sg.st !== "play") return;
    const t = await uiPrompt("اكتب الكلمة (" + d0.sg.cat + "):", "");
    const w = String(t || "").trim().replace(/\s+/g, "");
    const n = sgNorm(w).length;
    if (!w) return;
    if (n !== SG_LEN) return roomToast("الكلمة لازم 3 حروف", "alert");
    await sgSetWord(d0, w);
    sgAct((x, now) => sgUpd(x, { len: n }, null, now));
}
/* ----- التخمين: المتسابق يقول كلمته بالصوت والمقدم يضغط كم حرف صحيح (0 إلى 3)، أو استرايك (طلب محمد 9 نوفمبر) ----- */
function sgHit(n) {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 3 || d0.sg.st !== "play" || !(n >= 0 && n <= 3)) return;
    sgAct((x, now) => {
        const t = x.sg.turn, gs = x.sg.gs.concat([{ p: t, n: n }]);
        /* 3 حروف صحيحة = عرف الكلمة */
        if (n === SG_LEN) return sgEndRound(x, now, t, "found", { gs: gs, reveal: sgWordOf(x) || "" });
        return sgUpd(x, { gs: gs, turn: sgOther(t), tEnd: now + SG_TURN3_MS }, null, now);
    });
}
/* استرايك: انتهى وقته، أو كلمة بحروف غير 3، أو من غير التصنيف (المقدم يحكم) */
function sgStrike() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 3 || d0.sg.st !== "play") return;
    sgAct((x, now) => {
        const t = x.sg.turn, sk = x.sg.sk.slice(), gs = x.sg.gs.concat([{ p: t, x: 1 }]);
        sk[t - 1]++;
        if (sk[t - 1] >= SG_STRIKES) return sgEndRound(x, now, sgOther(t), "strikes", { gs: gs, sk: sk, reveal: sgWordOf(x) || "" });
        return sgUpd(x, { gs: gs, sk: sk, turn: sgOther(t), tEnd: now + SG_TURN3_MS }, null, now);
    });
}

/* ===== الرسم: بكرة الاختيار (بدل العجلة، طلب محمد): شريط يدور بسرعة ويبطّئ لين يقف على النتيجة في الوسط.
   النتيجة (w.i) مكتوبة من المقدم، والحركة محسوبة من وقت السيرفر (w.at): كل الأجهزة تقف على نفس العنصر بنفس اللحظة، واللي دخل متأخر يشوفها نص دورانها ===== */
function sgReelHTML(items, w, letters) {
    const n = items.length, loops = w ? (w.loops || 4) : 4, cells = [];
    const order = w && w.seed ? sgShuffle(n, w.seed) : items.map((_, k) => k);
    for (let l = 0; l < loops + 3; l++) order.forEach(k => cells.push(`<div class="c">${escapeHTML(String(items[k]))}</div>`));
    let style = "";
    if (w) {
        const p = order.indexOf(w.i), st = (w.s || 0) % n, fi = loops * n + p, el = Math.min(SG_SPIN_MS, Math.max(0, bcNow() - w.at));
        style = `--from:calc(var(--h) * ${-st});--to:calc(var(--h) * ${-(fi - 1)});animation:sgReel ${SG_SPIN_MS}ms cubic-bezier(.12,.72,.08,1) ${-el}ms both;`;
    } else style = `--n:${n};animation:sgIdle ${Math.max(8, n * 1.2)}s linear infinite;`;
    const flash = w ? `animation-delay:${Math.max(0, SG_SPIN_MS - Math.min(SG_SPIN_MS, Math.max(0, bcNow() - w.at)))}ms;` : "";
    return `<div class="sg-reel ${letters ? "let" : ""} ${w ? "go" : "idle"}"><div class="sg-strip" style="${style}">${cells.join("")}</div><i class="sg-sel" style="${flash}"></i><i class="sg-fade"></i></div>`;
}
function sgHold(w, ms) { return bcNow() >= (w ? w.at : 0) + ms ? "" : "sg-hold"; }

/* ===== الرسم: شاشة الفقرة (للكل) ===== */
function sgHeadHTML(d) {
    const sg = d.sg || {}, seg = d.seg;
    const step = (n, t) => `<span class="${n < seg ? "done" : (n === seg ? "cur" : "")}">${n < seg ? ic("check") : n}<b>${t}</b></span>`;
    const sp = d.sp || {}, o = bcCur(d) || {};
    const pts = k => { const v = sp[k]; return v ? ` <em>${v[0]}-${v[1]}</em>` : ""; };
    return `<div class="sg-steps">${step(1, "الأسئلة")}${step(2, "الحروف" + (seg > 2 ? pts("g2") : ""))}${step(3, "الكلمات")}</div>`;
}
function sgWheelStageHTML(d) {
    const sg = d.sg, seg = d.seg, letter = seg === 2 && sg.st === "letter", w = sg.wheel;
    const items = letter ? SG_LETTERS : sg.items;
    const title = letter ? "اختيار الحرف" : (seg === 2 ? "اختيار التصنيف" : "اختيار نوع الكلمة");
    const chip = `<div class="sg-chip">${letter ? `التصنيف: <b>${escapeHTML(sg.cat)}</b> · ` : ""}${title}</div>`;
    let res;
    if (w) res = `<div class="sg-res ${sgHold(w, SG_SPIN_MS + 200)}" data-after="${w.at + SG_SPIN_MS + 200}">${letter ? `<span class="big">${escapeHTML(sg.letter)}</span>` : `<span class="lbl">${escapeHTML(sg.cat)}</span>`}${seg === 3 ? `<small>من ${sg.len} حروف</small>` : ""}</div>`;
    else res = `<div class="sg-res idle">${isAdmin ? "اضغط ابدأ الاختيار" : "بانتظار المقدم يبدأ الاختيار..."}</div>`;
    return `${chip}${sgReelHTML(items, w, letter)}${res}`;
}
function sgTurnHTML(d, me) {
    const sg = d.sg, nm = escapeHTML(livePlayerName(d, sg.turn)), total = d.seg === 2 ? SG_TURN2_MS : SG_TURN3_MS;
    const left = Math.max(0, (sg.tEnd || 0) - bcNow());
    const ring = `<div class="st-ring"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" id="sgRing" cx="22" cy="22" r="19" style="stroke-dashoffset:${(119.4 * (1 - Math.min(1, left / total))).toFixed(1)}"/></svg><b id="sgTimerNum">${Math.ceil(left / 1000)}</b></div>`;
    const mine = me && me === sg.turn;
    return `<div class="sg-turn ${left <= 0 ? "over" : ""}" id="sgTurn">${ring}<div class="tx"><b>الدور على ${nm}</b><span class="ov">${ic("alarm")} انتهى الوقت · المقدم يقرر</span><span class="nm">${mine ? "دورك! جاوب بالمايك" : (d.seg === 2 ? "يجاوب بالمايك" : "يخمّن بالمايك")}</span></div></div>`;
}
function sgPlay2HTML(d, me) {
    const sg = d.sg;
    return `<div class="sg-prompt"><small>اذكر من</small><b>${escapeHTML(sg.cat)}</b><small>بحرف</small><span class="let">${escapeHTML(sg.letter)}</span></div>
${sgTurnHTML(d, me)}
<div class="sg-cnt">${ic("check-circle")} أجوبة صحيحة في الجولة: <b>${sg.cnt || 0}</b></div>
<div class="lv-muted">كل متسابق بدوره، واللي يغلط أو ينتهي وقته يخسر الجولة</div>`;
}
const SG_HITS = ["ولا حرف", "حرف صحيح", "حرفين صحيحة", "3 حروف صحيحة"];
function sgFbHTML(g) {
    if (g.x) return `<i class="x">استرايك</i>`;
    return `<i class="n${g.n}">${SG_HITS[g.n] || ""}</i>`;
}
function sgPlay3HTML(d, me) {
    const sg = d.sg, o = bcCur(d) || {};
    const box = n => `<div class="sg-sk ${sg.turn === n ? "on" : ""}"><b>${escapeHTML(n === 1 ? o.p1 : o.p2)}</b><div>${Array.from({ length: SG_STRIKES }, (_, k) => `<i class="${k < sg.sk[n - 1] ? "full" : ""}">${k < sg.sk[n - 1] ? ic("x") : ""}</i>`).join("")}</div></div>`;
    const rows = sg.gs.slice().reverse().slice(0, 4).map(g => `<div class="sg-g p${g.p}"><span class="who">${escapeHTML(g.p === 1 ? o.p1 : o.p2)}</span><span class="fb">${sgFbHTML(g)}</span></div>`).join("");
    return `<div class="sg-prompt"><small>${escapeHTML(sg.cat)}</small><b>من ${sg.len} حروف</b></div>
${sgTurnHTML(d, me)}
<div class="sg-sks">${box(1)}${box(2)}</div>
<div class="sg-gs">${rows || `<div class="lv-muted">لا تخمين للحين، ${escapeHTML(livePlayerName(d, sg.first))} يبدأ</div>`}</div>
`;
}
const SG_WHY = {
    wrong: l => `${l} غلط أو انتهى وقته`, strikes: l => `${l} أخذ 3 استرايك`, found: (l, w) => `${w} عرف الكلمة!`, skip: () => "الجولة بدون نقطة"
};
function sgDoneHTML(d) {
    const sg = d.sg, o = bcCur(d) || {}, w = sg.win, lose = w ? livePlayerName(d, sgOther(w)) : "";
    const why = (SG_WHY[sg.why] || (() => ""))(escapeHTML(lose), escapeHTML(w ? livePlayerName(d, w) : ""));
    const word = d.seg === 3 && sg.reveal ? `<div class="sg-word"><small>الكلمة كانت</small>${Array.from(String(sg.reveal)).map(c => `<span>${escapeHTML(c)}</span>`).join("")}</div>` : "";
    return `${w ? `<div class="sg-win"><img src="${safeSrc(bcAv(o, w))}" alt=""><div class="t">${ic("trophy")} ${escapeHTML(livePlayerName(d, w))}</div><div class="s">+1 نقطة</div></div>` : `<div class="sg-win none"><div class="t">بدون نقطة</div></div>`}
<div class="lv-muted">${why}</div>${word}
<div class="sg-score">${escapeHTML(o.p1 || "")} <b>${d.s1 || 0}</b> - <b>${d.s2 || 0}</b> ${escapeHTML(o.p2 || "")}</div>`;
}
function bcSegHTML(d, me) {
    const sg = d.sg;
    if (!sg) return `<div class="lv-muted">...</div>`;
    let h = sgHeadHTML(d);
    if (sg.st === "play") h += d.seg === 2 ? sgPlay2HTML(d, me) : sgPlay3HTML(d, me);
    else if (sg.st === "done") h += sgDoneHTML(d);
    else h += sgWheelStageHTML(d);
    return h;
}

/* ===== لوحة المقدم تحت الشاشة (#sgDock) ===== */
function sgDockPaint(d) {
    const scr = document.getElementById("liveScreen");
    let dock = document.getElementById("sgDock");
    const on = !!(scr && isAdmin && d && d.status === "live" && d.scene === "playing" && (d.seg === 2 || d.seg === 3) && d.sg);
    if (!on) { if (dock) dock.remove(); if (scr) scr.classList.remove("sg-dock-on"); SG.dockSig = ""; return; }
    sgLoadWord(d);
    const sg = d.sg, w = sg.wheel, word = sgWordOf(d), cat = escapeHTML(sg.cat || "");
    const hold = (ms, cls) => `${cls || ""} ${sgHold(w, ms)}`;
    const btn = (fn, cls, icon, txt, after) => `<button class="${cls} ${after ? hold(SG_SPIN_MS + 200) : ""}" ${after ? `data-after="${w.at + SG_SPIN_MS + 200}"` : ""} onclick="${fn}()">${icon ? ic(icon) : ""} ${txt}</button>`;
    const first = escapeHTML(livePlayerName(d, sg.first)), turn = escapeHTML(livePlayerName(d, sg.turn));
    let h = "";
    const say = t => `<div class="sg-say">${ic("mic")} ${t}</div>`;
    const wordBox = () => `<div class="sg-wordbox"><small>الكلمة (تشوفها أنت بس)</small><b>${escapeHTML(word || "…")}</b></div>`;
    if (sg.st === "cat" && d.seg === 2) {
        if (!w) {
            h = btn("sgSpin", "bc-go", "dice", "ابدأ اختيار التصنيف")
              + `<details class="sg-edit"><summary>${ic("pencil")} التصنيفات (${sg.items.length}) · إضافة أو حذف</summary><div class="sg-chips">${sg.items.map((c, i) => `<span>${escapeHTML(c)}<button onclick="sgCatDel(${i})" aria-label="حذف">×</button></span>`).join("")}</div><button class="bc-ghost" onclick="sgCatAdd()">${ic("plus")} إضافة تصنيف</button></details>`;
        } else h = btn("sgToLetter", "bc-go", "dice", "التالي: اختيار الحرف", 1);
    } else if (sg.st === "letter") {
        if (!w) h = btn("sgSpinLetter", "bc-go", "dice", "ابدأ اختيار الحرف");
        else h = btn("sgStart", "bc-go", "zap", "ابدأ الجولة (" + first + " يبدأ)", 1) + btn("sgSpinLetter", "bc-ghost", "dice", "اختيار حرف من جديد", 1);
    } else if (sg.st === "cat" && d.seg === 3) {
        if (!w) h = btn("sgSpin", "bc-go", "dice", "ابدأ اختيار نوع الكلمة");
        else h = `<div class="${hold(SG_SPIN_MS + 200)}" data-after="${w.at + SG_SPIN_MS + 200}">${say(`قل: «${cat} من ${sg.len} حروف»`)}${wordBox()}<div class="sg-row2"><button class="bc-ghost" onclick="sgReword()">كلمة غيرها</button><button class="bc-ghost" onclick="sgCustomWord()">${ic("pencil")} كلمة من عندي</button></div></div>`
            + btn("sgStart", "bc-go", "zap", "ابدأ الجولة (" + first + " يبدأ)", 1);
    } else if (sg.st === "play" && d.seg === 2) {
        h = say(`قل: «اذكروا من ${cat} بحرف ${escapeHTML(sg.letter)}، ${turn} الأول»`)
          + `<div class="bc-verdict"><button class="ok" onclick="sgOk()">${ic("check-circle")} صح · الدور للثاني</button><button class="no" onclick="sgBad()">${ic("x-circle")} غلط / خلص وقته</button></div>`
          + `<button class="lv-link" onclick="sgSkip()">إنهاء الجولة بدون نقطة</button>`;
    } else if (sg.st === "play" && d.seg === 3) {
        h = (sg.gs.length ? "" : say(`قل: «${cat} من 3 حروف، ${turn} يبدأ»`)) + wordBox()
          + `<div class="sg-hits"><button class="h0" onclick="sgHit(0)">ولا حرف</button><button class="h1" onclick="sgHit(1)">حرف صحيح</button><button class="h2" onclick="sgHit(2)">حرفين صحيحة</button><button class="h3" onclick="sgHit(3)">ثلاث حروف صحيحة</button></div>`
          + `<button class="sg-strike" onclick="sgStrike()">${ic("x-circle")} استرايك</button>`
          + `<div class="sg-row2">${sg.gs.length || sg.sk[0] || sg.sk[1] ? "" : `<button class="bc-ghost" onclick="sgReword()">كلمة غيرها</button><button class="bc-ghost" onclick="sgCustomWord()">${ic("pencil")} كلمة من عندي</button>`}<button class="lv-link" onclick="sgSkip()">إنهاء بدون نقطة</button></div>`;
    } else if (sg.st === "done") {
        const last = sg.r + 1 >= SG_ROUNDS;
        h = btn("sgNext", "bc-go", last ? "trophy" : "zap", d.seg === 2 ? (last ? "فقرة خمّن الكلمة" : "الجولة التالية") : (last ? "نتيجة المواجهة" : "الجولة التالية"));
    }
    /* التركيب يتغير بس لو تغيّر المحتوى: الخانة المكتوبة فيها ما تنمسح مع الرسم */
    const sig = d.seg + "|" + sg.r + "|" + sg.st + "|" + sg.n + "|" + (w ? w.at : 0) + "|" + (word ? 1 : 0) + "|" + sg.items.length + "|" + sg.turn + "|" + (sg.wheel ? 1 : 0);
    if (!dock) {
        dock = document.createElement("div");
        dock.id = "sgDock"; dock.className = "sg-dock";
        const body = document.getElementById("liveScreenBody");
        scr.insertBefore(dock, body ? body.nextSibling : null);
    }
    scr.classList.add("sg-dock-on");
    if (SG.dockSig !== sig) { SG.dockSig = sig; dock.innerHTML = h; dock.classList.remove("busy"); }
}

/* ===== كل 200ms (من liveTick): العجلة تعرض نتيجتها بعد ما تقف، والعداد، وأصوات اللحظة ===== */
function sgTick(d) {
    const sg = d.sg;
    if (!sg) return;
    document.querySelectorAll("#liveScreen .sg-hold").forEach(el => { if (bcNow() >= Number(el.dataset.after || 0)) el.classList.remove("sg-hold"); });
    if (sg.st === "play" && sg.tEnd) {
        const total = d.seg === 2 ? SG_TURN2_MS : SG_TURN3_MS, left = Math.max(0, sg.tEnd - bcNow()), pct = Math.min(1, left / total);
        const ring = document.getElementById("sgRing"), num = document.getElementById("sgTimerNum"), t = document.getElementById("sgTurn");
        if (ring) { ring.style.strokeDashoffset = (119.4 * (1 - pct)).toFixed(1); ring.style.stroke = pct > 0.5 ? "#4ade80" : (pct > 0.25 ? "#facc15" : "#ef4444"); }
        const s = Math.ceil(left / 1000);
        if (num && num.textContent !== String(s)) num.textContent = s;
        if (t) t.classList.toggle("over", left <= 0);
        if (s !== SG.lastSec) {
            const first = SG.lastSec === -1;   /* أول قراءة (فتحت البث متأخر): بدون صوت */
            SG.lastSec = s;
            if (!first && s > 0 && s <= 3) cinePlay("tick", 0.6);
            else if (!first && s === 0) cinePlay("sg_time", 1);
        }
    } else SG.lastSec = -1;
}
/* مؤثرات احترافية (عينات mp3 من مكتبة Mixkit في audio/sg_*.mp3، مو أصوات المتصفح): كل ما زادت الحروف الصحيحة صار الصوت أقوى وأكثر حماس (طلب محمد 9 نوفمبر) */
const SG_SAMPLES = ["sg_miss", "sg_h1", "sg_h2", "sg_h3", "sg_h3b", "sg_strike", "sg_spin", "sg_land", "sg_seg", "sg_round", "sg_pass", "sg_ok", "sg_bad", "sg_time"];
function sgHitSound(key) {
    if (key === "x") cinePlay("sg_strike", 1);
    else if (key === 0) cinePlay("sg_miss", 1);
    else if (key === 1) cinePlay("sg_h1", 1);
    else if (key === 2) { cinePlay("sg_h2", 1); }
    else if (key === 3) { cinePlay("sg_h3", 1); cinePlay("sg_h3b", 0.8); }
}
/* أصوات وستينجر (تنادى مع كل رسم للشاشة) */
function sgFx(d) {
    const sg = d && d.sg;
    if (!sg || d.scene !== "playing" || !(d.seg === 2 || d.seg === 3)) { SG.prevKey = ""; SG.prevSnap = null; return; }
    const key = d.cur + ":" + d.seg + ":" + sg.r + ":" + sg.st;
    const snap = { cnt: sg.cnt || 0, gs: (sg.gs || []).length, sk: (sg.sk || [0, 0]).join(), turn: sg.turn };
    const prev = SG.prevSnap, was = SG.prevKey;
    SG.prevKey = key; SG.prevSnap = snap;
    const same = !!prev && key.split(":").slice(0, 3).join() === was.split(":").slice(0, 3).join();
    const fresh = bcNow() - (Number(sg.at) || 0) < 2500;
    const pass = ms => setTimeout(() => cinePlay("sg_pass", 1), ms);   /* انتقال الدور للمتسابق الثاني */
    /* فقرة الكلمات: كل ضغطة من المقدم لها مؤثر (يقوى مع عدد الحروف الصحيحة) وبعدها الدور ينتقل */
    if (same && d.seg === 3 && snap.gs > prev.gs) {
        const g = sg.gs[sg.gs.length - 1];
        if (g) { sgHitSound(g.x ? "x" : g.n); if (sg.st === "play") pass(g.n === 0 || g.x ? 900 : 1000); }
    }
    /* فقرة الحروف: جواب صح ← الدور للثاني */
    if (same && d.seg === 2 && snap.cnt > prev.cnt) { cinePlay("sg_ok", 1); pass(700); }
    if (key !== was) {
        if (sg.st === "cat" && sg.r === 0) {
            bcStinger(d.seg === 2 ? "الفقرة الثانية" : "الفقرة الثالثة", d.seg === 2 ? "عجلة الحروف" : "خمّن الكلمة", sg.at);
            showSound(sg.at, "sg_seg", 1);
        }
        if (sg.st === "play") { showSound(sg.at, "start_q", 0.8); }
        if (sg.st === "done" && fresh) {
            if (d.seg === 2 && sg.why === "wrong") cinePlay("sg_bad", 1);
            if (sg.win) setTimeout(() => { cinePlay("sg_round", 1); cinePlay("applause", 0.45, { dur: 2.6 }); }, d.seg === 3 ? 1500 : 800);
        }
    }
    const w = sg.wheel;
    if (w && w.at !== SG.wheelAt) {
        SG.wheelAt = w.at;
        showSound(w.at, "sg_spin", 1);
        const wait = w.at + SG_SPIN_MS - bcNow();
        if (wait > -300) setTimeout(() => cinePlay("sg_land", 1), Math.max(0, wait));
    }
}
