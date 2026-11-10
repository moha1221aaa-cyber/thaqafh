/* تسجيل البث ومشاهدته بعد ما يخلص (10 نوفمبر 2026، طلب محمد: "اجعل البث ينحفظ بعد انتهاؤه عند المسؤول كفيديو مشاهد").
   - جهاز المنظم وهو فاتح البث يسجّل: (1) الصوت كله في ملف واحد (MediaRecorder): المؤثرات وصوت المذيع (cinema.js و presenter.js يوصلونها لـ recTap)
     ومايكات المتسابقين والمنظم (مسارات أجورا)، و(2) كل تغيير في وثيقة البث بوقته (المفاتيح اللي تغيّرت بس) وتفاعلات الجمهور.
   - لما ينتهي البث (أو يطلع المنظم من الشاشة) التسجيل ينحفظ في الجهاز أول (IndexedDB) وبعدين يرتفع: الصوت لـ Cloudinary،
     والأحداث مضغوطة في liveSecrets/rec_<رقم>_c<جزء> و liveSecrets/rec_<رقم> والقائمة في liveSecrets/_recs (المنظم بس، القواعد).
     لو الرفع فشل يبقى في الجهاز وفيه زر "ارفع" في القائمة.
   - المشاهدة: القائمة الجانبية ← "تسجيلات البث" ← "شاهد": نفس شاشة البث بالضبط كأنك مشاهد (window.BC_REPLAY: الوقت من الصوت،
     ما يكتب شي، ما يتصل بأجورا، والمؤثرات وصوت المذيع من التسجيل نفسه)، مع تشغيل وإيقاف وشريط تقديم. */
var BC_REPLAY = null;
const REC = { id: "", mr: null, chunks: [], ev: [], last: {}, lastObj: null, t0: 0, tap: null, dest: null, srcs: new Map(), mime: "", title: "", stopping: null };
const REC_CHUNK = 700000;   /* حجم الجزء في Firestore (أقل من 1MB) */
function recTap() { return REC.tap; }
function recOn() { return !!REC.id; }

/* ===== التسجيل (جهاز المنظم) ===== */
function recWant(d) {
    return !!(isAdmin && !window.BC_REPLAY && openLiveId && openLiveId !== "__replay" && d && d.status === "live" && typeof MediaRecorder !== "undefined" && window.indexedDB);
}
/* ينادى كل 200ms من liveTick */
function recTick(d) {
    if (window.BC_REPLAY) return recReplayTick();
    if (REC.id && (REC.id !== openLiveId || !d || d.status !== "live")) recStop(REC.id === openLiveId ? d : null);
    if (!REC.id && !REC.stopping && recWant(d)) recStart(d);
    if (REC.id) { recSyncPoint(); recSnap(d); recAttach(); }
}
function recStart(d) {
    try {
        const G = cineGraph(), c = G.c;
        if (c.state !== "running") { try { c.resume(); } catch (e) {} return; }   /* المحرك الصوتي واقف: نحاول نشغّله ونبدأ التسجيل التيك الجاي */
        const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || "";
        const tap = c.createGain(), dest = c.createMediaStreamDestination();
        tap.connect(dest);
        if (G.master) G.master.connect(tap);
        const mr = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
        Object.assign(REC, { id: openLiveId, mr, chunks: [], ev: [], last: {}, lastObj: null, t0: bcNow(), tap, dest, srcs: new Map(), mime: mr.mimeType || mime || "audio/webm",
            title: bcIsReh(openLiveId) ? "بث خاص" : ("الجولة " + (d.round || "")) });
        mr.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
        mr.start(10000);
        /* ساعة الصوت (وقت المحرك الصوتي) مع ساعة البث: لو الجوال علّق أو الصوت وقف لحظات، التسجيل يقصر عن الوقت الحقيقي،
           فنحفظ نقاط مزامنة [وقت الصوت, وقت البث] والمشاهدة تحسب وقت الصورة من مكان الصوت (تأخير وبطء، شكوى محمد 10 نوفمبر) */
        REC.ctx = c; REC.a0 = c.currentTime; REC.sync = [[0, Math.round(bcNow())]];
    } catch (e) { console.error("تسجيل البث: ما بدأ", e); REC.id = ""; }
}
function recAudioMs() { return REC.ctx ? Math.round((REC.ctx.currentTime - REC.a0) * 1000) : 0; }
/* نقطة مزامنة لو ساعة الصوت بعدت عن ساعة البث أكثر من 60ms (أو كل 5 ث) */
function recSyncPoint() {
    if (!REC.sync) return;
    const a = recAudioMs(), sv = Math.round(bcNow()), last = REC.sync[REC.sync.length - 1];
    if (Math.abs(sv - (last[1] + (a - last[0]))) > 60 || a - last[0] >= 5000) REC.sync.push([a, sv]);
}
/* وقت البث المقابل لمكان في الصوت (ms): آخر نقطة مزامنة قبله (ولو تكرر نفس المكان، الأخيرة: يقفز فوق اللحظات اللي ما انسجلت) */
function recMap(sync, a) {
    let lo = 0, hi = sync.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (sync[m][0] <= a) lo = m; else hi = m - 1; }
    return sync[lo][1] + (a - sync[lo][0]);
}
/* حدث جديد بالمفاتيح اللي تغيّرت بس (وأول حدث فيه الوثيقة كاملة) */
function recSnap(d) {
    if (!d || d === REC.lastObj) return;
    REC.lastObj = d;
    const patch = {}, del = [];
    let any = false;
    Object.keys(d).forEach(k => {
        let s; try { s = JSON.stringify(d[k]); } catch (e) { return; }
        if (s === undefined) return;
        if (REC.last[k] !== s) { REC.last[k] = s; patch[k] = JSON.parse(s); any = true; }
    });
    Object.keys(REC.last).forEach(k => { if (!(k in d)) { delete REC.last[k]; del.push(k); any = true; } });
    if (any) REC.ev.push(del.length ? [Math.round(bcNow() - REC.t0), patch, del] : [Math.round(bcNow() - REC.t0), patch]);
}
/* تفاعلات الجمهور (react.js) تنحفظ مع الأحداث وتطير وقت المشاهدة */
function recRx(b) { if (REC.id) REC.ev.push([Math.round(bcNow() - REC.t0), { _rx: b }]); }
/* مايكات المتسابقين والمنظم (أجورا) تدخل التسجيل */
function recAttach() {
    if (!REC.tap) return;
    const tracks = [];
    try { if (typeof bcClient !== "undefined" && bcClient) bcClient.remoteUsers.forEach(u => { if (u.audioTrack) tracks.push(u.audioTrack.getMediaStreamTrack()); }); } catch (e) {}
    try { if (typeof bcTrack !== "undefined" && bcTrack) tracks.push(bcTrack.getMediaStreamTrack()); } catch (e) {}
    const c = REC.tap.context;
    tracks.forEach(t => {
        if (!t || REC.srcs.has(t.id) || t.readyState === "ended") return;
        try { const s = c.createMediaStreamSource(new MediaStream([t])); s.connect(REC.tap); REC.srcs.set(t.id, s); } catch (e) {}
    });
}
function recStop(dLast) {
    if (!REC.id || !REC.mr) { REC.id = ""; return; }
    if (dLast) recSnap(dLast);
    recSyncPoint();
    const r = { id: REC.id, mr: REC.mr, chunks: REC.chunks, ev: REC.ev, t0: REC.t0, t1: bcNow(), mime: REC.mime, title: REC.title, tap: REC.tap, srcs: REC.srcs, sync: REC.sync, adur: recAudioMs() };
    Object.assign(REC, { id: "", mr: null, chunks: [], ev: [], last: {}, lastObj: null, tap: null, dest: null, srcs: new Map(), sync: null, ctx: null });
    REC.stopping = new Promise(res => {
        r.mr.onstop = () => res();
        try { r.mr.state !== "inactive" ? r.mr.stop() : res(); } catch (e) { res(); }
        setTimeout(res, 4000);
    }).then(async () => {
        try { r.tap.disconnect(); } catch (e) {}
        r.srcs.forEach(s => { try { s.disconnect(); } catch (e) {} });
        if (r.t1 - r.t0 < 5000 || !r.ev.length) return;   /* أقل من 5 ث: ما يستاهل */
        const rid = String(r.t0) + "_" + String(r.id).replace(/[^\w]/g, "").slice(0, 30);
        const meta = { rid, bid: String(r.id), title: r.title, at: Math.round(r.t0), dur: Math.round(r.adur || (r.t1 - r.t0)), mime: r.mime };
        const audio = new Blob(r.chunks, { type: r.mime });
        const tl = JSON.stringify({ v: 2, t0: Math.round(r.t0), sync: r.sync, ev: r.ev });
        await recLocalPut({ rid, meta, audio, tl });
        roomToast("انحفظ تسجيل البث", "save");
        recUpload(rid).catch(() => {});
    }).catch(e => console.error("تسجيل البث", e)).then(() => { REC.stopping = null; });
}

/* ===== الحفظ في الجهاز (IndexedDB) لين يرتفع ===== */
function recDB() {
    return new Promise((res, rej) => {
        const q = indexedDB.open("thaqafah-rec", 1);
        q.onupgradeneeded = () => q.result.createObjectStore("pending", { keyPath: "rid" });
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
}
async function recLocal(op, arg) {
    const db = await recDB();
    return new Promise((res, rej) => {
        const tx = db.transaction("pending", op === "get" || op === "all" ? "readonly" : "readwrite"), st = tx.objectStore("pending");
        const q = op === "put" ? st.put(arg) : op === "get" ? st.get(arg) : op === "del" ? st.delete(arg) : st.getAll();
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
}
function recLocalPut(x) { return recLocal("put", x); }

/* ===== الرفع ===== */
async function recGzipB64(str) {
    let bytes = new TextEncoder().encode(str), z = 0;
    if (typeof CompressionStream !== "undefined") {
        bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()); z = 1;
    }
    let bin = ""; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return { z, b64: btoa(bin) };
}
async function recUnB64(b64, z) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (!z) return new TextDecoder().decode(bytes);
    return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
const REC_UP = {};
async function recUpload(rid) {
    if (REC_UP[rid]) return REC_UP[rid];
    REC_UP[rid] = (async () => {
        const x = await recLocal("get", rid);
        if (!x) return;
        const fd = new FormData();
        fd.append("file", x.audio, "bc_" + rid + (/mp4/.test(x.meta.mime) ? ".m4a" : ".webm"));
        fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.secure_url) throw new Error((j.error && j.error.message) || ("رفع الصوت " + r.status));
        const enc = await recGzipB64(x.tl);
        const parts = [];
        for (let i = 0; i < enc.b64.length; i += REC_CHUNK) parts.push(enc.b64.slice(i, i + REC_CHUNK));
        const sec = firebaseDB.collection("liveSecrets");
        for (let k = 0; k < parts.length; k++) await sec.doc("rec_" + rid + "_c" + k).set({ d: parts[k] });
        const meta = Object.assign({}, x.meta, { audio: j.secure_url, parts: parts.length, z: enc.z });
        await sec.doc("rec_" + rid).set(meta);
        const li = await sec.doc("_recs").get();
        const list = ((li.exists && li.data().list) || []).filter(m => m.rid !== rid);
        list.push({ rid, title: meta.title, at: meta.at, dur: meta.dur });
        await sec.doc("_recs").set({ list: list.slice(-200) });
        await recLocal("del", rid);
        recRenderList();
    })().finally(() => { delete REC_UP[rid]; });
    return REC_UP[rid];
}

/* ===== القائمة (المنظم) ===== */
function recFmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function recDate(at) { try { return new Date(at).toLocaleString("ar-SA", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
async function recRenderList() {
    const box = document.getElementById("recBody");
    if (!box || !isAdmin) return;
    let up = [], local = [];
    try { const s = await firebaseDB.collection("liveSecrets").doc("_recs").get(); up = ((s.exists && s.data().list) || []).slice(); } catch (e) {}
    try { local = await recLocal("all"); } catch (e) {}
    up.sort((a, b) => b.at - a.at);
    const row = (m, btn) => `<div class="rec-row"><div class="t"><b>${escapeHTML(m.title || "البث")}</b><small>${escapeHTML(recDate(m.at))} · ${recFmt(m.dur)}</small></div>${btn}</div>`;
    let h = "";
    if (local.length) h += local.map(x => row(x.meta, `<button class="bc-go" onclick="recUploadNow(${jsArg(x.rid)})">${ic("share")} ارفع</button>`)).join("");
    h += up.map(m => row(m, `<button class="bc-go" onclick="recPlay(${jsArg(m.rid)})">${ic("rocket")} شاهد</button>`)).join("");
    box.innerHTML = h || `<div class="lv-muted">ما فيه تسجيلات</div>`;
}
async function recUploadNow(rid) {
    roomToast("جاري الرفع...", "hourglass");
    try { await recUpload(rid); roomToast("ارتفع التسجيل", "check-circle"); } catch (e) { roomToast("ما ارتفع: " + (e && e.message), "alert"); }
    recRenderList();
}
function openRecModal() {
    if (!isAdmin) return;
    const b = document.getElementById("recBody"); if (b) b.innerHTML = `<div class="lv-muted">...</div>`;
    openModal("recModal");
    recRenderList();
}

/* ===== المشاهدة ===== */
async function recPlay(rid) {
    if (!isAdmin || window.BC_REPLAY || openLiveId) return;
    roomToast("جاري تحميل التسجيل...", "hourglass");
    let tl;
    const sec = firebaseDB.collection("liveSecrets");
    try {
        const m = await sec.doc("rec_" + rid).get();
        if (!m.exists) throw new Error("ما لقيته");
        const meta = m.data();
        const parts = [];
        for (let k = 0; k < (meta.parts || 0); k++) parts.push((await sec.doc("rec_" + rid + "_c" + k).get()).data().d);
        tl = JSON.parse(await recUnB64(parts.join(""), meta.z));
        tl.meta = meta;
    } catch (e) { return roomToast("تعذّر فتح التسجيل: " + (e && e.message), "alert"); }
    /* النافذة فوق شاشة البث: تتسكر، وخانتها في سجل الرجوع تصير عادية (الرجوع من المشاهدة يرجع للموقع) */
    try { closeAllModalsDirectly(); if (window.history.state && window.history.state.modalOpen) window.history.replaceState({}, ""); } catch (e) {}
    /* تسجيل الجوال (webm) ما فيه مدة ويتقدّم بصعوبة، فنطلبه من Cloudinary محوّل mp3 */
    let src = String(tl.meta.audio || "");
    if (/res\.cloudinary\.com\/.+\/video\/upload\//.test(src)) src = src.replace(/\.(webm|m4a|mp4|ogg)(\?.*)?$/i, ".mp3");
    const audio = new Audio(safeSrc(src));
    audio.preload = "auto";
    if (!tl.sync || !tl.sync.length) tl.sync = [[0, tl.t0]];   /* التسجيلات الأولى (قبل نقاط المزامنة) */
    const R = { tl, audio, i: 0, st: {}, t: -1, adminWas: isAdmin, ct: -1, perf: 0, am: 0,
        /* مكان الصوت (ms) بنعومة: currentTime يتحدث على دفعات في بعض المتصفحات، فبين التحديثات نكمّل بساعة الجهاز (بحد 300ms) */
        audioMs() {
            const ct = audio.currentTime, p = performance.now();
            if (ct !== this.ct) { this.ct = ct; this.perf = p; }
            const playing = !audio.paused && !audio.ended && audio.readyState >= 3;
            return ct * 1000 + (playing ? Math.min(300, (p - this.perf) * (audio.playbackRate || 1)) : 0);
        },
        last: 0,
        /* ما يرجع ورا بفروقات صغيرة (الصورة ما ترتجف)، إلا لو رجع بالشريط */
        now() { const v = recMap(tl.sync, this.audioMs()); if (v < this.last && this.last - v < 400) return this.last; this.last = v; return v; } };
    R.audio.addEventListener("ended", () => recCtlPaint());
    window.BC_REPLAY = BC_REPLAY = R;
    isAdmin = false;   /* تشوفه كمشاهد (بدون أزرار المقدم ولا كتابة) */
    recApply(0, true);
    openLiveScreen("__replay");
    recCtlPaint();
    audio.play().catch(() => recCtlPaint());
}
/* يطبّق الأحداث لين الوقت t (ms من البداية)؛ لو رجع ورا يبني من أول */
function recApply(t, silent) {
    const R = BC_REPLAY, ev = R.tl.ev;
    if (t < R.t - 1) { R.i = 0; R.st = {}; silent = true; }
    let changed = false;
    while (R.i < ev.length && ev[R.i][0] <= t) {
        const e = ev[R.i++];
        if (e[1]._rx) { if (!silent) rxBurst(e[1]._rx, ""); continue; }
        Object.assign(R.st, JSON.parse(JSON.stringify(e[1])));
        (e[2] || []).forEach(k => delete R.st[k]);
        changed = true;
    }
    R.t = t;
    if (changed || !liveMatchesCache.__replay) liveMatchesCache.__replay = Object.assign({}, R.st);
    return changed;
}
function recReplayTick() {
    const R = BC_REPLAY;
    if (!R) return;
    const am = R.audioMs(), t = R.now() - R.tl.t0;
    const jump = am < R.am - 400 || am > R.am + 1500;   /* تقديم أو رجوع بالشريط: بدون تفاعلات ولا أصوات */
    R.am = am;
    if (recApply(t, jump) && openLiveId === "__replay") renderLiveScreen();
    recCtlPaint();
}
function recCtlPaint() {
    const R = BC_REPLAY, scr = document.getElementById("liveScreen");
    if (!R || !scr) return;
    let el = document.getElementById("recCtl");
    const dur = (R.tl.meta.dur || 0) / 1000, cur = R.audio.currentTime || 0;
    if (!el) {
        el = document.createElement("div"); el.id = "recCtl"; el.className = "rec-ctl";
        el.innerHTML = `<button class="rec-pp" onclick="recToggle()"></button><input type="range" min="0" step="0.5" oninput="recSeek(this.value)"><span class="rec-time"></span>`;
        scr.appendChild(el);
    }
    const pp = el.querySelector(".rec-pp"), rg = el.querySelector("input"), tm = el.querySelector(".rec-time");
    const playing = !R.audio.paused && !R.audio.ended;
    const pi = playing ? "❚❚" : "▶";
    if (pp.textContent !== pi) pp.textContent = pi;
    rg.max = String(Math.max(1, Math.round(dur)));
    if (document.activeElement !== rg) rg.value = String(cur);
    const txt = recFmt(cur * 1000) + " / " + recFmt(dur * 1000);
    if (tm.textContent !== txt) tm.textContent = txt;
}
function recToggle() { const R = BC_REPLAY; if (!R) return; if (R.audio.paused) R.audio.play().catch(() => {}); else R.audio.pause(); recCtlPaint(); }
function recSeek(v) { const R = BC_REPLAY; if (!R) return; R.audio.currentTime = Number(v) || 0; R.ct = -1; R.last = 0; recReplayTick(); }
/* closeLiveScreen يناديها: يرجع كل شي زي ما كان */
function recOnClose() {
    const R = BC_REPLAY;
    if (!R) return;
    try { R.audio.pause(); R.audio.src = ""; } catch (e) {}
    window.BC_REPLAY = BC_REPLAY = null;
    isAdmin = R.adminWas;
    delete liveMatchesCache.__replay;
    const el = document.getElementById("recCtl"); if (el) el.remove();
}
