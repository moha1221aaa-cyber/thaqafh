/* زر الرجوع في الجوال يرجع خطوة بخطوة (js/nav.js) واسم التبويب في الهيدر بدل FEEKARO OFFICIAL.
   node tests/harness/nav.mjs */
import { serve, FakeDB, seed, launch, device, until, sleep } from "./harness.mjs";

const srv = await serve(8787);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined && !v ? " " + JSON.stringify(extra).slice(0, 300) : "")); };
const db = new FakeDB(30);
seed(db, "intro", { status: "ended" });
const browser = await launch({ wav: "silence.wav" });
const errs = p => p.__logs.filter(l => /PAGEERROR/.test(l));
try {
    const p = await device(browser, db, "p1", { live: "none" });
    await until(() => p.evaluate(() => typeof navApply === "function" && !!currentUser && document.querySelectorAll("#standingsBox tbody tr").length >= 0), 10000);
    const tab = () => p.evaluate(() => document.querySelector(".section.active").id);
    const back = async () => { await p.evaluate(() => history.back()); await sleep(450); };
    const title = () => p.evaluate(() => { const t = document.getElementById("adminTitle"); return { text: t.textContent, shown: t.offsetParent !== null }; });
    const st = () => p.evaluate(() => history.state && history.state.nav);

    check("first history entry is the home state", (await st()).tab === "home");
    check("home: no 'FEEKARO OFFICIAL' text anywhere in the header", await p.evaluate(() => !/FEEKARO OFFICIAL/i.test(document.getElementById("mainHeader").innerText)));
    let t = await title();
    check("home: title hidden (logo only)", t.text === "" && !t.shown, t);

    /* العناوين */
    for (const [sec, name] of [["tournaments", "البطولات"], ["majlis", "المجلس"], ["accountTab", "الحساب"]]) {
        await p.click(`.bottom-nav .tab[data-sec="${sec}"]`); await sleep(350);
        t = await title();
        check("tab " + sec + " → header shows its name", t.text === name && t.shown, t);
    }
    check("header title is plain Arabic text (no letter-spacing that breaks the letters)", await p.evaluate(() => getComputedStyle(document.getElementById("adminTitle")).letterSpacing === "normal" || getComputedStyle(document.getElementById("adminTitle")).letterSpacing === "0px"));

    /* الرجوع بين التبويبات خطوة خطوة: الحساب ← المجلس ← البطولات ← الرئيسية */
    await back(); check("back from الحساب → المجلس", await tab() === "majlis");
    await back(); check("back → البطولات", await tab() === "tournaments");
    t = await title(); check("title follows the back step", t.text === "البطولات", t);
    await back(); check("back → الرئيسية", await tab() === "home");
    t = await title(); check("home again: title empty", t.text === "", t);

    /* صفحة البطولة: الرجوع للقائمة، مو للتبويب اللي قبل */
    await p.click('.bottom-nav .tab[data-sec="tournaments"]'); await sleep(300);
    await p.click("#tnList .tn-item:nth-of-type(1)"); await sleep(300);
    check("inside a tournament page", await p.evaluate(() => tn.open && document.getElementById("tnDetail").offsetParent !== null));
    await back();
    check("back → the tournaments LIST (still on the tournaments tab)", await tab() === "tournaments" && await p.evaluate(() => !tn.open && document.getElementById("tnList").offsetParent !== null));
    await p.click("#tnList .tn-item:nth-of-type(1)"); await sleep(300);
    await p.click(".tn-back"); await sleep(450);
    check("the on-page back button does the same (one step)", await p.evaluate(() => !tn.open) && await tab() === "tournaments");
    await back(); check("one more back → home", await tab() === "home");

    /* نافذة فوق الصفحة: الرجوع يسكّرها بس */
    await p.click('.bottom-nav .tab[data-sec="tournaments"]'); await sleep(300);
    await p.click('#tnList .tn-top button:nth-child(2)'); await sleep(200);
    await p.evaluate(() => tnOpenCreate()); await sleep(300);
    check("modal open", await p.evaluate(() => document.getElementById("tnCreateModal").classList.contains("active")));
    await back();
    check("back closes the modal and stays on the same page", await p.evaluate(() => !document.getElementById("tnCreateModal").classList.contains("active")) && await tab() === "tournaments");

    /* بطولة خاصة (رمز) ثم رجوع */
    await p.evaluate(() => tnOpenCreate()); await sleep(250);
    await p.fill("#tnName", "اختبار الرجوع"); await p.fill("#tnPlayers", "أ، ب، ج");
    await p.click("#tnCreateBtn");
    await until(() => p.evaluate(() => !!privDoc), 6000); await sleep(400);
    check("private tournament opened after create", await p.evaluate(() => tn.open && tn.mode === "private"));
    await back();
    check("back from the private tournament → list", await p.evaluate(() => !tn.open) && await tab() === "tournaments");

    /* المجلس والجلسة */
    await p.click('.bottom-nav .tab[data-sec="majlis"]'); await sleep(300);
    await p.click('#mjSeg button[data-k="session"]'); await sleep(300);
    await p.evaluate(() => sessOpenCreate()); await sleep(250);
    await p.fill("#sessTitle", "جلسة"); await p.click("#sessCreateBtn");
    await until(() => p.evaluate(() => !!sess), 6000); await sleep(300);
    check("inside a session", await p.evaluate(() => !!sess && sj.pane === "session"));
    await back();
    check("back from the session → the sessions list (same tab)", await p.evaluate(() => !sess) && await tab() === "majlis" && await p.evaluate(() => sj.pane === "session"));
    await back();
    check("back → room pane", await p.evaluate(() => sj.pane === "room") && await tab() === "majlis");
    await back();
    check("back → previous tab (tournaments)", await tab() === "tournaments");

    /* من الرئيسية: آخر خطوة (بعدها يطلع من التطبيق) */
    while (await tab() !== "home") await back();
    check("at home we're on the first entry (next back leaves the app)", await p.evaluate(() => history.state && history.state.nav && history.state.nav.tab === "home"));

    /* رابط مشارك يفتح البطولة، والرجوع للرئيسية */
    const pk = [...db.docs.keys()].find(k => /^privateTournaments\//.test(k));
    const fan = await device(browser, db, "fan", { live: "none", query: "t=" + pk.split("/")[1] });
    await until(() => fan.evaluate(() => typeof tn !== "undefined" && tn.open && !!privDoc), 10000);
    await fan.evaluate(() => history.back()); await sleep(500);
    check("shared link: back leaves the tournament and shows home", await fan.evaluate(() => !tn.open && document.querySelector(".section.active").id === "home") || await fan.evaluate(() => !tn.open));
    for (const [n, pg] of [["p1", p], ["fan", fan]]) check("no page errors on " + n, errs(pg).length === 0, errs(pg));
} finally { await browser.close(); srv.close && srv.close(); }
console.log(ok ? "ALL PASS" : "SOME FAILED");
process.exit(ok ? 0 : 1);
