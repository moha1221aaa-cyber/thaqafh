/* اختيار أصوات البث (10 نوفمبر 2026): المنظم يختار من القائمة الجانبية، والاختيار ينحفظ في liveDiag/_sfx ويسمعه كل المشاهدين.
   node tests/harness/sfx.mjs */
import { serve, FakeDB, seed, launch, device, until, sleep } from "./harness.mjs";
const srv = await serve();
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const browser = await launch({});
try {
    const db = new FakeDB(30); const now = Date.now();
    seed(db, "playing", { seg: 3, sp: {}, phase: "s3", deadline: 0, hostSeen: now + 600000, sg: { r: 0, st: "cat", at: now, n: 0, first: 1, items: ["جماد"], used: [], ul: [], cat: "", letter: "", wheel: null, turn: 0, tEnd: 0, cnt: 0, win: 0, why: "", gs: [], sk: [0, 0], len: 0, reveal: "" } });
    const host = await device(browser, db, "host", {});
    const fan = await device(browser, db, "u_p1", {});
    await until(() => host.evaluate(() => !!currentUser && isAdmin), 15000);
    await sleep(800);
    /* الملفات */
    const files = await host.evaluate(async () => { const r = []; for (const e of SFX_EVENTS) { const ns = [1, 2, 3, 4, 5, 6].concat(sfxSamples(e.k).map(x => x[0])); for (const n of ns) r.push(await fetch("audio/" + sfxId(e.k, n) + ".mp3").then(x => x.ok && (x.headers.get("content-type") || "").includes("audio"))); } return { n: r.length, ok: r.every(Boolean), perEvent: SFX_EVENTS.map(e => 6 + sfxSamples(e.k).length) }; });
    check("كل الملفات موجودة (6 مولّدة + Mixkit + Sonniss: أكثر من 50 لكل حدث)", files.ok && files.n >= 700 && files.perEvent.every(x => x >= 50), { n: files.n, min: Math.min(...files.perEvent) });
    /* القائمة للمنظم */
    check("المنظم: زر أصوات البث في القائمة الجانبية", await host.evaluate(() => { renderSideMenu(); return /أصوات البث/.test(document.getElementById("sideMenuBody").innerText); }));
    check("المشاهد: ما فيه الزر", await fan.evaluate(() => { renderSideMenu(); return !/أصوات البث/.test(document.getElementById("sideMenuBody").innerText); }));
    await fan.evaluate(() => openSfxModal());
    check("المشاهد: openSfxModal ما يفتح شي", await fan.evaluate(() => !document.getElementById("sfxModal").classList.contains("active")));
    await host.evaluate(() => openSfxModal());
    check("13 بطاقة مطوية، وتنفتح بطاقة وحدة بس وفيها الحالي + 50 خيار على الأقل", await host.evaluate(() => document.querySelectorAll("#sfxBody .sfx-card").length === 13 && !document.querySelector("#sfxBody .sfx-row") && (sfxToggle("h1"), document.querySelectorAll("#sfxBody .sfx-card.open").length === 1 && document.querySelectorAll("#sfxBody .sfx-card.open button").length >= 50)));
    check("الافتراضي: الحالي مختار في كل حدث", await host.evaluate(() => sfxChosen("h1") === "d" && [...document.querySelectorAll("#sfxBody .sfx-card.open button.on")].every(b => b.textContent === "الحالي") && SFX_EVENTS.every(e => sfxChosen(e.k) === "d")));
    /* الاختيار */
    await host.evaluate(() => { SFX.openKey = ""; sfxRender(); sfxToggle("h2"); sfxPick("h2", "3"); });
    await sleep(500);
    await host.evaluate(() => sfxPick("strike", "5"));
    await sleep(500);
    const saved = await until(() => { const d = db.data("room/main/liveDiag/_sfx"); return d && d.map && d.map.h2 === "3" && d.map.strike === "5" ? d : null; }, 6000);
    check("الاختيار ينحفظ في liveDiag/_sfx", !!saved, saved && saved.map);
    check("البطاقة تبيّن الاختيار", await host.evaluate(() => { const c = [...document.querySelectorAll("#sfxBody .sfx-card")].find(x => /حرفين صحيحة/.test(x.querySelector(".sfx-t").textContent)); return /3 ·/.test(c.querySelector(".sfx-cur").textContent) && c.querySelector("button.on").textContent.startsWith("3 ·"); }));
    /* عينة استوديو (رقم 7+) تنختار وتنحفظ وتشتغل */
    await host.evaluate(() => { sfxToggle("h1"); sfxPick("h1", String(sfxSamples("h1")[3][0])); });
    await sleep(500);
    const sm = await until(() => { const d = db.data("room/main/liveDiag/_sfx"); return d && d.map && d.map.h1 === "10" ? d : null; }, 6000);
    check("اختيار عينة استوديو ينحفظ (h1 = 10)", !!sm, sm && sm.map);
    check("البطاقة تعرض اسم العينة المختارة", !!await until(() => host.evaluate(() => { const c = [...document.querySelectorAll("#sfxBody .sfx-card")].find(x => /^حرف صحيح/.test(x.querySelector(".sfx-t").textContent)); return c.querySelector("button.on").textContent === sfxSamples("h1")[3][1] && c.querySelector(".sfx-cur").textContent === sfxSamples("h1")[3][1]; }), 4000));
    await host.evaluate(() => sfxPick("h1", "d"));
    await sleep(500);
    await sleep(300);
    check("رقم غير موجود يرجع للحالي (حماية)", await host.evaluate(() => { SFX.map.h1 = "98"; const r = sfxChosen("h1"); SFX.map.h1 = "99"; const r2 = sfxChosen("h1"); delete SFX.map.h1; return r === "d" && r2 === "d"; }));
    /* المشاهد يسمع الاختيار */
    await fan.evaluate(() => { window.__played = []; const o = window.cinePlay; window.cinePlay = (id, v, x) => { window.__played.push(id); return o(id, v, x); }; sfxListen(); });
    check("المشاهد يستلم الاختيار", !!await until(() => fan.evaluate(() => SFX.map.h2 === "3" && SFX.map.strike === "5"), 6000));
    await until(() => fan.evaluate(() => !!CINE_BUF[sfxId("h2", 3)] && !!CINE_BUF[sfxId("strike", 5)]), 8000);
    await fan.evaluate(() => { SG_SFX.h2(); SG_SFX.strike(); SG_SFX.h1(); });
    const played = await fan.evaluate(() => window.__played);
    check("المشاهد: الأحداث المختارة تشغّل الصوت المختار (حتى وبدون ما يفتح الإعدادات)", played.includes("sx_h2_3") && played.includes("sx_strike_5") && !played.includes("sg_h2") && !played.includes("sg_strike"), played);
    check("وغير المختار يبقى على الصوت الحالي", played.includes("sg_h1"), played);
    await fan.evaluate(() => { window.__played.length = 0; SG_SFX.round(); SG_SFX.h3(); });
    check("الحالي للجولة والثلاث حروف يشتغل زي قبل", (await fan.evaluate(() => window.__played)).includes("match_end"));
    /* تجربة صوت بدون اختيار */
    await host.evaluate(() => { window.__p2 = []; const o = window.cinePlay; window.cinePlay = (id, v, x) => { window.__p2.push(id); return o(id, v, x); }; });
    await host.evaluate(() => sfxPreview("land", "4"));
    check("التجربة تشغّل الصوت وما تغيّر الاختيار", (await host.evaluate(() => window.__p2)).includes("sx_land_4") && await host.evaluate(() => sfxChosen("land") === "d"));
    /* تراجع */
    await host.evaluate(() => { window.uiConfirm = () => Promise.resolve(true); return sfxResetAll(); });
    check("رجّع كل الأصوات للحالي", !!await until(() => { const d = db.data("room/main/liveDiag/_sfx"); return d && d.map && Object.keys(d.map).length === 0 ? d : null; }, 5000));
    check("المشاهد يرجع للحالي", !!await until(() => fan.evaluate(() => sfxChosen("h2") === "d"), 6000));
    for (const [n, pg] of [["host", host], ["fan", fan]]) { const errs = pg.__logs.filter(l => /PAGEERROR/.test(l)); check(n + ": no page errors", !errs.length, errs.slice(0, 3)); }
} catch (e) { ok = false; console.log(e.stack || e); }
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
