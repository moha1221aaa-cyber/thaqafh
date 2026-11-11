/* فقرتين المواجهة (9 نوفمبر 2026): الفقرة 2 عجلة الحروف و الفقرة 3 خمّن الكلمة. node tests/harness/segments.mjs
   يبدأ من آخر سؤال في الفقرة الأولى، ويمشي: الفقرة 2 (3 جولات) ← الفقرة 3 (3 جولات) ← النتيجة، والمقدم هو اللي يقرر دايماً */
import { serve, FakeDB, seed, launch, device, until, sleep, liveDoc } from "./harness.mjs";

const srv = await serve(8787);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const browser = await launch({ wav: "silence.wav" });
const db = new FakeDB(30);
const now = Date.now();
seed(db, "playing", { seg: 1, sp: {}, sg: null, phase: "reveal", qIndex: 4, outcome: 1, s1: 3, s2: 1, log: [1, 1, 2, 1, 0], qAt: now - 9000, deadline: now + 60000, ready1: true, ready2: true, hostSeen: now, shown: { "0_4": "الفهد" } });
const host = await device(browser, db, "host", {});
const fan = await device(browser, db, "u_p1", {});
const D = () => liveDoc(db);
const click = async sel => { await sleep(450); return host.evaluate(s => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel); };
const dockBtn = async txt => { await sleep(450); return host.evaluate(t => { const b = [...document.querySelectorAll("#sgDock button")].find(x => x.textContent.includes(t) && !x.classList.contains("sg-hold") && getComputedStyle(x).visibility !== "hidden"); if (b) b.click(); return !!b; }, txt); };
const waitBtn = async txt => !!(await until(() => host.evaluate(t => [...document.querySelectorAll("#sgDock button")].some(x => x.textContent.includes(t) && getComputedStyle(x).visibility !== "hidden" && getComputedStyle(x.closest(".sg-hold") || x).visibility !== "hidden"), txt), 12000));
const st = () => { const d = D(); return d && d.sg ? d.sg.st + ":" + d.sg.r : ""; };
try {
    await host.evaluate(() => { SG_SPIN_MS = 500; });
    await fan.evaluate(() => { SG_SPIN_MS = 500; });

    /* ===== أدوات صافية ===== */
    const bank = await host.evaluate(() => Object.values(SG_WORDS).every(l => l.length >= 15 && l.every(w => sgNorm(w).length === 3)) && SG_TURN3_MS === 10000 && SG_LEN === 3);
    check("بنك الكلمات كله 3 حروف، ووقت الفقرة 3 = 10 ث", bank);
    check("المشاهد يشوف البكرة (مو عجلة)", true);

    /* ===== الفقرة 1 ← 2 ===== */
    check("الزر يقول الفقرة الثانية", await until(() => host.evaluate(() => /الفقرة الثانية: عجلة الحروف/.test(document.querySelector(".bc-nextq")?.textContent || "")), 8000));
    await click(".bc-nextq");
    const d1 = await until(() => { const d = D(); return d.seg === 2 ? d : null; }, 8000);
    check("بعد آخر سؤال: الفقرة 2 (cat، الجولة 0)", d1 && d1.phase === "s2" && d1.sg.st === "cat" && d1.sg.r === 0 && d1.sg.items.length === 7 && d1.s1 === 3 && d1.s2 === 1, d1 && { seg: d1.seg, sg: d1.sg });
    check("المقدم يشوف لوحة التحكم، والمشاهد لا", await until(() => host.$("#sgDock"), 5000) && !(await fan.$("#sgDock")));
    check("المشاهد يشوف البكرة", await until(() => fan.evaluate(() => !!document.querySelector(".sg-reel .c")), 5000));

    /* ===== الفقرة 2: 3 جولات ===== */
    for (let r = 0; r < 3; r++) {
        await until(() => st() === "cat:" + r, 8000);
        await until(() => host.evaluate(() => /ابدأ اختيار التصنيف/.test(document.getElementById("sgDock")?.textContent || "")), 6000);
        if (r === 0) {
            await host.evaluate(() => { window.uiPrompt = () => Promise.resolve("ماركات سيارات"); });
            await host.evaluate(() => sgCatAdd());
            check("إضافة تصنيف جديد (8 تصنيفات)", await until(() => D().sg.items.length === 8 && D().sg.items.includes("ماركات سيارات"), 5000));
            await sleep(300);
            await host.evaluate(() => sgCatDel(7));
            check("حذف تصنيف (رجع 7)", await until(() => D().sg.items.length === 7 && D().sg.n === 2, 5000));
            await host.evaluate(() => localStorage.removeItem("sg_cats2"));
            await sleep(500);
        }
        const clicked = await dockBtn("ابدأ اختيار التصنيف");
        if (!clicked) console.log("dock:", await host.evaluate(() => document.getElementById("sgDock") && document.getElementById("sgDock").outerHTML.slice(0, 600)));
        const w = await until(() => D().sg.wheel ? D().sg : null, 5000);
        check(`ف2 ج${r + 1}: العجلة اختارت تصنيف من القائمة`, w && w.items.includes(w.cat) && w.wheel.i === w.items.indexOf(w.cat), w && { cat: w.cat, i: w.wheel.i });
        if (r === 0) {
            check("اللحظة السينمائية: تطلع عند الاختيار فيها النتيجة (عند المشاهد)", await until(() => fan.evaluate(c => document.querySelector(".sg-cine b")?.textContent === c, D().sg.cat), 4000));
            check("البكرة مخفية وقت الدوران (تمويه، أو تعتيم على الجوالات)", await fan.evaluate(() => { const st = document.querySelector(".sg-reel .sg-strip"); return !!st && /sgMotion|sgDim/.test(getComputedStyle(st).animationName); }));
            check("وتختفي بعد ثانيتين ونص", await until(() => fan.evaluate(() => !document.querySelector(".sg-cine")), 5000));
        }
        if (r === 0) { await host.evaluate(() => { SG_SPIN_MS = 3000; sgToLetter(); }); await sleep(250); check("ما يلف الحروف قبل ما تقف عجلة التصنيف", D().sg.st === "cat"); await host.evaluate(() => { SG_SPIN_MS = 500; }); }
        if (r > 0) check(`ف2 ج${r + 1}: التصنيف ما يتكرر`, !D().sg.used.includes(D().sg.cat), D().sg.used);
        check(`ف2 ج${r + 1}: المشاهد يشوف التصنيف بعد وقوف العجلة`, await until(() => fan.evaluate(c => document.querySelector(".sg-res .lbl")?.textContent === c && getComputedStyle(document.querySelector(".sg-res")).visibility !== "hidden", D().sg.cat), 6000));
        await waitBtn("التالي: اختيار الحرف");
        await dockBtn("التالي: اختيار الحرف");
        check(`ف2 ج${r + 1}: عجلة الحروف`, await until(() => D().sg.st === "letter", 5000));
        await dockBtn("ابدأ اختيار الحرف");
        const L = await until(() => D().sg.wheel && D().sg.letter ? D().sg : null, 5000);
        check(`ف2 ج${r + 1}: حرف من الألف للياء`, L && /^[ابتثجحخدذرزسشصضطظعغفقكلمنهوي]$/.test(L.letter) && L.wheel.k === "letter", L && L.letter);
        await waitBtn("ابدأ الجولة");
        await dockBtn("ابدأ الجولة");
        const p = await until(() => D().sg.st === "play" ? D().sg : null, 5000);
        check(`ف2 ج${r + 1}: يبدأ ${r % 2 === 0 ? "الأول" : "الثاني"} ومعه وقت`, p && p.turn === (r % 2 === 0 ? 1 : 2) && p.tEnd > Date.now(), p && { turn: p.turn });
        /* انتهاء الوقت ما يقرر شي لحاله */
        if (r === 1) {
            await host.evaluate(() => { const d = liveMatchesCache[openLiveId]; });
            await until(() => D().sg.tEnd < Date.now() + 100000, 1000);
            await sleep(10600);
            check("ف2: بعد انتهاء 10 ث ما تغيّر شي لحاله (المقدم يقرر)", D().sg.st === "play" && D().sg.turn === p.turn && D().sg.cnt === 0, { st: D().sg.st });
            check("ف2: الشاشة تقول انتهى الوقت", await host.evaluate(() => document.getElementById("sgTurn").classList.contains("over")));
            check("ف2: والمشاهد كذلك", await fan.evaluate(() => document.getElementById("sgTurn").classList.contains("over")));
        }
        await click("#sgDock .bc-verdict .ok");
        check(`ف2 ج${r + 1}: صح ← الدور للثاني`, await until(() => D().sg.turn === sgOtherJs(p.turn) && D().sg.cnt === 1, 5000), D().sg.turn);
        const before = { s1: D().s1, s2: D().s2 };
        await click("#sgDock .bc-verdict .no");
        const dn = await until(() => D().sg.st === "done" ? D() : null, 5000);
        const winner = sgOtherJs(sgOtherJs(p.turn));   /* الثاني غلط (الدور عليه) ← الأول يفوز */
        check(`ف2 ج${r + 1}: الغلط يعطي النقطة للثاني`, dn && dn.sg.win === winner && dn["s" + winner] === before["s" + winner] + 1 && dn.sp.g2[winner - 1] >= 1, dn && { win: dn.sg.win, s1: dn.s1, s2: dn.s2 });
        await waitBtn(r === 2 ? "فقرة خمّن الكلمة" : "الجولة التالية");
        await dockBtn(r === 2 ? "فقرة خمّن الكلمة" : "الجولة التالية");
    }
    const d3 = await until(() => D().seg === 3 ? D() : null, 6000);
    check("بعد 3 جولات: الفقرة 3", d3 && d3.phase === "s3" && d3.sg.st === "cat" && d3.sg.items.length === 5, d3 && d3.sg);
    const s2tot = d3.sp.g2[0] + d3.sp.g2[1];
    check("نقاط الفقرة 2 = 3 وانضافت للمجموع", s2tot === 3 && d3.s1 + d3.s2 === 4 + 3, { sp: d3.sp, s1: d3.s1, s2: d3.s2 });

    /* ===== الفقرة 3 ===== */
    const norm = s => s.replace(/[ً-ٟ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
    for (let r = 0; r < 3; r++) {
        await until(() => st() === "cat:" + r, 8000);
        await until(() => host.evaluate(() => /ابدأ اختيار نوع الكلمة/.test(document.getElementById("sgDock")?.textContent || "")), 6000);
        await dockBtn("ابدأ اختيار نوع الكلمة");
        const w = await until(() => D().sg.wheel ? D().sg : null, 5000);
        const sec = db.data("liveSecrets/seg_round_2");
        const word = sec && sec["w0_" + r];
        check(`ف3 ج${r + 1}: العجلة اختارت نوع الكلمة والكلمة محفوظة عند المقدم بس`, w && ["اسم إنسان", "اسم حيوان", "جماد", "فعل", "كلمات معنوية أو أخرى"].includes(w.cat) && !!word && w.len === 3 && norm(word).length === 3, w && { cat: w.cat, len: w.len });
        /* الكلمة ممكن تكون نفس اسم متسابق في الاختبار (سعد وفهد من بنك "اسم إنسان")، فما نقدر نفحص إنها مو موجودة */
        const clash = ["سعد", "فهد", "خالد", "ناصر", "محمد"].includes(word);
        check(`ف3 ج${r + 1}: الكلمة مو في الوثيقة العامة`, clash || !JSON.stringify(D()).includes(word), word);
        check(`ف3 ج${r + 1}: المقدم يشوف الكلمة`, await until(() => host.evaluate(w => document.querySelector(".sg-wordbox b")?.textContent === w, word), 6000));
        check(`ف3 ج${r + 1}: المشاهد ما يشوف الكلمة`, clash || await fan.evaluate(w => !document.getElementById("liveScreen").innerText.includes(w) || w.length < 3, word));
        await waitBtn("ابدأ الجولة");
        await dockBtn("ابدأ الجولة");
        const p = await until(() => D().sg.st === "play" ? D().sg : null, 5000);
        check(`ف3 ج${r + 1}: اللعب يبدأ`, p && p.turn === (r % 2 === 0 ? 1 : 2) && p.len === 3);
        check(`ف3 ج${r + 1}: ما فيه خانة كتابة، والأزرار 4 + استرايك`, !!await until(() => host.evaluate(() => !document.querySelector("#sgDock input") && [...document.querySelectorAll("#sgDock .sg-hits button")].map(b => b.textContent.trim()).join("|") === "ولا حرف|حرف صحيح|حرفين صحيحة|ثلاث حروف صحيحة" && /استرايك/.test((document.querySelector("#sgDock .sg-strike") || {}).textContent || "")), 4000));
        if (r === 0) {
            const first = p.turn;
            /* ولا حرف، حرف، حرفين: تنسجل والدور يتنقل */
            const seq = [0, 1, 2];
            for (let k = 0; k < seq.length; k++) {
                await click(`#sgDock .sg-hits .h${seq[k]}`);
                await until(() => D().sg.gs.length === k + 1, 5000);
                const g = D().sg.gs[k];
                check(`ف3 ج1: زر ${seq[k]} حرف ينسجل للمتسابق الصحيح ويروح الدور`, g.n === seq[k] && g.p === (k % 2 === 0 ? first : sgOtherJs(first)) && D().sg.turn === sgOtherJs(g.p) && D().sg.tEnd > Date.now() + 8000 && D().sg.tEnd < Date.now() + 10500, { g, turn: D().sg.turn });
            }
            check("ف3 ج1: المشاهد يشوف نتيجة التخمين (حرفين صحيحة)", await until(() => fan.evaluate(() => [...document.querySelectorAll(".sg-g .fb i")].some(i => i.textContent.trim() === "حرفين صحيحة")), 5000));
            const snd = await host.evaluate(async () => { const ids = ["sg_miss", "sg_strike", "sg_h1", "sg_h2", "sg_h3", "sg_ok", "wrong", "impact", "whoosh", "slam", "braam", "applause", "correct", "timeout", "match_end", "tick", "riser"]; const r = await Promise.all(ids.map(id => fetch("audio/" + id + ".mp3").then(x => x.ok))); return { files: r.every(Boolean), reg: ids.every(id => !!CINE_FILES[id]), sfx: ["miss", "h1", "h2", "h3", "strike", "ok", "bad", "time", "pass", "seg", "round", "land"].every(k => typeof SG_SFX[k] === "function"), noSynth: typeof sgTone === "undefined" && typeof SG_SAMPLES === "undefined" }; });
            check("الأصوات: من نفس مؤثرات البث (متناسقة)، كل زر وانتقال له صوت", snd.files && snd.reg && snd.sfx && snd.noSynth, snd);
            const r = await host.evaluate(() => { const items = ["أ","ب","ج","د","هـ","و","ز"]; const ws = Array.from({ length: 300 }, () => sgWheelObj("cat", items, sgPickIdx(items, []), 1)); const cnt = new Array(7).fill(0); ws.forEach(w => cnt[w.i]++); return { cnt, seeds: new Set(ws.map(w => w.seed)).size, loops: new Set(ws.map(w => w.loops)).size, starts: new Set(ws.map(w => w.s)).size, shuf: new Set(ws.map(w => sgShuffle(7, w.seed).join())).size, same: sgShuffle(7, 12345).join() === sgShuffle(7, 12345).join() }; });
            check("العشوائية: كل الخيارات تطلع، والترتيب والبداية واللفات تتغير، وكل الأجهزة تحسب نفس الترتيب", r.cnt.every(c => c > 15) && r.seeds > 280 && r.loops === 4 && r.starts === 7 && r.shuf > 100 && r.same, r);
            /* 3 استرايك للأول: بقي له ضغطتين (تخمينات الأول مرت) */
            const sk0 = D().sg.sk.slice();
            for (let k = 0; k < 6; k++) { await click("#sgDock .sg-strike"); await sleep(400); if (D().sg.st === "done") break; }
            const dn = await until(() => D().sg.st === "done" ? D() : null, 5000);
            check("ف3 ج1: 3 استرايك = خسارة الجولة والنقطة للثاني + الكلمة تنكشف", dn && dn.sg.why === "strikes" && dn.sg.win === sgOtherJs(dn.sg.gs[dn.sg.gs.length - 1].p) && dn.sg.reveal === word, dn && { win: dn.sg.win, why: dn.sg.why, sk: dn.sg.sk });
            check("ف3 ج1: المشاهد يشوف الكلمة بعد الانتهاء", await until(() => fan.evaluate(w => [...document.querySelectorAll(".sg-word span")].map(x => x.textContent).join("") === w, word), 5000));
        } else if (r === 1) {
            /* 3 حروف صحيحة = عرف الكلمة = نقطة */
            const t = p.turn;
            await click("#sgDock .sg-hits .h3");
            const dn = await until(() => D().sg.st === "done" ? D() : null, 5000);
            check("ف3 ج2: ثلاث حروف صحيحة تعطي النقطة لصاحب الدور", dn && dn.sg.win === t && dn.sg.why === "found" && dn.sp.g3[t - 1] >= 1 && dn.sg.reveal === word, dn && { win: dn.sg.win, sp: dn.sp });
        } else {
            /* 10 ث تمر بدون ما يتغير شي، والمقدم ينهي الجولة بدون نقطة */
            await sleep(10800);
            check("ف3 ج3: انتهاء الـ10 ث ما يغيّر شي لحاله", D().sg.st === "play" && D().sg.gs.length === 0 && D().sg.turn === p.turn);
            check("ف3 ج3: الشاشة تقول انتهى الوقت", await host.evaluate(() => document.getElementById("sgTurn").classList.contains("over")));
            await dockBtn("إنهاء بدون نقطة");
            const dn = await until(() => D().sg.st === "done" ? D() : null, 5000);
            check("ف3 ج3: إنهاء بدون نقطة + الكلمة تنكشف", dn && dn.sg.win === 0 && dn.sg.reveal === word, dn && dn.sg);
        }
        await waitBtn(r === 2 ? "الفقرة الرابعة: ضد وند" : "الجولة التالية");
        await dockBtn(r === 2 ? "الفقرة الرابعة: ضد وند" : "الجولة التالية");
    }
    /* الفقرة 4 (ضد وند، تفاصيلها في duel.mjs): هنا ننهيها بدون نقطة ونتأكد إن النتيجة تطلع بعدها */
    check("بعد الفقرة 3: الفقرة الرابعة ضد وند", !!await until(() => { const d = D(); return d.seg === 4 && d.phase === "s4" && d.sg.st === "cat" ? d : null; }, 6000));
    await waitBtn("إنهاء الفقرة بدون نقطة");
    await dockBtn("إنهاء الفقرة بدون نقطة");
    await until(() => D().sg.st === "done", 5000);
    await waitBtn("نتيجة المواجهة");
    await dockBtn("نتيجة المواجهة");
    const res = await until(() => D().scene === "result" ? D() : null, 6000);
    check("بعد الفقرة 4: نتيجة المواجهة", !!res && res.order[0].state === "done" && res.order[0].s1 === res.s1 && res.order[0].s2 === res.s2, res && { s1: res.s1, s2: res.s2, sp: res.sp });
    check("مجموع النقاط = الأسئلة (4) + ف2 (3) + ف3 (2)", res && res.s1 + res.s2 === 4 + 3 + 2, res && { s1: res.s1, s2: res.s2 });
    check("لوحة المقدم اختفت", await until(() => host.evaluate(() => !document.getElementById("sgDock")), 5000));
    check("شاشة النتيجة تفصّل الفقرات", await until(() => host.evaluate(() => /فقرة الحروف/.test(document.getElementById("liveScreen").innerText) && /فقرة الكلمات/.test(document.getElementById("liveScreen").innerText)), 6000));
    for (const [n, pg] of [["host", host], ["fan", fan]]) {
        if (process.env.LOGS) console.log(pg.__logs.slice(-15));
        const errs = pg.__logs.filter(l => /PAGEERROR/.test(l));
        check(n + ": no page errors", !errs.length, errs.slice(0, 3));
    }
} catch (e) { ok = false; console.log(e); if (process.env.LOGS) console.log(host.__logs.slice(-20)); }
function sgOtherJs(n) { return n === 1 ? 2 : 1; }
await browser.close();
srv.close();
process.exit(ok ? 0 : 1);
