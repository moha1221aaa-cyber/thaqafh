/* تبويب البطولات (8 نوفمبر 2026، طلب محمد): دمج الترتيب والمواجهات في مكان واحد.
   الرسمية: بطولتين ينظمهم منظم المنصة، "أبطال النخبة الثقافي" (الدوري الرئيسي league/current، وعليه البث المباشر)
   و"تصفيات أبطال النخبة الثقافي" (league/qualifiers، نفس الشكل بدون بث).
   الخاصة: أي مستخدم مسجّل ينشئ بطولة بينه وبين أصحابه (privateTournaments/<رمز 8 أحرف>)، يدخل نتايجها هو بس،
   والباقين يشوفونها بالرمز أو الرابط ?t=<الرمز>. */

const ELITE_TITLE = "أبطال النخبة الثقافي";
const QUAL_TITLE = "تصفيات أبطال النخبة الثقافي";
const TN_PRIV_MAX_OWNED = 5;
const TN_JOINED_KEY = "thq:joined";

const tn = { mode: "official", official: "elite", pane: "stand", open: false, list: "official" };   /* open: داخل صفحة بطولة (وإلا القائمة) */
let qual = { players: [], matches: [], links: {}, groups: null, ko: null, exists: false };
let privDoc = null;          /* البطولة الخاصة المفتوحة: { id, name, ownerUid, ownerName, double, players, matches } */
let privUnsub = null;
let privOwned = [];          /* بطولاتي: [{id, name, n, played}] */
let privListUid = null;      /* مين حمّلنا له قوائم البطولات الخاصة */
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
    const ms = (matchList || []).map(m => { const o = { p1: get(m.p1), p2: get(m.p2), s1: m.s1 == null ? "" : m.s1, s2: m.s2 == null ? "" : m.s2, round: m.round }; if (m.g != null) o.g = m.g; return o; });
    return { players: ps, matches: ms };
}
function tnSerialize(ms) {
    return ms.map(m => { const o = { p1: m.p1.name, p2: m.p2.name, s1: m.s1, s2: m.s2, round: m.round }; if (m.g != null) o.g = m.g; return o; });
}
function tnPlayedCount(list) {
    return (list || []).filter(m => m.s1 !== "" && m.s2 !== "" && m.s1 != null && m.s2 != null).length;
}

/* ===== السياق: وش المعروض الحين (الترتيب والمواجهات يرسمون منه) ===== */
function tCtx() {
    if (!tn.open) return { kind: "none", players: [], matches: [], links: {}, canEdit: false, save: function () {}, live: false, profile: false, title: "", empty: "" };
    if (tn.mode === "private") {
        if (privDoc) {
            return {
                kind: "private", players: privDoc.players, matches: privDoc.matches, links: {}, groups: privDoc.groups,
                ko: privDoc.ko, saveKo: ko => { privDoc.ko = ko; privSave(); },
                canEdit: !!(currentUser && currentUser.uid === privDoc.ownerUid), save: privSave,
                live: false, profile: false, title: privDoc.name, empty: "ما فيه متسابقين"
            };
        }
        return { kind: "none", players: [], matches: [], links: {}, canEdit: false, save: function () {}, live: false, profile: false, title: "", empty: "" };
    }
    if (tn.official === "qual") {
        return {
            kind: "qual", players: qual.players, matches: qual.matches, links: qual.links, groups: qual.groups,
            ko: qual.ko, saveKo: ko => { qual.ko = ko; qualSave(); },
            canEdit: isAdmin, save: qualSave, live: false, profile: false, title: QUAL_TITLE,
            empty: qual.exists ? "ما فيه متسابقين" : "التصفيات ما بدأت للحين"
        };
    }
    return {
        kind: "elite", players: players, matches: matches, links: playerLinks, groups: leagueGroups,
        ko: leagueKo, saveKo: ko => { leagueKo = ko; save(); },
        canEdit: isAdmin, save: save, live: true, profile: true, title: ELITE_TITLE, empty: "ما فيه متسابقين"
    };
}

/* ===== التصفيات (league/qualifiers) ===== */
function initTournaments() {
    /* الرابط المشارك يفتح البطولة الخاصة مباشرة */
    if (tnDeepLink && /^[A-Z0-9]{8}$/.test(tnDeepLink.toUpperCase())) {
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
            qual = { players: h.players, matches: h.matches, links: d.playerLinks || {}, groups: groupsValid(d.groups, h.players.map(p => p.name)) ? d.groups : null, ko: koValid(d.ko, h.players.map(p => p.name)) ? d.ko : null, exists: true };
        } else {
            qual = { players: [], matches: [], links: {}, groups: null, ko: null, exists: false };
        }
        renderTournamentsPage();
    }, () => {});
    renderTournamentsPage();
}

function qualSave() {
    if (!isAdmin || !firebaseReady || !firebaseDB) return;
    firebaseDB.collection("league").doc("qualifiers").set({
        matches: tnSerialize(qual.matches),
        playersList: qual.players.map(p => p.name),
        playerLinks: qual.links || {},
        groups: qual.groups || firebase.firestore.FieldValue.delete(),
        ko: qual.ko || firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => { console.log(err); alert("ما انحفظ: " + authErrAr(err)); });
}
/* كم مجموعة؟ (1 = دوري واحد). الحد: 3 متسابقين على الأقل في المجموعة */
async function tnAskGroups(count, cur) {
    const max = Math.max(1, Math.min(GROUP_NAMES.length, Math.floor(count / 3)));
    if (max < 2) return 1;
    const ans = await uiPrompt(`كم مجموعة؟ اكتب 1 لدوري واحد، أو رقم من 2 لين ${max} لنظام المجموعات (مثل دوري أبطال أوروبا).`, String(cur || 1));
    if (ans === null) return null;
    const n = parseInt(ans, 10);
    if (!(n >= 1 && n <= max)) { alert(`اكتب رقم من 1 لين ${max}`); return null; }
    return n;
}
async function qualAddPlayer() {
    if (!isAdmin) return;
    let name = await uiPrompt("اسم المتسابق الجديد في التصفيات:");
    if (!name || !name.trim()) return;
    name = name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (qual.players.some(p => p.name === name)) return alert("المتسابق موجود بنفس الاسم");
    if (qual.matches.some(m => m.s1 !== "" && m.s2 !== "") && !await uiConfirm("فيه نتايج مسجلة، وإضافة متسابق تعيد القرعة وتمسحها. نكمل؟")) return;
    const list = qual.players.map(p => p.name).concat([name]);
    let groups = null;
    if (qual.groups) { /* ينضاف لأصغر مجموعة */
        const small = qual.groups.reduce((a, g) => g.p.length < a.p.length ? g : a, qual.groups[0]);
        groups = qual.groups.map(g => ({ n: g.n, p: g === small ? g.p.concat([name]) : g.p.slice() }));
    }
    qualRebuild(list, groups);
}
async function qualRedraw() {
    if (!isAdmin) return;
    if (!qual.players.length) return alert("أضف متسابقين أول");
    const names = qual.players.map(p => p.name);
    const n = await tnAskGroups(names.length, qual.groups ? qual.groups.length : 1);
    if (n === null) return;
    if (!await uiConfirm(`نعيد القرعة ${n > 1 ? "بـ " + n + " مجموعات" : "بدوري واحد"} ونمسح نتايج التصفيات؟`)) return;
    qualRebuild(names, drawGroups(names, n));
}
function qualRebuild(names, groups) {
    const ps = names.map(n => ({ name: n, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    const ms = names.length >= 2 ? buildSchedule(ps, true, groups) : [];
    qual = { players: ps, matches: ms, links: qual.links || {}, groups: groups || null, ko: null, exists: true };
    qualSave();
    renderTournamentsPage();
}

/* ===== التنقل والرسم: قائمة بطولات، ونضغط على بطولة تفتح صفحتها (الترتيب والمواجهات داخلها) ===== */
function tnOpenOfficial(k) {
    if (privUnsub) { privUnsub(); privUnsub = null; }
    privDoc = null;
    tn.mode = "official";
    tn.list = "official";
    tn.official = k === "qual" ? "qual" : "elite";
    tn.pane = "stand";
    tn.open = true;
    renderTournamentsPage();
    window.scrollTo(0, 0);
}
function tnBack() {
    if (privUnsub) { privUnsub(); privUnsub = null; }
    privDoc = null;
    tn.open = false;
    renderTournamentsPage();
    window.scrollTo(0, 0);
}
function tnSetPane(k) {
    tn.pane = k === "matches" || k === "ko" ? k : "stand";
    paintTnPane();
}
function paintTnPane() {
    document.querySelectorAll("#tnSub button").forEach(b => b.classList.toggle("active", b.dataset.k === tn.pane));
    const st = document.getElementById("tnStand"), mt = document.getElementById("tnMatches");
    const kt = document.getElementById("tnKo");
    if (st) st.style.display = tn.pane === "stand" ? "" : "none";
    if (mt) mt.style.display = tn.pane === "matches" ? "" : "none";
    if (kt) kt.style.display = tn.pane === "ko" ? "" : "none";
    if (tn.pane === "ko") renderKo();
    /* تبويب الإقصاء يظهر لو فيه أدوار إقصائية، أو للي يقدر يبدأها */
    const c = tCtx(), kb = document.querySelector('#tnSub button[data-k="ko"]');
    if (kb) kb.style.display = c.ko || c.canEdit ? "" : "none";
    if (tn.pane === "ko" && kb && kb.style.display === "none") { tn.pane = "stand"; paintTnPane(); }
    const lb = document.getElementById("liveMatchesBar");
    if (lb) lb.style.display = tn.mode === "official" && tn.official === "elite" ? "" : "none";
}

function tnRowHTML(icon, title, sub, action, cls) {
    return `<button type="button" class="tn-item ${cls || ""}" onclick="${action}">
<span class="tn-item-ic">${ic(icon)}</span>
<span class="tn-item-b"><b>${escapeHTML(title)}</b><small>${escapeHTML(sub)}</small></span>
<span class="tn-item-go">${ic("chevron-right")}</span>
</button>`;
}

/* قائمة الثلاث نقاط (⋮): الأزرار الثانوية فيها بدل ما تنتشر في الصفحة. items: [{ icon, label, action, danger }] */
function moreMenuHTML(id, items) {
    items = items.filter(Boolean);
    if (!items.length) return "";
    return `<div class="tn-more">
<button type="button" class="tn-more-btn" onclick="tnMenuToggle(event, ${jsArg(id)})" aria-haspopup="menu" aria-label="المزيد">${ic("dots")}</button>
<div class="tn-menu" id="${id}" role="menu" hidden>${items.map(it => `<button type="button" role="menuitem" class="${it.danger ? "danger" : ""}" onclick="tnMenuClose(); ${it.action}">${ic(it.icon)}<span>${escapeHTML(it.label)}</span></button>`).join("")}</div>
</div>`;
}
function tnMenuClose() { document.querySelectorAll(".tn-menu").forEach(m => { m.hidden = true; }); }
function tnMenuToggle(ev, id) {
    ev.stopPropagation();
    const m = document.getElementById(id);
    if (!m) return;
    const open = m.hidden;
    tnMenuClose();
    m.hidden = !open;
}
document.addEventListener("click", e => { if (!e.target.closest || !e.target.closest(".tn-more")) tnMenuClose(); });

function tnSetList(k) {
    tn.list = k === "private" ? "private" : "official";
    renderTournamentsPage();
}

/* قائمة البطولات: قسمين منفصلين، الرسمية والخاصة */
function renderTnList() {
    const box = document.getElementById("tnList");
    if (!box) return;
    const seg = `<div class="tn-seg tn-top" role="tablist">
<button type="button" class="${tn.list === "official" ? "active" : ""}" onclick="tnSetList('official')">${ic("trophy")} الرسمية</button>
<button type="button" class="${tn.list === "private" ? "active" : ""}" onclick="tnSetList('private')">${ic("users")} الخاصة</button>
</div>`;
    const sub = (n, played, total, g) => n ? `${n} متسابق${g ? " · " + g + " مجموعات" : ""} · ${played}/${total} مواجهة` : "لم تبدأ بعد";
    if (tn.list === "official") {
        box.innerHTML = seg + `
<div class="tn-note">بطولات ينظمها منظم المنصة.</div>
${tnRowHTML("trophy", ELITE_TITLE, sub(players.length, tnPlayedCount(matches), matches.length, leagueGroups && leagueGroups.length), "tnOpenOfficial('elite')", "gold")}
${tnRowHTML("target", QUAL_TITLE, sub(qual.players.length, tnPlayedCount(qual.matches), qual.matches.length, qual.groups && qual.groups.length), "tnOpenOfficial('qual')")}`;
        return;
    }
    const joinedIds = Object.keys(privJoined).filter(id => !privOwned.some(o => o.id === id));
    box.innerHTML = seg + `
<div class="tn-intro">
<h3>${ic("users")} بطولتك الخاصة</h3>
<p>سوّ مسابقة ثقافية بينك وبين أصحابك: تكتب أسماءهم، والموقع يسوي القرعة والترتيب (دوري أو مجموعات)، وتدخل النتايج من جوالك. وأصحابك يتابعونها بالرمز أو الرابط.</p>
<button type="button" class="tn-primary" onclick="tnOpenCreate()">${ic("plus")} بطولة خاصة جديدة</button>
</div>
<div class="tn-join">
<input type="text" id="tnJoinCode" maxlength="8" dir="ltr" autocapitalize="characters" placeholder="رمز بطولة (8 أحرف)" onkeydown="if(event.key==='Enter')tnJoin()">
<button type="button" onclick="tnJoin()">افتح</button>
</div>
${currentUser ? (privOwned.length ? `<h4 class="tn-h">بطولاتي</h4>${privOwned.map(o => tnRowHTML("trophy", o.name, `${o.n} متسابق · ${o.played}/${o.total} مواجهة · الرمز ${o.id}`, `tnOpenPrivate(${jsArg(o.id)})`)).join("")}` : "") : `
<div class="tn-login">${ic("lock")} سجّل دخولك من تبويب "الحساب" عشان تنشئ بطولة خاصة. المشاهدة بالرمز بدون حساب.
<button type="button" onclick="showTab(null,'accountTab')">الذهاب للحساب</button></div>`}
${joinedIds.length ? `<h4 class="tn-h">بطولات أتابعها</h4>${joinedIds.map(id => tnRowHTML("trophy", privJoined[id].name, `المنظم: ${privJoined[id].ownerName || "-"} · ${privJoined[id].n} متسابق`, `tnOpenPrivate(${jsArg(id)})`)).join("")}` : ""}`;
}

/* رأس صفحة البطولة: رجوع، العنوان، وأزرار (مشاركة ظاهرة + ⋮ للباقي) */
function tnHeadHTML(title, small, actions) {
    return `
<div class="tn-phead">
<button type="button" class="tn-back" onclick="tnBack()" aria-label="رجوع للبطولات">${ic("chevron-right")}</button>
<div class="tn-ptitle"><b>${escapeHTML(title)}</b><small>${small}</small></div>
<div class="tn-pact">${actions || ""}</div>
</div>`;
}

function renderTournamentsPage() {
    const sec = document.getElementById("tournaments");
    if (!sec) return;
    const list = document.getElementById("tnList"), detail = document.getElementById("tnDetail");
    list.style.display = tn.open ? "none" : "";
    detail.style.display = tn.open ? "" : "none";
    if (!tn.open) {
        /* قوائم الخاصة تتحمل مرة لكل حساب */
        const uid = currentUser ? currentUser.uid : "";
        if (privListUid !== uid) { privListUid = uid; loadPrivateLists(); }
        renderTnList();
        return;
    }
    const head = document.getElementById("tnBodyHead");
    if (tn.mode === "private") {
        head.innerHTML = privDoc ? privHeadHTML() : "";
    } else {
        const q = tn.official === "qual";
        const sm = q ? "طريقك لأبطال النخبة" : "البطولة الرئيسية للمنصة";
        const items = [];
        if (isAdmin) {
            items.push({ icon: "plus", label: "إضافة متسابق", action: q ? "qualAddPlayer()" : "addNewPlayerPrompt()" });
            items.push({ icon: "dice", label: "إعادة القرعة (دوري أو مجموعات)", action: q ? "qualRedraw()" : "reDrawMatches()" });
        }
        if (isAdmin) items.push(tCtx().ko ? { icon: "trash", label: "حذف الأدوار الإقصائية", action: "koDelete()", danger: true } : { icon: "crown", label: "ابدأ الأدوار الإقصائية", action: "koStart()" });
        items.push({ icon: "message", label: "مشاركة الترتيب عبر واتساب", action: "shareStandingsToWhatsApp()" });
        head.innerHTML = tnHeadHTML(q ? QUAL_TITLE : ELITE_TITLE, sm, moreMenuHTML("tnMenu", items));
    }
    table(); renderMatches();
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
            if (!tn.open) renderTnList();
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
            if (!tn.open) renderTnList();
        }, () => {});
    }
}

function privHeadHTML() {
    const mine = currentUser && currentUser.uid === privDoc.ownerUid;
    const grp = privDoc.groups ? ` · ${privDoc.groups.length} مجموعات` : "";
    const small = `${escapeHTML(privDoc.ownerName || "-")}${mine ? " (أنت)" : ""}${grp} · <span class="tn-code" dir="ltr">${escapeHTML(privDoc.id)}</span>`;
    const items = [
        { icon: "message", label: "مشاركة الترتيب عبر واتساب", action: "shareStandingsToWhatsApp()" },
        mine ? (privDoc.ko ? { icon: "trash", label: "حذف الأدوار الإقصائية", action: "koDelete()" } : { icon: "crown", label: "ابدأ الأدوار الإقصائية", action: "koStart()" }) : null,
        mine ? { icon: "hourglass", label: "تصفير النتائج", action: "privResetScores()" } : null,
        mine ? { icon: "trash", label: "حذف البطولة", action: "privDelete()", danger: true } : null
    ];
    return tnHeadHTML(privDoc.name, small, `<button type="button" class="tn-ic-btn" onclick="privShare()" title="مشاركة الرابط" aria-label="مشاركة الرابط">${ic("share")}</button>` + moreMenuHTML("tnMenu", items));
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
    const gcount = parseInt(document.getElementById("tnGroups").value, 10) || 1;
    if (!name) return alert("اكتب اسم البطولة");
    if (names.length < 2) return alert("اكتب اسمين على الأقل");
    if (names.length > 12) return alert("الحد الأعلى 12 متسابق");
    if (gcount > 1 && names.length < gcount * 3) return alert(`نظام ${gcount} مجموعات يحتاج ${gcount * 3} متسابقين على الأقل (3 في كل مجموعة)`);
    const btn = document.getElementById("tnCreateBtn");
    btn.disabled = true;
    const ps = names.map(n => ({ name: n, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    const groups = drawGroups(names, gcount);
    const data = {
        name: name,
        ownerUid: currentUser.uid,
        ownerName: ((currentUserDocData && currentUserDocData.name) || currentUser.displayName || "مستخدم").slice(0, 60),
        playersList: names,
        matches: tnSerialize(buildSchedule(ps, dbl, groups)),
        double: dbl,
        ...(groups ? { groups: groups } : {}),
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
    tn.list = "private";
    tn.open = true;
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
        privDoc = { id: id, name: d.name, ownerUid: d.ownerUid, ownerName: d.ownerName, double: d.double !== false, players: h.players, matches: h.matches, groups: groupsValid(d.groups, h.players.map(p => p.name)) ? d.groups : null, ko: koValid(d.ko, h.players.map(p => p.name)) ? d.ko : null };
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
function tnClosePrivate() { tnBack(); }

function privSave() {
    if (!privDoc || !currentUser || currentUser.uid !== privDoc.ownerUid) return;
    privCol().doc(privDoc.id).set({
        matches: tnSerialize(privDoc.matches),
        ko: privDoc.ko || firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => alert("ما انحفظت النتيجة: " + authErrAr(err)));
}
async function privResetScores() {
    if (!privDoc || !await uiConfirm("نصفّر كل نتايج البطولة؟")) return;
    privDoc.matches.forEach(m => { m.s1 = ""; m.s2 = ""; });
    privDoc.ko = null;
    privSave();
    renderTournamentsPage();
}
async function privDelete() {
    if (!privDoc || !await uiConfirm(`نحذف بطولة "${privDoc.name}" نهائياً؟`)) return;
    const id = privDoc.id;
    privCol().doc(id).delete().then(() => { tnForget(id); roomToast("انحذفت البطولة", "check-circle"); }).catch(err => alert("ما انحذفت: " + authErrAr(err)));
}
async function privShare() {
    if (!privDoc) return;
    const url = privUrl(privDoc.id);
    const text = `تابع بطولة "${privDoc.name}" على منصة فيكارو الثقافية\nالرمز: ${privDoc.id}\n${url}`;
    if (navigator.share) { try { await navigator.share({ title: privDoc.name, text: text, url: url }); } catch (e) {} return; }
    try { await navigator.clipboard.writeText(text); roomToast("اننسخ رابط البطولة", "check-circle"); }
    catch (e) { await uiPrompt("انسخ الرابط:", url); }
}
