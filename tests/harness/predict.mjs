/* توقعات الجمهور على الموسم (11 نوفمبر 2026، predict.js): التعادل، وفائز كل فقرة، والقفل، والنقاط، وترتيب الموسم،
   ونتيجة توقعاتك بعد المواجهة وفي الختام (تبقى لين "تخطي")، وزر 🎯 بالمجموع. node tests/harness/predict.mjs */
import { serve, FakeDB, seed, launch, device, until, sleep, liveDoc } from "./harness.mjs";

const srv = await serve(Number(process.env.HARNESS_PORT) || 8799);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const browser = await launch({ wav: "silence.wav" });
const db = new FakeDB(30);
seed(db, "intro", { sceneAt: Date.now() - 3000, seg: 1 });
const KEY = "r2_سعد_فهد", PD = "predictions/u_fan_" + KEY;
const host = await device(browser, db, "host", {});
const fan = await device(browser, db, "fan", {});
const guest = await device(browser, db, "guest", {});
const D = () => liveDoc(db);
const tx = fnSrc => host.evaluate(src => liveTx(openLiveId, (x, now) => (new Function("x", "now", "return (" + src + ")(x, now)"))(x, now)), fnSrc);
try {
    /* ===== قبل المواجهة ===== */
    check("الضيف: ما يتوقع (زر تسجيل الدخول بدل الأزرار)", !!await until(() => guest.evaluate(() => !!document.querySelector(".st-pred .pr-login") && !document.querySelector(".st-predbtns")), 8000));
    check("الضيف: ما عنده زر 🎯", await guest.evaluate(() => !document.querySelector(".pr-side")));
    check("المشاهد: ثلاث أزرار (الأول، تعادل، الثاني)", !!await until(() => fan.evaluate(() => [...document.querySelectorAll(".st-predbtns.pr3 button")].map(b => b.textContent.trim()).join("|") === "سعد|تعادل|فهد"), 8000));
    check("المقدم ما يتوقع", await host.evaluate(() => !document.querySelector(".st-predbtns button") && !document.querySelector(".pr-side")));
    await fan.evaluate(() => bcPredict(0));
    const p0 = await until(() => db.data(PD), 5000);
    check("توقع التعادل انحفظ بوقته ومعرّف المواجهة (نفس تبويب التوقعات)", p0 && p0.w === 0 && p0.tw && p0.matchId === KEY, p0);
    check("زر 🎯 يرف (فيه توقعات فقرات مفتوحة)", !!await until(() => fan.evaluate(() => !!document.querySelector(".pr-side.due")), 5000));
    await fan.evaluate(() => prToggle());
    check("لوحة توقعاتك: الفائز وثلاث فقرات بأزرار", !!await until(() => fan.evaluate(() => document.querySelectorAll("#prPanel .pr-row.open").length === 4), 4000));
    await fan.evaluate(() => { bcPredict(1, "g2"); bcPredict(2, "g3"); bcPredict(0, "g4"); });
    const p1 = await until(() => { const p = db.data(PD); return p && p.g2 === 1 && p.g3 === 2 && p.g4 === 0 ? p : null; }, 5000);
    check("توقعات الفقرات انحفظت بأوقاتها", p1 && p1.t2 && p1.t3 && p1.t4, p1);
    check("بعد ما توقع الكل ما يرف", !!await until(() => fan.evaluate(() => !document.querySelector(".pr-side.due")), 4000));
    /* ===== المواجهة تبدأ: القفل ===== */
    await tx('(x, now) => ({ scene: "talk", sceneAt: now, ready1: true, ready2: true })');
    const lk = await until(() => ((D().lks || {})["0"] || {}).w, 6000);
    check("جهاز المقدم سجّل لحظة قفل توقع الفائز", !!lk, D().lks);
    await fan.evaluate(() => bcPredict(2));
    await sleep(700);
    check("بعد القفل: تغيير الفائز ما ينقبل", db.data(PD).w === 0);
    check("وتوقع الفقرات للحين مفتوح", await fan.evaluate(() => prCanPick(liveMatchesCache[openLiveId], "g2")));
    await tx('(x, now) => Object.assign(sgEnter(Object.assign({}, x, { scene: "playing" }), 2, now), {})');
    check("بداية الفقرة الثانية: لحظة قفلها انكتبت", !!await until(() => ((D().lks || {})["0"] || {}).g2, 5000), D().lks);
    await until(() => fan.evaluate(() => liveMatchesCache[openLiveId].seg === 2), 5000);
    check("جوال المشاهد: توقع الفقرة الثانية انقفل، والثالثة للحين مفتوحة", await fan.evaluate(() => !prCanPick(liveMatchesCache[openLiveId], "g2") && prCanPick(liveMatchesCache[openLiveId], "g3")));
    await fan.evaluate(() => bcPredict(2, "g2"));
    await sleep(700);
    check("بعد بداية الفقرة: توقعها ما يتغيّر", db.data(PD).g2 === 1);
    /* لو جوال متأخر كتب بعد القفل: ساعة السيرفر تكشفه وما ينحسب (prValid) */
    check("التوقع اللي وقته بعد القفل ما ينحسب", await fan.evaluate(lk => { const m = { s1: 1, s2: 1, sw: [2, null, null], lk: { g2: lk } }; return prScore({ w: 0, g2: 2, t2: lk + 5000 }, m).items.every(x => x.k !== "g2") && prScore({ w: 0, g2: 2, t2: lk - 5000 }, m).items.some(x => x.k === "g2" && x.ok); }, D().lks["0"].g2));
    /* ===== النتيجة: تعادل 3-3، وفائزين الفقرات 1 و 2 وبدون (تعادل) ===== */
    await tx('(x, now) => ({ s1: 3, s2: 3, sp: { g2: [2, 1], g3: [1, 2], g4: [0, 0] } })');
    await tx('(x, now) => bcFinishUpd(x, now)');
    const o0 = await until(() => { const o = D().order[0]; return o.state === "done" ? o : null; }, 5000);
    check("فائز كل فقرة ولحظات القفل انحفظت مع النتيجة", o0 && JSON.stringify(o0.sw) === "[1,2,0]" && o0.lk && o0.lk.w && o0.lk.g2, o0 && { sw: o0.sw, lk: o0.lk });
    const sum = await until(() => fan.evaluate(() => { const e = document.getElementById("prSum"); return e ? e.textContent : null; }), 8000);
    check("المشاهد: نتيجة توقعاته (كلها صح +8)", sum && /\+8/.test(sum) && /كلها صح/.test(sum) && /تخطي/.test(sum), sum);
    check("المقدم والضيف بدون نافذة نتيجة توقعات شخصية", await host.evaluate(() => !document.getElementById("prSum")) && await guest.evaluate(() => !/توقعاتك/.test((document.getElementById("prSum") || {}).textContent || "")));
    check("سطر النتيجة: كم واحد توقع التعادل", !!await until(() => host.evaluate(() => /1 من 1 توقعوا التعادل/.test(document.getElementById("liveScreen").textContent)), 5000));
    /* ===== الترتيب: المقدم يكتب النتيجة ثم ترتيب الموسم ===== */
    const res = await until(() => { const r = db.data("league/predRes"); return r && r.k && r.k[KEY] ? r.k[KEY] : null; }, 20000);
    check("league/predRes فيه فائزين الفقرات ولحظات القفل", res && JSON.stringify(res.sw) === "[1,2,0]" && res.lk && res.lk.w, res);
    const board = await until(() => { const b = db.data("league/predBoard"); return b && b.u && b.u.u_fan ? b : null; }, 25000);
    check("ترتيب الموسم: المشاهد 8 نقاط (4 من 4 صح)", board && board.u.u_fan.p === 8 && board.u.u_fan.c === 4 && board.u.u_fan.a === 4 && board.k.includes(KEY), board && board.u);
    check("المواجهات اللي نتيجتها مكتوبة باليد (الجولة 1) أخذت لحظة قفل من جهاز المقدم", !!await until(() => { const r = db.data("league/predRes"); return r && r.k && r.k["r1_سعد_خالد"] && r.k["r1_سعد_خالد"].lk && r.k["r1_سعد_خالد"].lk.w; }, 15000));
    check("ولحظة قفل البث ما تغيّرت", JSON.stringify(db.data("league/predRes").k[KEY].sw) === "[1,2,0]" && db.data("league/predRes").k[KEY].lk.g2);
    check("زر 🎯 فيه المجموع 8 (بدون ما ينحسب مرتين)", !!await until(() => fan.evaluate(() => (document.querySelector(".pr-side b") || {}).textContent === "8"), 6000), await fan.evaluate(() => (document.querySelector(".pr-side b") || {}).textContent));
    /* ===== المقدم ينتقل: النافذة تبقى لين "تخطي" ===== */
    await tx('(x, now) => ({ scene: "intro", cur: 1, sceneAt: now, s1: 0, s2: 0, seg: 1, sp: {}, sg: null })');
    await sleep(1500);
    check("المقدم انتقل للمواجهة الجاية والنافذة باقية", await fan.evaluate(() => liveMatchesCache[openLiveId].cur === 1 && !!document.getElementById("prSum")));
    await fan.click("#prSum .pr-skip");
    check("تخطي يسكّرها", !!await until(() => fan.evaluate(() => !document.getElementById("prSum")), 3000));
    /* ===== الختام ===== */
    await tx('(x, now) => ({ scene: "closing", sceneAt: now })');
    const cl = await until(() => fan.evaluate(() => { const e = document.getElementById("prSum"); return e ? e.textContent : null; }), 8000);
    check("الختام: أفضل المتفرجين والمجموع وزر تخطي", cl && /أفضل المتفرجين/.test(cl) && /مشاهد/.test(cl) && /تخطي/.test(cl), cl);
    check("الضيف يشوف ترتيب الموسم في الختام", !!await until(() => guest.evaluate(() => /أفضل المتفرجين/.test((document.getElementById("prSum") || {}).textContent || "")), 8000));
    for (const [n, pg] of [["host", host], ["fan", fan], ["guest", guest]]) { const errs = pg.__logs.filter(l => /PAGEERROR/.test(l)); check(n + ": no page errors", !errs.length, errs.slice(0, 3)); }
} catch (e) { ok = false; console.log(e.stack || e); }
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
