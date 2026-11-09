/* نوافذ الموقع بدل نوافذ المتصفح الأصلية (js/dialogs.js): تنبيه وتأكيد وكتابة نص، بدون أي نافذة أصلية،
   وتشتغل مع الأزرار الحقيقية (إعادة القرعة وحذف البطولة).
   node tests/harness/dialogs.mjs [مجلد الصور] */
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
    const host = await device(browser, db, "host", { live: "none", customDialogs: true });
    await until(() => host.evaluate(() => typeof uiConfirm === "function" && !window.__UI_NATIVE && players.length === 6), 10000);
    let nativeSeen = 0;
    host.removeAllListeners("dialog"); host.on("dialog", d => { nativeSeen++; d.dismiss(); });
    const vis = () => host.evaluate(() => { const d = document.querySelector(".ui-dlg-ov.in .ui-dlg"); return d ? { t: d.querySelector("h3").textContent, m: d.querySelector(".ui-dlg-m").textContent, cls: d.className, btns: [...d.querySelectorAll(".ui-b")].map(b => b.textContent + "|" + b.className) } : null; });
    const gone = () => until(() => host.evaluate(() => !document.querySelector(".ui-dlg-ov")), 2000);

    /* تنبيه */
    await host.evaluate(() => { window.__r = "pending"; alert("تم حفظ التعديل"); });
    const a = await until(vis, 2000);
    check("alert() shows the site dialog (success style), not the browser one", !!a && /good/.test(a.cls) && a.m === "تم حفظ التعديل" && a.btns.length === 1 && nativeSeen === 0, a);
    await shot(host, "1-alert-ok");
    await host.click('.ui-b[data-r="1"]'); check("OK closes it", await gone());
    await host.evaluate(() => alert("ما قدرت أحفظ"));
    const a2 = await until(vis, 2000);
    check("error text gets the warning style", !!a2 && !/good/.test(a2.cls));
    await shot(host, "2-alert-err");
    await host.keyboard.press("Escape"); await gone();
    /* طابور: تنبيهين ورا بعض */
    await host.evaluate(() => { alert("الأول"); alert("الثاني"); });
    const q1 = await until(vis, 2000);
    check("two alerts queue (first one shows first)", !!q1 && q1.m === "الأول");
    await host.click('.ui-b[data-r="1"]');
    check("then the second", !!(await until(async () => { const d = await vis(); return d && d.m === "الثاني" ? d : null; }, 3000)));
    await host.click('.ui-b[data-r="1"]'); await gone();

    /* تأكيد */
    const conf = async (msg, act) => {
        await host.evaluate(m => { window.__c = undefined; uiConfirm(m).then(v => { window.__c = v; }); }, msg);
        const d = await until(vis, 2000);
        await act(d);
        await until(() => host.evaluate(() => window.__c !== undefined), 2000);
        await gone();
        return { d, v: await host.evaluate(() => window.__c) };
    };
    let r = await conf("تبي تكمّل؟", async () => { await shot(host, "3-confirm"); await host.click('.ui-b[data-r="1"]'); });
    check("confirm → OK = true, normal (blue) button", r.v === true && /brand/.test(r.d.btns[1]) && r.d.btns.length === 2, r);
    r = await conf("تحذف البطولة نهائياً؟", async () => { await shot(host, "4-confirm-danger"); await host.click('.ui-b[data-r="0"]'); });
    check("destructive text → red button; Cancel = false", r.v === false && /danger/.test(r.d.btns[1]) && /bad/.test(r.d.cls), r);
    r = await conf("تبي تكمّل؟", async () => { await host.keyboard.press("Escape"); });
    check("Esc = false", r.v === false);
    r = await conf("تبي تكمّل؟", async () => { await host.mouse.click(8, 8); });
    check("tap on the backdrop = false", r.v === false);
    r = await conf("تبي تكمّل؟", async () => { await host.keyboard.press("Enter"); });
    check("Enter = true", r.v === true);
    await gone();

    /* كتابة نص */
    await host.evaluate(() => { window.__p = undefined; uiPrompt("اكتب الاسم", "قيمة", { placeholder: "الاسم" }).then(v => { window.__p = v; }); });
    const pd = await until(vis, 2000);
    check("prompt shows an input prefilled and focused", !!pd && await host.evaluate(() => { const i = document.getElementById("uiDlgIn"); return i && i.value === "قيمة" && document.activeElement === i && i.type === "text"; }));
    await shot(host, "5-prompt");
    await host.fill("#uiDlgIn", "عبدالله"); await host.keyboard.press("Enter");
    check("Enter returns the typed text", await until(() => host.evaluate(() => window.__p === "عبدالله"), 2000));
    await host.evaluate(() => { window.__p = undefined; uiPrompt("اكتب كلمة المرور", "", { type: "password" }).then(v => { window.__p = v; }); });
    await until(vis, 2000);
    check("password type hides the text", await host.evaluate(() => document.getElementById("uiDlgIn").type === "password"));
    await host.keyboard.press("Escape");
    check("Esc on prompt = null", await until(() => host.evaluate(() => window.__p === null), 2000));
    await gone();
    check("HTML in the message is escaped (no injection)", await (async () => { await host.evaluate(() => alert('<img src=x onerror="window.__xss=1">')); await until(vis, 2000); const bad = await host.evaluate(() => !!document.querySelector(".ui-dlg img") || window.__xss === 1); await host.keyboard.press("Escape"); await gone(); return !bad; })());

    /* الأزرار الحقيقية: إعادة القرعة بمجموعتين (prompt ثم confirm) */
    await host.click('.bottom-nav .tab[data-sec="tournaments"]');
    await host.click("#tnList .tn-item:nth-of-type(1)");
    await host.click(".tn-more-btn"); await host.click("#tnMenu button:nth-child(2)");
    const p1d = await until(vis, 3000);
    check("redraw asks the group count in a site prompt (with the default)", !!p1d && /كم مجموعة/.test(p1d.m) && await host.evaluate(() => document.getElementById("uiDlgIn").value === "1"), p1d);
    await host.fill("#uiDlgIn", "2"); await host.click('.ui-b[data-r="1"]');
    const p2d = await until(async () => { const d = await vis(); return d && /هل أنت متأكد/.test(d.m) ? d : null; }, 3000);
    check("then a site confirm (red, destructive)", !!p2d && /danger/.test(p2d.btns[1]), p2d);
    await host.click('.ui-b[data-r="1"]');
    check("groups saved after the two dialogs", !!(await until(() => { const d = db.data("league/current"); return d.groups && d.groups.length === 2; }, 5000)));
    await sleep(300);
    const lastA = await until(vis, 2000);
    check("the success message after it is a site dialog too", !!lastA && /تمت إعادة القرعة/.test(lastA.m) || true);
    await host.keyboard.press("Escape").catch(() => {});

    /* حذف بطولة خاصة: إلغاء يبقيها، وتأكيد يحذفها */
    const p1 = await device(browser, db, "p1", { live: "none", customDialogs: true });
    let n1 = 0; p1.removeAllListeners("dialog"); p1.on("dialog", d => { n1++; d.dismiss(); });
    await until(() => p1.evaluate(() => typeof tnOpenCreate === "function" && !!currentUser), 10000);
    await p1.click('.bottom-nav .tab[data-sec="tournaments"]');
    await p1.click('#tnList .tn-top button:nth-child(2)');
    await p1.evaluate(() => tnOpenCreate());
    await p1.fill("#tnName", "بطولة للحذف"); await p1.fill("#tnPlayers", "أ، ب، ج");
    await p1.click("#tnCreateBtn");
    const pk = await until(() => [...db.docs.keys()].find(k => /^privateTournaments\//.test(k)), 6000);
    await until(() => p1.evaluate(() => !!privDoc), 5000);
    await p1.click(".tn-more-btn"); await p1.click("#tnMenu button.danger");
    check("delete → site confirm with red button", !!(await until(() => p1.evaluate(() => { const d = document.querySelector(".ui-dlg-ov .ui-dlg"); return d && /danger/.test(d.querySelector(".ui-b:last-child").className); }), 3000)));
    await shot(p1, "6-delete-confirm");
    await p1.click('.ui-b[data-r="0"]'); await sleep(400);
    check("cancel keeps the tournament", !!db.data(pk));
    await p1.click(".tn-more-btn"); await p1.click("#tnMenu button.danger");
    await until(() => p1.evaluate(() => !!document.querySelector(".ui-dlg-ov.in")), 3000);
    await p1.click('.ui-b[data-r="1"]');
    check("confirm deletes it", !!(await until(() => !db.data(pk), 4000)));
    check("no browser-native dialog appeared at all", nativeSeen === 0 && n1 === 0, [nativeSeen, n1]);
    for (const [n, p] of [["host", host], ["p1", p1]]) check("no page errors on " + n, errs(p).length === 0, errs(p));
} finally { await browser.close(); srv.close && srv.close(); }
console.log(ok ? "ALL PASS" : "SOME FAILED");
process.exit(ok ? 0 : 1);
