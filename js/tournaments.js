/* تبويب البطولات (8 نوفمبر 2026، طلب محمد): دمج الترتيب والمواجهات في مكان واحد.
   الرسمية: بطولتين ينظمهم منظم المنصة، "أبطال النخبة الثقافي" (الدوري الرئيسي league/current، وعليه البث المباشر)
   و"تصفيات أبطال النخبة الثقافي" (league/qualifiers، نفس الشكل بدون بث).
   الخاصة: أي مستخدم مسجّل ينشئ بطولة بينه وبين أصحابه (privateTournaments/<رمز 8 أحرف>)، يدخل نتايجها هو بس،
   والباقين يشوفونها بالرمز أو الرابط ?t=<الرمز>. */

const ELITE_TITLE = "أبطال النخبة الثقافي";
const QUAL_TITLE = "تصفيات أبطال النخبة الثقافي";
const TN_PRIV_MAX_OWNED = 5;
const TN_JOINED_KEY = "thq:joined";
const TN_STATE_KEY = "thq:tn";

const tn = { mode: "official", official: "elite", pane: "stand", priv: null };
let qual = { players: [], matches: [], links: {}, exists: false };
let privDoc = null;          /* البطولة الخاصة المفتوحة: { id, name, ownerUid, ownerName, double, players, matches } */
let privUnsub = null;
let privOwned = [];          /* بطولاتي: [{id, name, n, played}] */
let privJoined = {};         /* اللي انضميت لها: id → { name, ownerName, n } */
let privOwnedUnsub = null;
let tnDeepLink = (() => { try { return new URLSearchParams(location.search).get("t"); } catch (e) { return null; } })();

function tnStore(get, set) {
    try {
        if (set === undefined) return JSON.parse(localStorage.getItem(get) || "null");
        localStorage.setItem(get, JSON.stringify(set));
    } catch (e) {}
    return null;
}

/* لاعبين ومواجهات من الشكل المحفوظ (أسماء) إلى الشكل المعروض (كائنات تشترك في نفس اللاعب) */
function tnHydrate(playersList, matchList) {
    const ps = (playersList || []).map(name => ({ name: name, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    const byName = {};
    ps.forEach(p => { byName[p.name] = p; });
    const get = n => byName[n] || (byName[n] = { name: n, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    const ms = (matchList || []).map(m => ({ p1: get(m.p1), p2: get(m.p2), s1: m.s1 == null ? "" : m.s1, s2: m.s2 == null ? "" : m.s2, round: m.round }));
    return { players: ps, matches: ms };
}
function tnSerialize(ms) {
    return ms.map(m => ({ p1: m.p1.name, p2: m.p2.name, s1: m.s1, s2: m.s2, round: m.round }));
}
function tnPlayedCount(list) {
    return (list || []).filter(m => m.s1 !== "" && m.s2 !== "" && m.s1 != null && m.s2 != null).length;
}

/* ===== السياق: وش المعروض الحين (الترتيب والمواجهات يرسمون منه) ===== */
function tCtx() {
    if (tn.mode === "private") {
        if (privDoc) {
            return {
                kind: "private", players: privDoc.players, matches: privDoc.matches, links: {},
                canEdit: !!(currentUser && currentUser.uid === privDoc.ownerUid), save: privSave,
                live: false, profile: false, title: privDoc.name, empty: "ما فيه متسابقين"
            };
        }
        return { kind: "none", players: [], matches: [], links: {}, canEdit: false, save: function () {}, live: false, profile: false, title: "", empty: "" };
    }
    if (tn.official === "qual") {
        return {
            kind: "qual", players: qual.players, matches: qual.matches, links: qual.links,
            canEdit: isAdmin, save: qualSave, live: false, profile: false, title: QUAL_TITLE,
            empty: qual.exists ? "ما فيه متسابقين" : "التصفيات ما بدأت للحين"
        };
    }
    return {
        kind: "elite", players: players, matches: matches, links: playerLinks,
        canEdit: isAdmin, save: save, live: true, profile: true, title: ELITE_TITLE, empty: "ما فيه متسابقين"
    };
}

/* ===== التصفيات (league/qualifiers) ===== */
function initTournaments() {
    const st = tnStore(TN_STATE_KEY);
    if (st && (st.mode === "official" || st.mode === "private")) tn.mode = st.mode;
    if (st && (st.official === "elite" || st.official === "qual")) tn.official = st.official;
    /* الرابط المشارك يفتح البطولة الخاصة مباشرة */
    if (tnDeepLink && /^[A-Z0-9]{8}$/.test(tnDeepLink.toUpperCase())) {
        tn.mode = "private";
        setTimeout(() => {
            showTabNow(document.querySelector('.bottom-nav .tab[data-sec="tournaments"]'), "tournaments");
            tnOpenPrivate(tnDeepLink.toUpperCase(), true);
        }, 400);
    }
    if (!firebaseReady || !firebaseDB) return;
    firebaseDB.collection("league").doc("qualifiers").onSnapshot(doc => {
        if (doc.exists) {
            const d = doc.data();
            const h = tnHydrate(d.playersList, d.matches);
            qual = { players: h.players, matches: h.matches, links: d.playerLinks || {}, exists: true };
        } else {
            qual = { players: [], matches: [], links: {}, exists: false };
        }
        if (tn.mode === "official" && tn.official === "qual") renderTournamentsPage();
        else renderTournamentCards();
    }, () => {});
    if (tn.mode === "private") loadPrivateLists();
    renderTournamentsPage();
}

function qualSave() {
    if (!isAdmin || !firebaseReady || !firebaseDB) return;
    firebaseDB.collection("league").doc("qualifiers").set({
        matches: tnSerialize(qual.matches),
        playersList: qual.players.map(p => p.name),
        playerLinks: qual.links || {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => { console.log(err); alert("ما انحفظ: " + authErrAr(err)); });
}
function qualAddPlayer() {
    if (!isAdmin) return;
    let name = prompt("اسم المتسابق الجديد في التصفيات:");
    if (!name || !name.trim()) return;
    name = name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (qual.players.some(p => p.name === name)) return alert("المتسابق موجود بنفس الاسم");
    if (qual.matches.some(m => m.s1 !== "" && m.s2 !== "") && !confirm("فيه نتايج مسجلة، وإضافة متسابق تعيد القرعة وتمسحها. نكمل؟")) return;
    const list = qual.players.map(p => p.name).concat([name]);
    qualRebuild(list);
}
function qualRedraw() {
    if (!isAdmin) return;
    if (!qual.players.length) return alert("أضف متسابقين أول");
    if (!confirm("نعيد القرعة ونمسح نتايج التصفيات؟")) return;
    qualRebuild(qual.players.map(p => p.name));
}
function qualRebuild(names) {
    const ps = names.map(n => ({ name: n, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    const ms = names.length >= 2 ? buildSchedule(ps, true) : [];
    qual = { players: ps, matches: ms, links: qual.links || {}, exists: true };
    qualSave();
    renderTournamentsPage();
}

/* ===== التنقل والرسم ===== */
function tnSetMode(k) {
    tn.mode = k === "private" ? "private" : "official";
    tnStore(TN_STATE_KEY, { mode: tn.mode, official: tn.official });
    if (tn.mode === "private") loadPrivateLists();
    renderTournamentsPage();
}
function tnPickOfficial(k) {
    tn.official = k === "qual" ? "qual" : "elite";
    tnStore(TN_STATE_KEY, { mode: tn.mode, official: tn.official });
    renderTournamentsPage();
}
function tnSetPane(k) {
    tn.pane = k === "matches" ? "matches" : "stand";
    paintTnPane();
}
function paintTnPane() {
    document.querySelectorAll("#tnSub button").forEach(b => b.classList.toggle("active", b.dataset.k === tn.pane));
    const st = document.getElementById("tnStand"), mt = document.getElementById("tnMatches");
    if (st) st.style.display = tn.pane === "stand" ? "" : "none";
    if (mt) mt.style.display = tn.pane === "matches" ? "" : "none";
    const lb = document.getElementById("liveMatchesBar");
    if (lb) lb.style.display = tn.mode === "official" && tn.official === "elite" ? "" : "none";
}

function renderTournamentCards() {
    const box = document.getElementById("tnPicker");
    if (!box) return;
    const eliteDone = tnPlayedCount(matches);
    const card = (k, title, sub, icon, n, played, total) => `
<button type="button" class="tn-card ${tn.official === k ? "active" : ""}" onclick="tnPickOfficial(${jsArg(k)})">
<span class="tn-card-ic">${ic(icon)}</span>
<span class="tn-card-t">${escapeHTML(title)}</span>
<span class="tn-card-s">${escapeHTML(sub)}</span>
<span class="tn-card-n">${n ? `${n} متسابق · ${played}/${total} مواجهة` : "لم تبدأ بعد"}</span>
</button>`;
    box.innerHTML =
        card("elite", ELITE_TITLE, "البطولة الرئيسية للمنصة", "trophy", players.length, eliteDone, matches.length) +
        card("qual", QUAL_TITLE, "طريقك لأبطال النخبة", "target", qual.players.length, tnPlayedCount(qual.matches), qual.matches.length);
}

function renderTournamentsPage() {
    const sec = document.getElementById("tournaments");
    if (!sec) return;
    const official = tn.mode === "official";
    document.querySelectorAll("#tnTop button").forEach(b => b.classList.toggle("active", b.dataset.k === tn.mode));
    document.getElementById("tnOfficialHead").style.display = official ? "" : "none";
    document.getElementById("tnPrivateHome").style.display = !official && !privDoc ? "" : "none";
    const showBody = official || !!privDoc;
    document.getElementById("tnBody").style.display = showBody ? "" : "none";

    const head = document.getElementById("tnBodyHead");
    if (official) {
        renderTournamentCards();
        head.innerHTML = "";
    } else if (privDoc) {
        head.innerHTML = privHeadHTML();
    } else {
        head.innerHTML = "";
        renderPrivateHome();
    }

    const adm = document.getElementById("tnAdminBox");
    if (adm) {
        const ctx = tCtx();
        if (official && isAdmin) {
            adm.innerHTML = `<div class="tn-admin">
<button type="button" onclick="${tn.official === "qual" ? "qualAddPlayer()" : "addNewPlayerPrompt()"}">${ic("plus")} إضافة متسابق</button>
<button type="button" onclick="${tn.official === "qual" ? "qualRedraw()" : "reDrawMatches()"}">${ic("dice")} إعادة القرعة</button>
</div>`;
        } else if (!official && privDoc && ctx.canEdit) {
            adm.innerHTML = `<div class="tn-admin">
<button type="button" onclick="privResetScores()">${ic("hourglass")} تصفير النتائج</button>
</div>`;
        } else adm.innerHTML = "";
    }
    if (showBody) { table(); renderMatches(); }
    paintTnPane();
}

/* ===== البطولات الخاصة ===== */
function privCol() { return firebaseDB.collection("privateTournaments"); }
function privGenCode() {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint32Array(8);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    let c = "";
    for (let i = 0; i < 8; i++) c += A[buf[i] % A.length];
    return c;
}
function privUrl(id) { return location.origin + "/?t=" + encodeURIComponent(id); }

function loadPrivateLists() {
    if (!firebaseReady || !firebaseDB) return;
    /* اللي انضميت لها: كل رمز محفوظ نجيب اسمه */
    const joined = tnStore(TN_JOINED_KEY) || [];
    joined.forEach(id => {
        if (privJoined[id]) return;
        privCol().doc(id).get().then(d => {
            if (d.exists) {
                const x = d.data();
                privJoined[id] = { name: x.name, ownerName: x.ownerName, ownerUid: x.ownerUid, n: (x.playersList || []).length };
            } else {
                tnStore(TN_JOINED_KEY, (tnStore(TN_JOINED_KEY) || []).filter(k => k !== id));
            }
            if (tn.mode === "private" && !privDoc) renderPrivateHome();
        }).catch(() => {});
    });
    /* بطولاتي */
    if (privOwnedUnsub) { privOwnedUnsub(); privOwnedUnsub = null; }
    privOwned = [];
    if (currentUser) {
        privOwnedUnsub = privCol().where("ownerUid", "==", currentUser.uid).onSnapshot(snap => {
            privOwned = snap.docs.map(d => {
                const x = d.data();
                return { id: d.id, name: x.name, n: (x.playersList || []).length, played: tnPlayedCount(x.matches), total: (x.matches || []).length, at: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : 0 };
            }).sort((a, b) => b.at - a.at);
            if (tn.mode === "private" && !privDoc) renderPrivateHome();
        }, () => {});
    }
}

function renderPrivateHome() {
    const box = document.getElementById("tnPrivateHome");
    if (!box) return;
    const item = (id, name, sub) => `
<button type="button" class="tn-item" onclick="tnOpenPrivate(${jsArg(id)})">
<span class="tn-item-ic">${ic("trophy")}</span>
<span class="tn-item-b"><b>${escapeHTML(name)}</b><small>${escapeHTML(sub)}</small></span>
<span class="tn-item-go">${ic("chevron-right")}</span>
</button>`;
    const joinedIds = Object.keys(privJoined).filter(id => !privOwned.some(o => o.id === id));
    box.innerHTML = `
<div class="tn-intro">
<h3>${ic("users")} بطولتك الخاصة</h3>
<p>سوّ مسابقة ثقافية بينك وبين أصحابك: تكتب أسماءهم، والموقع يسوي القرعة والترتيب، وتدخل النتايج من جوالك. وأصحابك يتابعونها بالرمز أو الرابط.</p>
<button type="button" class="tn-primary" onclick="tnOpenCreate()">${ic("plus")} بطولة خاصة جديدة</button>
</div>
<div class="tn-join">
<input type="text" id="tnJoinCode" maxlength="8" dir="ltr" autocapitalize="characters" placeholder="رمز البطولة (8 أحرف)" onkeydown="if(event.key==='Enter')tnJoin()">
<button type="button" onclick="tnJoin()">انضم</button>
</div>
${currentUser ? `
<h4 class="tn-h">بطولاتي</h4>
${privOwned.length ? privOwned.map(o => item(o.id, o.name, `${o.n} متسابق · ${o.played}/${o.total} مواجهة · الرمز ${o.id}`)).join("") : `<div class="empty-state">ما أنشأت أي بطولة للحين</div>`}` : `
<div class="tn-login">${ic("lock")} سجّل دخولك من تبويب "الحساب" عشان تنشئ بطولة خاصة. المشاهدة بالرمز بدون حساب.
<button type="button" onclick="showTab(null,'accountTab')">الذهاب للحساب</button></div>`}
${joinedIds.length ? `<h4 class="tn-h">بطولات تتابعها</h4>${joinedIds.map(id => item(id, privJoined[id].name, `المنظم: ${privJoined[id].ownerName || "-"} · ${privJoined[id].n} متسابق`)).join("")}` : ""}`;
}

function privHeadHTML() {
    const mine = currentUser && currentUser.uid === privDoc.ownerUid;
    return `
<div class="tn-phead">
<button type="button" class="tn-back" onclick="tnClosePrivate()">${ic("chevron-right")} بطولاتي</button>
<div class="tn-ptitle">
<b>${escapeHTML(privDoc.name)}</b>
<small>المنظم: ${escapeHTML(privDoc.ownerName || "-")}${mine ? " (أنت)" : ""} · الرمز <span class="tn-code" dir="ltr">${escapeHTML(privDoc.id)}</span></small>
</div>
<div class="tn-pact">
<button type="button" onclick="privShare()" title="مشاركة">${ic("share")}</button>
${mine ? `<button type="button" class="danger" onclick="privDelete()" title="حذف البطولة">${ic("trash")}</button>` : ""}
</div>
</div>`;
}

function tnOpenCreate() {
    if (!currentUser) { roomToast("سجّل دخولك أول من تبويب الحساب", "lock"); return; }
    if (privOwned.length >= TN_PRIV_MAX_OWNED) return alert(`وصلت الحد (${TN_PRIV_MAX_OWNED} بطولات). احذف بطولة قديمة عشان تنشئ جديدة.`);
    openModal("tnCreateModal");
}

function tnParseNames(raw) {
    const out = [];
    String(raw || "").split(/[،,\n]+/).map(x => x.trim().replace(/\s+/g, " ").slice(0, 30)).filter(Boolean).forEach(x => { if (!out.includes(x)) out.push(x); });
    return out;
}

async function tnCreatePrivate() {
    if (!currentUser || !firebaseReady) return;
    const name = (document.getElementById("tnName").value || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const names = tnParseNames(document.getElementById("tnPlayers").value);
    const dbl = document.getElementById("tnFormat").value !== "single";
    if (!name) return alert("اكتب اسم البطولة");
    if (names.length < 2) return alert("اكتب اسمين على الأقل");
    if (names.length > 12) return alert("الحد الأعلى 12 متسابق");
    const btn = document.getElementById("tnCreateBtn");
    btn.disabled = true;
    const ps = names.map(n => ({ name: n, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    const data = {
        name: name,
        ownerUid: currentUser.uid,
        ownerName: ((currentUserDocData && currentUserDocData.name) || currentUser.displayName || "مستخدم").slice(0, 60),
        playersList: names,
        matches: tnSerialize(buildSchedule(ps, dbl)),
        double: dbl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    let id = null, lastErr = null;
    for (let i = 0; i < 3 && !id; i++) {
        const code = privGenCode();
        try { await privCol().doc(code).set(data); id = code; } catch (e) { lastErr = e; if (!e || e.code !== "permission-denied") break; }
    }
    btn.disabled = false;
    if (!id) return alert("ما انسوت البطولة: " + authErrAr(lastErr));
    document.getElementById("tnName").value = "";
    document.getElementById("tnPlayers").value = "";
    goBackModal();
    setTimeout(() => tnOpenPrivate(id), 150);
}

function tnJoin() {
    const inp = document.getElementById("tnJoinCode");
    const id = ((inp && inp.value) || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(id)) return alert("الرمز 8 أحرف وأرقام");
    tnOpenPrivate(id);
}

function tnOpenPrivate(id, fromLink) {
    if (!firebaseReady || !firebaseDB) return;
    id = String(id || "").toUpperCase();
    if (privUnsub) { privUnsub(); privUnsub = null; }
    tn.mode = "private";
    let first = true;
    privUnsub = privCol().doc(id).onSnapshot(doc => {
        if (!doc.exists) {
            if (first) roomToast("ما لقيت بطولة بهذا الرمز", "lock");
            tnForget(id);
            tnClosePrivate();
            return;
        }
        const d = doc.data();
        const h = tnHydrate(d.playersList, d.matches);
        privDoc = { id: id, name: d.name, ownerUid: d.ownerUid, ownerName: d.ownerName, double: d.double !== false, players: h.players, matches: h.matches };
        if (first) {
            first = false;
            tn.pane = "stand";
            const joined = tnStore(TN_JOINED_KEY) || [];
            if (!joined.includes(id)) { joined.unshift(id); tnStore(TN_JOINED_KEY, joined.slice(0, 20)); }
            privJoined[id] = { name: d.name, ownerName: d.ownerName, ownerUid: d.ownerUid, n: (d.playersList || []).length };
        }
        renderTournamentsPage();
    }, err => {
        roomToast("ما قدرت أفتح البطولة", "lock");
        tnClosePrivate();
    });
    if (!fromLink) renderTournamentsPage();
}
function tnForget(id) {
    tnStore(TN_JOINED_KEY, (tnStore(TN_JOINED_KEY) || []).filter(k => k !== id));
    delete privJoined[id];
}
function tnClosePrivate() {
    if (privUnsub) { privUnsub(); privUnsub = null; }
    privDoc = null;
    renderTournamentsPage();
}

function privSave() {
    if (!privDoc || !currentUser || currentUser.uid !== privDoc.ownerUid) return;
    privCol().doc(privDoc.id).set({
        matches: tnSerialize(privDoc.matches),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => alert("ما انحفظت النتيجة: " + authErrAr(err)));
}
function privResetScores() {
    if (!privDoc || !confirm("نصفّر كل نتايج البطولة؟")) return;
    privDoc.matches.forEach(m => { m.s1 = ""; m.s2 = ""; });
    privSave();
    renderTournamentsPage();
}
function privDelete() {
    if (!privDoc || !confirm(`نحذف بطولة "${privDoc.name}" نهائياً؟`)) return;
    const id = privDoc.id;
    privCol().doc(id).delete().then(() => { tnForget(id); roomToast("انحذفت البطولة", "check-circle"); }).catch(err => alert("ما انحذفت: " + authErrAr(err)));
}
async function privShare() {
    if (!privDoc) return;
    const url = privUrl(privDoc.id);
    const text = `تابع بطولة "${privDoc.name}" على منصة فيكارو الثقافية\nالرمز: ${privDoc.id}\n${url}`;
    if (navigator.share) { try { await navigator.share({ title: privDoc.name, text: text, url: url }); } catch (e) {} return; }
    try { await navigator.clipboard.writeText(text); roomToast("اننسخ رابط البطولة", "check-circle"); }
    catch (e) { window.prompt("انسخ الرابط:", url); }
}
