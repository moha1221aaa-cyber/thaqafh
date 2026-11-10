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
SFX_EVENTS.forEach(e => { for (let n = 1; n <= 40; n++) CINE_FILES["sx_" + e.k + "_" + n] = { g: 1 }; });

function sfxId(k, n) { return "sx_" + k + "_" + n; }
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
/* تجربة صوت (يحمّله لو ما تحمّل) بدون ما يغيّر الاختيار */
async function sfxPreview(k, n) {
    try {
        const ctx = liveCtx(); if (ctx.state === "suspended") await ctx.resume();
        if (n === "d") { const f = SFX_DEFAULT[k]; if (f) f(); return; }
        const id = sfxId(k, n);
        cineLoadSamples([id]);
        const t0 = Date.now();
        while (!CINE_BUF[id] && Date.now() - t0 < 6000) await new Promise(r => setTimeout(r, 60));
        if (CINE_BUF[id]) cinePlay(id, 1); else roomToast("ما تحمّل الصوت، جرّب مرة ثانية", "alert");
    } catch (e) {}
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
    if (n === "d") return "الحالي";
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
    let html = `<div class="sfx-hint">اضغط على الزر اللي تبي تغيّر صوته، واضغط أي صوت تسمعه: الأخير اللي تضغطه يصير المعتمد في البث عند كل المشاهدين. "الحالي" هو الصوت المعتمد قبل التعديل. لكل زر 6 أنماط مولّدة وعشرات العينات من مكتبات استوديو مختلفة (Mixkit و Sonniss).</div>`;
    SFX_EVENTS.forEach(e => {
        if (e.g) html += `<div class="sfx-group">${escapeHTML(e.g)}</div>`;
        const cur = sfxChosen(e.k), open = SFX.openKey === e.k, all = sfxSamples(e.k);
        html += `<div class="sfx-card ${open ? "open" : ""}"><button class="sfx-head" onclick="sfxToggle(${jsArg(e.k)})"><span class="sfx-t">${escapeHTML(e.label)}</span><span class="sfx-cur">${escapeHTML(sfxOptName(e.k, cur))}</span><i>${open ? "▲" : "▼"} ${6 + all.length}</i></button>`;
        if (open) {
            const btn = (n, label) => `<button class="${cur === String(n) ? "on" : ""}" onclick="sfxPick(${jsArg(e.k)}, '${n}')">${escapeHTML(label)}</button>`;
            const mix = all.filter(x => x.length < 3), son = all.filter(x => x.length >= 3);
            html += `<div class="sfx-row">${btn("d", "الحالي")}${SFX_STYLES.map((st, i) => btn(i + 1, (i + 1) + " · " + st)).join("")}</div>`
                + (mix.length ? `<div class="sfx-sub">عينات Mixkit (${mix.length})</div><div class="sfx-row">${mix.map(x => btn(x[0], x[1])).join("")}</div>` : "")
                + (son.length ? `<div class="sfx-sub">تسجيلات استوديو Sonniss (${son.length})</div><div class="sfx-row">${son.map(x => btn(x[0], x[1])).join("")}</div>` : "");
        }
        html += `</div>`;
    });
    html += `<button class="sfx-reset" onclick="sfxResetAll()">رجّع كل الأصوات للحالي</button>`;
    const y = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = y;
}
function openSfxModal() {
    if (!isAdmin) return;
    sfxListen();
    sfxRender();
    openModal("sfxModal");
}
