/* أصوات البث القابلة للاختيار (10 نوفمبر 2026، طلب محمد): لكل زر ولحظة في البث 6 أصوات جاهزة غير الصوت الحالي،
   والمنظم يختارها من القائمة الجانبية ← "أصوات البث" (للمنظم بس). الاختيار ينحفظ في room/main/liveDiag/_sfx { map: { <الحدث>: "d" أو "1".."6" } }
   فيسمعه كل المشاهدين (المنظم بس يكتب فيه: قاعدة liveDiag)، والاختيار الفاضي أو "d" = الصوت الحالي.
   الملفات audio/sx_<الحدث>_<رقم>.mp3 مولّدة بـ tests/harness/audio/gen_sx.py، ولا يتحمّل غير الصوت المختار (والتجربة تحمّل وقتها). */
const SFX_STYLES = ["نحاسي", "سينمائي", "ماريمبا", "إلكتروني", "أوركسترا", "بيانو كهربائي"];
const SFX_EVENTS = [
    { g: "أزرار الفقرة الثالثة (خمّن الكلمة)", k: "miss", label: "ولا حرف" },
    { g: "", k: "h1", label: "حرف صحيح" },
    { g: "", k: "h2", label: "حرفين صحيحة" },
    { g: "", k: "h3", label: "ثلاث حروف صحيحة" },
    { g: "", k: "strike", label: "استرايك" },
    { g: "الأسئلة وفقرة الحروف", k: "ok", label: "جواب صح" },
    { g: "", k: "bad", label: "جواب غلط (فقرة الحروف)" },
    { g: "", k: "time", label: "انتهاء الوقت" },
    { g: "الانتقالات واللحظات", k: "pass", label: "انتقال الدور للمتسابق الثاني" },
    { g: "", k: "spin", label: "دوران اختيار التصنيف والحرف" },
    { g: "", k: "land", label: "وقوف الاختيار" },
    { g: "", k: "seg", label: "بداية الفقرة" },
    { g: "", k: "round", label: "فوز الجولة" }
];
const SFX = { map: {}, sub: null, loaded: false };
try { SFX.map = JSON.parse(localStorage.getItem("sfx_map") || "{}") || {}; } catch (e) { SFX.map = {}; }
/* تسجيل كل الملفات (المولّدة 1-6 وكل العينات مهما كان رقمها) عشان cineLoadSamples يقبلها */
SFX_EVENTS.forEach(e => {
    for (let n = 1; n <= 6; n++) CINE_FILES["sx_" + e.k + "_" + n] = { g: 1 };
    ((typeof SFX_SAMPLES !== "undefined" && SFX_SAMPLES[e.k]) || []).forEach(x => { CINE_FILES["sx_" + e.k + "_" + x[0]] = { g: 1 }; });
});

function sfxId(k, n) { return "sx_" + k + "_" + n; }
/* أصوات المسابقات (العلامة "G" في SFX_SAMPLES): أولها (61) هو الحالي، فيتحمّل مع أصوات البث الأساسية */
function sfxIsGame(k, n) { return sfxSamples(k).some(x => String(x[0]) === String(n) && x[2] === "G"); }
SFX_EVENTS.forEach(e => { const id = sfxId(e.k, 61); if (CINE_FILES[id] && CINE_CORE.indexOf(id) === -1) CINE_CORE.push(id); });
/* خيارات الحدث: 1 إلى 6 أنماط مولّدة (SFX_STYLES) و7 وما فوق عينات استوديو (SFX_SAMPLES من js/sfx-catalog.js) */
function sfxSamples(k) { return (typeof SFX_SAMPLES !== "undefined" && SFX_SAMPLES[k]) || []; }
function sfxChosen(k) {
    const n = String(SFX.map[k] || "d");
    if (/^[1-6]$/.test(n)) return n;
    return /^\d{1,2}$/.test(n) && sfxSamples(k).some(x => String(x[0]) === n) ? n : "d";
}
/* يشغّل الصوت المختار للحدث، ولو ما فيه اختيار (أو ما تحمّل بعد) يشغّل الصوت الحالي (fallback) */
function sfxPlay(k, fallback) {
    const n = sfxChosen(k);
    if (n !== "d") {
        const id = sfxId(k, n);
        if (CINE_BUF[id]) { cinePlay(id, 1); return; }
        cineLoadSamples([id]);
    }
    if (fallback) fallback();
}
function sfxPreload() {
    const ids = SFX_EVENTS.map(e => sfxChosen(e.k)).map((n, i) => n === "d" ? null : sfxId(SFX_EVENTS[i].k, n)).filter(Boolean);
    if (ids.length) { try { liveCtx(); cineLoadSamples(ids); } catch (e) {} }
}
function sfxApply(map) {
    SFX.map = map && typeof map === "object" ? map : {};
    try { localStorage.setItem("sfx_map", JSON.stringify(SFX.map)); } catch (e) {}
    sfxPreload();
    if (document.getElementById("sfxModal") && document.getElementById("sfxModal").classList.contains("active")) sfxRender();
}
/* يسمع الاختيار المحفوظ (مرة وحدة): يستدعى لما ينفتح البث وقائمة الأصوات */
function sfxListen() {
    if (SFX.sub || typeof firebaseDB === "undefined" || !firebaseDB) return;
    try {
        SFX.sub = firebaseDB.collection("room").doc("main").collection("liveDiag").doc("_sfx").onSnapshot(s => {
            SFX.loaded = true;
            sfxApply(s.exists ? (s.data() || {}).map : {});
        }, () => {});
    } catch (e) {}
}
/* تجربة صوت بدون ما يغيّر الاختيار: من الجهاز لو تنزّل (فوري)، وإلا ينزل الحين */
async function sfxPreview(k, n) {
    try {
        const ctx = liveCtx(); if (ctx.state === "suspended") await ctx.resume();
        if (n === "d") { const f = SFX_DEFAULT[k]; if (f) f(); return; }
        const id = sfxId(k, n);
        if (!CINE_BUF[id]) {
            if (!CINE_LOADING[id]) cineLoadSamples([id]);
            await Promise.race([CINE_LOADING[id], new Promise(r => setTimeout(r, 8000))]);
        }
        if (CINE_BUF[id]) cinePlay(id, 1);
        else { delete CINE_LOADING[id]; roomToast("ما تحمّل الصوت (النت؟)، جرّب مرة ثانية", "alert"); }
    } catch (e) {}
}
/* كل ملفات الأصوات (المختارة والحالية وكل الخيارات) */
function sfxAllIds() {
    const ids = CINE_CORE.slice();
    SFX_EVENTS.forEach(e => {
        for (let n = 1; n <= 6; n++) ids.push(sfxId(e.k, n));
        sfxSamples(e.k).forEach(x => ids.push(sfxId(e.k, x[0])));
    });
    return ids.filter((x, i, a) => a.indexOf(x) === i);
}
/* تنزيل كل الأصوات على الجهاز (Cache Storage) عشان التجربة والبث يشتغلون فوري وبدون نت.
   يتخطى اللي تنزّل قبل، 4 ملفات بنفس الوقت، والتقدم في #sfxDl */
SFX.dl = { run: null, done: 0, total: 0, fail: 0, ready: false };
function sfxDlPaint() {
    const el = document.getElementById("sfxDl");
    if (!el) return;
    const D = SFX.dl, pct = D.total ? Math.round(D.done * 100 / D.total) : 0;
    if (D.ready && !D.fail) el.innerHTML = `<b>✓ كل الأصوات (${D.total}) محفوظة في جهازك</b><span>تشتغل فوري وبدون نت</span>`;
    else if (D.run) el.innerHTML = `<b>جاري حفظ الأصوات في جهازك ${D.done} من ${D.total}</b><span class="sfx-bar"><i style="width:${pct}%"></i></span>`;
    else if (D.fail) el.innerHTML = `<b>انحفظ ${D.done - D.fail} من ${D.total}</b><button onclick="sfxDownloadAll()">كمّل التحميل</button>`;
    else el.innerHTML = `<button onclick="sfxDownloadAll()">احفظ كل الأصوات في جهازي</button>`;
}
function sfxDownloadAll() {
    if (SFX.dl.run) return SFX.dl.run;
    const D = SFX.dl;
    D.run = (async () => {
        let cache;
        try { cache = await caches.open(AUDIO_CACHE); } catch (e) { D.run = null; return; }
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
        const ids = sfxAllIds();
        let have = [];
        try { have = (await cache.keys()).map(r => r.url); } catch (e) {}
        const need = ids.filter(id => have.indexOf(cineAudioUrl(id)) === -1);
        D.total = ids.length; D.done = ids.length - need.length; D.fail = 0; D.ready = false;
        sfxDlPaint();
        let i = 0, last = 0;
        const worker = async () => {
            while (i < need.length) {
                const id = need[i++];
                try {
                    const r = await fetch(cineAudioUrl(id));
                    if (!r.ok || (r.headers.get("Content-Type") || "").indexOf("audio") === -1) throw new Error("bad");
                    await cache.put(cineAudioUrl(id), r);
                } catch (e) { D.fail++; }
                D.done++;
                if (Date.now() - last > 250) { last = Date.now(); sfxDlPaint(); }
            }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        D.ready = true; D.run = null;
        sfxDlPaint();
    })();
    return D.run;
}
/* المنظم يختار: يجرّب الصوت وينحفظ لكل المشاهدين */
async function sfxPick(k, n) {
    if (!isAdmin) return;
    sfxPreview(k, n);
    const map = Object.assign({}, SFX.map);
    if (n === "d") delete map[k]; else map[k] = n;
    SFX.map = map;
    try { localStorage.setItem("sfx_map", JSON.stringify(map)); } catch (e) {}
    sfxRender();
    try { await firebaseDB.collection("room").doc("main").collection("liveDiag").doc("_sfx").set({ map: map, at: Date.now() }); }
    catch (e) { roomToast("ما انحفظ الاختيار: " + (e && e.message), "alert"); }
}
async function sfxResetAll() {
    if (!isAdmin || !await uiConfirm("ترجّع كل الأصوات للصوت الحالي؟", { ok: "رجّع" })) return;
    SFX.map = {}; try { localStorage.removeItem("sfx_map"); } catch (e) {}
    sfxRender();
    try { await firebaseDB.collection("room").doc("main").collection("liveDiag").doc("_sfx").set({ map: {}, at: Date.now() }); } catch (e) {}
}
/* اسم الخيار المعروض (الحالي، نمط مولّد، أو عينة) */
function sfxOptName(k, n) {
    if (n === "d") return "الحالي: " + ((sfxSamples(k).find(e => String(e[0]) === "61") || [0, "مسابقات"])[1]);
    const i = Number(n);
    if (i >= 1 && i <= 6) return i + " · " + SFX_STYLES[i - 1];
    const x = sfxSamples(k).find(e => String(e[0]) === String(n));
    return x ? x[1] : "الحالي";
}
SFX.openKey = "";
function sfxToggle(k) { SFX.openKey = SFX.openKey === k ? "" : k; sfxRender(); }
/* الأحداث 13 كل واحد فيه 50+ خيار: البطاقات مطوية، وتنفتح وحدة وحدة (الأزرار ما تنرسم إلا للمفتوحة) */
function sfxRender() {
    const body = document.getElementById("sfxBody");
    if (!body) return;
    let html = `<div class="sfx-hint">اضغط على الزر اللي تبي تغيّر صوته، واضغط أي صوت تسمعه: الأخير اللي تضغطه يصير المعتمد في البث عند كل المشاهدين. "الحالي" هو أول صوت من أصوات المسابقات. أول قسم في كل زر أصوات مسابقات (صفارة الغلط، رنة الصح، بوق الوقت، تكتكة العجلة، فانفير الفوز)، وتحتها خيارات ثانية من مكتبات استوديو (Mixkit و Sonniss).</div><div id="sfxDl" class="sfx-dl"></div>`;
    SFX_EVENTS.forEach(e => {
        if (e.g) html += `<div class="sfx-group">${escapeHTML(e.g)}</div>`;
        const cur = sfxChosen(e.k), open = SFX.openKey === e.k, all = sfxSamples(e.k);
        html += `<div class="sfx-card ${open ? "open" : ""}"><button class="sfx-head" onclick="sfxToggle(${jsArg(e.k)})"><span class="sfx-t">${escapeHTML(e.label)}</span><span class="sfx-cur">${escapeHTML(sfxOptName(e.k, cur))}</span><i>${open ? "▲" : "▼"} ${6 + all.length}</i></button>`;
        if (open) {
            const btn = (n, label) => `<button class="${cur === String(n) ? "on" : ""}" onclick="sfxPick(${jsArg(e.k)}, '${n}')">${escapeHTML(label)}</button>`;
            const mix = all.filter(x => x.length < 3), son = all.filter(x => x[2] === "S"), game = all.filter(x => x[2] === "G");
            html += `<div class="sfx-sub sfx-sub-g">أصوات مسابقات (${game.length + 1})</div><div class="sfx-row">${btn("d", "الحالي")}${game.filter(x => String(x[0]) !== "61").map(x => btn(x[0], x[1])).join("")}</div>`
                + `<div class="sfx-sub">أنماط مولّدة (6)</div><div class="sfx-row">${SFX_STYLES.map((st, i) => btn(i + 1, (i + 1) + " · " + st)).join("")}</div>`
                + (mix.length ? `<div class="sfx-sub">عينات Mixkit (${mix.length})</div><div class="sfx-row">${mix.map(x => btn(x[0], x[1])).join("")}</div>` : "")
                + (son.length ? `<div class="sfx-sub">تسجيلات استوديو Sonniss (${son.length})</div><div class="sfx-row">${son.map(x => btn(x[0], x[1])).join("")}</div>` : "");
        }
        html += `</div>`;
    });
    html += `<button class="sfx-reset" onclick="sfxResetAll()">رجّع كل الأصوات للحالي</button>`;
    const y = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = y;
    sfxDlPaint();
}
function openSfxModal() {
    if (!isAdmin) return;
    sfxListen();
    sfxRender();
    openModal("sfxModal");
    sfxDownloadAll();
}
