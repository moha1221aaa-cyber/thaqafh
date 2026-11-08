/* نظام المجموعات (8 نوفمبر 2026، مثل دوري أبطال أوروبا وكأس العالم): القرعة توزع المتسابقين على مجموعات،
   كل مجموعة دوري لحالها، والجدول والمواجهات لكل مجموعة، والأول والثاني يتأهلون.
   node tests/harness/groups.mjs [مجلد الصور] */
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
    await until(() => host.evaluate(() => typeof buildSchedule === "function" && players.length === 6), 10000);

    /* ===== القرعة (دالة صافية) ===== */
    const u = await host.evaluate(() => {
        const names = ["a", "b", "c", "d", "e", "f"];
        const gs = drawGroups(names, 2);
        const ps = names.map(n => ({ name: n, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
        const ms = buildSchedule(ps, true, gs);
        const gOf = {}; gs.forEach((g, i) => g.p.forEach(n => { gOf[n] = i; }));
        const within = ms.every(m => gOf[m.p1.name] === gOf[m.p2.name] && m.g === gOf[m.p1.name]);
        const pairs = new Set(ms.map(m => m.p1.name + ">" + m.p2.name));
        const rounds = [...new Set(ms.map(m => m.round))].sort((a, b) => a - b);
        const busy = ms.every(m => ms.filter(x => x.round === m.round && (x.p1 === m.p1 || x.p2 === m.p1 || x.p1 === m.p2 || x.p2 === m.p2)).length === 1);
        return { sizes: gs.map(g => g.p.length), n: ms.length, within, uniq: pairs.size === ms.length, rounds, busy, three: drawGroups(names, 3).map(g => g.p.length), one: drawGroups(names, 1), valid: groupsValid(gs, names), invalid: groupsValid(gs, ["a", "b"]) };
    });
    check("2 groups of 3", JSON.stringify(u.sizes) === "[3,3]", u.sizes);
    check("12 matches (each group double round robin), never across groups", u.n === 12 && u.within && u.uniq, u);
    check("rounds 1..6, nobody plays twice in a round", JSON.stringify(u.rounds) === "[1,2,3,4,5,6]" && u.busy, u.rounds);
    check("3 groups of 2, and 1 group = plain league (null)", JSON.stringify(u.three) === "[2,2,2]" && u.one === null);
    check("groupsValid accepts the same names, rejects others", u.valid && !u.invalid);

    /* ===== الدوري الرئيسي: المنظم يعيد القرعة بمجموعتين ===== */
    host.removeAllListeners("dialog");
    host.on("dialog", d => d.type() === "prompt" ? d.accept("2") : d.accept());
    await host.click('.bottom-nav .tab[data-sec="tournaments"]');
    await host.click("#tnList .tn-item:nth-of-type(1)");
    await host.click(".tn-more-btn"); await host.click("#tnMenu button:nth-child(2)");
    const c = await until(() => { const d = db.data("league/current"); return d.groups && d.groups.length === 2 ? d : null; }, 6000);
    check("elite: redraw with 2 groups saved (groups + matches tagged g)", !!c && c.matches.length === 12 && c.matches.every(m => m.g === 0 || m.g === 1), c && [c.groups, c.matches.length]);
    check("elite: standings shows 2 group tables with 3 rows each", await until(() => host.evaluate(() => document.querySelectorAll("#standingsBox .tn-gt").length === 2 && [...document.querySelectorAll("#standingsBox .tn-gt")].every(t => t.querySelectorAll("tbody tr").length === 3)), 4000));
    check("elite: group titles + qualify legend", await host.evaluate(() => [...document.querySelectorAll(".tn-gt-t")].map(x => x.textContent).join() === "المجموعة أ,المجموعة ب" && /يتأهل الأول والثاني/.test(document.querySelector(".tn-legend").textContent) && document.querySelectorAll("#standingsBox tr.adv").length === 4));
    await host.click('#tnSub button[data-k="matches"]');
    check("elite: every match card shows its group", await until(() => host.evaluate(() => { const m = document.querySelectorAll("#upcoming .match"); return m.length > 0 && [...m].every(x => /المجموعة (أ|ب)/.test(x.querySelector(".match-grp") ? x.querySelector(".match-grp").textContent : "")); }), 4000));
    /* نتيجة: تأثر مجموعتها بس */
    const g0 = await host.evaluate(() => { const first = matches.find(m => m.g === 0); const i = document.querySelectorAll("#upcoming .match"); return { a: first.p1.name, b: first.p2.name }; });
    await host.evaluate(() => { const card = [...document.querySelectorAll("#upcoming .match")].find(x => /المجموعة أ/.test(x.textContent)); const ins = card.querySelectorAll("input"); ins[0].value = "3"; ins[0].dispatchEvent(new Event("change")); ins[1].value = "1"; ins[1].dispatchEvent(new Event("change")); });
    check("score saved with the group kept on the match", !!(await until(() => { const d = db.data("league/current"); return d.matches.some(m => m.s1 === "3" && m.s2 === "1" && m.g === 0); }, 5000)) && db.data("league/current").groups.length === 2);
    await host.click('#tnSub button[data-k="stand"]');
    check("only that group's table has points", await host.evaluate(() => { const pts = [...document.querySelectorAll("#standingsBox .tn-gt")].map(t => [...t.querySelectorAll(".pts-cell b")].reduce((a, b) => a + Number(b.textContent), 0)); return pts[0] === 3 && pts[1] === 0 || pts[1] === 3 && pts[0] === 0; }));
    await shot(host, "1-elite-groups");
    check("home page still lists the next round (all groups)", await host.evaluate(() => document.querySelectorAll("#homeUpcoming .match").length >= 1));

    /* ===== البطولة الخاصة بمجموعات ===== */
    const p1 = await device(browser, db, "p1", { live: "none" });
    await until(() => p1.evaluate(() => typeof tnOpenCreate === "function" && !!currentUser), 10000);
    const dialogs = []; p1.removeAllListeners("dialog"); p1.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
    await p1.click('.bottom-nav .tab[data-sec="tournaments"]');
    await p1.click('#tnList .tn-top button:nth-child(2)');
    await p1.evaluate(() => tnOpenCreate());
    await p1.fill("#tnName", "بطولة المجموعات");
    await p1.fill("#tnPlayers", "أ1، أ2، أ3، أ4، أ5");
    await p1.selectOption("#tnGroups", "2");
    await p1.click("#tnCreateBtn");
    await sleep(500);
    check("2 groups with 5 players refused (needs 3 per group), nothing created", dialogs.some(d => /مجموعات يحتاج 6/.test(d)) && ![...db.docs.keys()].some(k => /^privateTournaments\//.test(k)), dialogs);
    await p1.fill("#tnPlayers", "أ1، أ2، أ3، أ4، أ5، أ6");
    await p1.click("#tnCreateBtn");
    const pk = await until(() => [...db.docs.keys()].find(k => /^privateTournaments\//.test(k)), 6000);
    const pt = pk && db.data(pk);
    check("private tournament created with 2 groups", !!pt && pt.groups.length === 2 && pt.groups.every(g => g.p.length === 3) && pt.matches.length === 12 && pt.matches.every(m => m.g === 0 || m.g === 1), pt && pt.groups);
    check("private: standings in 2 group tables", await until(() => p1.evaluate(() => document.querySelectorAll("#standingsBox .tn-gt").length === 2), 5000));
    check("private: header says 2 groups, with ⋮ menu and share icon", await p1.evaluate(() => /2 مجموعات/.test(document.querySelector(".tn-ptitle small").textContent) && !!document.querySelector(".tn-more-btn") && !!document.querySelector(".tn-ic-btn")));
    await p1.click(".tn-more-btn");
    check("⋮ menu opens with 4 items (share standings, start knockout, reset, delete)", await p1.evaluate(() => { const m = document.getElementById("tnMenu"); return !m.hidden && m.querySelectorAll("button").length === 4; }));
    await shot(p1, "2-private-menu");
    await p1.evaluate(() => document.body.click());
    check("tapping elsewhere closes the menu", await p1.evaluate(() => document.getElementById("tnMenu").hidden));
    await p1.click('#tnSub button[data-k="matches"]');
    check("private: matches show their group", await p1.evaluate(() => [...document.querySelectorAll("#upcoming .match")].every(x => !!x.querySelector(".match-grp"))));
    await shot(p1, "3-private-matches");
    /* صديق يشوف نفس المجموعات */
    const code = pk.split("/")[1];
    const fan = await device(browser, db, "fan", { live: "none", query: "t=" + code });
    check("friend sees the same 2 groups", await until(() => fan.evaluate(() => document.querySelectorAll("#standingsBox .tn-gt").length === 2), 8000));
    /* دوري واحد يبقى زي قبل */
    await p1.evaluate(() => tnBack());
    await p1.evaluate(() => tnOpenCreate());
    await p1.fill("#tnName", "دوري عادي");
    await p1.fill("#tnPlayers", "س1، س2، س3");
    await p1.selectOption("#tnGroups", "1");
    await p1.click("#tnCreateBtn");
    const k2 = await until(() => [...db.docs.keys()].find(k => /^privateTournaments\//.test(k) && k !== pk), 6000);
    check("single league: no groups field, one plain table, no legend", !!k2 && !("groups" in db.data(k2)) && await until(() => p1.evaluate(() => document.querySelectorAll("#standingsBox .tn-gt").length === 1 && !document.querySelector(".tn-legend") && !document.querySelector(".tn-gt-t")), 5000));
    for (const [n, p] of [["host", host], ["p1", p1], ["fan", fan]]) check("no page errors on " + n, errs(p).length === 0, errs(p));
} finally { await browser.close(); srv.close && srv.close(); }
console.log(ok ? "ALL PASS" : "SOME FAILED");
process.exit(ok ? 0 : 1);
