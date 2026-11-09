/* تبويب المجلس (8 نوفمبر 2026، طلب محمد): كان "الغرفة"، وصار فيه قسمين:
   الغرفة: الفعاليات عن بعد بالصوت (الغرفة الصوتية والألعاب، الكود في room*.js و som.js و bara.js).
   الجلسة: الفعاليات الحضورية في الجمعات والاستراحات. المضيف يفتح جلسة بشاشة جواله، والحاضرين ينضمون برمز
   (أو يضيفهم هو بالاسم لو ما معهم جوال)، ولوحة النقاط تتحدث مباشرة عند الكل (sessions/<رمز 6 أحرف> و members تحته). */

const SESS_KEY = "thq:sess";
const sj = { pane: "room" };
let sess = null;            /* الجلسة المفتوحة: { id, title, place, hostUid, hostName, status } */
let sessMembers = [];       /* [{ id, name, pts }] */
let sessUnsub = null, sessMembersUnsub = null;
let sessHostList = [];      /* جلساتي المفتوحة (للمضيف) */
let sessHostUnsub = null, sessHostUid = null;

function sessCol() { return firebaseDB.collection("sessions"); }
function sessGenCode() {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint32Array(6);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    let c = "";
    for (let i = 0; i < 6; i++) c += A[buf[i] % A.length];
    return c;
}
function sessUrl(id) { return location.origin + "/?s=" + encodeURIComponent(id); }
function sessIsHost() { return !!(sess && currentUser && currentUser.uid === sess.hostUid); }

function initMajlis() {
    let id = null;
    try { id = new URLSearchParams(location.search).get("s"); } catch (e) {}
    if (id && /^[A-Z0-9]{6}$/.test(id.toUpperCase())) {
        sj.pane = "session";
        setTimeout(() => {
            showTabNow(document.querySelector('.bottom-nav .tab[data-sec="majlis"]'), "majlis");
            sessOpen(id.toUpperCase());
        }, 400);
        return;
    }
    try { id = localStorage.getItem(SESS_KEY); } catch (e) { id = null; }
    if (id && /^[A-Z0-9]{6}$/.test(id)) sessOpen(id, true);
}

function mjSetPane(k) {
    sj.pane = k === "session" ? "session" : "room";
    renderMajlis();
}

function renderMajlis() {
    const seg = document.getElementById("mjSeg");
    if (!seg) return;
    seg.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.k === sj.pane));
    const room = document.getElementById("mjRoom"), ses = document.getElementById("mjSession");
    room.style.display = sj.pane === "room" ? "" : "none";
    ses.style.display = sj.pane === "session" ? "" : "none";
    /* نقطة خضراء على الجلسة لو فيه جلسة شغالة عندي */
    const sb = seg.querySelector('button[data-k="session"]');
    if (sb) sb.classList.toggle("has-live", !!(sess && sess.status === "open"));
    if (sj.pane === "room") { if (typeof renderRoomCard === "function") renderRoomCard(); }
    else renderSession();
}

/* ===== الجلسة ===== */
function renderSession() {
    const box = document.getElementById("mjSession");
    if (!box) return;
    if (!sess) return renderSessionHome(box);
    const host = sessIsHost();
    const me = currentUser ? sessMembers.find(m => m.id === currentUser.uid) : null;
    const open = sess.status === "open";
    const ranked = sessMembers.slice().sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name, "ar"));
    let rank = 0, prev = null, shown = 0;
    const rows = ranked.map(m => {
        shown++;
        if (m.pts !== prev) { rank = shown; prev = m.pts; }
        const ctl = host && open ? `
<span class="sj-ctl">
<button type="button" onclick="sessPts(${jsArg(m.id)}, -1)" aria-label="ناقص نقطة">−1</button>
<button type="button" class="plus" onclick="sessPts(${jsArg(m.id)}, 1)" aria-label="زائد نقطة">+1</button>
<button type="button" class="plus" onclick="sessPts(${jsArg(m.id)}, 2)" aria-label="زائد نقطتين">+2</button>
<button type="button" class="rm" onclick="sessRemove(${jsArg(m.id)})" aria-label="حذف ${escapeHTML(m.name)}">${ic("trash")}</button>
</span>` : "";
        return `<div class="sj-row ${me && me.id === m.id ? "me" : ""} ${rank === 1 && m.pts > 0 ? "first" : ""}">
<span class="sj-rank">${rank}</span>
<span class="sj-name">${escapeHTML(m.name)}${me && me.id === m.id ? " <small>(أنت)</small>" : ""}</span>
<span class="sj-pts">${m.pts}</span>${ctl}
</div>`;
    }).join("");

    let action = "";
    if (open && !host && !me) {
        action = currentUser
            ? `<button type="button" class="tn-primary" onclick="sessJoin()">${ic("plus")} انضم للجلسة</button>`
            : `<div class="tn-login">${ic("lock")} سجّل دخولك من تبويب "الحساب" عشان تنضم وتظهر في اللوحة.<button type="button" onclick="showTab(null,'accountTab')">الذهاب للحساب</button></div>`;
    }
    /* الألعاب: الطاولة المفتوحة تطلع للكل، والمضيف يفتح لعبة جديدة */
    const pills = (typeof somRoomPill === "function" ? somRoomPill() : "") + (typeof baraRoomPill === "function" ? baraRoomPill() : "");
    const somOn = typeof somActiveGame === "function" && somActiveGame(), baraOn = typeof baraActiveGame === "function" && baraActiveGame();
    const gameBtns = host && open ? `<div class="sj-gbtns">
${somOn ? "" : `<button type="button" onclick="somCreate()">${ic("dice")}<b>السوم</b><small>أوراق وسوم ومفاوضة</small></button>`}
${baraOn ? "" : `<button type="button" onclick="baraCreate()">${ic("users")}<b>برا السالفة</b><small>مين برا السالفة؟</small></button>`}
</div>` : "";
    const games = open && (pills || gameBtns) ? `<div class="sj-games"><h4>${ic("gamepad")} الألعاب</h4>${pills}${gameBtns}</div>` : "";
    const winner = !open && ranked.length && ranked[0].pts > 0 ? ranked[0] : null;

    box.innerHTML = `
<div class="sj-head ${open ? "" : "ended"}">
<button type="button" class="tn-back" onclick="sessLeave()" aria-label="رجوع للجلسات">${ic("chevron-right")}</button>
<div class="sj-title"><b>${escapeHTML(sess.title)}</b><small>${escapeHTML(sess.place)} · المضيف: ${escapeHTML(sess.hostName || "-")}</small></div>
<span class="sj-state">${open ? `<i class="dot"></i> مباشرة` : "انتهت"}</span>
${moreMenuHTML("sjMenu", [
    host && open ? { icon: "check-circle", label: "إنهاء الجلسة", action: "sessEnd()" } : null,
    me && !host && open ? { icon: "x", label: "مغادرة الجلسة", action: "sessQuit()" } : null,
    host ? { icon: "trash", label: "حذف الجلسة", action: "sessDelete()", danger: true } : null
])}
</div>
<div class="sj-code">
<span>رمز الجلسة</span><b dir="ltr">${escapeHTML(sess.id)}</b>
<button type="button" onclick="sessShare()">${ic("share")} شارك</button>
</div>
${winner ? `<div class="sj-winner">${ic("crown")} الفائز: <b>${escapeHTML(winner.name)}</b> بـ ${winner.pts} نقطة</div>` : ""}
${action}
${games}
<div class="sj-board">${rows || `<div class="empty-state">${open ? "ما فيه حاضرين للحين. شارك الرمز، أو أضفهم بالاسم." : "ما كان فيه حاضرين"}</div>`}</div>
${host && open ? `
<div class="tn-join sj-add">
<input type="text" id="sessGuestName" maxlength="30" placeholder="أضف حاضر بالاسم (بدون جوال)" onkeydown="if(event.key==='Enter')sessAddGuest()">
<button type="button" onclick="sessAddGuest()">إضافة</button>
</div>` : ""}`;
}

function renderSessionHome(box) {
    const mine = sessHostList;
    box.innerHTML = `
<div class="tn-intro">
<h3>${ic("users")} الجلسة</h3>
<p>للفعاليات اللي تقام عندكم في الجمعات والاستراحات. افتح جلسة وشارك الرمز، والحاضرين ينضمون من جوالاتهم، ولوحة النقاط تتحدث قدام الكل وإنت تعطي النقاط وقت ما يجاوبون.</p>
<button type="button" class="tn-primary" onclick="sessOpenCreate()">${ic("plus")} ابدأ جلسة جديدة</button>
</div>
<div class="tn-join">
<input type="text" id="sessJoinCode" maxlength="6" dir="ltr" autocapitalize="characters" placeholder="رمز الجلسة (6 أحرف)" onkeydown="if(event.key==='Enter')sessJoinByCode()">
<button type="button" onclick="sessJoinByCode()">ادخل</button>
</div>
${currentUser ? `<h4 class="tn-h">جلساتي المفتوحة</h4>
${mine.length ? mine.map(s => `<button type="button" class="tn-item" onclick="sessOpen(${jsArg(s.id)})"><span class="tn-item-ic">${ic("users")}</span><span class="tn-item-b"><b>${escapeHTML(s.title)}</b><small>${escapeHTML(s.place)} · الرمز ${escapeHTML(s.id)}</small></span><span class="tn-item-go">${ic("chevron-right")}</span></button>`).join("") : `<div class="empty-state">ما عندك جلسات مفتوحة</div>`}` : `<div class="tn-login">${ic("lock")} سجّل دخولك من تبويب "الحساب" عشان تفتح جلسة. الدخول بالرمز للمشاهدة بدون حساب.<button type="button" onclick="showTab(null,'accountTab')">الذهاب للحساب</button></div>`}`;
    loadHostSessions();
}

function loadHostSessions() {
    if (!firebaseReady || !firebaseDB || !currentUser) return;
    if (sessHostUnsub && sessHostUid === currentUser.uid) return;
    if (sessHostUnsub) { sessHostUnsub(); sessHostUnsub = null; sessHostList = []; }
    sessHostUid = currentUser.uid;
    sessHostUnsub = sessCol().where("hostUid", "==", currentUser.uid).onSnapshot(snap => {
        sessHostList = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(s => s.status === "open")
            .sort((a, b) => ((b.createdAt && b.createdAt.toMillis && b.createdAt.toMillis()) || 0) - ((a.createdAt && a.createdAt.toMillis && a.createdAt.toMillis()) || 0));
        if (sj.pane === "session" && !sess) renderSession();
    }, () => {});
}

function sessOpenCreate() {
    if (!currentUser) { roomToast("سجّل دخولك أول من تبويب الحساب", "lock"); return; }
    if (sessHostList.length >= 3) return alert("عندك 3 جلسات مفتوحة. أنهِ وحدة منها أول.");
    openModal("sessionCreateModal");
}

async function sessCreate() {
    if (!currentUser || !firebaseReady) return;
    const title = (document.getElementById("sessTitle").value || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const place = document.getElementById("sessPlace").value;
    if (!title) return alert("اكتب اسم الجلسة");
    const btn = document.getElementById("sessCreateBtn");
    btn.disabled = true;
    const data = {
        title: title, place: place,
        hostUid: currentUser.uid,
        hostName: ((currentUserDocData && currentUserDocData.name) || currentUser.displayName || "مستخدم").slice(0, 60),
        status: "open",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    let id = null, lastErr = null;
    for (let i = 0; i < 3 && !id; i++) {
        const code = sessGenCode();
        try { await sessCol().doc(code).set(data); id = code; } catch (e) { lastErr = e; if (!e || e.code !== "permission-denied") break; }
    }
    btn.disabled = false;
    if (!id) return alert("ما انسوت الجلسة: " + authErrAr(lastErr));
    document.getElementById("sessTitle").value = "";
    goBackModal();
    setTimeout(() => sessOpen(id), 150);
}

function sessJoinByCode() {
    const inp = document.getElementById("sessJoinCode");
    const id = ((inp && inp.value) || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(id)) return alert("الرمز 6 أحرف وأرقام");
    sessOpen(id);
}

function sessOpen(id, quiet) {
    if (!firebaseReady || !firebaseDB) return;
    sessDetach();
    sj.pane = "session";
    let first = true;
    sessUnsub = sessCol().doc(id).onSnapshot(doc => {
        if (!doc.exists) {
            if (!quiet || !first) roomToast(first ? "ما لقيت جلسة بهذا الرمز" : "الجلسة انحذفت", "lock");
            sessLeave();
            return;
        }
        sess = Object.assign({ id: id }, doc.data());
        if (first) {
            first = false; try { localStorage.setItem(SESS_KEY, id); } catch (e) {}
            /* ألعاب الجلسة (السوم وبرا السالفة): تشتغل على sessions/<الرمز>/games */
            if (typeof somSetSession === "function") somSetSession(id);
            if (typeof baraSetSession === "function") baraSetSession(id);
        }
        renderMajlis();
    }, () => { sessLeave(); });
    sessMembersUnsub = sessCol().doc(id).collection("members").onSnapshot(snap => {
        sessMembers = snap.docs.map(d => { const x = d.data(); return { id: d.id, name: String(x.name || "-"), pts: Number(x.pts) || 0 }; });
        if (sj.pane === "session") renderSession();
    }, () => {});
    if (!quiet) renderMajlis();
}
function sessDetach() {
    if (typeof somSetSession === "function") somSetSession(null);
    if (typeof baraSetSession === "function") baraSetSession(null);
    if (sessUnsub) { sessUnsub(); sessUnsub = null; }
    if (sessMembersUnsub) { sessMembersUnsub(); sessMembersUnsub = null; }
}
function sessLeave() {
    sessDetach();
    sess = null; sessMembers = [];
    try { localStorage.removeItem(SESS_KEY); } catch (e) {}
    renderMajlis();
}

/* ===== الحاضر ===== */
function sessMyName() {
    return ((currentUserDocData && currentUserDocData.name) || (currentUser && currentUser.displayName) || "مستخدم").trim().slice(0, 30);
}
function sessJoin() {
    if (!sess || !currentUser) return;
    sessCol().doc(sess.id).collection("members").doc(currentUser.uid).set({
        name: sessMyName(), pts: 0, joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => roomToast("انضميت للجلسة", "check-circle")).catch(err => alert("ما قدرت تنضم: " + authErrAr(err)));
}
async function sessQuit() {
    if (!sess || !currentUser || !await uiConfirm("تبي تغادر الجلسة؟")) return;
    sessCol().doc(sess.id).collection("members").doc(currentUser.uid).delete().catch(err => alert("ما تمت المغادرة: " + authErrAr(err)));
}

/* ===== المضيف ===== */
function sessPts(memberId, delta) {
    if (!sessIsHost() || sess.status !== "open") return;
    sessCol().doc(sess.id).collection("members").doc(memberId)
        .update({ pts: firebase.firestore.FieldValue.increment(delta) })
        .catch(err => alert("ما انحفظت النقطة: " + authErrAr(err)));
}
function sessAddGuest() {
    if (!sessIsHost() || sess.status !== "open") return;
    const inp = document.getElementById("sessGuestName");
    const name = ((inp && inp.value) || "").trim().replace(/\s+/g, " ").slice(0, 30);
    if (!name) return;
    if (sessMembers.some(m => m.name === name)) return alert("فيه حاضر بنفس الاسم");
    if (sessMembers.length >= 40) return alert("وصلت الحد (40 حاضر)");
    const gid = "g_" + sessGenCode() + sessGenCode().slice(0, 2);
    sessCol().doc(sess.id).collection("members").doc(gid).set({
        name: name, pts: 0, joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => { if (inp) { inp.value = ""; inp.focus(); } }).catch(err => alert("ما انضاف: " + authErrAr(err)));
}
async function sessRemove(memberId) {
    if (!sessIsHost()) return;
    const m = sessMembers.find(x => x.id === memberId);
    if (!m || !await uiConfirm(`نحذف ${m.name} من الجلسة؟`)) return;
    sessCol().doc(sess.id).collection("members").doc(memberId).delete().catch(err => alert("ما انحذف: " + authErrAr(err)));
}
async function sessEnd() {
    if (!sessIsHost() || !await uiConfirm("ننهي الجلسة؟ اللوحة تبقى للقراءة بس.")) return;
    sessCol().doc(sess.id).update({ status: "ended", endedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(err => alert("ما انتهت الجلسة: " + authErrAr(err)));
}
async function sessDelete() {
    if (!sessIsHost() || !await uiConfirm("نحذف الجلسة ولوحتها نهائياً؟")) return;
    const id = sess.id;
    try {
        const snap = await sessCol().doc(id).collection("members").get();
        await Promise.all(snap.docs.map(d => d.ref.delete()));
        await sessCol().doc(id).delete();
    } catch (err) { alert("ما انحذفت: " + authErrAr(err)); }
}
async function sessShare() {
    if (!sess) return;
    const url = sessUrl(sess.id);
    const text = `انضم لجلسة "${sess.title}" على منصة فيكارو الثقافية\nالرمز: ${sess.id}\n${url}`;
    if (navigator.share) { try { await navigator.share({ title: sess.title, text: text, url: url }); } catch (e) {} return; }
    try { await navigator.clipboard.writeText(text); roomToast("اننسخ رابط الجلسة", "check-circle"); }
    catch (e) { await uiPrompt("انسخ الرابط:", url); }
}
