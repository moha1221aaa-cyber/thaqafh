/* تفاعلات الجمهور بالإيموجي (10 نوفمبر 2026، طلب محمد): زر فوق البث يفتح صف إيموجيات، والضغطة تطلع الإيموجي يطير فوق شاشة البث عند الكل.
   عشان ما نصرف قراءات Firestore (المشروع على الباقة المجانية): كل مشاهد يجمع ضغطاته ويكتبها كل 2.5 ث بالكثير في وثيقته
   room/main/liveRx/<البث>/u/<uid> {c: {إيموجي: عدد تراكمي}, n, at} (صاحبها بس يكتب، firestore.rules)، وجهاز المنظم بس يسمعها
   ويكتب كل 2.5 ث بالكثير ملخص واحد room/main/liveRx/<البث> {b: {uid: {إيموجي: كم جديد}}, n, at}، والكل يسمع الملخص ويطيّر اللي جا من غيره
   (اللي ضغطه هو طار عنده على طول). الضيف (بدون حساب) يشوف إيموجيه عنده بس. البث المسجّل (record.js) ياخذ الملخصات ويعيدها وقت المشاهدة */
const BC_RX = ["👏", "🔥", "❤️", "😂", "😮", "🎉"];
const RX = { open: false, mine: {}, sentN: 0, pend: false, timer: 0, sub: null, subId: "", agg: null, aggId: "", seen: {}, hostPend: {}, hostTimer: 0, aggN: 0, lastAgg: null };
function rxReset() { RX.open = false; RX.lastAgg = null; }
function rxDoc(id) { return firebaseDB.collection("room").doc("main").collection("liveRx").doc(String(id)); }

function bcFloat(e, mine) {
    const scr = document.getElementById("liveScreen");
    if (!scr || (CINE_REDUCED && !mine)) return;
    if (scr.querySelectorAll(".st-float").length > 24) return;   /* حد عشان الجوال ما يثقل لو انهالت التفاعلات */
    const f = document.createElement("div");
    f.className = "st-float";
    f.textContent = e;
    f.style.left = (6 + Math.random() * 18) + "%";
    f.style.setProperty("--dx", ((Math.random() - 0.5) * 80) + "px");
    scr.appendChild(f);
    setTimeout(() => f.remove(), 2700);
}

/* ===== الزر والصف =====
   الزر مع أزرار البث الصغيرة جنب المقدم (bcSideCtlHTML في screen.js)، والصف يطلع تحته لما ينفتح.
   كان زر عائم تحت يسار ويركب على أزرار المقدم ونتيجة المواجهة (فحص 11 نوفمبر 2026) */
function rxOn(d) { return !!(d && d.status === "live" && !(typeof BC_REPLAY !== "undefined" && BC_REPLAY)); }
function rxBtnHTML(d) { return rxOn(d) ? `<button class="rx-side ${RX.open ? "on" : ""}" onclick="rxToggle()" aria-label="تفاعل" aria-expanded="${RX.open}">${RX.open ? ic("x") : "😀"}</button>` : ""; }
function rxBarHTML(d) {
    if (!rxOn(d) || !RX.open) return "";
    return `<div class="rx-bar open" id="rxBar"><div class="rx-row">${BC_RX.map((e, i) => `<button onclick="bcReact(${i})" aria-label="${e}">${e}</button>`).join("")}</div></div>`;
}
function rxPaint(d) {
    const scr = document.getElementById("liveScreen");
    if (!scr) return;
    let el = document.getElementById("rxBar");
    const html = rxBarHTML(d);
    const btn = scr.querySelector(".rx-side");
    if (btn) { btn.classList.toggle("on", RX.open); btn.setAttribute("aria-expanded", String(RX.open)); const want = RX.open ? "x" : "e"; if (btn.dataset.k !== want) { btn.dataset.k = want; btn.innerHTML = RX.open ? ic("x") : "😀"; } }
    if (!html || !btn) { if (el) el.remove(); return; }
    if (!el) { const t = document.createElement("div"); t.innerHTML = html; el = t.firstChild; scr.appendChild(el); }
    const sr = scr.getBoundingClientRect(), br = btn.getBoundingClientRect();
    el.style.top = Math.round(br.bottom - sr.top + 6) + "px";
    el.style.left = Math.max(8, Math.round(br.left - sr.left)) + "px";
}
function rxToggle() { RX.open = !RX.open; rxPaint(liveMatchesCache[openLiveId]); }

/* ===== المشاهد يضغط ===== */
function bcReact(i) {
    const e = BC_RX[i];
    if (!e || !openLiveId) return;
    bcFloat(e, true);
    if (!currentUser || !firebaseDB || bcIsReh(openLiveId)) return;
    if (RX.mineId !== openLiveId) { RX.mineId = openLiveId; RX.mine = {}; RX.sentN = 0; }
    RX.mine[e] = (RX.mine[e] || 0) + 1;
    RX.pend = true;
    if (!RX.timer) RX.timer = setTimeout(rxFlush, 2500);
}
function rxFlush() {
    RX.timer = 0;
    if (!RX.pend || !openLiveId || !currentUser) return;
    RX.pend = false;
    RX.sentN++;
    rxDoc(openLiveId).collection("u").doc(currentUser.uid).set({ c: Object.assign({}, RX.mine), n: RX.sentN, at: Date.now() }).catch(() => {});
}

/* ===== المنظم: يجمع ويكتب ملخص واحد ===== */
function rxHostSync(d) {
    const want = !!(isAdmin && d && d.status === "live" && openLiveId && !bcIsReh(openLiveId) && !(typeof BC_REPLAY !== "undefined" && BC_REPLAY));
    const id = want ? openLiveId : "";
    if (RX.subId === id) return;
    if (RX.sub) { try { RX.sub(); } catch (e) {} RX.sub = null; }
    RX.subId = id; RX.seen = {}; RX.hostPend = {};
    if (!id) return;
    let first = true;
    RX.sub = rxDoc(id).collection("u").onSnapshot(s => {
        s.forEach(doc => {
            const c = (doc.data() || {}).c || {}, prev = RX.seen[doc.id] || {};
            if (!first) {
                BC_RX.forEach(e => {
                    const add = Math.max(0, Math.min(20, (Number(c[e]) || 0) - (Number(prev[e]) || 0)));
                    if (add) { const p = RX.hostPend[doc.id] = RX.hostPend[doc.id] || {}; p[e] = (p[e] || 0) + add; }
                });
            }
            RX.seen[doc.id] = c;
        });
        first = false;
        if (Object.keys(RX.hostPend).length && !RX.hostTimer) RX.hostTimer = setTimeout(rxHostFlush, 2500);
    }, () => {});
}
function rxHostFlush() {
    RX.hostTimer = 0;
    const id = RX.subId, b = RX.hostPend;
    if (!id || !Object.keys(b).length) return;
    RX.hostPend = {};
    RX.aggN++;
    rxDoc(id).set({ b: b, n: Date.now() * 10 + (RX.aggN % 10), at: Date.now() }).catch(() => {});
}

/* ===== الكل: يسمع الملخص ويطيّر تفاعلات الباقين ===== */
function rxListen(d) {
    const id = d && d.status === "live" && openLiveId && !bcIsReh(openLiveId) && !(typeof BC_REPLAY !== "undefined" && BC_REPLAY) ? openLiveId : "";
    if (RX.aggId === id) return;
    if (RX.agg) { try { RX.agg(); } catch (e) {} RX.agg = null; }
    RX.aggId = id; RX.lastAgg = null;
    if (!id || !firebaseDB) return;
    RX.agg = rxDoc(id).onSnapshot(s => {
        const x = s.exists ? s.data() : null;
        if (RX.lastAgg === null) { RX.lastAgg = x ? x.n : 0; return; }   /* أول قراءة (موجود أو لا): اللي قبل ما ينحسب */
        if (!x || !x.b) return;
        if (x.n === RX.lastAgg) return;
        RX.lastAgg = x.n;
        if (typeof recRx === "function") recRx(x.b);
        rxBurst(x.b, currentUser ? currentUser.uid : "");
    }, () => {});
}
/* يطيّر الإيموجيات (بالكثير 12 بالدفعة، موزعة على ثانيتين) */
function rxBurst(b, skipUid) {
    const list = [];
    Object.keys(b || {}).forEach(uid => {
        if (uid === skipUid) return;
        const c = b[uid] || {};
        BC_RX.forEach(e => { for (let k = 0; k < Math.min(5, Number(c[e]) || 0); k++) list.push(e); });
    });
    list.slice(0, 12).forEach((e, k) => setTimeout(() => bcFloat(e, false), k * 160 + Math.random() * 120));
}
/* ينادى مع كل رسم للبث (screen.js) */
function rxSync(d) {
    rxPaint(d);
    rxListen(d);
    rxHostSync(d);
}
