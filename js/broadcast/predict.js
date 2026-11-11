/* ===== توقعات الجمهور على الموسم (11 نوفمبر 2026، طلب محمد) =====
   - التوقع: فائز المواجهة (المتسابق الأول أو الثاني أو تعادل) قبل ما تبدأ، وفائز كل فقرة (الحروف، الكلمات، ضد وند) قبل ما تبدأ.
   - مكان واحد للبث وتبويب التوقعات: predictions/<uid>_<المواجهة> { userId, matchId, name, w, g2, g3, g4, tw, t2, t3, t4, updatedAt }
     (0 تعادل، 1 الأول، 2 الثاني). وقت كل توقع (tw و t2...) ساعة السيرفر وتفرضها القواعد، فما ينفع تغيّره لوقت قديم.
   - لحظة قفل كل توقع: جهاز المقدم يكتبها في وثيقة البث (lks.<المواجهة>.w لما تبدأ المواجهة، و .g2/.g3/.g4 لما تبدأ الفقرة)،
     وتنحفظ مع فائز كل فقرة (sw) في league/predRes لما تنكتب النتيجة. التوقع اللي وقته بعد القفل ما ينحسب.
   - النقاط: الفائز صح 3، كل فقرة صح 1، وكل توقعات المواجهة صح نقطتين زيادة.
   - ترتيب الموسم: جهاز المنظم يحسبه من كل التوقعات ونتايج الدوري ويكتبه في league/predBoard (وثيقة وحدة يقراها الكل،
     بدل ما كل جوال يقرا كل التوقعات). وقت المسابقة التجريبية الترتيب ما يتغيّر.
   - المشاهد يتابع مجموعه طول البث (زر 🎯 جنب أزرار البث)، وبعد كل مواجهة وفي الختام تطلع له نتيجة توقعاته والترتيب،
     وتبقى لين يضغط "تخطي" (ما تنقفل لما المقدم ينتقل). الضيف ما يتوقع لين يسجّل. */
const PR_PTS = { w: 3, g: 1, bonus: 2 };
const PR_SEGS = [["g2", "الحروف"], ["g3", "الكلمات"], ["g4", "ضد وند"]];
const PR = { key: "", sub: null, docs: {}, mine: {}, mineSub: null, mineUid: "", board: null, res: null, boardSub: null, resSub: null,
    hostSub: null, hostDocs: {}, hostTimer: 0, hostLast: "", hostSig: "", open: false, seen: {}, lkSent: {} };

function prName(p) { return typeof p === "string" ? p : (p && p.name) || ""; }
function prKey(round, p1, p2) { return `r${round}_${prName(p1)}_${prName(p2)}`; }   /* نفس getMatchId */
function prBcKey(d, i) {
    const o = d && (d.order || [])[i];
    if (!o) return "";
    return prKey(o.round !== undefined ? o.round : d.round, o.p1, o.p2);
}
function prOutcome(a, b) { a = Number(a) || 0; b = Number(b) || 0; return a > b ? 1 : (a < b ? 2 : 0); }
function prPick(p, k) {
    if (!p) return null;
    const v = p[k];
    if (v === 0 || v === 1 || v === 2) return v;
    /* توقعات التبويب القديمة (النتيجة بالأرقام) */
    if (k === "w" && p.s1 !== undefined && p.s1 !== "" && p.s2 !== undefined && p.s2 !== "") return prOutcome(p.s1, p.s2);
    return null;
}
function prMs(t) { return t && typeof t.toMillis === "function" ? t.toMillis() : (typeof t === "number" ? t : (t && typeof t.__ts === "number" ? t.__ts : 0)); }
function prTs(p, k) { return prMs(p && p[k === "w" ? "tw" : "t" + k.slice(1)]) || (k === "w" ? prMs(p && p.updatedAt) : 0); }
/* التوقع ينحسب لو انحفظ قبل لحظة قفله (ولو ما فيه قفل مسجّل، مثل نتيجة كتبها المنظم بيده، ينحسب) */
function prValid(p, k, m) {
    const lock = m && m.lk && m.lk[k];
    if (!lock) return true;
    const t = prTs(p, k);
    return t > 0 && t <= lock + 1500;
}
/* نقاط توقع مواجهة وحدة. m = { s1, s2 (فاضي لو ما خلصت), sw: [فائز الحروف، الكلمات، ضد وند] (null للي ما خلصت), lk } */
function prScore(p, m) {
    const out = { pts: 0, ok: 0, all: 0, items: [] };
    if (!p || !m) return out;
    const done = m.s1 !== undefined && m.s1 !== "" && m.s1 !== null && m.s2 !== undefined && m.s2 !== "" && m.s2 !== null;
    let allOk = true, known = 0;
    const w = prPick(p, "w");
    if (done) {
        const res = prOutcome(m.s1, m.s2);
        if (w !== null && prValid(p, "w", m)) { const ok = w === res; out.all++; known++; if (ok) { out.ok++; out.pts += PR_PTS.w; } else allOk = false; out.items.push({ k: "w", pick: w, res, ok }); }
        else allOk = false;
    } else allOk = false;
    PR_SEGS.forEach(([k], j) => {
        const res = m.sw ? m.sw[j] : null;
        if (res !== 0 && res !== 1 && res !== 2) { allOk = false; return; }
        const pick = prPick(p, k);
        if (pick === null || !prValid(p, k, m)) { allOk = false; return; }
        const ok = pick === res;
        out.all++; known++;
        if (ok) { out.ok++; out.pts += PR_PTS.g; } else allOk = false;
        out.items.push({ k, pick, res, ok });
    });
    if (allOk && known === 4) { out.pts += PR_PTS.bonus; out.bonus = true; }
    return out;
}
/* فائز كل فقرة من نقاطها (d.sp.g2 = [الأول, الثاني]) */
function prSegWinners(sp) {
    sp = sp || {};
    return ["g2", "g3", "g4"].map(k => Array.isArray(sp[k]) ? prOutcome(sp[k][0], sp[k][1]) : null);
}

/* ===== ترتيب الموسم ===== */
function prRank(board) {
    const u = (board && board.u) || {};
    return Object.keys(u).map(uid => Object.assign({ uid }, u[uid])).sort((a, b) => (b.p - a.p) || (b.c - a.c) || (a.a - b.a) || String(a.n).localeCompare(String(b.n)));
}
function prMyRow(uid) {
    const list = prRank(PR.board);
    const i = list.findIndex(x => x.uid === uid);
    return i === -1 ? { rank: 0, p: 0, c: 0, a: 0, n: "" } : Object.assign({ rank: i + 1 }, list[i]);
}
function prEnsure() {
    if (!firebaseDB) return;
    const col = firebaseDB.collection("league");
    if (!PR.boardSub) PR.boardSub = col.doc("predBoard").onSnapshot(s => { PR.board = s.exists ? s.data() : null; prChanged(); }, () => {});
    if (!PR.resSub) PR.resSub = col.doc("predRes").onSnapshot(s => { PR.res = s.exists ? s.data() : null; prChanged(); prHostKick(); }, () => {});
    const uid = currentUser ? currentUser.uid : "";
    if (PR.mineUid !== uid) {
        if (PR.mineSub) { try { PR.mineSub(); } catch (e) {} PR.mineSub = null; }
        PR.mineUid = uid; PR.mine = {};
        if (uid) PR.mineSub = firebaseDB.collection("predictions").where("userId", "==", uid).onSnapshot(snap => {
            const m = {};
            snap.forEach(doc => { const x = doc.data() || {}; if (x.userId === uid && x.matchId) m[x.matchId] = x; });
            PR.mine = m; prChanged();
        }, () => {});
    }
}
let prChangedT = 0;
function prChanged() {
    if (prChangedT) return;
    prChangedT = setTimeout(() => {
        prChangedT = 0;
        if (openLiveId && liveMatchesCache[openLiveId]) { liveLastSig = ""; renderLiveScreen(); prPanelPaint(); }
        if (typeof renderPredictions === "function") { try { renderPredictions(); } catch (e) {} }
        if (typeof renderRankingUI === "function") { try { renderRankingUI(); } catch (e) {} }
    }, 60);
}

/* ===== جهاز المنظم: يحسب ترتيب الموسم ويكتبه (مرة كل ما تتغير النتايج أو التوقعات) ===== */
function prBuild(docs, ms, res) {
    const u = {}, k = [], byKey = {};
    (ms || []).forEach(m => {
        if (m.s1 === "" || m.s2 === "" || m.s1 == null || m.s2 == null) return;
        const key = prKey(m.round, m.p1, m.p2);
        byKey[key] = Object.assign({ s1: m.s1, s2: m.s2 }, (res && res[key]) || {});
        k.push(key);
    });
    Object.keys(docs || {}).forEach(id => {
        const p = docs[id];
        const m = p && byKey[p.matchId];
        if (!m || !p.userId) return;
        const sc = prScore(p, m);
        if (!sc.all) return;
        const x = u[p.userId] || (u[p.userId] = { n: "مشاهد", p: 0, c: 0, a: 0 });
        if (p.name) x.n = String(p.name).slice(0, 40);
        x.p += sc.pts; x.c += sc.ok; x.a += sc.all;
    });
    return { u, k: k.sort() };
}
function prHostKick() {
    if (!isAdmin || !firebaseDB || !currentUser || window.BC_REPLAY) return;
    if (!PR.hostSub) {
        PR.hostSub = firebaseDB.collection("predictions").onSnapshot(snap => {
            const all = {};
            snap.forEach(doc => { all[doc.id] = doc.data(); });
            PR.hostDocs = all; prHostKick();
        }, () => {});
        return;
    }
    clearTimeout(PR.hostTimer);
    PR.hostTimer = setTimeout(prHostWrite, 2500);
}
function prHostWrite() {
    if (!isAdmin || !firebaseDB || typeof matches === "undefined") return;
    if (typeof leagueTrial !== "undefined" && leagueTrial) return;   /* المسابقة التجريبية ما تغيّر ترتيب الموسم */
    /* مواجهة نتيجتها انكتبت بيد المنظم (بدون بث) ما لها لحظة قفل: نسجّلها أول ما نشوف النتيجة، فما أحد يتوقعها بعد ما يعرف النتيجة */
    const res = (PR.res && PR.res.k) || {}, miss = {};
    (matches || []).forEach(m => {
        if (m.s1 === "" || m.s2 === "" || m.s1 == null || m.s2 == null) return;
        const key = prKey(m.round, m.p1, m.p2);
        if (!(res[key] && res[key].lk && res[key].lk.w)) miss[key] = { lk: { w: Date.now() } };
    });
    if (Object.keys(miss).length && !PR.lkPending) {
        PR.lkPending = 1;
        firebaseDB.collection("league").doc("predRes").set({ k: miss }, { merge: true }).catch(() => {}).then(() => { PR.lkPending = 0; });
    }
    const b = prBuild(PR.hostDocs, matches, PR.res && PR.res.k);
    const sig = JSON.stringify(b);
    if (sig === PR.hostLast) return;
    const cur = PR.board ? JSON.stringify({ u: PR.board.u || {}, k: (PR.board.k || []).slice().sort() }) : "";
    PR.hostLast = sig;
    if (sig === cur) return;
    firebaseDB.collection("league").doc("predBoard").set({ u: b.u, k: b.k, at: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => { PR.hostLast = ""; });
}
/* المنظم: أي تغيّر في نتايج الدوري يعيد الحساب (يتنادى كل ثانيتين من liveTick والتبويب) */
function prHostWatch() {
    if (!isAdmin || typeof matches === "undefined") return;
    prEnsure();
    const sig = (matches || []).map(m => m.s1 + ":" + m.s2).join(",");
    if (sig !== PR.hostSig) { PR.hostSig = sig; prHostKick(); }
}
setInterval(() => { try { if (typeof isAdmin !== "undefined" && isAdmin && firebaseDB && currentUser) prHostWatch(); } catch (e) {} }, 4000);

/* ===== الحفظ ===== */
function prCanPick(d, k) {
    if (!currentUser || !d || d.status !== "live" || bcIsReh(openLiveId) || window.BC_REPLAY || isAdmin || myLiveNum(d)) return false;
    const lk = (d.lks || {})[d.cur] || {};
    if (lk[k]) return false;
    if (k === "w") return d.scene === "intro";
    const n = Number(k.slice(1));
    const live = d.scene === "intro" || d.scene === "talk" || d.scene === "countdown" || d.scene === "playing";
    return live && (d.scene !== "playing" || (d.seg || 1) < n);
}
function prSave(key, k, v) {
    if (!currentUser || !key || !(v === 0 || v === 1 || v === 2)) return Promise.resolve(false);
    const cur = PR.mine[key] || {};
    if (cur[k] === v) return Promise.resolve(true);   /* نفس الاختيار: ما نكتب (وقته يبقى) */
    const name = String((typeof currentUserDocData !== "undefined" && currentUserDocData && currentUserDocData.name) || currentUser.displayName || "مشاهد").slice(0, 60);
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    const doc = { userId: currentUser.uid, matchId: key, name, updatedAt: ts };
    doc[k] = v; doc[k === "w" ? "tw" : "t" + k.slice(1)] = ts;
    PR.mine[key] = Object.assign({}, cur, { [k]: v });   /* يبان على طول */
    prChanged();
    return firebaseDB.collection("predictions").doc(currentUser.uid + "_" + key).set(doc, { merge: true })
        .then(() => true)
        .catch(err => { roomToast(err && err.code === "permission-denied" ? "ما قدرنا نحفظ توقعك (صلاحيات قاعدة البيانات)" : "تعذّر حفظ توقعك", "alert"); return false; });
}
function bcPredict(n, k) {
    const d = liveMatchesCache[openLiveId];
    k = k || "w";
    if (!prCanPick(d, k)) return;
    const key = prBcKey(d, d.cur);
    prSave(key, k, n).then(ok => { if (ok) roomToast("انحفظ توقعك", "check"); });
}

/* ===== البث: توقعات المواجهة الحالية للكل (النسب) ===== */
function prListenKey(key) {
    if (PR.key === key) return;
    if (PR.sub) { try { PR.sub(); } catch (e) {} PR.sub = null; }
    PR.key = key; PR.docs = {};
    if (!key || !firebaseDB) return;
    PR.sub = firebaseDB.collection("predictions").where("matchId", "==", key).onSnapshot(snap => {
        const m = {};
        snap.forEach(doc => { const x = doc.data() || {}; if (x.matchId === key && x.userId) m[x.userId] = x; });
        PR.docs = m; prChanged();
    }, () => {});
}
function bcPredListen(id) {
    if (window.BC_REPLAY) id = "";
    if (!id) { prListenKey(""); return; }
    prEnsure();
}
function bcPredCounts(d, cur, k) {
    k = k || "w";
    const out = { a: 0, b: 0, dr: 0, t: 0 };
    if (!d || cur !== d.cur) return out;
    Object.keys(PR.docs).forEach(uid => {
        const v = prPick(PR.docs[uid], k);
        if (v === 1) out.a++; else if (v === 2) out.b++; else if (v === 0) out.dr++;
    });
    out.t = out.a + out.b + out.dr;
    return out;
}
function bcPredSig(d) {
    if (!d) return "";
    const c = bcPredCounts(d, d.cur), key = prBcKey(d, d.cur), mine = PR.mine[key] || {};
    return [c.a, c.b, c.dr, prPick(mine, "w"), prPick(mine, "g2"), prPick(mine, "g3"), prPick(mine, "g4"), PR.board ? (PR.board.k || []).length : -1, prTotal(d)].join("-");
}
function bcPredHTML(d, o) {
    const c = bcPredCounts(d, d.cur);
    const pct = x => c.t ? Math.round(x * 100 / c.t) : 0;
    const mine = prPick(PR.mine[prBcKey(d, d.cur)], "w");
    const bar = `<div class="st-predbar pr3"><i class="a" style="width:${c.t ? pct(c.a) : 33.4}%"></i><i class="d" style="width:${c.t ? pct(c.dr) : 33.3}%"></i><i class="b" style="width:${c.t ? pct(c.b) : 33.3}%"></i></div>
<div class="st-predlbl"><span>${escapeHTML(o.p1)} ${c.t ? pct(c.a) + "%" : ""}</span><span>تعادل ${c.t ? pct(c.dr) + "%" : ""}</span><span>${c.t ? pct(c.b) + "%" : ""} ${escapeHTML(o.p2)}</span></div>`;
    if (!currentUser) return `<div class="st-pred"><div class="t">${ic("target")} توقّع الفائز</div>${bar}<button class="pr-login" onclick="closeLiveScreen(true);showTab(null,'accountTab')">${ic("lock")} سجّل دخول عشان تتوقع</button></div>`;
    if (myLiveNum(d) || isAdmin) return c.t ? `<div class="st-pred"><div class="t">${ic("target")} توقعات الجمهور</div>${bar}</div>` : "";
    const btn = (n, label) => `<button class="${mine === n ? "on" : ""}" onclick="bcPredict(${n})">${label}</button>`;
    return `<div class="st-pred"><div class="t">${ic("target")} مين بيفوز؟</div>
<div class="st-predbtns pr3">${btn(1, escapeHTML(o.p1))}${btn(0, "تعادل")}${btn(2, escapeHTML(o.p2))}</div>${bar}</div>`;
}
/* سطر النتيجة: كم واحد توقعها صح */
function prResultLine(d, o) {
    const c = bcPredCounts(d, d.cur);
    if (!c.t) return "";
    const r = prOutcome(d.s1, d.s2), n = r === 1 ? c.a : (r === 2 ? c.b : c.dr);
    const who = r === 0 ? "التعادل" : "فوز " + escapeHTML(r === 1 ? o.p1 : o.p2);
    return `<div class="lv-muted">${ic("target")} ${n} من ${c.t} توقعوا ${who}</div>`;
}

/* ===== مجموع المشاهد: ترتيب الموسم + اللي ما دخل الترتيب للحين من هالبث ===== */
function prLiveMatch(d, i) {
    const o = (d.order || [])[i] || {};
    const lk = (d.lks || {})[i] || o.lk || null;
    if (o.state === "done") return { s1: o.s1 || 0, s2: o.s2 || 0, sw: o.sw || null, lk };
    if (i !== d.cur || d.scene !== "playing" && d.scene !== "result") return null;
    /* المواجهة الحالية: الفقرات اللي خلصت */
    const sw = prSegWinners(d.sp).map((w, j) => (d.seg > j + 2 || d.scene === "result") ? w : null);
    return { s1: d.scene === "result" ? (d.s1 || 0) : "", s2: d.scene === "result" ? (d.s2 || 0) : "", sw, lk };
}
function prBcPoints(d) {
    let pts = 0;
    const counted = new Set((PR.board && PR.board.k) || []);
    (d.order || []).forEach((o, i) => {
        const key = prBcKey(d, i), p = PR.mine[key];
        if (!p || counted.has(key)) return;
        const m = prLiveMatch(d, i);
        if (m) pts += prScore(p, m).pts;
    });
    return pts;
}
function prTotal(d) {
    if (!currentUser) return 0;
    return prMyRow(currentUser.uid).p + (d && !d.trial ? prBcPoints(d) : 0);
}
/* زر 🎯 جنب أزرار البث: مجموعك، ويرف لو فيه توقع مفتوح ما سويته */
function prViewer(d) { return !!(d && d.status === "live" && currentUser && !isAdmin && !myLiveNum(d) && !bcIsReh(openLiveId) && !window.BC_REPLAY); }
function prDue(d) {
    if (!prViewer(d)) return false;
    const mine = PR.mine[prBcKey(d, d.cur)] || {};
    return ["w", "g2", "g3", "g4"].some(k => prCanPick(d, k) && prPick(mine, k) === null);
}
function prBtnHTML(d) {
    if (!prViewer(d)) return "";
    return `<button class="pr-side ${PR.open ? "on" : ""} ${prDue(d) ? "due" : ""}" onclick="prToggle()" aria-label="توقعاتك ونقاطك" aria-expanded="${PR.open}">🎯<b>${prTotal(d)}</b></button>`;
}
function prToggle() { PR.open = !PR.open; liveLastSig = ""; renderLiveScreen(); prPanelPaint(); }
function prPickRow(d, k, label, o) {
    const key = prBcKey(d, d.cur), p = PR.mine[key] || {}, pick = prPick(p, k);
    const name = n => n === 1 ? escapeHTML(o.p1) : (n === 2 ? escapeHTML(o.p2) : "تعادل");
    if (prCanPick(d, k)) {
        const b = n => `<button class="${pick === n ? "on" : ""}" onclick="bcPredict(${n}, ${jsArg(k)})">${name(n)}</button>`;
        return `<div class="pr-row open"><span class="l">${label}</span><div class="pr-btns">${b(1)}${b(0)}${b(2)}</div></div>`;
    }
    const m = prLiveMatch(d, d.cur);
    const sc = m ? prScore(p, m).items.find(x => x.k === k) : null;
    const st = sc ? (sc.ok ? `<i class="ok">${ic("check-circle")} +${k === "w" ? PR_PTS.w : PR_PTS.g}</i>` : `<i class="no">${ic("x-circle")}</i>`) : (pick === null ? "" : `<i class="wait">${ic("hourglass")}</i>`);
    return `<div class="pr-row"><span class="l">${label}</span><span class="v">${pick === null ? "—" : name(pick)}</span>${st}</div>`;
}
function prBoardHTML(n, uid) {
    const list = prRank(PR.board).slice(0, n);
    if (!list.length) return "";
    return `<div class="pr-board">${list.map((x, i) => `<div class="${x.uid === uid ? "me" : ""}"><span class="r">${i < 3 ? ic("medal", "m" + (i + 1)) : i + 1}</span><span class="n">${escapeHTML(x.n || "مشاهد")}</span><b>${x.p}</b></div>`).join("")}</div>`;
}
function prPanelHTML(d) {
    const o = bcCur(d) || {}, me = currentUser ? prMyRow(currentUser.uid) : null;
    const rows = d.scene === "closing" || !o.p1 ? "" : prPickRow(d, "w", "الفائز", o) + PR_SEGS.map(([k, l]) => prPickRow(d, k, l, o)).join("");
    return `<div class="pr-panel" id="prPanel"><div class="pr-head"><span>🎯 <b>${prTotal(d)}</b> نقطة</span>${me && me.rank ? `<span>المركز ${me.rank}</span>` : ""}<button class="pr-x" onclick="prToggle()" aria-label="إغلاق">${ic("x")}</button></div>
${rows ? `<div class="pr-rows">${rows}</div>` : ""}${prBoardHTML(5, currentUser && currentUser.uid)}</div>`;
}
function prPanelPaint() {
    const scr = document.getElementById("liveScreen");
    let el = document.getElementById("prPanel");
    const d = openLiveId ? liveMatchesCache[openLiveId] : null;
    if (!scr || !PR.open || !prViewer(d)) { if (el) el.remove(); if (PR.open && !prViewer(d)) PR.open = false; return; }
    const btn = scr.querySelector(".pr-side");
    const t = document.createElement("div"); t.innerHTML = prPanelHTML(d);
    const n = t.firstChild;
    if (el && el.innerHTML === n.innerHTML) n.remove(); else { if (el) el.replaceWith(n); else scr.appendChild(n); el = n; }
    if (btn) { const sr = scr.getBoundingClientRect(), br = btn.getBoundingClientRect(); el.style.top = Math.round(br.bottom - sr.top + 6) + "px"; }
}

/* ===== بعد المواجهة وفي الختام: نتيجة توقعاتك والترتيب، وتبقى لين تضغط "تخطي" ===== */
function prSummaryHTML(d, kind) {
    const uid = currentUser ? currentUser.uid : "";
    let body = "";
    if (kind === "result") {
        const o = bcCur(d) || {}, key = prBcKey(d, d.cur), p = PR.mine[key];
        const name = n => n === 1 ? escapeHTML(o.p1) : (n === 2 ? escapeHTML(o.p2) : "تعادل");
        const label = { w: "الفائز", g2: "الحروف", g3: "الكلمات", g4: "ضد وند" };
        if (p) {
            const sc = prScore(p, prLiveMatch(d, d.cur) || {});
            body += `<div class="pr-sum-rows">${sc.items.map(x => `<div class="${x.ok ? "ok" : "no"}"><span>${label[x.k]}</span><span>${name(x.pick)}</span><b>${x.ok ? "+" + (x.k === "w" ? PR_PTS.w : PR_PTS.g) : ic("x")}</b></div>`).join("")}${sc.bonus ? `<div class="ok bonus"><span>${ic("trophy")} كلها صح</span><span></span><b>+${PR_PTS.bonus}</b></div>` : ""}</div>
<div class="pr-sum-got">+${sc.pts}</div>`;
        }
    } else if (uid) body += `<div class="pr-sum-got">+${prBcPoints(d) + prRoundBoardPts(d)}</div>`;
    const me = uid ? prMyRow(uid) : null;
    if (uid) body += `<div class="pr-sum-me">🎯 <b>${prTotal(d)}</b>${me && me.rank ? ` · المركز ${me.rank}` : ""}</div>`;
    const board = prBoardHTML(kind === "closing" ? 10 : 5, uid);
    return `<div class="pr-sum" id="prSum"><div class="pr-sum-card"><div class="pr-sum-t">${kind === "closing" ? `${ic("trophy")} أفضل المتفرجين` : `${ic("target")} توقعاتك`}</div>${body}${board}
<button class="bc-go pr-skip" onclick="prSkip()">${ic("chevron-right")} تخطي</button></div></div>`;
}
/* نقاط هالبث اللي دخلت ترتيب الموسم (المواجهات اللي خلصت ونتيجتها انكتبت) */
function prRoundBoardPts(d) {
    let pts = 0;
    const counted = new Set((PR.board && PR.board.k) || []);
    (d.order || []).forEach((o, i) => {
        const key = prBcKey(d, i), p = PR.mine[key];
        if (!p || !counted.has(key)) return;
        const r = (PR.res && PR.res.k && PR.res.k[key]) || {};
        pts += prScore(p, { s1: o.s1 || 0, s2: o.s2 || 0, sw: r.sw || o.sw || null, lk: r.lk || o.lk || null }).pts;
    });
    return pts;
}
function prSkip() { const el = document.getElementById("prSum"); if (el) el.remove(); }
function prSummary(d) {
    if (!d || d.status !== "live" || isAdmin || myLiveNum(d) || bcIsReh(openLiveId) || window.BC_REPLAY || d.trial) return;
    const kind = d.scene === "result" ? "result" : (d.scene === "closing" ? "closing" : "");
    if (!kind) return;
    const tag = openLiveId + ":" + kind + ":" + (kind === "result" ? d.cur : "");
    if (PR.seen[tag]) return;
    if (bcNow() - (Number(d.sceneAt) || 0) > 10 * 60000) return;   /* فتح البث بعد ما خلصت بوقت طويل */
    /* المشاهد بدون حساب: الترتيب بس في الختام، لو فيه ترتيب */
    if (!currentUser && (kind !== "closing" || !(PR.board && Object.keys(PR.board.u || {}).length))) return;
    PR.seen[tag] = 1;
    const scr = document.getElementById("liveScreen");
    if (!scr) return;
    prSkip();
    setTimeout(() => {
        if (!openLiveId) return;
        const t = document.createElement("div"); t.innerHTML = prSummaryHTML(liveMatchesCache[openLiveId] || d, kind);
        scr.appendChild(t.firstChild);
    }, kind === "result" ? 2600 : 1200);   /* بعد لقطة النتيجة والاحتفال */
}
/* جهاز المقدم: لحظة قفل توقع الفائز = أول ما تطلع المواجهة من صفحة "جاهز" */
function prHostLocks(d) {
    if (!isAdmin || !d || d.status !== "live" || bcIsReh(openLiveId) || window.BC_REPLAY) return;
    if (d.scene === "intro" || d.scene === "opening" || d.scene === "closing" || !(d.order || [])[d.cur]) return;
    const lk = (d.lks || {})[d.cur] || {};
    const tag = openLiveId + ":" + d.cur;
    if (lk.w || PR.lkSent[tag]) return;
    PR.lkSent[tag] = 1;
    const at = d.scene === "talk" && Number(d.sceneAt) ? Number(d.sceneAt) : bcNow();
    liveTx(openLiveId, x => (x.cur === d.cur && !((x.lks || {})[x.cur] || {}).w) ? { ["lks." + x.cur + ".w"]: at } : null).catch(() => { PR.lkSent[tag] = 0; });
}
/* ينادى مع كل رسم للبث */
function prSync(d) {
    if (!d || window.BC_REPLAY || bcIsReh(openLiveId)) { prListenKey(""); return; }
    prEnsure();
    prListenKey(d.status === "live" ? prBcKey(d, d.cur) : "");
    prHostLocks(d);
    prSummary(d);
    prPanelPaint();
}
/* ترتيب أفضل المتوقعين (ملخص البث في الرئيسية): ترتيب الموسم */
function bcPredBoard() {
    return prRank(PR.board).slice(0, 5).map(x => ({ name: x.n || "مشاهد", ok: x.c, all: x.a, p: x.p }));
}
