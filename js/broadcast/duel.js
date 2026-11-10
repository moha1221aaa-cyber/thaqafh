/* الفقرة الرابعة "ضد وند" (10 نوفمبر 2026، طلب محمد): المقدم يختار تصنيف واحد للاثنين (أندية، لاعبين، دول، أكلات، شخصيات)، وكل متسابق يختار شي في باله منه،
   وبعدها بالدور كل واحد يسأل خصمه سؤال جوابه نعم أو لا (مثل: هل شخصيتك يوتيوبر؟) والمقدم يحط الجواب وينتقل الدور، ولما واحد يعرف اللي في بال الثاني المقدم يضغط فوزه. جولة وحدة، والفائز +1.
   - الاختيار سري: المتسابق يكتبه من جواله في duelPicks/<uid> (صاحبه والمنظم بس يقرون، firestore.rules)،
     وجهاز المنظم يسمع اختيار الاثنين ويكتب في وثيقة البث التصنيف و"جاهز" بس (sg.c و sg.rd)، واللي في بالهم يطلع للكل بعد نهاية الجولة (sg.reveal).
   - المنظم يقدر يدخل الاختيار بدل متسابق (بدون جوال)، وفي البث الخاص التجريبي يختار عن المتسابقين الوهميين لحاله.
   - النسخة عند المنظم تنحفظ في liveSecrets/seg_<البث> (p<المواجهة>_1 و _2) عشان لو أعاد تحميل الصفحة.
   - الانتقالات كلها بزر المنظم (ما فيه وقت يقرر لحاله)، والأزرار في #sgDock (segments.js sgDockPaint ← duDockPaint).
   - الجو: خلفية متحركة للتوتر (.du-bg) وصوت خلفية بدون موسيقى (audio/du_bed.mp3: همهمة واطية ونبض قلب وتكتكة، من tests/harness/audio/gen_du.py) طول الفقرة لين تنتهي الجولة. */
const DU_ROUNDS = 1;
const DU_CATS = ["أندية", "لاعبين", "دول", "أكلات", "شخصيات"];
const DU_BOT = {   /* اختيارات المتسابقين الوهميين في البث الخاص التجريبي */
    "أندية": ["الهلال", "النصر", "ريال مدريد", "برشلونة", "الأهلي"], "لاعبين": ["سالم الدوسري", "ميسي", "رونالدو", "محمد صلاح", "ياسر القحطاني"],
    "دول": ["اليابان", "مصر", "البرازيل", "إيطاليا", "المغرب"], "أكلات": ["الكبسة", "البيتزا", "المندي", "السوشي", "الجريش"],
    "شخصيات": ["الملك عبدالعزيز", "أينشتاين", "ابن سينا", "نيوتن", "طلال مداح"]
};
const DU = { picks: {}, tried: {}, subs: [], subKey: "", bed: null, bedOn: false, pickSig: "", mine: {}, myCat: "", sending: false, prev: null };
CINE_FILES.du_bed = { g: 1 };

function duNewRound(d, now) {
    /* اللي متأخر بالنقاط يبدأ يسأل (ولو متعادلين المتسابق الأول) */
    const first = (d.s1 || 0) <= (d.s2 || 0) ? 1 : 2;
    return { r: 0, st: "cat", cat: "", at: now, n: 0, first: first, turn: 0, c: ["", ""], rd: [0, 0], q: 0, gs: [], win: 0, why: "", reveal: [], items: [], used: [], ul: [], sk: [0, 0], cnt: 0, wheel: null, tEnd: 0 };
}
function duKey(d) { return openLiveId + "|" + d.cur; }
function duPickOf(d, n) { return DU.picks[duKey(d) + "|" + n] || null; }
function duOpp(d, n) { return livePlayerName(d, n === 1 ? 2 : 1); }

/* ===== المتسابق: يختار ويثبّت من جواله (#duPick برا الرسم الجزئي عشان الكتابة ما تنمسح) ===== */
const DU_HINT = { "أندية": "اسم النادي", "لاعبين": "اسم اللاعب", "دول": "اسم الدولة", "أكلات": "اسم الأكلة", "شخصيات": "اسم الشخصية" };
async function duSubmit() {
    const d = liveMatchesCache[openLiveId], me = myLiveNum(d);
    if (!d || !me || d.seg !== 4 || !d.sg || d.sg.st !== "pick" || !currentUser || DU.sending) return;
    const inp = document.getElementById("duPickIn");
    const pick = String(inp ? inp.value : "").replace(/\s+/g, " ").trim().slice(0, 40);
    const cat = d.sg.cat || "";
    if (!pick) return roomToast("اكتب اللي في بالك", "alert");
    DU.sending = true;
    try {
        await firebaseDB.collection("duelPicks").doc(currentUser.uid).set({ bid: String(openLiveId), cur: d.cur, cat: cat, pick: pick, at: Date.now() });
        DU.mine[duKey(d)] = { cat: cat, pick: pick };
        DU.pickSig = "";
        roomToast("تم، اختيارك سري (المقدم بس يشوفه)", "lock");
    } catch (e) { roomToast("ما انحفظ: " + (e && e.message), "alert"); }
    DU.sending = false;
    duPaint(liveMatchesCache[openLiveId]);
}
function duEditMine() { const d = liveMatchesCache[openLiveId]; if (d) { delete DU.mine[duKey(d)]; DU.pickSig = ""; duPaint(d); } }
function duPickPaint(d, scr) {
    let el = document.getElementById("duPick");
    const me = d ? myLiveNum(d) : 0;
    const on = !!(scr && d && me && d.status === "live" && d.scene === "playing" && d.seg === 4 && d.sg && (d.sg.st === "pick" || d.sg.st === "play"));
    if (!on) { if (el) el.remove(); DU.pickSig = ""; return; }
    const sg = d.sg, mine = DU.mine[duKey(d)];
    /* لو المتسابق أعاد تحميل الصفحة: اختياره يرجع من duelPicks حقه */
    if (!mine && currentUser && firebaseDB && !DU.tried["me|" + duKey(d)]) {
        DU.tried["me|" + duKey(d)] = 1;
        const k = duKey(d), cur = d.cur;
        firebaseDB.collection("duelPicks").doc(currentUser.uid).get().then(s => {
            const v = s.exists ? s.data() : null;
            if (v && v.bid === String(openLiveId) && v.cur === cur && v.pick && !DU.mine[k]) { DU.mine[k] = { cat: v.cat, pick: v.pick }; DU.pickSig = ""; duPaint(liveMatchesCache[openLiveId]); }
        }).catch(() => {});
    }
    let h, sig;
    if (sg.st === "pick" && !mine) {
        sig = "form|" + duKey(d) + "|" + sg.cat;
        h = `<div class="du-ptitle">${ic("lock")} اختر من <b>${escapeHTML(sg.cat)}</b> شي في بالك، و${escapeHTML(duOpp(d, me))} يحاول يخمّنه</div>
<div class="du-prow"><input id="duPickIn" maxlength="40" autocomplete="off" placeholder="اكتب ${escapeHTML(DU_HINT[sg.cat] || "اللي في بالك")}" onkeydown="if(event.key==='Enter')duSubmit()"><button class="bc-go" onclick="duSubmit()">${ic("lock")} ثبّت</button></div>
<div class="du-pnote">ما يشوفه إلا المقدم لين تنتهي الفقرة</div>`;
    } else {
        sig = "mine|" + duKey(d) + "|" + sg.st + "|" + (mine ? mine.pick : "");
        h = `<div class="du-mine">${ic("lock")} اللي في بالك: <b>${escapeHTML(mine ? mine.pick : "…")}</b> <small>${escapeHTML(mine ? mine.cat : "")}</small>${sg.st === "pick" ? `<button class="lv-link" onclick="duEditMine()">غيّره</button>` : ""}</div>`;
    }
    if (!el) {
        el = document.createElement("div"); el.id = "duPick"; el.className = "du-pick";
        const body = document.getElementById("liveScreenBody");
        scr.insertBefore(el, body ? body.nextSibling : null);
    }
    if (DU.pickSig !== sig) { DU.pickSig = sig; el.innerHTML = h; }
}

/* ===== المنظم: يسمع اختيار المتسابقين ويكتب "جاهز" والتصنيف للكل ===== */
function duListen(d) {
    if (!isAdmin || !firebaseDB) return;
    const o = bcCur(d) || {}, key = duKey(d) + "|" + (o.uid1 || "") + "|" + (o.uid2 || "");
    const want = d.seg === 4 && d.sg && d.sg.st === "pick";
    if (!want || DU.subKey !== key) { DU.subs.forEach(u => { try { u(); } catch (e) {} }); DU.subs = []; DU.subKey = ""; }
    if (!want || DU.subKey === key) return;
    DU.subKey = key;
    duLoadSecrets(d);
    [1, 2].forEach(n => {
        const uid = n === 1 ? o.uid1 : o.uid2;
        if (!uid) return;
        if (/^bot_/.test(uid)) { if (!duPickOf(d, n)) { const c = DU_BOT[d.sg.cat] ? d.sg.cat : DU_CATS[0]; duGot(d, n, c, DU_BOT[c][sgRand(DU_BOT[c].length)], 2500 + 1500 * n); } return; }
        DU.subs.push(firebaseDB.collection("duelPicks").doc(uid).onSnapshot(s => {
            const v = s.exists ? s.data() : null;
            if (v && v.bid === String(openLiveId) && v.cur === d.cur && v.pick) duGot(d, n, d.sg.cat, v.pick, 0);
        }, () => {}));
    });
}
/* وصل اختيار متسابق: ينحفظ عند المنظم (و liveSecrets) ويعلن "جاهز" والتصنيف */
function duGot(d, n, cat, pick, delay) {
    const k = duKey(d) + "|" + n, cur = d.cur, id = openLiveId;
    const prev = DU.picks[k];
    DU.picks[k] = { cat: DU_CATS.indexOf(cat) === -1 ? "" : cat, pick: String(pick).slice(0, 40) };
    if (!prev || prev.pick !== DU.picks[k].pick || prev.cat !== DU.picks[k].cat) {
        firebaseDB.collection("liveSecrets").doc("seg_" + id).set({ ["p" + cur + "_" + n]: DU.picks[k] }, { merge: true }).catch(() => {});
    }
    setTimeout(() => liveTx(id, (x, now) => {
        if (x.status !== "live" || x.scene !== "playing" || x.seg !== 4 || x.cur !== cur || !x.sg || x.sg.st !== "pick") return null;
        if (x.sg.rd[n - 1] && x.sg.c[n - 1] === DU.picks[k].cat) return null;
        const rd = x.sg.rd.slice(), c = x.sg.c.slice();
        rd[n - 1] = 1; c[n - 1] = DU.picks[k].cat;
        return sgUpd(x, { rd: rd, c: c }, null, now);
    }).catch(() => {}), delay || 0);
    sgDockPaint(liveMatchesCache[openLiveId]);
}
function duLoadSecrets(d) {
    const key = duKey(d);
    if (DU.tried[key]) return;
    DU.tried[key] = 1;
    firebaseDB.collection("liveSecrets").doc("seg_" + openLiveId).get().then(s => {
        const v = s.exists ? (s.data() || {}) : {};
        [1, 2].forEach(n => { const p = v["p" + d.cur + "_" + n]; if (p && p.pick && !DU.picks[key + "|" + n]) DU.picks[key + "|" + n] = p; });
        sgDockPaint(liveMatchesCache[openLiveId]);
    }).catch(() => {});
}
/* المنظم يكتب الاختيار بدل المتسابق (ما عنده جوال أو قاله للمقدم) */
async function duHostPick(n) {
    const d = sgCur();
    if (!d || d.seg !== 4 || d.sg.st !== "pick") return;
    const name = livePlayerName(d, n);
    const t = await uiPrompt("وش في بال " + name + "؟ (" + d.sg.cat + ")", "");
    const pick = String(t || "").replace(/\s+/g, " ").trim();
    if (!pick) return;
    duGot(d, n, d.sg.cat, pick, 0);
}

/* ===== أفعال المقدم ===== */
/* التصنيف موحد للاثنين والمقدم يختاره (طلب محمد 10 نوفمبر) */
function duSetRoundCat(i) {
    const d0 = sgCur(), c = DU_CATS[i];
    if (!d0 || d0.seg !== 4 || d0.sg.st !== "cat" || !c) return;
    sgAct((x, now) => sgUpd(x, { st: "pick", cat: c }, null, now));
}
function duStart() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 4 || d0.sg.st !== "pick") return;
    if (!(d0.sg.rd[0] && d0.sg.rd[1])) return roomToast("انتظر الاثنين يختارون", "hourglass");
    sgAct((x, now) => sgUpd(x, { st: "play", turn: x.sg.first }, null, now));
}
/* صاحب الدور يسأل خصمه سؤال (مثل: هل شخصيتك يوتيوبر؟) والخصم يجاوب، والمقدم يحط الجواب (نعم أو لا) ← الدور للثاني */
function duAnswer(yes) {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 4 || d0.sg.st !== "play") return;
    sgAct((x, now) => sgUpd(x, { turn: sgOther(x.sg.turn), q: (x.sg.q || 0) + 1, gs: x.sg.gs.concat([{ p: x.sg.turn, a: yes ? 1 : 0 }]).slice(-30) }, null, now));
}
/* الفوز: واحد عرف اللي في بال الثاني ← +1، واللي في بالهم يطلع للكل */
function duWin(n) {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 4 || d0.sg.st !== "play" || !(n === 1 || n === 2)) return;
    const rv = duRevealOf(d0);
    sgAct((x, now) => sgEndRound(x, now, n, "found", { reveal: rv }));
}
function duSkip() {
    const d0 = sgCur();
    if (!d0 || d0.seg !== 4 || !(d0.sg.st === "play" || d0.sg.st === "pick" || d0.sg.st === "cat")) return;
    const rv = duRevealOf(d0);
    sgAct((x, now) => sgEndRound(x, now, 0, "skip", { reveal: rv }));
}
function duRevealOf(d) { return [1, 2].map(n => { const p = duPickOf(d, n); return p ? p.pick : ""; }); }

/* ===== الرسم للكل ===== */
function duCard(d, n, sg) {
    const o = bcCur(d) || {}, ready = sg.rd[n - 1];
    const state = sg.st === "cat" ? "" : sg.st === "pick" ? (ready ? `${ic("check-circle")} اختار` : `<span class="du-dots">يختار<i></i><i></i><i></i></span>`)
        : (sg.st === "done" ? `<b class="du-rv">${escapeHTML((sg.reveal || [])[n - 1] || "—")}</b>` : (sg.turn === n ? "يسأل الحين" : "يجاوب"));
    const on = sg.st === "play" && sg.turn === n, won = sg.st === "done" && sg.win === n;
    return `<div class="du-card ${on ? "on" : ""} ${won ? "won" : ""} ${ready ? "ready" : ""}"><img src="${safeSrc(bcAv(o, n))}" alt=""><div class="nm">${escapeHTML(livePlayerName(d, n))}</div><div class="st">${state}</div>${sg.st === "done" ? "" : `<div class="lk">${ic("lock")}</div>`}</div>`;
}
function duHTML(d, me) {
    const sg = d.sg;
    const cards = `<div class="du-vs">${duCard(d, 1, sg)}<div class="du-x">ضد</div>${duCard(d, 2, sg)}</div>`;
    const catBox = sg.cat ? `<div class="du-cat"><small>التصنيف</small><b>${escapeHTML(sg.cat)}</b></div>` : "";
    if (sg.st === "cat") {
        return `<div class="du-title"><b>ضد وند</b><small>كل متسابق يختار شي في باله، والثاني يخمّنه بأسئلة جوابها نعم أو لا</small></div>${cards}
<div class="du-catsrow">${DU_CATS.map(c => `<span>${escapeHTML(c)}</span>`).join("")}</div>
<div class="lv-muted">بانتظار المقدم يختار التصنيف...</div>`;
    }
    if (sg.st === "pick") {
        return `<div class="du-title"><b>ضد وند</b><small>كل متسابق يختار شي في باله، والثاني يخمّنه بأسئلة جوابها نعم أو لا</small></div>${catBox}${cards}
<div class="lv-muted">${me ? "اكتب اللي في بالك تحت (سري)" : "بانتظار الاختيار..."}</div>`;
    }
    if (sg.st === "play") {
        const nm = escapeHTML(livePlayerName(d, sg.turn)), opp = escapeHTML(livePlayerName(d, sgOther(sg.turn)));
        const rows = sg.gs.slice().reverse().slice(0, 5).map(g => `<div class="du-g p${g.p}"><span>سؤال ${escapeHTML(livePlayerName(d, g.p))}</span><i class="${g.a ? "y" : "x"}">${g.a ? "نعم" : "لا"}</i></div>`).join("");
        return `<div class="du-turn"><small>${me === sg.turn ? "دورك!" : "الدور على"}</small><b>${me === sg.turn ? "اسأل " + opp : nm}</b><span>${me === sg.turn ? "سؤال جوابه نعم أو لا" : "يسأل " + opp + " سؤال جوابه نعم أو لا"}</span></div>${catBox}${cards}
<div class="du-q">${ic("ball")} أسئلة: <b>${sg.q || 0}</b></div><div class="du-gs">${rows}</div>`;
    }
    const w = sg.win;
    return `<div class="du-title"><b>${w ? ic("trophy") + " " + escapeHTML(livePlayerName(d, w)) + " عرفها!" : "بدون نقطة"}</b><small>${w ? "+1 نقطة بعد " + (sg.q || 0) + " سؤال" : "انتهت الجولة"}</small></div>${catBox}${cards}
<div class="sg-score">${escapeHTML((bcCur(d) || {}).p1 || "")} <b>${d.s1 || 0}</b> - <b>${d.s2 || 0}</b> ${escapeHTML((bcCur(d) || {}).p2 || "")}</div>`;
}

/* ===== لوحة المقدم ===== */
function duDockPaint(d, scr, dock) {
    duListen(d);
    const sg = d.sg, say = t => `<div class="sg-say">${ic("mic")} ${t}</div>`;
    const sec = n => { const p = duPickOf(d, n); return `<div class="du-sec ${sg.turn === n && sg.st === "play" ? "on" : ""}"><small>في بال ${escapeHTML(livePlayerName(d, n))}</small><b>${escapeHTML(p ? p.pick : "…")}</b>${p && p.cat ? `<i>${escapeHTML(p.cat)}</i>` : ""}</div>`; };
    const first = escapeHTML(livePlayerName(d, sg.first)), turn = escapeHTML(livePlayerName(d, sg.turn)), opp = escapeHTML(livePlayerName(d, sgOther(sg.turn)));
    let h = "";
    if (sg.st === "cat") {
        h = `<div class="du-ptitle">اختر التصنيف (نفسه للاثنين)</div><div class="du-cats">${DU_CATS.map((c, i) => `<button onclick="duSetRoundCat(${i})">${escapeHTML(c)}</button>`).join("")}</div>`
          + `<button class="lv-link" onclick="duSkip()">إنهاء الفقرة بدون نقطة</button>`;
    } else if (sg.st === "pick") {
        const both = sg.rd[0] && sg.rd[1];
        h = say(`قل: «التصنيف ${escapeHTML(sg.cat)}، كل واحد يختار شي في باله ويثبّته من جواله»`)
          + `<div class="du-secs">${sec(1)}${sec(2)}</div>`
          + `<div class="sg-row2"><button class="bc-ghost" onclick="duHostPick(1)">${ic("pencil")} أدخل بدل ${escapeHTML(livePlayerName(d, 1))}</button><button class="bc-ghost" onclick="duHostPick(2)">${ic("pencil")} أدخل بدل ${escapeHTML(livePlayerName(d, 2))}</button></div>`
          + `<button class="bc-go ${both ? "" : "off"}" onclick="duStart()">${ic("zap")} ${both ? "ابدأ (" + first + " يسأل أول)" : "بانتظار الاثنين يختارون"}</button>`
          + `<button class="lv-link" onclick="duSkip()">إنهاء الفقرة بدون نقطة</button>`;
    } else if (sg.st === "play") {
        h = (sg.q ? "" : say(`قل: «${first} يبدأ، اسأل ${escapeHTML(livePlayerName(d, sgOther(sg.first)))} سؤال جوابه نعم أو لا»`))
          + `<div class="du-secs">${sec(1)}${sec(2)}</div>`
          + `<div class="du-ask">${turn} يسأل · جواب ${opp}:</div>`
          + `<div class="du-act"><button class="yes" onclick="duAnswer(1)">${ic("check-circle")} نعم</button><button class="no" onclick="duAnswer(0)">${ic("x-circle")} لا</button></div>`
          + `<div class="du-wins"><button onclick="duWin(1)">${ic("trophy")} ${escapeHTML(livePlayerName(d, 1))} عرفها · فوز</button><button onclick="duWin(2)">${ic("trophy")} ${escapeHTML(livePlayerName(d, 2))} عرفها · فوز</button></div>`
          + `<button class="lv-link" onclick="duSkip()">إنهاء بدون نقطة</button>`;
    } else if (sg.st === "done") {
        h = `<button class="bc-go" onclick="sgNext()">${ic("trophy")} نتيجة المواجهة</button>`;
    }
    const sig = "4|" + sg.st + "|" + sg.n + "|" + sg.turn + "|" + [1, 2].map(n => (duPickOf(d, n) || {}).pick || "").join("|");
    if (!dock) {
        dock = document.createElement("div");
        dock.id = "sgDock"; dock.className = "sg-dock";
        const body = document.getElementById("liveScreenBody");
        scr.insertBefore(dock, body ? body.nextSibling : null);
    }
    scr.classList.add("sg-dock-on");
    if (SG.dockSig !== sig) { SG.dockSig = sig; dock.innerHTML = h; dock.classList.remove("busy"); }
}

/* ===== الجو: الخلفية وصوتها (يستدعى مع كل رسم، و null لما يتسكر البث) ===== */
function duPaint(d) {
    const scr = document.getElementById("liveScreen");
    const in4 = !!(scr && d && d.status === "live" && d.scene === "playing" && d.seg === 4 && d.sg);
    if (scr) scr.classList.toggle("du-on", in4);
    let bg = scr ? scr.querySelector(".du-bg") : null;
    if (in4 && !bg) { bg = document.createElement("div"); bg.className = "du-bg"; bg.innerHTML = `<i class="b1"></i><i class="b2"></i><i class="sweep"></i><i class="grid"></i><i class="vig"></i>`; scr.insertBefore(bg, document.getElementById("liveScreenBody")); }
    if (!in4 && bg) bg.remove();
    if (d && d.seg >= 3) { try { cineLoadSamples(["du_bed"]); } catch (e) {} }
    duBed(in4 && d.sg.st !== "done");
    duPickPaint(in4 ? d : null, scr);
    if (!in4) { DU.subs.forEach(u => { try { u(); } catch (e) {} }); DU.subs = []; DU.subKey = ""; }
}
/* صوت الخلفية (بدون موسيقى): يدخل بهدوء ويطلع بهدوء، ويرجع يحاول لو ما تحمّل للحين */
function duBed(on) {
    if (on === DU.bedOn && (!on || DU.bed)) return;
    if (!on) {
        DU.bedOn = false;
        const b = DU.bed; DU.bed = null;
        if (b) { try { const t = b.c.currentTime; b.g.gain.cancelScheduledValues(t); b.g.gain.setValueAtTime(b.g.gain.value, t); b.g.gain.linearRampToValueAtTime(0.0001, t + 1.2); b.src.stop(t + 1.3); } catch (e) {} }
        return;
    }
    DU.bedOn = true;
    const buf = CINE_BUF.du_bed;
    if (!buf) return;
    try {
        const G = cineGraph(), c = G.c;
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0.06; src.loopEnd = Math.max(0.5, buf.duration - 0.06);   /* بدون فراغ ترميز mp3 عند التكرار */
        const g = c.createGain(), t = c.currentTime;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42, t + 2.5);
        src.connect(g); g.connect(G.bus); src.start(t + 0.05);
        DU.bed = { src, g, c };
    } catch (e) { DU.bed = null; }
}
/* أصوات الفقرة (من نفس أصوات البث المختارة: SG_SFX) */
function duFx(d) {
    if (!d) { DU.prev = null; return; }
    const sg = d.sg, key = openLiveId + "|" + d.cur + "|" + sg.st, p = DU.prev;
    const snap = { key: key, gs: sg.gs.length, rd: sg.rd.join() };
    DU.prev = snap;
    const fresh = bcNow() - (Number(sg.at) || 0) < 2500;
    if (!p || p.key !== key) {
        if (sg.st === "cat") { bcStinger("الفقرة الرابعة", "ضد وند", sg.at); if (fresh) SG_SFX.seg(); }
        if (sg.st === "pick" && fresh) SG_SFX.land();
        if (sg.st === "play") showSound(sg.at, "start_q", 0.8);
        if (sg.st === "done" && fresh && sg.win) { SG_SFX.ok(); setTimeout(SG_SFX.round, 900); }
        return;
    }
    if (sg.st === "pick" && snap.rd !== p.rd && fresh) SG_SFX.h1();
    if (sg.st === "play" && snap.gs > p.gs) { const g = sg.gs[sg.gs.length - 1]; if (g) { (g.a ? SG_SFX.ok : SG_SFX.miss)(); setTimeout(SG_SFX.pass, 750); } }
}
