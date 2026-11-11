/* إضافات البث (11 نوفمبر 2026، طلب محمد): التراجع عن آخر حكم، وشارة الفقرة، وشريط الزخم، وشارة السلسلة، واحتفال الفائز.
   node tests/harness/extras.mjs */
import { serve, FakeDB, seed, launch, device, until, sleep, liveDoc } from "./harness.mjs";

const srv = await serve(Number(process.env.HARNESS_PORT) || 8798);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const browser = await launch({ wav: "silence.wav" });
const vp = { width: 360, height: 740 };
const sg2 = now => ({ r: 0, st: "play", at: now - 1000, n: 3, first: 1, items: ["أكلات", "مدن", "دول"], used: [], ul: ["س"], cat: "دول", letter: "س", wheel: null, turn: 1, tEnd: now + 9000, cnt: 0, win: 0, why: "", gs: [], sk: [0, 0], len: 0, reveal: "" });
const pages = [];
const fresh = async (state, who) => {
    const db = new FakeDB(30); seed(db, "intro", Object.assign({ hostSeen: Date.now(), ready1: true, ready2: true }, state));
    const out = { db };
    for (const w of who) { out[w] = await device(browser, db, w, { viewport: vp }); pages.push(out[w]); }
    for (const w of who) await until(() => out[w].evaluate(() => document.getElementById("liveScreen")?.classList.contains("open")), 8000);
    return out;
};
const close = async o => { for (const k of Object.keys(o)) if (k !== "db") await o[k].context().close(); };
try {
    /* ===== 1) التراجع عن الحكم في فقرة الأسئلة ===== */
    {
        const now = Date.now();
        const o = await fresh({ scene: "playing", seg: 1, phase: "answer", answerer: 1, buzzer: 1, qIndex: 1, qAt: now - 6000, deadline: now + 7000, s1: 1, log: [1, -1, -1, -1, -1] }, ["host", "fan"]);
        await until(() => o.host.$(".bc-verdict .ok"), 6000);
        check("قبل الحكم: ما فيه زر تراجع", !(await o.host.$(".bc-undo")));
        await o.host.evaluate(() => bcHostVerdict(true));
        const d1 = await until(() => { const d = liveDoc(o.db); return d.phase === "reveal" ? d : null; }, 5000);
        check("الحكم صح انكتب (+1 والكشف)", d1 && d1.s1 === 2 && d1.log[1] === 1, d1 && { s1: d1.s1, ph: d1.phase });
        check("زر تراجع يطلع للمقدم بس", !!await until(() => o.host.$(".st-hostrow .bc-undo"), 4000) && !(await o.fan.$(".bc-undo")));
        await o.host.click(".st-hostrow .bc-undo");
        const d2 = await until(() => { const d = liveDoc(o.db); return d.phase === "answer" ? d : null; }, 5000);
        check("التراجع رجّع البث مثل قبل الحكم (السؤال نفسه، والنقطة انشالت)", d2 && d2.s1 === 1 && d2.answerer === 1 && d2.qIndex === 1 && d2.log[1] === -1 && !d2.lastAnswer && d2.v > d1.v, d2 && { s1: d2.s1, log: d2.log, la: d2.lastAnswer });
        check("ووقت الجواب تمدد بقدر اللي راح", d2 && d2.deadline >= now + 7000, d2 && d2.deadline - now);
        check("بعد التراجع: الزر يختفي، وأزرار صح وغلط ترجع", !!await until(() => o.host.evaluate(() => !document.querySelector(".bc-undo") && !!document.querySelector(".bc-verdict .ok:not([disabled])")), 5000));
        check("المشاهد يشوف السؤال رجع", !!await until(() => o.fan.evaluate(() => liveMatchesCache[openLiveId].phase === "answer"), 4000));
        /* الحكم غلط، وبعدها شي تغيّر في البث ← ما ينفع تراجع */
        await o.host.evaluate(() => bcHostVerdict(false));
        await until(() => liveDoc(o.db).answerer === 2, 5000);
        await until(() => o.host.$(".bc-undo"), 4000);
        const d3 = liveDoc(o.db);
        await o.fan.evaluate(() => liveTx(openLiveId, () => ({ fb2: 1 })));   /* أي كتابة بعد الحكم */
        check("لو تغيّر شي بعد الحكم الزر يختفي (ما يمسح اللي صار)", !!await until(() => o.host.evaluate(() => !document.querySelector(".bc-undo")), 5000));
        await o.host.evaluate(() => bcUndo());
        await sleep(600);
        check("والتراجع ما يسوي شي", liveDoc(o.db).answerer === 2 && liveDoc(o.db).v === d3.v + 1);
        /* الزر يختفي بعد 5 ثواني */
        await o.host.evaluate(() => bcHostVerdict(true));
        await until(() => o.host.$(".bc-undo"), 4000);
        await sleep(5400);
        check("الزر يختفي لحاله بعد 5 ثواني", await o.host.evaluate(() => !document.querySelector(".bc-undo") && !bcUndoLive()));
        await close(o);
    }
    /* ===== 2) التراجع في فقرة الحروف ===== */
    {
        const now = Date.now();
        const o = await fresh({ scene: "playing", seg: 2, phase: "s2", sp: {}, s1: 3, s2: 2, sg: sg2(now) }, ["host"]);
        await until(() => o.host.$("#sgDock"), 6000);
        await o.host.evaluate(() => sgBad());
        const d1 = await until(() => { const d = liveDoc(o.db); return d.sg.st === "done" ? d : null; }, 5000);
        check("ف2: غلط ← الجولة خلصت والنقطة للثاني", d1 && d1.s2 === 3 && d1.sg.win === 2, d1 && d1.sg);
        await until(() => o.host.$(".bc-undo"), 4000);
        await o.host.evaluate(() => bcUndo());
        const d2 = await until(() => { const d = liveDoc(o.db); return d.sg.st === "play" ? d : null; }, 5000);
        check("ف2: التراجع رجّع الدور والنقاط", d2 && d2.s2 === 2 && d2.sg.turn === 1 && !d2.sg.win && JSON.stringify(d2.sp) === "{}", d2 && { s2: d2.s2, sg: d2.sg.st, sp: d2.sp });
        await close(o);
    }
    /* ===== 3) شارة السلسلة وشريط الزخم ===== */
    {
        const now = Date.now();
        const o = await fresh({ scene: "playing", seg: 1, phase: "buzz", qIndex: 2, qAt: now - 3000, deadline: now + 12000, s1: 2, s2: 0, log: [1, 1, -1, -1, -1] }, ["fan"]);
        const st = await until(() => o.fan.evaluate(() => { const s = document.querySelectorAll(".st-pod")[0].querySelector(".st-streak"); return s ? s.textContent.trim() : null; }), 5000);
        check("سلسلة 🔥 2 على منصة اللي جاوب مرتين ورا بعض", st && /2/.test(st), st);
        check("والثاني بدون سلسلة", await o.fan.evaluate(() => !document.querySelectorAll(".st-pod")[1].querySelector(".st-streak")));
        const w = await o.fan.evaluate(() => { const m = document.querySelector(".st-mom .m1"); return m && m.style.width; });
        check("شريط الزخم يميل للمتقدم (2-0)", w === "88%", w);
        await close(o);
        const o2 = await fresh({ scene: "playing", seg: 1, phase: "buzz", qIndex: 3, qAt: now - 3000, deadline: now + 12000, s1: 2, s2: 1, log: [1, 1, 2, -1, -1] }, ["fan"]);
        await until(() => o2.fan.$(".st-mom"), 5000);
        check("السلسلة تنقطع لو جاوب الثاني (1 بس ما تطلع)", await o2.fan.evaluate(() => !document.querySelector(".st-streak")));
        check("الزخم 2-1 = 67%", await o2.fan.evaluate(() => document.querySelector(".st-mom .m1").style.width === "67%"));
        await close(o2);
    }
    /* ===== 4) شارة الفقرة ===== */
    {
        const now = Date.now();
        const o = await fresh({ scene: "playing", seg: 3, phase: "s3", sp: { g2: [2, 1] }, s1: 5, s2: 3, sg: Object.assign(sg2(now), { st: "cat", at: now, cat: "", letter: "", turn: 0, items: ["اسم إنسان", "جماد"] }) }, ["fan"]);
        const t = await until(() => o.fan.evaluate(() => { const e = document.querySelector(".bc-segid.s3"); return e ? e.textContent : null; }), 3000);
        check("شارة الفقرة الثالثة (رقمها واسمها ولونها)", t && /3/.test(t) && /خمّن الكلمة/.test(t), t);
        check("وتختفي بعد ثانيتين ونص", !!await until(() => o.fan.evaluate(() => !document.querySelector(".bc-segid")), 4000));
        await close(o);
    }
    /* ===== 4ب) صوت بداية الجولة يشتغل حتى لو الحالة وصلت متأخرة ثانية (نت الجوال) ===== */
    {
        const now = Date.now();
        const o = await fresh({ scene: "playing", seg: 2, phase: "s2", sp: {}, s1: 3, s2: 2, sg: Object.assign(sg2(now), { st: "letter" }) }, ["host", "fan"]);
        await sleep(1200);
        await o.fan.evaluate(() => { window.__s = []; const f = window.cineS; window.cineS = (id, t, v, x) => { window.__s.push(id); return f(id, t, v, x); }; });
        await o.host.evaluate(() => liveTx(openLiveId, (x, now) => ({ sg: Object.assign({}, x.sg, { st: "play", at: now - 1000, n: x.sg.n + 1, turn: 1, tEnd: now + 9000 }) })));
        check("صوت بداية الجولة يشتغل لو وصلت الحالة بعد ثانية", !!await until(() => o.fan.evaluate(() => window.__s.includes("start_q")), 4000), await o.fan.evaluate(() => window.__s));
        await close(o);
        const o2 = await fresh({ scene: "playing", seg: 2, phase: "s2", sp: {}, s1: 3, s2: 2, sg: Object.assign(sg2(now), { st: "letter" }) }, ["host", "fan"]);
        await sleep(1200);
        await o2.fan.evaluate(() => { window.__s = []; const f = window.cineS; window.cineS = (id, t, v, x) => { window.__s.push(id); return f(id, t, v, x); }; });
        await o2.host.evaluate(() => liveTx(openLiveId, (x, now) => ({ sg: Object.assign({}, x.sg, { st: "play", at: now - 4000, n: x.sg.n + 1, turn: 1, tEnd: now + 9000 }) })));
        await sleep(1500);
        check("واللي وصله متأخر كثير (4 ث) ما يسمع صوت قديم", await o2.fan.evaluate(() => !window.__s.includes("start_q")), await o2.fan.evaluate(() => window.__s));
        await close(o2);
    }
    /* ===== 5) احتفال الفائز ===== */
    {
        const o = await fresh({ scene: "result", s1: 4, s2: 2, sceneAt: Date.now() }, ["fan"]);
        const n = await until(() => o.fan.evaluate(() => document.querySelectorAll(".bc-confetti i").length || null), 4000);
        check("قصاصات الاحتفال تطلع مع النتيجة", n >= 16, n);
        check("وتختفي لحالها", !!await until(() => o.fan.evaluate(() => !document.querySelector(".bc-confetti")), 7000));
        await close(o);
        const o2 = await fresh({ scene: "result", s1: 2, s2: 2, sceneAt: Date.now() }, ["fan"]);
        await sleep(1500);
        check("التعادل بدون قصاصات", await o2.fan.evaluate(() => !document.querySelector(".bc-confetti")));
        await close(o2);
    }
    for (const pg of pages) { const errs = pg.__logs.filter(l => /PAGEERROR/.test(l)); if (errs.length) check("no page errors", false, errs.slice(0, 3)); }
} catch (e) { ok = false; console.log(e.stack || e); }
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
