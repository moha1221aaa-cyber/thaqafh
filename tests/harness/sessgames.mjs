/* السوم وبرا السالفة داخل جلسة حضورية (8 نوفمبر 2026): المضيف مستخدم عادي (مو منظم المنصة)، والطاولة في
   sessions/<الرمز>/games/<اللعبة> بدون مايك، ومع functions/som.js و bara.js الحقيقيين (sid).
   يتأكد: المضيف يفتح ويوزع، غير المضيف ما يوزع ولا يكشف (403)، كل واحد يشوف ورقه بس، الأوراق ما تطلع في الوثيقة،
   وأصوات برا السالفة تنكتب تحت الجلسة، وما شي يكتب في غرفة الصوت.
   node tests/harness/sessgames.mjs [مجلد الصور] */
import fs from "node:fs";
import { serve, FakeDB, seed, launch, device, until, sleep } from "./harness.mjs";
import { setupAuth, fakeCaches } from "../functions/helpers.mjs";
import { onRequestPost as somPost } from "../../functions/som.js";
import { onRequestPost as baraPost } from "../../functions/bara.js";

const out = process.argv[2] || "/tmp/harness-sessgames";
fs.mkdirSync(out, { recursive: true });
let ok = true;
const check = (name, v, extra) => { console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined && !v ? " " + JSON.stringify(extra).slice(0, 300) : "")); if (!v) ok = false; };

const auth = await setupAuth(); fakeCaches();
const db = new FakeDB(40);
seed(db, "intro");
const SID = "ABC234";
db.docs.set("sessions/" + SID, { ver: 1, data: { title: "ليلة ثقافة", place: "استراحة", hostUid: "u_p1", hostName: "سعد", status: "open", createdAt: { __ts: Date.now() } } });
const enc = v => v === null || v === undefined ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v }
    : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
    : (v && typeof v.__ts === "number") ? { timestampValue: new Date(v.__ts).toISOString() }
    : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
auth.routes.push({ match: u => u.startsWith("https://firestore.googleapis.com/"), handle: async u => {
    const p = decodeURIComponent(u.split("/documents/")[1].split("?")[0]);
    const d = db.data(p);
    return d ? new Response(JSON.stringify({ fields: enc(d).mapValue.fields })) : new Response("{}", { status: 404 });
} });
const env = { AGORA_APP_CERTIFICATE: "test-secret-0123456789abcdef" };
const tokens = { host: await auth.token("u_host", "moha1221aaa@gmail.com"), p1: await auth.token("u_p1"), p2: await auth.token("u_p2"), fan: await auth.token("u_fan") };
const statuses = [];
const mk = (fn, name) => async (b, info) => {
    const pending = [];
    const req = new Request("http://127.0.0.1:8787/" + name, { method: "POST", body: JSON.stringify(b),
        headers: Object.assign({ Origin: "http://127.0.0.1:8787", "Content-Type": "application/json" }, info.headers.authorization ? { Authorization: "Bearer " + tokens[info.who] } : {}) });
    const res = await fn({ request: req, env, waitUntil: p => pending.push(p) });
    const text = await res.text();
    await Promise.all(pending);
    statuses.push({ who: info.who, action: b.action, sid: b.sid, status: res.status });
    return { raw: { status: res.status, contentType: "application/json", body: text } };
};
const api = { som: mk(somPost, "som"), bara: mk(baraPost, "bara") };
const gs = n => db.data("sessions/" + SID + "/games/" + n);
const srv = await serve(8787);
const browser = await launch({});
const errs = p => p.__logs.filter(l => /PAGEERROR/.test(l));
try {
    const devs = {};
    for (const who of ["p1", "p2", "fan"]) devs[who] = await device(browser, db, who, { api, live: "none", query: "s=" + SID });
    const { p1, p2, fan } = devs;
    for (const pg of Object.values(devs)) await until(() => pg.evaluate(s => typeof sess !== "undefined" && sess && sess.id === s && somSess === s && baraSess === s, SID), 10000);
    check("session opened with the games attached (host = ordinary user)", await p1.evaluate(() => sessIsHost() && somHost() && baraHost() && !isAdmin));
    check("non-host attendee is not host in the games", await p2.evaluate(() => !somHost() && !baraHost()));
    check("host sees the two start buttons", await p1.evaluate(() => document.querySelectorAll(".sj-gbtns button").length === 2));
    check("attendee sees no start buttons", await p2.evaluate(() => document.querySelectorAll(".sj-gbtns button").length === 0));

    /* ===== السوم ===== */
    await p1.click(".sj-gbtns button:first-child");
    check("som table opened under the session (lobby)", !!await until(() => gs("som") && gs("som").phase === "lobby", 5000));
    check("nothing written to the voice-room game doc", !db.data("room/main/games/som"));
    check("no mic button in the table (in-person)", await p1.evaluate(() => !!document.querySelector("#somScreen.open") && !document.querySelector("#somScreen .som-top-btns .som-ic.dim, #somScreen .som-top-btns .som-ic.on")));
    check("pill shows for attendees", !!await until(() => p2.evaluate(() => !!document.querySelector(".sj-games .som-pill")), 4000));
    for (const pg of [p2, fan]) { await pg.click(".sj-games .som-pill"); await until(() => pg.evaluate(() => !!document.querySelector("#somScreen.open .som-b.gold")), 3000); await pg.click("#somScreen .som-b.gold"); await sleep(250); }
    await p1.click("#somScreen .som-b.gold");
    check("3 players joined", !!await until(() => gs("som").players.length === 3, 5000), gs("som") && gs("som").players);
    check("host starts the round (server deal by session host)", await (async () => { await p1.click("#somScreen .som-b.brand"); return !!await until(() => gs("som").phase === "bid" && gs("som").round === 1, 6000); })(), gs("som"));
    check("deal request went with sid and succeeded for the host", statuses.some(s => s.who === "p1" && s.action === "deal" && s.sid === SID && s.status === 200));
    check("hands are sealed, not in the document", /^v1\./.test(gs("som").deal) && !/"h":/.test(JSON.stringify(gs("som"))));
    const hands = {};
    for (const [w, pg] of Object.entries(devs)) { await until(() => pg.evaluate(() => somHand && somHand.key === somKey(somState)), 6000); hands[w] = await pg.evaluate(() => somHand.cards); }
    check("each one got 4 different cards, all different from each other", Object.values(hands).every(h => h && h.length === 4) && new Set(Object.values(hands).flat()).size === 12, hands);
    /* غير المضيف ما يوزع ولا يكشف */
    const rawAs = (who, name, body) => devs[who].evaluate(async ([n, b]) => { const r = await fetch("/" + n, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, await authHeaders()), body: JSON.stringify(b) }); return r.status; }, [name, body]);
    check("attendee cannot deal (403)", await rawAs("p2", "som", { action: "deal", sid: SID, gid: gs("som").gid, round: 5, uids: ["u_p1", "u_p2"] }) === 403);
    check("attendee cannot reveal (403)", await rawAs("p2", "som", { action: "reveal", sid: SID, gid: gs("som").gid, round: 1 }) === 403);
    check("session id that doesn't exist: nobody is host (403)", await rawAs("p1", "som", { action: "deal", sid: "ZZZZZ9", gid: "sabcdefgh1", round: 1, uids: ["u_p1", "u_p2"] }) === 403);
    { const st = await rawAs("fan", "som", { action: "hand", sid: SID, gid: "sotherxx1", round: 1 }); check("a hand for another game id is refused (409)", st === 409, st); }
    await sleep(300);
    await p2.screenshot({ path: out + "/1-som-attendee.png" }); await p1.screenshot({ path: out + "/2-som-host.png" });
    /* السوم يقفل: المضيف يسكّر الطاولة */
    await p1.evaluate(() => somDo({ t: "close" }));
    check("host closes the table", !!await until(() => !gs("som").active, 4000));

    /* ===== برا السالفة ===== */
    await p1.evaluate(() => { if (somIsOpen) somClose(true); });
    await p1.click(".sj-gbtns button:last-child");
    check("bara table opened under the session", !!await until(() => gs("bara") && gs("bara").phase === "lobby" && gs("bara").active, 5000));
    check("nothing written to the voice-room bara doc", !db.data("room/main/games/bara"));
    for (const pg of [p2, fan]) { await until(() => pg.evaluate(() => !!document.querySelector(".sj-games .bara-pill")), 4000); await pg.evaluate(() => baraOpen()); await until(() => pg.evaluate(() => !!document.querySelector("#baraScreen.open .bara-act .som-b")), 3000); await pg.evaluate(() => baraJoin()); await sleep(250); }
    await p1.evaluate(() => baraJoin());
    check("3 players joined bara", !!await until(() => gs("bara").pids.length === 3, 5000), gs("bara") && gs("bara").pids);
    await until(() => p1.evaluate(() => baraState && baraState.pids.length === 3), 4000);
    check("round starts by the session host", await (async () => { await p1.evaluate(() => baraHostRound()); return !!await until(() => gs("bara").phase === "ask" && gs("bara").round === 1, 6000); })(), gs("bara"));
    if (0) console.log("bara statuses", JSON.stringify(statuses.filter(x => x.action && /deal|role/.test(x.action) && x.who === "p1").slice(-3)), JSON.stringify(await p1.evaluate(() => [baraHostBusy, baraCatPick, baraState && baraState.phase])));
    check("plan sealed, word not in any document", /^v1\./.test(gs("bara").plan));
    const roles = {};
    for (const [w, pg] of Object.entries(devs)) { await until(() => pg.evaluate(() => baraRole && baraRole.key === baraKey(baraState)) || pg.evaluate(() => { baraFetchRole(); return false; }), 6000); await until(() => pg.evaluate(() => baraRole && baraRole.key === baraKey(baraState)), 6000); roles[w] = await pg.evaluate(() => ({ out: baraRole.out, word: baraRole.word || "" })); }
    const outs = Object.keys(roles).filter(w => roles[w].out);
    check("exactly one is outside, the others share one word", outs.length === 1 && new Set(Object.keys(roles).filter(w => !roles[w].out).map(w => roles[w].word)).size === 1, roles);
    const word = roles[Object.keys(roles).find(w => !roles[w].out)].word;
    check("the word is in no document", ![...db.docs.keys()].some(p => JSON.stringify(db.data(p)).includes(word)));
    /* نبدأ التصويت ونصوّت: الأصوات تحت الجلسة */
    await p1.evaluate(() => baraHostVote());
    await until(() => gs("bara").phase === "vote", 4000);
    await until(() => p2.evaluate(() => baraState && baraState.phase === "vote"), 4000);
    await p2.evaluate(() => baraVote("u_fan"));
    await until(() => [...db.docs.keys()].some(k => k.startsWith("sessions/" + SID + "/baraVotes/")), 4000);
    const vk = [...db.docs.keys()].filter(k => k.startsWith("sessions/" + SID + "/baraVotes/"));
    check("secret vote written under the session (not in the global baraVotes)", vk.length >= 1 && ![...db.docs.keys()].some(k => k.startsWith("baraVotes/")), vk);
    await p2.screenshot({ path: out + "/3-bara-attendee.png" });
    for (const [n, p] of Object.entries(devs)) check("no page errors on " + n, errs(p).length === 0, errs(p));
} finally { await browser.close(); srv.close && srv.close(); }
console.log(ok ? "ALL PASS" : "SOME FAILED");
process.exit(ok ? 0 : 1);
