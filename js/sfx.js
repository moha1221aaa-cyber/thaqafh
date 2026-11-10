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
SFX_EVENTS.forEach(e => { for (let n = 1; n <= 6; n++) CINE_FILES["sx_" + e.k + "_" + n] = { g: 1 }; });

function sfxId(k, n) { return "sx_" + k + "_" + n; }
function sfxChosen(k) { const n = String(SFX.map[k] || "d"); return /^[1-6]$/.test(n) ? n : "d"; }
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
function sfxRender() {
    const body = document.getElementById("sfxBody");
    if (!body) return;
    let html = `<div class="sfx-hint">اضغط أي صوت تسمعه، والصوت اللي تضغطه آخر مرة يصير هو اللي يطلع في البث عند كل المشاهدين. "الحالي" هو الصوت المعتمد قبل التعديل.</div>`;
    SFX_EVENTS.forEach(e => {
        if (e.g) html += `<div class="sfx-group">${escapeHTML(e.g)}</div>`;
        const cur = sfxChosen(e.k);
        html += `<div class="sfx-card"><div class="sfx-t">${escapeHTML(e.label)}</div><div class="sfx-row">`
            + `<button class="${cur === "d" ? "on" : ""}" onclick="sfxPick(${jsArg(e.k)}, 'd')">الحالي</button>`
            + SFX_STYLES.map((s, i) => `<button class="${cur === String(i + 1) ? "on" : ""}" onclick="sfxPick(${jsArg(e.k)}, '${i + 1}')">${i + 1} · ${escapeHTML(s)}</button>`).join("")
            + `</div></div>`;
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
