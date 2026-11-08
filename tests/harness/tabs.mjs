/* 8 نوفمبر 2026: التبويبات الجديدة. الشريط السفلي (الحساب يسار، المجلس بينه وبين البطولات)، وانشال التوقعات،
   والبطولات الرسمية (أبطال النخبة والتصفيات) والخاصة (إنشاء، رمز، المنظم بس يدخل النتايج)، والمجلس (الغرفة والجلسة).
   node tests/harness/tabs.mjs [مجلد الصور] */
import { serve, FakeDB, seed, launch, device, until, sleep } from "./harness.mjs";
import fs from "node:fs";

const OUT = process.argv[2];
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const srv = await serve(8787);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const shot = async (p, n) => { if (OUT) await p.screenshot({ path: `${OUT}/${n}.png` }); };
const db = new FakeDB(30);
seed(db, "intro", { status: "ended" });
const browser = await launch({ wav: "silence.wav" });
const errs = p => p.__logs.filter(l => /PAGEERROR/.test(l));
try {
    const host = await device(browser, db, "host", { live: "none" });
    await until(() => host.evaluate(() => players.length > 0 && document.querySelectorAll("#standingsBox tbody tr").length > 0), 10000);

    /* ===== الشريط السفلي ===== */
    const nav = await host.evaluate(() => [...document.querySelectorAll(".bottom-nav .tab")].map(t => ({ sec: t.dataset.sec, label: t.innerText.trim(), x: Math.round(t.getBoundingClientRect().left) })));
    const byX = nav.slice().sort((a, b) => a.x - b.x).map(t => t.label);
    check("4 tabs, left to right: الحساب، المجلس، البطولات، الرئيسية", JSON.stringify(byX) === JSON.stringify(["الحساب", "المجلس", "البطولات", "الرئيسية"]), byX);
    check("no predictions / old table / old matches sections", await host.evaluate(() => !document.getElementById("predictions") && !document.getElementById("table") && !document.getElementById("matches") && !document.getElementById("room")));
    check("side menu pages follow the new tabs", await host.evaluate(() => MENU_PAGES.map(p => p.label).join(",") === "الرئيسية,البطولات,المجلس,الحساب"));
    await shot(host, "01-home");

    /* ===== البطولات: قائمة، والترتيب والمواجهات داخل كل بطولة ===== */
    await host.click('.bottom-nav .tab[data-sec="tournaments"]');
    check("tournaments section active", await until(() => host.evaluate(() => document.getElementById("tournaments").classList.contains("active")), 3000));
    check("opens on a LIST of tournaments (no standings / matches outside)", await host.evaluate(() => document.getElementById("tnList").offsetParent !== null && document.getElementById("tnDetail").offsetParent === null && document.getElementById("standingsBox").offsetParent === null));
    check("official section: two rows with the right names", await host.evaluate(() => { const t = [...document.querySelectorAll("#tnList .tn-item-b b")].slice(0, 2).map(x => x.textContent.trim()); return t[0] === "أبطال النخبة الثقافي" && t[1] === "تصفيات أبطال النخبة الثقافي"; }));
    check("official and private are separate sections (private stuff hidden on the official one)", await host.evaluate(() => !document.querySelector("#tnList .tn-primary") && !document.getElementById("tnJoinCode") && document.querySelectorAll("#tnList .tn-top button").length === 2));
    await host.click('#tnList .tn-top button:nth-child(2)');
    check("private section: intro, create and join", await host.evaluate(() => !!document.querySelector("#tnList .tn-primary") && !!document.getElementById("tnJoinCode") && !document.querySelector("#tnList .tn-item.gold")));
    await host.click('#tnList .tn-top button:nth-child(1)');
    await shot(host, "02a-list");
    await host.click("#tnList .tn-item:nth-of-type(1)");
    check("tap the row → tournament page with title and back button", await until(() => host.evaluate(() => document.getElementById("tnDetail").offsetParent !== null && document.querySelector(".tn-ptitle b").textContent === "أبطال النخبة الثقافي" && !!document.querySelector(".tn-back")), 3000));
    const n = await host.evaluate(() => players.length);
    check("standings inside the tournament page", await host.evaluate(n => document.querySelectorAll("#standingsBox tbody tr").length === n, n), n);
    check("matches pane hidden, then shown by the sub tab", await host.evaluate(() => document.getElementById("tnMatches").style.display === "none"));
    await host.click('#tnSub button[data-k="matches"]');
    check("matches inside the tournament page", await until(() => host.evaluate(() => document.getElementById("tnMatches").style.display !== "none" && document.querySelectorAll("#upcoming .match").length > 0), 3000));
    check("admin can edit scores on elite", await host.evaluate(() => !document.querySelector("#upcoming .match input").disabled));
    await shot(host, "02-elite-matches");
    await host.click(".tn-back");
    check("back → the list again", await until(() => host.evaluate(() => document.getElementById("tnList").offsetParent !== null && document.getElementById("tnDetail").offsetParent === null), 3000));
    /* التصفيات */
    await host.click("#tnList .tn-item:nth-of-type(2)");
    check("qualifiers page title", await until(() => host.evaluate(() => document.querySelector(".tn-ptitle b").textContent === "تصفيات أبطال النخبة الثقافي"), 3000));
    check("qualifiers: empty state before it starts", await until(() => host.evaluate(() => /ما بدأت/.test(document.getElementById("standingsBox").innerText)), 3000));
    host.removeAllListeners("dialog");
    let asked = 0;
    host.on("dialog", d => { asked++; d.type() === "prompt" ? d.accept("متسابق " + asked) : d.accept(); });
    check("admin actions live in the ⋮ menu, not loose on the page", await host.evaluate(() => !document.querySelector(".tn-admin") && document.querySelectorAll("#tnMenu button").length === 3));
    for (let i = 0; i < 3; i++) { await host.click(".tn-more-btn"); await host.click("#tnMenu button:nth-child(1)"); await sleep(250); }
    const q = await until(() => { const d = db.data("league/qualifiers"); return d && d.playersList.length === 3 ? d : null; }, 5000);
    check("qualifiers doc created with 3 players and a double round robin (6 matches)", q && q.matches.length === 6, q && q.matches.length);
    check("qualifiers standings rendered", await host.evaluate(() => document.querySelectorAll("#standingsBox tbody tr").length === 3));
    check("elite data untouched by the qualifiers", await host.evaluate(n => players.length === n && !players.some(p => /^متسابق/.test(p.name)), n));
    await host.click('#tnSub button[data-k="matches"]');
    await host.evaluate(() => { const i = document.querySelector("#upcoming .match input"); i.value = "4"; i.dispatchEvent(new Event("change")); const j = document.querySelectorAll("#upcoming .match input")[1]; j.value = "2"; j.dispatchEvent(new Event("change")); });
    const q2 = await until(() => { const d = db.data("league/qualifiers"); return d && d.matches.some(m => m.s1 === "4" && m.s2 === "2") ? d : null; }, 5000);
    check("score typed in qualifiers saves to league/qualifiers (not league/current)", !!q2 && !db.data("league/current").matches.some(m => m.s1 === "4" && m.s2 === "2"));
    check("no live-broadcast buttons on the qualifiers", await host.evaluate(() => !document.querySelector("#upcoming .live-start-btn")));
    await shot(host, "03-qual");
    host.removeAllListeners("dialog"); host.on("dialog", d => d.accept());

    /* ===== البطولات الخاصة ===== */
    const p1 = await device(browser, db, "p1", { live: "none" });
    await until(() => p1.evaluate(() => typeof tnOpenOfficial === "function" && document.querySelectorAll("#standingsBox tbody tr").length > 0), 10000);
    await p1.click('.bottom-nav .tab[data-sec="tournaments"]');
    await p1.click('#tnList .tn-top button:nth-child(2)');
    check("private: create + join live in the private section", await p1.evaluate(() => document.getElementById("tnList").offsetParent !== null && !!document.getElementById("tnJoinCode") && !!document.querySelector("#tnList .tn-primary")));
    await shot(p1, "04-private-home");
    await p1.evaluate(() => tnOpenCreate());
    await p1.fill("#tnName", "بطولة الشلة");
    await p1.fill("#tnPlayers", "أحمد، فهد\nخالد، فهد، سلمان");
    await shot(p1, "05-create-modal");
    await p1.click("#tnCreateBtn");
    const pt = await until(() => { const l = [...db.docs.keys()].filter(k => /^privateTournaments\/[A-Z0-9]{8}$/.test(k)); return l.length ? db.data(l[0]) : null; }, 5000);
    check("created: owner, 4 unique players (dup removed), double round robin = 12 matches", pt && pt.ownerUid === "u_p1" && pt.playersList.length === 4 && pt.matches.length === 12, pt && [pt.playersList, pt.matches.length]);
    const code = [...db.docs.keys()].find(k => /^privateTournaments\//.test(k)).split("/")[1];
    check("code is 8 chars without confusing letters", /^[A-HJ-NP-Z2-9]{8}$/.test(code), code);
    check("opens straight into the tournament (title + code + standings)", await until(() => p1.evaluate(c => document.querySelector(".tn-ptitle b") && document.querySelector(".tn-ptitle b").textContent === "بطولة الشلة" && document.querySelector(".tn-code").textContent === c && document.querySelectorAll("#standingsBox tbody tr").length === 4, code), 5000));
    await p1.click('#tnSub button[data-k="matches"]');
    check("owner can enter scores", await p1.evaluate(() => { const i = document.querySelector("#upcoming .match input"); return !!i && !i.disabled; }));
    await p1.evaluate(() => { const a = document.querySelectorAll("#upcoming .match input"); a[0].value = "3"; a[0].dispatchEvent(new Event("change")); a[1].value = "1"; a[1].dispatchEvent(new Event("change")); });
    const pt2 = await until(() => { const d = db.data("privateTournaments/" + code); return d.matches.some(m => m.s1 === "3" && m.s2 === "1") ? d : null; }, 5000);
    check("score saved on the private doc, players list unchanged", !!pt2 && pt2.playersList.length === 4);
    await shot(p1, "06-private-matches");

    /* صديق يفتح بالرابط: يشوف وما يعدّل */
    const fan = await device(browser, db, "fan", { live: "none", query: "t=" + code });
    check("friend opens the share link into the tournament", await until(() => fan.evaluate(c => { const el = document.querySelector(".tn-code"); return document.getElementById("tournaments").classList.contains("active") && el && el.textContent === c; }, code), 8000));
    await fan.click('#tnSub button[data-k="matches"]');
    check("friend sees the result but cannot edit", await until(() => fan.evaluate(() => { const i = document.querySelectorAll("#past .match input"); return i.length === 2 && [...i].every(x => x.disabled) && document.querySelector("#upcoming .match input").disabled; }), 4000));
    check("friend has no delete / reset in his menu", await fan.evaluate(() => !document.querySelector(".tn-menu .danger") && ![...document.querySelectorAll(".tn-menu button")].some(b => /تصفير/.test(b.textContent))));
    check("owner has reset + delete inside the ⋮ menu", await p1.evaluate(() => { const t = [...document.querySelectorAll("#tnMenu button")].map(b => b.textContent.trim()); return t.some(x => /تصفير/.test(x)) && t.some(x => /حذف/.test(x)); }));
    check("private players don't borrow the official links / profile click", await fan.evaluate(() => !document.querySelector("#standingsBox .clickable-profile")));
    /* التحديث المباشر */
    await p1.evaluate(() => { const a = document.querySelectorAll("#upcoming .match input"); a[0].value = "2"; a[0].dispatchEvent(new Event("change")); a[1].value = "2"; a[1].dispatchEvent(new Event("change")); });
    check("friend's board updates live", await until(() => fan.evaluate(() => document.querySelectorAll("#past .match").length === 2), 5000));
    /* الحد الأقصى للأسماء */
    await p1.evaluate(() => tnOpenPrivate("ZZZZZZZZ"));
    check("unknown code → back to the list, no crash", await until(() => p1.evaluate(() => document.getElementById("tnList").offsetParent !== null), 4000));

    /* ===== المجلس ===== */
    await p1.click('.bottom-nav .tab[data-sec="majlis"]');
    check("majlis: room pane first, with the room card", await until(() => p1.evaluate(() => document.getElementById("mjRoom").offsetParent !== null && !!document.querySelector("#roomCardBox .room-card")), 4000));
    await shot(p1, "07-majlis-room");
    await p1.click('#mjSeg button[data-k="session"]');
    check("session pane shows intro, start button and join box", await p1.evaluate(() => document.getElementById("mjSession").offsetParent !== null && document.getElementById("mjRoom").offsetParent === null && !!document.getElementById("sessJoinCode")));
    await shot(p1, "08-session-home");
    await p1.evaluate(() => sessOpenCreate());
    await p1.fill("#sessTitle", "ليلة ثقافة");
    await p1.selectOption("#sessPlace", "استراحة");
    await p1.click("#sessCreateBtn");
    const sk = await until(() => [...db.docs.keys()].find(k => /^sessions\/[A-Z0-9]{6}$/.test(k)), 5000);
    check("session created by the host", !!sk && db.data(sk).hostUid === "u_p1" && db.data(sk).status === "open" && db.data(sk).title === "ليلة ثقافة");
    const sid = sk.split("/")[1];
    check("host sees the live board + code", await until(() => p1.evaluate(s => document.querySelector(".sj-code b") && document.querySelector(".sj-code b").textContent === s && !!document.getElementById("sessGuestName"), sid), 5000));
    await p1.fill("#sessGuestName", "أبو سعد");
    await p1.click(".sj-add button");
    check("host adds a guest attendee", !!(await until(() => [...db.docs.keys()].find(k => k.startsWith(sk + "/members/g_")), 4000)));
    /* حاضر ينضم من جواله */
    const fan2 = await device(browser, db, "p2", { live: "none", query: "s=" + sid });
    check("attendee opens the session link", await until(() => fan2.evaluate(s => document.getElementById("majlis").classList.contains("active") && document.querySelector(".sj-code b") && document.querySelector(".sj-code b").textContent === s, sid), 8000));
    check("attendee has no point buttons, only join", await fan2.evaluate(() => !document.querySelector(".sj-ctl") && !!document.querySelector("#mjSession .tn-primary")));
    await fan2.click("#mjSession .tn-primary");
    check("attendee joined with 0 points", !!(await until(() => db.data(sk + "/members/u_p2"), 4000)) && db.data(sk + "/members/u_p2").pts === 0);
    /* المضيف يعطي نقاط */
    check("host sees 2 rows", await until(() => p1.evaluate(() => document.querySelectorAll(".sj-row").length === 2), 4000));
    await p1.evaluate(() => sessPts("u_p2", 1)); await p1.evaluate(() => sessPts("u_p2", 2));
    check("points add up (+1 then +2 = 3)", !!(await until(() => db.data(sk + "/members/u_p2").pts === 3, 4000)));
    check("attendee's board ranks him first with 3", await until(() => fan2.evaluate(() => { const r = document.querySelector(".sj-row"); return r && r.classList.contains("me") && /3/.test(r.querySelector(".sj-pts").textContent); }), 5000));
    await shot(fan2, "09-session-attendee");
    await shot(p1, "10-session-host");
    await p1.evaluate(() => sessEnd());
    check("host ends it: attendee sees the winner", await until(() => fan2.evaluate(() => /الفائز/.test(document.querySelector(".sj-winner") ? document.querySelector(".sj-winner").textContent : "")), 5000));

    for (const [n, p] of [["host", host], ["p1", p1], ["fan", fan], ["p2", fan2]]) check("no page errors on " + n, errs(p).length === 0, errs(p));
} finally { await browser.close(); srv.close && srv.close(); }
console.log(ok ? "ALL PASS" : "SOME FAILED");
process.exit(ok ? 0 : 1);
