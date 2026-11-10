/* عدد الحضور وتفاعلات الجمهور وتسجيل البث ومشاهدته (10 نوفمبر 2026). node tests/harness/social.mjs */
import { serve, FakeDB, seed, launch, device, until, sleep, liveDoc } from "./harness.mjs";

const srv = await serve(Number(process.env.HARNESS_PORT) || 8795);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const browser = await launch({ wav: "silence.wav" });
const db = new FakeDB(30);
const now = Date.now();
seed(db, "talk", { sceneAt: now - 3000, ready1: true, ready2: true, hostSeen: now });
const host = await device(browser, db, "host", {});
const p1 = await device(browser, db, "p1", {});
const fan = await device(browser, db, "fan", {});
const base = new URL(host.url()).origin;
/* Cloudinary: الرفع يرجّع رابط ملف صوت محلي */
let uploads = 0;
await host.route(/api\.cloudinary\.com/, r => { uploads++; r.fulfill({ contentType: "application/json", body: JSON.stringify({ secure_url: base + "/audio/du_bed.mp3" }) }); });
try {
    /* ===== عدد الحضور ===== */
    check("عدد الحضور ظاهر للمنظم وللمشاهد", await until(() => host.$("#liveScreen .lv-eye #bcListeners"), 8000) && await until(() => fan.$("#liveScreen .lv-eye #bcListeners"), 8000));

    /* ===== التفاعلات ===== */
    await p1.evaluate(() => { window.__fl = []; new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(n => { if (n.classList && n.classList.contains("st-float")) window.__fl.push(n.textContent); }))).observe(document.getElementById("liveScreen"), { childList: true }); });
    check("زر التفاعل ظاهر للمشاهد", !!await until(() => fan.$("#rxBar .rx-tog"), 6000));
    await fan.click("#rxBar .rx-tog");
    check("ينفتح صف 6 إيموجيات", await until(() => fan.evaluate(() => document.querySelectorAll("#rxBar .rx-row button").length === 6), 3000));
    await fan.evaluate(() => { bcReact(0); bcReact(0); bcReact(1); });
    check("الإيموجي يطير عند اللي ضغطه على طول", await fan.evaluate(() => document.querySelectorAll("#liveScreen .st-float").length >= 3));
    const mine = await until(() => { const x = db.data("room/main/liveRx/round_2/u/u_fan"); return x && x.c && x.c["👏"] === 2 ? x : null; }, 6000);
    check("الضغطات تنجمع وتنكتب مرة وحدة في وثيقة المشاهد", mine && mine.c["🔥"] === 1 && mine.n === 1, mine);
    const agg = await until(() => { const x = db.data("room/main/liveRx/round_2"); return x && x.b && x.b.u_fan ? x : null; }, 8000);
    check("المنظم يكتب ملخص واحد", agg && agg.b.u_fan["👏"] === 2 && agg.b.u_fan["🔥"] === 1, agg);
    check("الباقين يشوفون الإيموجيات تطير", !!await until(() => p1.evaluate(() => window.__fl.filter(e => e === "👏").length >= 2 && window.__fl.includes("🔥")), 6000), await p1.evaluate(() => window.__fl));
    await fan.evaluate(() => { bcReact(5); });
    const agg2 = await until(() => { const x = db.data("room/main/liveRx/round_2"); return x && x.b && x.b.u_fan && x.b.u_fan["🎉"] === 1 ? x : null; }, 9000);
    check("الملخص الثاني فيه الجديد بس", agg2 && !agg2.b.u_fan["👏"], agg2 && agg2.b);

    /* ===== التسجيل ===== */
    check("جهاز المنظم يسجّل البث", !!await until(() => host.evaluate(() => REC.id === "round_2" && REC.mr && REC.mr.state === "recording"), 6000));
    check("المشاهد ما يسجّل", await fan.evaluate(() => !REC.id));
    await host.evaluate(() => liveTx(openLiveId, () => ({ s1: 1 })));
    await sleep(1200);
    await host.evaluate(() => liveTx(openLiveId, () => ({ s2: 2 })));
    await sleep(1500);
    check("الأحداث تنحفظ بالمفاتيح اللي تغيّرت بس", await host.evaluate(() => REC.ev.length >= 3 && Object.keys(REC.ev[0][1]).length > 10 && REC.ev.some(e => e[1].s1 === 1 && Object.keys(e[1]).length < 6) && REC.ev.some(e => e[1]._rx)), await host.evaluate(() => REC.ev.map(e => Object.keys(e[1]).length)));
    await host.evaluate(() => liveTx(openLiveId, () => ({ status: "ended" })));
    const meta = await until(() => { const l = db.data("liveSecrets/_recs"); return l && l.list && l.list.length ? l.list[0] : null; }, 15000);
    check("بعد نهاية البث: التسجيل ارتفع (الصوت والأحداث) وانضاف للقائمة", meta && uploads === 1 && meta.dur > 4000, { meta, uploads });
    const rec = meta && db.data("liveSecrets/rec_" + meta.rid);
    check("بيانات التسجيل في liveSecrets (المنظم بس) والأحداث مضغوطة بأجزاء", rec && rec.parts >= 1 && !!db.data("liveSecrets/rec_" + meta.rid + "_c0") && /du_bed/.test(rec.audio), rec);
    check("ما بقى شي في الجهاز بعد الرفع", await until(() => host.evaluate(async () => (await recLocal("all")).length === 0), 5000));

    /* ===== المشاهدة ===== */
    await host.evaluate(() => closeLiveScreen(true));
    await sleep(500);
    await host.evaluate(() => openRecModal());
    check("قائمة التسجيلات فيها التسجيل وزر شاهد", !!await until(() => host.evaluate(() => /شاهد/.test(document.getElementById("recBody").textContent) && /الجولة/.test(document.getElementById("recBody").textContent)), 6000));
    const live0 = JSON.stringify(db.data("room/main/liveMatches/round_2"));
    await host.evaluate(() => [...document.querySelectorAll("#recBody button")].find(b => /شاهد/.test(b.textContent)).click());
    check("المشاهدة تفتح شاشة البث كمشاهد مع أزرار التشغيل", !!await until(() => host.evaluate(() => openLiveId === "__replay" && !!window.BC_REPLAY && isAdmin === false && !!document.getElementById("recCtl") && document.getElementById("liveScreen").classList.contains("open") && !document.getElementById("recModal").classList.contains("active")), 8000));
    check("أول المشاهدة: نفس بداية البث (الترحيب)", await host.evaluate(() => liveMatchesCache.__replay.scene === "talk" && liveMatchesCache.__replay.status === "live"));
    check("بدون زر إنهاء البث ولا التفاعلات ولا العداد", await host.evaluate(() => !document.querySelector("#liveScreen .bc-endbtn") && !document.getElementById("rxBar") && !document.querySelector("#liveScreen .lv-eye")));
    await host.evaluate(() => recSeek(9999));
    await sleep(600);
    check("التقديم للآخر: نتيجة البث مثل ما صار", await host.evaluate(() => liveMatchesCache.__replay.status === "ended" && liveMatchesCache.__replay.s1 === 1 && liveMatchesCache.__replay.s2 === 2), await host.evaluate(() => ({ st: liveMatchesCache.__replay.status, s1: liveMatchesCache.__replay.s1 })));
    await host.evaluate(() => recSeek(0));
    await sleep(600);
    check("الرجوع لأول: يرجع البث من البداية", await host.evaluate(() => liveMatchesCache.__replay.status === "live" && !liveMatchesCache.__replay.s1));
    check("المشاهدة ما كتبت شي في البث", JSON.stringify(db.data("room/main/liveMatches/round_2")) === live0);
    await host.evaluate(() => closeLiveScreen(true));
    check("بعد الطلوع: كل شي يرجع (المنظم منظم، والتسجيل مقفل)", !!await until(() => host.evaluate(() => !window.BC_REPLAY && isAdmin === true && !liveMatchesCache.__replay && !document.getElementById("recCtl")), 5000));
    for (const [n, pg] of [["host", host], ["p1", p1], ["fan", fan]]) { const errs = pg.__logs.filter(l => /PAGEERROR/.test(l)); check(n + ": no page errors", !errs.length, errs.slice(0, 3)); }
} catch (e) { ok = false; console.log(e.stack || e); }
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
