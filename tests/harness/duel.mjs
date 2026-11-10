/* الفقرة الرابعة "ضد وند" (10 نوفمبر 2026). node tests/harness/duel.mjs
   3 أجهزة (المقدم وسعد وفهد): كل متسابق يختار من جواله (سري)، المقدم يشوف الاثنين، وبعدها بالدور يسألون ويخمّنون لين واحد يعرف */
import { serve, FakeDB, seed, launch, device, until, sleep, liveDoc } from "./harness.mjs";

const srv = await serve(Number(process.env.HARNESS_PORT) || 8790);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const browser = await launch({ wav: "silence.wav" });
const db = new FakeDB(30);
const now = Date.now();
const sg0 = { r: 2, st: "done", at: now - 3000, n: 9, first: 1, turn: 2, items: [], used: [], ul: [], cat: "جماد", letter: "", wheel: null, tEnd: 0, cnt: 0, win: 1, why: "found", gs: [], sk: [0, 0], len: 3, reveal: "باب" };
seed(db, "playing", { seg: 3, phase: "s3", sp: { g2: [2, 1], g3: [1, 1] }, sg: sg0, s1: 5, s2: 3, ready1: true, ready2: true, hostSeen: now });
const host = await device(browser, db, "host", {});
const p1 = await device(browser, db, "p1", {});
const p2 = await device(browser, db, "p2", {});
const fan = await device(browser, db, "fan", {});
const D = () => liveDoc(db);
const dockBtn = async txt => { await sleep(450); return host.evaluate(t => { const b = [...document.querySelectorAll("#sgDock button")].find(x => x.textContent.includes(t)); if (b) b.click(); return !!b; }, txt); };
const waitDock = txt => until(() => host.evaluate(t => (document.getElementById("sgDock")?.textContent || "").includes(t), txt), 10000);
const pick = async (pg, cat, txt) => {
    await until(() => pg.$("#duPick #duPickIn"), 8000);
    await pg.evaluate(c => [...document.querySelectorAll("#duPick .du-cats button")].find(b => b.dataset.c === c).click(), cat);
    await pg.fill("#duPickIn", txt);
    await pg.click("#duPick .bc-go");
};
try {
    /* ===== من الفقرة 3 للفقرة 4 ===== */
    check("زر آخر الفقرة 3: الفقرة الرابعة", !!await waitDock("الفقرة الرابعة: ضد وند"));
    await dockBtn("الفقرة الرابعة: ضد وند");
    const d1 = await until(() => { const d = D(); return d.seg === 4 && d.sg && d.sg.st === "pick" ? d : null; }, 8000);
    check("الفقرة 4 بدأت (اختيار)، والمتأخر بالنقاط (فهد) يبدأ", d1 && d1.phase === "s4" && d1.sg.first === 2 && d1.sg.rd.join() === "0,0", d1 && d1.sg);
    check("المراحل فوق فيها 4 (ضد وند)", await until(() => fan.evaluate(() => /ضد وند/.test(document.querySelector(".sg-steps")?.textContent || "")), 6000));
    check("الخلفية الخاصة بالفقرة تطلع للكل", await until(() => fan.evaluate(() => document.getElementById("liveScreen").classList.contains("du-on") && !!document.querySelector("#liveScreen .du-bg")), 6000));
    check("صوت الخلفية (بدون موسيقى) شغال عند المشاهد", await until(() => fan.evaluate(() => DU.bedOn && !!DU.bed), 8000));
    check("المتسابق يشوف نموذج الاختيار، والمشاهد لا", await until(() => p1.$("#duPick #duPickIn"), 6000) && !(await fan.$("#duPick")));

    /* ===== الاختيار السري ===== */
    await p1.evaluate(() => { DU.myCat = ""; });
    await p1.fill("#duPickIn", "اليابان");
    await p1.click("#duPick .bc-go");
    await sleep(500);
    check("بدون تصنيف ما ينحفظ", !db.data("duelPicks/u_p1"));
    await pick(p1, "دول", "اليابان");
    const pk1 = await until(() => db.data("duelPicks/u_p1"), 6000);
    check("اختيار سعد ينحفظ في duelPicks حقه", pk1 && pk1.pick === "اليابان" && pk1.cat === "دول" && pk1.bid === "round_2" && pk1.cur === 0, pk1);
    const r1 = await until(() => { const d = D(); return d.sg.rd[0] ? d : null; }, 8000);
    check("المقدم يعلن: سعد جاهز وتصنيفه دول (بدون الشي نفسه)", r1 && r1.sg.c[0] === "دول" && !JSON.stringify(r1.sg).includes("اليابان"), r1 && r1.sg);
    check("سعد يشوف اختياره بس", await until(() => p1.evaluate(() => /اليابان/.test(document.getElementById("duPick")?.textContent || "")), 5000));
    check("فهد والمشاهد ما يشوفون اختيار سعد", !(await p2.evaluate(() => document.body.innerText.includes("اليابان"))) && !(await fan.evaluate(() => document.body.innerText.includes("اليابان"))));
    check("المقدم يشوف اختيار سعد في لوحته", await until(() => host.evaluate(() => /اليابان/.test(document.getElementById("sgDock")?.textContent || "")), 6000));
    check("زر البدء ينتظر الاثنين", await host.evaluate(() => /بانتظار الاثنين/.test(document.getElementById("sgDock").textContent)));
    await pick(p2, "أندية", "الهلال");
    const r2 = await until(() => { const d = D(); return d.sg.rd[0] && d.sg.rd[1] ? d : null; }, 8000);
    check("الاثنين جاهزين", r2 && r2.sg.c.join() === "دول,أندية" && !JSON.stringify(r2.sg).includes("الهلال"), r2 && r2.sg);
    check("المشاهد يشوف التصنيفين (في بالهم: دول و أندية)", await until(() => fan.evaluate(() => { const t = document.querySelector(".du-vs")?.textContent || ""; return t.includes("دول") && t.includes("أندية"); }), 5000));
    check("الاختيار محفوظ للمقدم في liveSecrets", !!await until(() => { const s = db.data("liveSecrets/seg_round_2"); return s && s.p0_1 && s.p0_2 && s.p0_2.pick === "الهلال" ? s : null; }, 5000));

    /* ===== اللعب بالدور ===== */
    await waitDock("ابدأ");
    await dockBtn("ابدأ (");
    const pl = await until(() => D().sg.st === "play" ? D().sg : null, 6000);
    check("اللعب بدأ، وفهد أول دور", pl && pl.turn === 2, pl);
    check("فهد يشوف دورك", await until(() => p2.evaluate(() => /دورك/.test(document.querySelector(".du-turn")?.textContent || "")), 5000));
    await waitDock("سأل");
    await dockBtn("سأل");
    check("سأل ← الدور لسعد (سؤال 1)", !!await until(() => D().sg.turn === 1 && D().sg.q === 1, 5000));
    await waitDock("خمّن غلط");
    await dockBtn("خمّن غلط");
    const g = await until(() => D().sg.q === 2 ? D().sg : null, 5000);
    check("خمّن غلط ← الدور لفهد، ويطلع في السجل", g && g.turn === 2 && g.gs.length === 2 && g.gs[1].x === 1 && g.gs[1].p === 1, g && g.gs);
    check("المشاهد يشوف عدد الأسئلة والسجل", await until(() => fan.evaluate(() => /2/.test(document.querySelector(".du-q")?.textContent || "") && document.querySelectorAll(".du-g").length === 2), 5000));
    check("ما فيه وقت يقرر لحاله (بدون tEnd)", !D().sg.tEnd);
    const before = D();
    await waitDock("خمّن صح");
    await dockBtn("خمّن صح");
    const dn = await until(() => D().sg.st === "done" ? D() : null, 6000);
    check("فهد خمّن صح: يفوز بالجولة +1، وg4", dn && dn.sg.win === 2 && dn.s2 === before.s2 + 1 && dn.s1 === before.s1 && dn.sp.g4 && dn.sp.g4[1] === 1, dn && { win: dn.sg.win, s1: dn.s1, s2: dn.s2, sp: dn.sp });
    check("بعد النهاية: اللي في بالهم يطلع للكل", dn && dn.sg.reveal[0].includes("اليابان") && dn.sg.reveal[1].includes("الهلال"), dn && dn.sg.reveal);
    check("المشاهد يشوف الكشف", await until(() => fan.evaluate(() => { const t = document.querySelector(".du-vs")?.textContent || ""; return t.includes("اليابان") && t.includes("الهلال"); }), 5000));
    check("صوت الخلفية يوقف بعد نهاية الجولة", await until(() => fan.evaluate(() => !DU.bedOn), 5000));

    /* ===== النتيجة ===== */
    await waitDock("نتيجة المواجهة");
    await dockBtn("نتيجة المواجهة");
    const res = await until(() => D().scene === "result" ? D() : null, 6000);
    check("بعد الفقرة 4: نتيجة المواجهة", !!res && res.order[0].state === "done" && res.order[0].s2 === res.s2, res && { s1: res.s1, s2: res.s2 });
    check("النتيجة فيها سطر ضد وند", await until(() => fan.evaluate(() => /ضد وند/.test(document.getElementById("liveScreenBody").textContent)), 6000));
    check("الخلفية تختفي بعد الفقرة", await until(() => fan.evaluate(() => !document.querySelector("#liveScreen .du-bg") && !document.getElementById("liveScreen").classList.contains("du-on")), 5000));
    for (const [n, pg] of [["host", host], ["p1", p1], ["p2", p2], ["fan", fan]]) { const errs = pg.__logs.filter(l => /PAGEERROR/.test(l)); check(n + ": no page errors", !errs.length, errs.slice(0, 3)); }
} catch (e) { ok = false; console.log(e.stack || e); }
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
