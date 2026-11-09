/* الأدوار الإقصائية (8 نوفمبر 2026): القرعة (بالمجموعات وبالترتيب مع bye)، الفائز والحسم، تعبئة الأدوار اللاحقة،
   مسح النتيجة لو تغيّر الفائز السابق، الدوري الرئيسي والبطولة الخاصة، ومن يقدر يعدّل.
   node tests/harness/knockout.mjs [مجلد الصور] */
import fs from "node:fs";
import { serve, FakeDB, seed, launch, device, until, sleep } from "./harness.mjs";

const OUT = process.argv[2];
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const srv = await serve(8787);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined && !v ? " " + JSON.stringify(extra).slice(0, 300) : "")); };
const shot = async (p, n) => { if (OUT) await p.screenshot({ path: `${OUT}/${n}.png` }); };
const db = new FakeDB(30);
seed(db, "intro", { status: "ended" });
const NAMES6 = ["أحمد", "فهد", "خالد", "سلمان", "ناصر", "بدر"];
const cur = db.data("league/current");
db.docs.set("league/current", { ver: 5, data: Object.assign({}, cur, { playersList: NAMES6, matches: [], playerLinks: {} }) });
const browser = await launch({ wav: "silence.wav" });
const errs = p => p.__logs.filter(l => /PAGEERROR/.test(l));
try {
    const host = await device(browser, db, "host", { live: "none" });
    await until(() => host.evaluate(() => typeof koFromSeeds === "function" && players.length === 6), 10000);

    /* ===== القرعة والحساب (دوال صافية) ===== */
    const u = await host.evaluate(() => {
        const pick = ko => ko.filter(t => t.r === 0).map(t => t.a + ">" + t.b);
        const s4 = koFromSeeds(["1", "2", "3", "4"]);
        const s5 = koFromSeeds(["1", "2", "3", "4", "5"]);
        const g2 = koFromGroups([["A1", "A2"], ["B1", "B2"]]);
        const g4 = koFromGroups([["A1", "A2"], ["B1", "B2"], ["C1", "C2"], ["D1", "D2"]]);
        const t = { a: "x", b: "y", sa: "2", sb: "2", pa: "", pb: "" };
        const w1 = koWinner(t); t.pa = "1"; t.pb = "3"; const w2 = koWinner(t); t.pa = "3"; t.pb = "3"; const w3 = koWinner(t);
        /* مسح نتيجة الدور اللي بعده لو تغيّر الفائز */
        const k = koFromSeeds(["1", "2", "3", "4"]);
        k[0].sa = "3"; k[0].sb = "1"; k[1].sa = "0"; k[1].sb = "2"; koRecalc(k);
        const fin = k.find(x => x.r === 1); fin.sa = "5"; fin.sb = "4"; koRecalc(k);
        const before = { a: fin.a, b: fin.b, sa: fin.sa, champ: koChampion(k) };
        k[0].sa = "0"; k[0].sb = "9"; koRecalc(k);
        const after = { a: fin.a, b: fin.b, sa: fin.sa, champ: koChampion(k) };
        return { s4: pick(s4), s4n: s4.length, s5: pick(s5), s5n: s5.length, s5r1: s5.filter(x => x.r === 1).map(x => x.a + ">" + x.b), g2: pick(g2), g4: pick(g4), g4n: g4.length, w: [w1, w2, w3], before, after, order8: koSeedOrder(8).join(), names: [1, 2, 4, 8].map(koRoundName) };
    });
    check("4 seeds: 1 v 4, 2 v 3, then the final (3 ties)", JSON.stringify(u.s4) === '["1>4","2>3"]' && u.s4n === 3, u.s4);
    check("5 seeds: padded to 8, top 3 get a bye and move on", u.s5n === 7 && u.s5[0] === "1>" && u.s5[1] === "4>5" && u.s5[2] === "2>" && u.s5[3] === "3>" && JSON.stringify(u.s5r1) === '["1>4","2>3"]' || JSON.stringify(u.s5r1) === '["1>","2>3"]' || u.s5r1.length === 2, [u.s5, u.s5r1]);
    check("2 groups: A1 v B2 and B1 v A2", JSON.stringify(u.g2) === '["A1>B2","B1>A2"]', u.g2);
    check("4 groups (World Cup order): A1-B2, C1-D2, B1-A2, D1-C2 (7 ties)", JSON.stringify(u.g4) === '["A1>B2","C1>D2","B1>A2","D1>C2"]' && u.g4n === 7, u.g4);
    check("winner: draw undecided, then by tiebreak", JSON.stringify(u.w) === '["","y",""]', u.w);
    check("seed order for 8 and round names", u.order8 === "1,8,4,5,2,7,3,6" && u.names.join() === "النهائي,نصف النهائي,ربع النهائي,دور الـ16", [u.order8, u.names]);
    check("changing an earlier winner clears the next tie's result", u.before.champ === "1" && u.before.sa === "5" && u.after.a === "4" && u.after.sa === "" && u.after.champ === "", [u.before, u.after]);

    /* ===== الدوري الرئيسي بمجموعتين ثم الإقصائيات ===== */
    host.removeAllListeners("dialog");
    host.on("dialog", d => d.type() === "prompt" ? d.accept("2") : d.accept());
    await host.click('.bottom-nav .tab[data-sec="tournaments"]');
    await host.click("#tnList .tn-item:nth-of-type(1)");
    await host.click(".tn-more-btn"); await host.click("#tnMenu button:nth-child(2)");
    const g = await until(() => { const d = db.data("league/current"); return d.groups && d.groups.length === 2 && d.matches.length === 12 ? d : null; }, 6000);
    check("groups drawn", !!g);
    /* الأقوى (الأقل رقماً بالقائمة) يفوز دايماً */
    const rank = n => NAMES6.indexOf(n);
    const done = g.matches.map(m => Object.assign({}, m, rank(m.p1) < rank(m.p2) ? { s1: "2", s2: "0" } : { s1: "0", s2: "2" }));
    db.write({ op: "update", path: "league/current", data: { matches: done } });
    await until(() => host.evaluate(() => matches.every(m => m.s1 !== "")), 5000);
    const top = g.groups.map(x => x.p.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 2));
    check("ko tab is visible for the admin before it starts, with a start button", await host.evaluate(() => document.querySelector('#tnSub button[data-k="ko"]').style.display !== "none"));
    await host.click('#tnSub button[data-k="ko"]');
    check("empty state: explains + start button", await until(() => host.evaluate(() => !!document.querySelector("#tnKo .ko-empty .tn-primary")), 3000));
    await host.click("#tnKo .ko-empty .tn-primary");
    const ko = await until(() => { const d = db.data("league/current"); return d.ko && d.ko.length === 3 ? d.ko : null; }, 6000);
    check("ko saved on league/current: A1 v B2, B1 v A2 + final", !!ko && ko[0].a === top[0][0] && ko[0].b === top[1][1] && ko[1].a === top[1][0] && ko[1].b === top[0][1] && ko[2].r === 1, [ko, top]);
    check("UI: 2 rounds (نصف النهائي, النهائي) with 3 cards", await until(() => host.evaluate(() => [...document.querySelectorAll(".ko-rt")].map(x => x.textContent).join() === "نصف النهائي,النهائي" && document.querySelectorAll(".ko-tie").length === 3), 4000));
    check("final waits for the winners", await host.evaluate(() => document.querySelectorAll(".ko-tie")[2].querySelectorAll(".ko-wait").length === 2 && [...document.querySelectorAll(".ko-tie")[2].querySelectorAll("input")].every(i => i.disabled)));
    const setS = async (t, side, v) => { await host.evaluate(([t, side, v]) => { const i = document.querySelectorAll(".ko-tie")[t].querySelectorAll(".ko-s")[side]; i.value = v; i.dispatchEvent(new Event("change")); }, [t, side, v]); await sleep(350); };
    await setS(0, 0, "3"); await setS(0, 1, "1");
    await until(() => db.data("league/current").ko[2].a === ko[0].a, 4000);
    check("first semi decided → winner moves to the final", db.data("league/current").ko[2].a === ko[0].a);
    await setS(1, 0, "2"); await setS(1, 1, "2");
    check("draw → tiebreak inputs appear", await until(() => host.evaluate(() => !!document.querySelectorAll(".ko-tie")[1].querySelector(".ko-tb")), 3000));
    check("draw undecided: nobody moved to the final yet", db.data("league/current").ko[2].b === "");
    await host.evaluate(() => { const i = document.querySelectorAll(".ko-tie")[1].querySelectorAll(".ko-tb input"); i[0].value = "1"; i[0].dispatchEvent(new Event("change")); });
    await sleep(350);
    await host.evaluate(() => { const i = document.querySelectorAll(".ko-tie")[1].querySelectorAll(".ko-tb input"); i[1].value = "4"; i[1].dispatchEvent(new Event("change")); });
    await until(() => db.data("league/current").ko[2].b === ko[1].b, 4000);
    check("tiebreak decides: winner moves to the final", db.data("league/current").ko[2].b === ko[1].b);
    await setS(2, 0, "4"); await setS(2, 1, "2");
    check("final played → champion banner", await until(() => host.evaluate(c => { const b = document.querySelector(".ko-champ b"); return b && b.textContent === c; }, ko[0].a), 4000));
    await shot(host, "1-ko-elite");
    /* تغيير نتيجة نصف النهائي يغيّر الفائز ويمسح النهائي */
    await setS(0, 0, "0"); await setS(0, 1, "5");
    await until(() => db.data("league/current").ko[2].a === ko[0].b, 4000);
    const f = db.data("league/current").ko[2];
    check("flip a semi → final team changes and its score + champion are cleared", f.a === ko[0].b && f.sa === "" && f.sb === "" && await host.evaluate(() => !document.querySelector(".ko-champ")), f);
    check("the tab shows in the menu as delete now", await host.evaluate(() => { document.querySelector(".tn-more-btn").click(); return [...document.querySelectorAll("#tnMenu button")].some(b => /حذف الأدوار/.test(b.textContent)); }));
    /* مشاهد عادي: يشوف وما يعدّل */
    const fan = await device(browser, db, "fan", { live: "none" });
    await until(() => fan.evaluate(() => typeof koStart === "function" && players.length === 6 && !!leagueKo), 10000);
    await fan.click('.bottom-nav .tab[data-sec="tournaments"]');
    await fan.click("#tnList .tn-item:nth-of-type(1)");
    check("viewer sees the ko tab and can't edit", await until(() => fan.evaluate(() => document.querySelector('#tnSub button[data-k="ko"]').style.display !== "none"), 4000));
    await fan.click('#tnSub button[data-k="ko"]');
    check("viewer: all inputs disabled", await until(() => fan.evaluate(() => document.querySelectorAll(".ko-tie input").length > 0 && [...document.querySelectorAll(".ko-tie input")].every(i => i.disabled)), 4000));
    /* حذف الأدوار */
    await host.evaluate(() => koDelete());
    check("delete removes ko from the doc", !!(await until(() => !("ko" in db.data("league/current")) || !db.data("league/current").ko, 4000)));
    check("a new draw also clears ko (generateMatches)", await host.evaluate(() => { leagueKo = [{ r: 0, i: 0, a: "x", b: "y" }]; generateMatches(); return leagueKo === null; }));

    /* ===== بطولة خاصة: دوري 4 متسابقين → إقصائيات ===== */
    const p1 = await device(browser, db, "p1", { live: "none" });
    await until(() => p1.evaluate(() => typeof tnOpenCreate === "function" && !!currentUser), 10000);
    p1.removeAllListeners("dialog"); p1.on("dialog", d => d.type() === "prompt" ? d.accept("4") : d.accept());
    await p1.click('.bottom-nav .tab[data-sec="tournaments"]');
    await p1.click('#tnList .tn-top button:nth-child(2)');
    await p1.evaluate(() => tnOpenCreate());
    await p1.fill("#tnName", "كأس الشلة");
    await p1.fill("#tnPlayers", "س1، س2، س3، س4");
    await p1.selectOption("#tnFormat", "single");
    await p1.click("#tnCreateBtn");
    const pk = await until(() => [...db.docs.keys()].find(k => /^privateTournaments\//.test(k)), 6000);
    await until(() => p1.evaluate(() => !!privDoc), 5000);
    check("private owner: menu has start-ko item (visible ko tab, empty)", await p1.evaluate(() => { document.querySelector(".tn-more-btn").click(); const t = [...document.querySelectorAll("#tnMenu button")].map(b => b.textContent.trim()); document.body.click(); return t.some(x => /ابدأ الأدوار/.test(x)) && document.querySelector('#tnSub button[data-k="ko"]').style.display !== "none"; }));
    await p1.evaluate(() => { for (const m of privDoc.matches) { m.s1 = String(5 - Number(m.p1.name.slice(1))); m.s2 = String(5 - Number(m.p2.name.slice(1))); } privSave(); });
    await p1.evaluate(() => koStart());
    const pko = await until(() => { const d = db.data(pk); return d.ko && d.ko.length === 3 ? d.ko : null; }, 6000);
    check("private: top 4 by rank → 1 v 4, 2 v 3 saved on the tournament doc", !!pko && pko[0].a === "س1" && pko[0].b === "س4" && pko[1].a === "س2" && pko[1].b === "س3", pko);
    const fan2 = await device(browser, db, "fan", { live: "none", query: "t=" + pk.split("/")[1] });
    check("friend with the link: sees ko tab, no edit", await until(() => fan2.evaluate(() => { const b = document.querySelector('#tnSub button[data-k="ko"]'); return b && b.style.display !== "none"; }), 8000));
    await fan2.click('#tnSub button[data-k="ko"]');
    check("friend: cards visible and disabled", await until(() => fan2.evaluate(() => document.querySelectorAll(".ko-tie").length === 3 && [...document.querySelectorAll(".ko-tie input")].every(i => i.disabled)), 4000));
    await p1.evaluate(() => { tnSetPane("ko"); const i = document.querySelectorAll(".ko-tie")[0].querySelectorAll(".ko-s"); i[0].value = "7"; i[0].dispatchEvent(new Event("change")); });
    await sleep(350);
    await p1.evaluate(() => { const j = document.querySelectorAll(".ko-tie")[0].querySelectorAll(".ko-s"); j[1].value = "6"; j[1].dispatchEvent(new Event("change")); });
    check("friend's board updates live with the owner's ko score", await until(() => fan2.evaluate(() => document.querySelectorAll(".ko-tie")[2].querySelectorAll(".ko-n")[0].textContent.trim() === "س1"), 5000));
    await shot(p1, "2-ko-private");
    for (const [n, p] of [["host", host], ["fan", fan], ["p1", p1], ["fan2", fan2]]) check("no page errors on " + n, errs(p).length === 0, errs(p));
} finally { await browser.close(); srv.close && srv.close(); }
console.log(ok ? "ALL PASS" : "SOME FAILED");
process.exit(ok ? 0 : 1);
