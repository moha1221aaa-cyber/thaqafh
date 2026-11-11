/* قواعد Firestore (firestore.rules) بمحاكي Firebase: الحركات الصحيحة من كود الموقع تنقبل، والتلاعب ينرفض.
   المرحلة 2 (26 أكتوبر 2026): الغرفة والبث والسوم والحضور والتشخيص والتوقعات والإيميلات.
   التشغيل: cd tests/rules && npm i && npx firebase emulators:exec --only firestore --project masro7league "node rules.test.mjs" */
import fs from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const RULES = fs.readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const env = await initializeTestEnvironment({ projectId: "masro7league", firestore: { rules: RULES, host: "127.0.0.1", port: 8085 } });
const TS = () => firebase.firestore.FieldValue.serverTimestamp();
const DEL = () => firebase.firestore.FieldValue.delete();
const ADMIN = "moha1221aaa@gmail.com";
const ctx = {
    admin: env.authenticatedContext("u_admin", { email: ADMIN }).firestore(),
    p1: env.authenticatedContext("u_p1", { email: "p1@t.local" }).firestore(),
    p2: env.authenticatedContext("u_p2", { email: "p2@t.local" }).firestore(),
    fan: env.authenticatedContext("u_fan", { email: "fan@t.local" }).firestore(),
    guest: env.unauthenticatedContext().firestore()
};
let failed = 0;
async function ok(name, p) { try { await assertSucceeds(p); console.log("PASS " + name); } catch (e) { failed++; console.log("FAIL " + name + " → " + (e && e.message || e).split("\n")[0]); } }
async function no(name, p) { try { await assertFails(p); console.log("PASS " + name); } catch (e) { failed++; console.log("FAIL " + name + " (was allowed)"); } }
async function seed(path, data) { await env.withSecurityRulesDisabled(async c => { await c.firestore().doc(path).set(data); }); }

/* ===== وثيقة البث ===== */
const LIVE = "room/main/liveMatches/round_2";
const now = () => Date.now();
const live = extra => Object.assign({
    type: "round", status: "live", scene: "playing", phase: "buzz", cur: 0, qIndex: 1, v: 10, round: 2, hostUid: "u_admin",
    order: [{ p1: "سعد", p2: "فهد", uid1: "u_p1", uid2: "u_p2", s1: 0, s2: 0, state: "pending" }],
    questions: [{ text: "س1", seal: "x" }, { text: "س2", seal: "y" }], shown: {},
    ready1: false, ready2: false, buzzer: 0, answerer: 0, tried1: false, tried2: false, passed: false, lastAnswer: null, outcome: 0,
    s1: 1, s2: 0, log: [1, -1, -1, -1, -1], fb1: 0, fb2: 0, bh1: 0, bh2: 0, qAt: now() - 2000, deadline: now() + 13000
}, extra || {});
const L = db => db.doc(LIVE);
const stamp = (u, v) => Object.assign(u, { v: (v || 10) + 1, updatedAt: TS() });

await seed(LIVE, live({ scene: "intro", phase: "wait" }));
await ok("p1 ready (own)", L(ctx.p1).update(stamp({ ready1: true })));
await seed(LIVE, live({ scene: "intro", phase: "wait", ready1: true }));
await ok("p2 ready → both ready → talk", L(ctx.p2).update(stamp({ ready2: true, scene: "talk", sceneAt: now() })));
await seed(LIVE, live({ scene: "intro", phase: "wait" }));
await no("p1 marks p2 ready", L(ctx.p1).update(stamp({ ready2: true })));
await no("p1 skips to talk without p2", L(ctx.p1).update(stamp({ ready1: true, scene: "talk", sceneAt: now() })));
await no("fan ready", L(ctx.fan).update(stamp({ ready1: true })));
await no("v not bumped", L(ctx.p1).update({ ready1: true, updatedAt: TS() }));

/* الجرس */
const buzz = n => stamp({ phase: "answer", buzzer: n, answerer: n, passed: false, deadline: now() + 7000, ansAt: now(), ["tried" + n]: true, ["fb" + n]: 2100 });
await seed(LIVE, live());
await ok("p1 buzz", L(ctx.p1).update(buzz(1)));
await seed(LIVE, live());
await ok("p2 buzz", L(ctx.p2).update(buzz(2)));
await seed(LIVE, live());
await no("p2 buzzes as player 1", L(ctx.p2).update(buzz(1)));
await no("fan buzz", L(ctx.fan).update(buzz(1)));
await no("guest buzz", L(ctx.guest).update(buzz(1)));
await no("p1 buzz + score", L(ctx.p1).update(Object.assign(buzz(1), { s1: 5 })));
await no("p1 buzz with a long answer time", L(ctx.p1).update(Object.assign(buzz(1), { deadline: now() + 60000 })));
await seed(LIVE, live({ deadline: now() - 10000 }));
await no("p1 buzz after the time is over", L(ctx.p1).update(buzz(1)));
await seed(LIVE, live({ phase: "answer", buzzer: 2, answerer: 2, tried2: true }));
await no("p1 buzz while p2 answers", L(ctx.p1).update(buzz(1)));

/* النقاط والنتائج: المنظم بس */
await seed(LIVE, live({ phase: "answer", buzzer: 1, answerer: 1, tried1: true, deadline: now() + 5000 }));
const reveal = (w, extra) => stamp(Object.assign({ phase: "reveal", outcome: w, log: [1, w, -1, -1, -1], deadline: now() + 6500, pend: null, lastAnswer: { by: 1, text: "", correct: w === 1 }, bh1: 0, bh2: 0 }, extra || {}));
await no("p1 judges himself correct", L(ctx.p1).update(reveal(1, { s1: 2 })));
await no("fan awards a point", L(ctx.fan).update(reveal(1, { s1: 2 })));
await ok("admin verdict correct (+1)", L(ctx.admin).update(reveal(1, { s1: 2 })));
await seed(LIVE, live());
await no("p1 rewrites the match order (results)", L(ctx.p1).update(stamp({ order: [{ uid1: "u_p1", uid2: "u_p2", s1: 5, s2: 0, state: "done" }] })));
await no("p1 rewrites questions", L(ctx.p1).update(stamp({ questions: [] })));
await no("p1 writes shown answers", L(ctx.p1).update(stamp({ shown: { "0_1": "x" } })));
await no("p1 ends the broadcast", L(ctx.p1).update(stamp({ status: "ended" })));
await no("p1 jumps to the next match", L(ctx.p1).update(stamp({ cur: 1, scene: "intro" })));
await no("fan creates a broadcast", ctx.fan.doc("room/main/liveMatches/round_9").set(live()));
await ok("admin creates a broadcast", ctx.admin.doc("room/main/liveMatches/round_9").set(live()));
await no("fan deletes a broadcast", ctx.fan.doc("room/main/liveMatches/round_9").delete());

/* انتهاء الوقت: أي أحد مسجّل، بس بعد وقته */
await seed(LIVE, live({ deadline: now() - 500 }));
await ok("fan: buzz time over → reveal with no points", L(ctx.fan).update(reveal(0, { lastAnswer: null })));
await seed(LIVE, live({ deadline: now() + 9000 }));
await no("fan: early reveal (time not over)", L(ctx.fan).update(reveal(0, { lastAnswer: null })));
await seed(LIVE, live({ deadline: now() - 500 }));
await no("fan: timeout reveal that marks a winner", L(ctx.fan).update(reveal(1, { lastAnswer: null })));
await no("fan: timeout reveal that rewrites old log entries", L(ctx.fan).update(reveal(0, { lastAnswer: null, log: [2, 0, -1, -1, -1] })));
await no("fan: timeout reveal with fake comeback stat", L(ctx.fan).update(reveal(0, { lastAnswer: null, bh2: 3 })));
await seed(LIVE, live({ phase: "answer", buzzer: 1, answerer: 1, tried1: true, deadline: now() - 500 }));
const pass = extra => stamp(Object.assign({ phase: "answer", answerer: 2, passed: true, lastAnswer: { by: 1, text: "", correct: false, timeout: true }, deadline: now() + 7000, ansAt: now(), pend: null, tried2: true }, extra || {}));
await ok("fan: answer time over → passes to p2", L(ctx.fan).update(pass()));
await no("fan: pass marked correct", L(ctx.fan).update(pass({ lastAnswer: { by: 1, correct: true } })));
await no("fan: pass back to the same player", L(ctx.fan).update(pass({ answerer: 1, tried1: true, tried2: DEL() })));
/* 27 أكتوبر 2026: علامة انتهاء الوقت (to1/to2) عشان المقدم يثبّت الجواب بعدها (bcHostLateOk) */
const ansOver = () => seed(LIVE, live({ phase: "answer", buzzer: 1, answerer: 1, tried1: true, deadline: now() - 500 }));
await ansOver(); await no("fan: timeout mark for the other player", L(ctx.fan).update(pass({ to2: "0_1" })));
await ansOver(); await no("fan: timeout mark for another question", L(ctx.fan).update(pass({ to1: "9_9" })));
await ansOver(); await ok("fan: pass with the timeout mark (to1) for this question", L(ctx.fan).update(pass({ to1: "0_1" })));
await seed(LIVE, live({ phase: "answer", buzzer: 1, answerer: 2, tried1: true, tried2: true, passed: true, deadline: now() - 500, to1: "0_1" }));
await ok("fan: p2 time over too → reveal with to2", L(ctx.fan).update(reveal(0, { lastAnswer: { by: 2, text: "", correct: false, timeout: true }, to2: "0_1" })));
await seed(LIVE, live({ phase: "answer", buzzer: 1, answerer: 1, tried1: true, tried2: true, passed: true, deadline: now() - 500 }));
await ok("fan: both tried, time over → reveal", L(ctx.fan).update(reveal(0, { lastAnswer: { by: 2, text: "", correct: false, timeout: true } })));
await seed(LIVE, live({ scene: "countdown", phase: "wait", qIndex: 0, deadline: now() - 300 }));
const firstQ = () => stamp({ scene: "playing", qIndex: 0, phase: "buzz", buzzer: 0, answerer: 0, tried1: false, tried2: false, passed: false, lastAnswer: null, outcome: 0, qAt: now(), deadline: now() + 15000 });
await ok("fan: countdown over → first question", L(ctx.fan).update(firstQ()));
await seed(LIVE, live({ scene: "countdown", phase: "wait", qIndex: 0, deadline: now() + 3000 }));
await no("fan: first question before the countdown ends", L(ctx.fan).update(firstQ()));
await seed(LIVE, live({ scene: "talk", phase: "wait" }));
await no("p1 starts the countdown (host only)", L(ctx.p1).update(stamp({ scene: "countdown", deadline: now() + 3500 })));
await ok("admin heartbeat", L(ctx.admin).update({ hostSeen: now() }));
await no("p1 heartbeat", L(ctx.p1).update({ hostSeen: now() }));
await no("rx doc by a fan", ctx.fan.doc("room/main/liveMatches/rx_round_2").set({ type: "rx", n: 1 }));

/* ثغرات المراجعة الأمنية (security-auditor، 26 أكتوبر): حرق السؤال، تقديم الوقت، تثبيت قيم غلط */
await seed(LIVE, live());
await no("p1 buzz with deadline 0 (to burn the question)", L(ctx.p1).update(Object.assign(buzz(1), { deadline: 0 })));
await seed(LIVE, live({ deadline: now() - 500 }));
await no("fan: reveal with an instant deadline", L(ctx.fan).update(reveal(0, { lastAnswer: null, deadline: 0 })));
await seed(LIVE, live({ phase: "answer", buzzer: 1, answerer: 1, tried1: true, deadline: now() - 500 }));
await no("fan: reveal before p2 got the question (skips the pass)", L(ctx.fan).update(reveal(0, { lastAnswer: { by: 1, text: "", correct: false, timeout: true } })));
await seed(LIVE, live({ phase: "answer", buzzer: 1, answerer: 2, tried1: true, tried2: true, passed: true, deadline: now() - 500 }));
await no("fan: pass back to p1 who already tried", L(ctx.fan).update(pass({ answerer: 1, tried1: true, tried2: DEL() })));
await seed(LIVE, live({ deadline: now() + 1500 }));
await no("fan: reveal 1.5 s before the time is over", L(ctx.fan).update(reveal(0, { lastAnswer: null })));
await seed(LIVE, live({ scene: "countdown", phase: "wait", qIndex: 0, deadline: now() - 300 }));
await no("fan: first question with both players locked out", L(ctx.fan).update(Object.assign(firstQ(), { tried1: true, tried2: true })));
await no("fan: first question with a fake correct answer", L(ctx.fan).update(Object.assign(firstQ(), { lastAnswer: { by: 1, text: "", correct: true } })));
await no("fan: first question with a 1-second buzz window", L(ctx.fan).update(Object.assign(firstQ(), { deadline: now() + 1000 })));
await seed(LIVE, live({ deadline: now() - 500 }));
await no("fan: timeout reveal with a big text in lastAnswer", L(ctx.fan).update(reveal(0, { lastAnswer: { by: 1, text: "x".repeat(5000), correct: false, timeout: true } })));
await no("fan: timeout reveal that truncates the log", L(ctx.fan).update(reveal(0, { lastAnswer: null, log: [1, 0] })));
await seed(LIVE, live({ deadline: now() - 500, bh1: 2 }));
await no("fan: timeout reveal that lowers a comeback stat", L(ctx.fan).update(reveal(0, { lastAnswer: null, bh1: 0 })));
await seed(LIVE, live());
await no("p1 buzz with a fake buzz speed", L(ctx.p1).update(Object.assign(buzz(1), { fb1: 1 })));

/* صناديق الأسئلة والتشخيص والتوقعات */
await no("fan writes question boxes", ctx.fan.doc("room/main/liveBoxes/round_2").set({ boxes: [] }));
await ok("admin writes question boxes", ctx.admin.doc("room/main/liveBoxes/round_2").set({ boxes: ["v1.x"], at: 1 }));
const DIAG = "room/main/liveDiag/round_2";
await ok("p1 diag (create)", ctx.p1.doc(DIAG).set({ bcDiag: { u_p1: { buzz: [{ at: 1, local: 20 }] } }, at: 1 }, { merge: true }));
await ok("p2 diag (merge)", ctx.p2.doc(DIAG).set({ bcDiag: { u_p2: { buzz: [{ at: 2 }] } }, at: 2 }, { merge: true }));
await no("p2 overwrites p1 diag", ctx.p2.doc(DIAG).set({ bcDiag: { u_p1: { buzz: [] } }, at: 3 }, { merge: true }));
await no("p1 writes extra fields in diag", ctx.p1.doc(DIAG).set({ hack: 1 }, { merge: true }));
await no("fan writes question history", ctx.fan.doc("room/main/liveDiag/_qhistory").set({ bcDiag: { u_fan: {} } }));
await ok("fan prediction (own doc)", ctx.fan.doc("room/main/livePred/round_2/u/u_fan").set({ p: { c0: 1 }, name: "مشاهد" }, { merge: true }));
await no("fan prediction in p1's doc", ctx.fan.doc("room/main/livePred/round_2/u/u_p1").set({ p: { c0: 2 }, name: "x" }));
await no("guest prediction", ctx.guest.doc("room/main/livePred/round_2/u/g").set({ p: { c0: 1 } }));
await no("fan writes the old prediction map", ctx.fan.doc("room/main/livePred/round_2").set({ c0: { u_fan: { n: 1 } } }));

/* ===== الغرفة ===== */
const ROOM = "room/main";
const mics = (over) => { const m = Array(15).fill(null); Object.assign(m, over || {}); return m; };
const room = extra => Object.assign({ isLive: true, hostUid: "u_admin", hostName: "محمد", mics: mics({ 2: { uid: "u_admin", name: "محمد", avatar: "", muted: false }, 5: { uid: "u_p2", name: "فهد", avatar: "", muted: false } }),
    chat: [{ senderUid: "u_p2", senderName: "فهد", text: "هلا", time: "1" }], pinnedMsg: null, game: { active: true, status: "running", qText: "س", s1: 0, s2: 0, p1Name: "أ", p2Name: "ب" } }, extra || {});
const R = db => db.doc(ROOM);
const seat = (uid, muted) => ({ uid, name: "x", avatar: "", muted: !!muted });
await seed(ROOM, room());
await ok("p1 takes an empty seat", R(ctx.p1).update({ mics: mics({ 2: room().mics[2], 5: room().mics[5], 7: seat("u_p1") }) }));
await seed(ROOM, room());
await no("p1 takes p2's seat", R(ctx.p1).update({ mics: mics({ 2: room().mics[2], 5: seat("u_p1") }) }));
await no("p1 kicks p2", R(ctx.p1).update({ mics: mics({ 2: room().mics[2] }) }));
await no("p1 sits as someone else", R(ctx.p1).update({ mics: mics({ 2: room().mics[2], 5: room().mics[5], 7: seat("u_fan") }) }));
await ok("p2 mutes own seat", R(ctx.p2).update({ mics: mics({ 2: room().mics[2], 5: seat("u_p2", true) }) }));
await ok("p2 leaves own seat", R(ctx.p2).update({ mics: mics({ 2: room().mics[2] }) }));
await seed(ROOM, room({ isLive: false }));
await no("p1 takes a seat while the room is closed", R(ctx.p1).update({ mics: mics({ 2: room().mics[2], 5: room().mics[5], 7: seat("u_p1") }) }));
await seed(ROOM, room());
const msg = (uid, t) => ({ senderUid: uid, senderName: "x", text: t || "مرحبا", time: "2" });
await ok("p1 sends a chat message", R(ctx.p1).update({ chat: room().chat.concat([msg("u_p1")]) }));
await seed(ROOM, room());
await no("p1 sends as p2", R(ctx.p1).update({ chat: room().chat.concat([msg("u_p2")]) }));
await no("p1 deletes p2's message", R(ctx.p1).update({ chat: [msg("u_p1")] }));
await no("p1 edits p2's message", R(ctx.p1).update({ chat: [msg("u_p2", "تعديل"), msg("u_p1")] }));
await no("guest sends chat", R(ctx.guest).update({ chat: room().chat.concat([msg("g")]) }));
const full = Array.from({ length: 50 }, (_, i) => msg("u_p2", "م" + i));
await seed(ROOM, room({ chat: full }));
await ok("p1 message on a full chat (oldest drops)", R(ctx.p1).update({ chat: full.slice(1).concat([msg("u_p1")]) }));
await seed(ROOM, room());
await no("p1 wipes the chat (keeps only his message)", R(ctx.p1).update({ chat: [msg("u_p1")] }));
await no("p1 takes two seats", R(ctx.p1).update({ mics: mics({ 2: room().mics[2], 5: room().mics[5], 7: seat("u_p1"), 8: seat("u_p1") }) }));
await seed(ROOM, room({ mics: mics({ 5: room().mics[5] }) }));
await no("p1 takes the host seat", R(ctx.p1).update({ mics: mics({ 2: seat("u_p1"), 5: room().mics[5] }) }));
await seed(ROOM, (() => { const r = room(); delete r.chat; return r; })());
await ok("p1 takes a seat in a room doc with no chat field", R(ctx.p1).update({ mics: mics({ 2: room().mics[2], 5: room().mics[5], 7: seat("u_p1") }) }));
await ok("p1 first message in a room doc with no chat field", R(ctx.p1).update({ chat: [msg("u_p1")] }));
await seed(ROOM, room());
await no("p1 writes a huge game answer", R(ctx.p1).update({ "game.revealText1": "x".repeat(500) }));
await ok("p1 answers the room game", R(ctx.p1).update({ "game.revealText1": "الرياض" }));
await no("p1 gives himself game points", R(ctx.p1).update({ "game.s1": 3 }));
await no("p1 opens the room", R(ctx.p1).update({ isLive: true, hostUid: "u_p1" }));
await no("p1 pins a message", R(ctx.p1).update({ pinnedMsg: "x" }));
await no("p1 writes a question bank", R(ctx.p1).update({ qbank: [{ text: "س", answer: "ج" }] }));
await no("p1 changes the room ID", R(ctx.p1).update({ accessId: "123" }));
await ok("admin writes the whole room", R(ctx.admin).set(room({ pinnedMsg: "تثبيت" }), { merge: true }));
await seed(ROOM, room({ game: { active: false } }));
await no("p1 answers a finished game", R(ctx.p1).update({ "game.revealText1": "x" }));

/* الحضور */
const pres = { name: "سعد", photoURL: "", isAdmin: false, lastSeen: TS() };
await ok("p1 presence (own)", ctx.p1.doc("room/main/presence/u_p1").set(pres, { merge: true }));
await no("p1 presence as p2", ctx.p1.doc("room/main/presence/u_p2").set(pres));
await no("p1 presence claiming admin", ctx.p1.doc("room/main/presence/u_p1").set(Object.assign({}, pres, { isAdmin: true })));
await ok("guest presence", ctx.guest.doc("room/main/presence/guest_gabc123xyz").set(pres, { merge: true }));
await no("guest presence on a user's doc", ctx.guest.doc("room/main/presence/u_p1").set(pres));
await ok("p1 removes own presence", ctx.p1.doc("room/main/presence/u_p1").delete());

/* ===== السوم ===== */
const SOM = "room/main/games/som";
const som = extra => Object.assign({ active: true, gid: "sabc123", phase: "bid", hostUid: "u_admin", deal: "v1.deal", players: [{ uid: "u_p1", bal: 10000 }, { uid: "u_p2", bal: 10000 }],
    pids: ["u_p1", "u_p2"], bids: {}, v: 3 }, extra || {});
await seed(SOM, som());
await ok("som: player bids", ctx.p1.doc(SOM).set(som({ bids: { u_p1: 500 }, v: 4 })));
await seed(SOM, som());
await no("som: outsider writes", ctx.fan.doc(SOM).set(som({ bids: { u_fan: 500 } })));
await no("som: player swaps the sealed cards", ctx.p1.doc(SOM).set(som({ deal: "v1.other" })));
await no("som: player adds an outsider", ctx.p1.doc(SOM).set(som({ pids: ["u_p1", "u_p2", "u_fan"] })));
await no("som: player closes the table", ctx.p1.doc(SOM).set(som({ active: false })));
await seed(SOM, som({ phase: "lobby" }));
await ok("som: fan joins the lobby", ctx.fan.doc(SOM).set(som({ phase: "lobby", pids: ["u_p1", "u_p2", "u_fan"], players: som().players.concat([{ uid: "u_fan", bal: 10000 }]) })));
await seed(SOM, som({ phase: "lobby" }));
await ok("som: player leaves the lobby", ctx.p2.doc(SOM).set(som({ phase: "lobby", pids: ["u_p1"], players: [som().players[0]] })));
await seed(SOM, som());
await no("som: fan joins mid-game", ctx.fan.doc(SOM).set(som({ pids: ["u_p1", "u_p2", "u_fan"] })));
await seed(SOM, som({ round: 2, seats: ["u_p1", "u_p2"], starter: "u_p1" }));
await no("som: player changes the round", ctx.p1.doc(SOM).set(som({ round: 3, seats: ["u_p1", "u_p2"], starter: "u_p1" })));
await no("som: player changes who starts", ctx.p1.doc(SOM).set(som({ round: 2, seats: ["u_p1", "u_p2"], starter: "u_p2" })));
await no("som: player replaces a player (same pids)", ctx.p1.doc(SOM).set(som({ round: 2, seats: ["u_p1", "u_p2"], starter: "u_p1", players: [som().players[0], { uid: "u_fan", bal: 10000 }] })));
await ok("som: player bids (round 2)", ctx.p1.doc(SOM).set(som({ round: 2, seats: ["u_p1", "u_p2"], starter: "u_p1", bids: { u_p1: 600 } })));
await ok("som: admin opens a new table", ctx.admin.doc(SOM).set(som({ gid: "snew999", phase: "lobby", pids: [], players: [] })));
await no("som: anything else under room by a fan", ctx.fan.doc("room/main/games/other").set({ x: 1 }));

/* ===== الإيميلات ===== */
await ok("contacts: own email", ctx.p1.doc("contacts/u_p1").set({ email: "p1@t.local" }, { merge: true }));
await no("contacts: someone else's email", ctx.p1.doc("contacts/u_p1").set({ email: "other@t.local" }));
await no("contacts: writing another user's contact", ctx.p1.doc("contacts/u_p2").set({ email: "p1@t.local" }));
await no("contacts: reading another user's email", ctx.p2.doc("contacts/u_p1").get());
await ok("contacts: reading own email", ctx.p1.doc("contacts/u_p1").get());
await ok("contacts: admin reads all", ctx.admin.collection("contacts").get());
await no("contacts: guest reads", ctx.guest.collection("contacts").get());
await no("users: new account with email in the public doc", ctx.p1.doc("users/u_p1").set({ name: "سعد", email: "p1@t.local" }));
await ok("users: new account without email", ctx.p1.doc("users/u_p1").set({ name: "سعد" }));
await seed("users/u_p2", { name: "فهد", email: "p2@t.local" });
await ok("users: legacy doc with email, rename", ctx.p2.doc("users/u_p2").set({ name: "فهد 2" }, { merge: true }));
await ok("users: removing the legacy email", ctx.p2.doc("users/u_p2").update({ email: DEL() }));
await no("users: adding email back", ctx.p2.doc("users/u_p2").update({ email: "p2@t.local" }));
await no("predictions: new with userEmail", ctx.p1.doc("predictions/u_p1_m1").set({ userId: "u_p1", matchId: "m1", s1: 1, s2: 0, userEmail: "p1@t.local" }));
await ok("predictions: new without email", ctx.p1.doc("predictions/u_p1_m1").set({ userId: "u_p1", matchId: "m1", s1: 1, s2: 0 }));
await no("predictions: in someone else's name", ctx.p1.doc("predictions/u_p2_m1").set({ userId: "u_p2", matchId: "m1", s1: 1, s2: 0 }));
/* توقعات الموسم (11 نوفمبر 2026، predict.js): 0 تعادل أو 1 أو 2، ووقت كل توقع ساعة السيرفر */
const PD = db => db.doc("predictions/u_fan_r2_سعد_فهد");
const pbase = x => Object.assign({ userId: "u_fan", matchId: "r2_سعد_فهد", name: "مشاهد", updatedAt: TS() }, x);
await ok("pred: winner draw with server time", PD(ctx.fan).set(pbase({ w: 0, tw: TS() }), { merge: true }));
await ok("pred: segment pick with its time", PD(ctx.fan).set(pbase({ g2: 1, t2: TS() }), { merge: true }));
await ok("pred: change the winner (new time)", PD(ctx.fan).set(pbase({ w: 2, tw: TS() }), { merge: true }));
await no("pred: pick without its time", PD(ctx.fan).set(pbase({ g3: 1 }), { merge: true }));
await no("pred: old time (before the lock)", PD(ctx.fan).set(pbase({ w: 1, tw: new Date(Date.now() - 3600000) }), { merge: true }));
await no("pred: moving the time back alone", PD(ctx.fan).set({ tw: new Date(Date.now() - 3600000) }, { merge: true }));
await no("pred: time refresh without changing the pick", PD(ctx.fan).set({ tw: TS() }, { merge: true }));
await no("pred: value 3", PD(ctx.fan).set(pbase({ g4: 3, t4: TS() }), { merge: true }));
await no("pred: doc id not matching the match", ctx.fan.doc("predictions/u_fan_other").set(pbase({ w: 1, tw: TS() })));
await no("pred: fake updatedAt", PD(ctx.fan).set(pbase({ w: 1, tw: TS(), updatedAt: new Date(0) }), { merge: true }));
await no("pred: guest", ctx.guest.doc("predictions/x_r2_سعد_فهد").set({ userId: "x", matchId: "r2_سعد_فهد", w: 1, tw: TS() }));
await no("pred board: viewer writes the season board", ctx.fan.doc("league/predBoard").set({ u: { u_fan: { n: "x", p: 999, c: 9, a: 9 } } }));
await ok("pred board: admin writes", ctx.admin.doc("league/predBoard").set({ u: {}, k: [], at: TS() }));
await no("pred res: viewer writes the lock times", ctx.fan.doc("league/predRes").set({ k: {} }));

/* ===== اللي ما تغيّر ===== */
await no("league: player writes the table", ctx.p1.doc("league/current").set({ matches: [] }));
await ok("league: everyone reads", ctx.guest.doc("league/current").get());
await no("liveSecrets: player reads", ctx.p1.doc("liveSecrets/round_2").get());
await no("liveSecrets: player reads the room question bank", ctx.p1.doc("liveSecrets/_roombank").get());
await no("private broadcast (liveSecrets/rehearsal): player reads", ctx.p1.doc("liveSecrets/rehearsal").get());
await no("private broadcast: player writes", ctx.p1.doc("liveSecrets/rehearsal").set({ status: "live" }));
await ok("private broadcast: admin writes", ctx.admin.doc("liveSecrets/rehearsal").set({ type: "round", status: "live", rehearsal: 1 }));
await ok("liveSecrets: admin writes the room question bank", ctx.admin.doc("liveSecrets/_roombank").set({ items: [{ text: "س", answer: "ج" }] }));
await ok("room: everyone reads", ctx.guest.doc(ROOM).get());

/* ===== برا السالفة (27 أكتوبر 2026): الردهة لكل لاعب حقه بس، والأصوات سرية ===== */
const BARA = "room/main/games/bara";
const p3 = env.authenticatedContext("u_p3", { email: "p3@t.local" }).firestore();
const bp = (name, score) => ({ name, av: "", score: score || 0 });
const bara = extra => Object.assign({ active: true, gid: "babc1234", phase: "lobby", hostUid: "u_admin", hostName: "محمد", pids: ["u_p1", "u_p2"],
    players: { u_p1: bp("سعد"), u_p2: bp("فهد") }, rounds: 5, round: 0, cat: "", catName: "", plan: "", asks: [], turn: 0, laps: 0, voted: [], res: null, log: [], v: 3, at: 1 }, extra || {});
const withP = (b, uid, entry) => Object.assign({}, b, { pids: b.pids.concat([uid]), players: Object.assign({}, b.players, { [uid]: entry }) });
await seed(BARA, bara());
await ok("bara: fan joins the lobby", ctx.fan.doc(BARA).set(withP(bara(), "u_fan", bp("مشاهد"))));
await seed(BARA, bara());
await no("bara: fan joins with points", ctx.fan.doc(BARA).set(withP(bara(), "u_fan", bp("مشاهد", 500))));
await no("bara: fan joins as someone else", ctx.fan.doc(BARA).set(withP(bara(), "u_p3", bp("مشاهد"))));
await no("bara: fan joins and changes another player", ctx.fan.doc(BARA).set(Object.assign(withP(bara(), "u_fan", bp("مشاهد")), { players: { u_p1: bp("سعد", 900), u_p2: bp("فهد"), u_fan: bp("مشاهد") } })));
await no("bara: fan joins and starts the game", ctx.fan.doc(BARA).set(Object.assign(withP(bara(), "u_fan", bp("مشاهد")), { phase: "ask" })));
await no("bara: fan joins with extra fields", ctx.fan.doc(BARA).set(withP(bara(), "u_fan", Object.assign(bp("مشاهد"), { out: true }))));
await no("bara: guest joins", ctx.guest.doc(BARA).set(withP(bara(), "u_fan", bp("مشاهد"))));
await ok("bara: player leaves the lobby", ctx.p2.doc(BARA).set(bara({ pids: ["u_p1"], players: { u_p1: bp("سعد") } })));
await seed(BARA, bara());
await no("bara: player removes someone else", ctx.p1.doc(BARA).set(bara({ pids: ["u_p1"], players: { u_p1: bp("سعد") } })));
const ten = {}; const tenIds = Array.from({ length: 10 }, (_, i) => "u_t" + i); tenIds.forEach(u => { ten[u] = bp(u); });
await seed(BARA, bara({ pids: tenIds, players: ten }));
await no("bara: 11th player", ctx.fan.doc(BARA).set(withP(bara({ pids: tenIds, players: ten }), "u_fan", bp("مشاهد"))));
const game = extra => bara(Object.assign({ phase: "ask", round: 2, plan: "v1.plan", cat: "food", catName: "أكلات", pids: ["u_p1", "u_p2", "u_fan"],
    players: { u_p1: bp("سعد", 100), u_p2: bp("فهد"), u_fan: bp("مشاهد") }, asks: [{ a: "u_p1", b: "u_p2" }, { a: "u_p2", b: "u_fan" }, { a: "u_fan", b: "u_p1" }], laps: 1 }, extra || {}));
await seed(BARA, game());
await no("bara: fan joins mid-game", p3.doc(BARA).set(withP(game(), "u_p3", bp("ثالث"))));
await no("bara: player raises his score", ctx.p1.doc(BARA).set(game({ players: { u_p1: bp("سعد", 999), u_p2: bp("فهد"), u_fan: bp("مشاهد") } })));
await no("bara: player swaps the sealed plan", ctx.p1.doc(BARA).set(game({ plan: "v1.other" })));
await no("bara: player starts the vote", ctx.p1.doc(BARA).set(game({ phase: "vote" })));
await no("bara: player moves the turn", ctx.p1.doc(BARA).update({ turn: 1 }));
await no("bara: player closes the table", ctx.p1.doc(BARA).update({ active: false }));
await ok("bara: admin moves the turn", ctx.admin.doc(BARA).update({ turn: 1, v: 4 }));
await ok("bara: everyone reads the table", ctx.guest.doc(BARA).get());

/* الأصوات */
const V = uid => "baraVotes/" + uid;
await seed(BARA, game({ phase: "vote" }));
const vote = (target, extra) => Object.assign({ gid: "babc1234", round: 2, target }, extra || {});
await ok("bara vote: player votes for another player", ctx.p1.doc(V("u_p1")).set(vote("u_p2")));
await ok("bara vote: player changes his vote", ctx.p1.doc(V("u_p1")).set(vote("u_fan")));
await no("bara vote: for himself", ctx.p1.doc(V("u_p1")).set(vote("u_p1")));
await no("bara vote: for someone not at the table", ctx.p1.doc(V("u_p1")).set(vote("u_p3")));
await no("bara vote: in someone else's name", ctx.p1.doc(V("u_p2")).set(vote("u_fan")));
await no("bara vote: not at the table", p3.doc(V("u_p3")).set(vote("u_p1")));
await no("bara vote: wrong round", ctx.p1.doc(V("u_p1")).set(vote("u_p2", { round: 1 })));
await no("bara vote: other game", ctx.p1.doc(V("u_p1")).set(vote("u_p2", { gid: "bzzz9999" })));
await no("bara vote: with a guess receipt", ctx.p1.doc(V("u_p1")).set(vote("u_p2", { g: "v1.x" })));
await no("bara vote: extra field", ctx.p1.doc(V("u_p1")).set(vote("u_p2", { out: "u_p2" })));
await ok("bara vote: owner reads his vote", ctx.p1.doc(V("u_p1")).get());
await no("bara vote: another player reads it (secret)", ctx.p2.doc(V("u_p1")).get());
await no("bara vote: guest reads it", ctx.guest.doc(V("u_p1")).get());
await no("bara vote: player lists all votes", ctx.p2.collection("baraVotes").get());
await ok("bara vote: admin lists all votes", ctx.admin.collection("baraVotes").where("gid", "==", "babc1234").get());
await seed(BARA, game({ phase: "ask" }));
await no("bara vote: before the vote starts", ctx.p2.doc(V("u_p2")).set(vote("u_p1")));
await seed(BARA, game({ phase: "guess" }));
await no("bara vote: changed after the reveal", ctx.p1.doc(V("u_p1")).set(vote("u_p2")));
await ok("bara guess: receipt keeps his vote", ctx.p1.doc(V("u_p1")).set(vote("u_fan", { g: "v1.receipt" })));
await no("bara guess: receipt drops his vote", ctx.p1.doc(V("u_p1")).set(vote(null, { g: "v1.receipt" })));
await ok("bara guess: receipt from someone who didn't vote", ctx.fan.doc(V("u_fan")).set(vote(null, { g: "v1.receipt" })));
await no("bara guess: empty receipt", ctx.p2.doc(V("u_p2")).set(vote(null, { g: "" })));
await no("bara guess: in someone else's name", ctx.p2.doc(V("u_fan")).set(vote(null, { g: "v1.r" })));
await no("bara vote: player deletes his vote", ctx.p1.doc(V("u_p1")).delete());

/* ===== البطولات الخاصة (8 نوفمبر 2026) ===== */
const PT = "privateTournaments/ABCD2345";
const ptData = extra => Object.assign({
    name: "بطولة الشلة", ownerUid: "u_p1", ownerName: "سعد", playersList: ["أ", "ب", "ج"],
    matches: [{ p1: "أ", p2: "ب", s1: "", s2: "", round: 1 }], double: true, createdAt: TS(), updatedAt: TS()
}, extra || {});
await no("ptour: guest creates", ctx.guest.doc(PT).set(ptData()));
await ok("ptour: user creates his own", ctx.p1.doc(PT).set(ptData()));
await no("ptour: user creates in someone else's name", ctx.p2.doc("privateTournaments/WXYZ2345").set(ptData()));
await no("ptour: bad code", ctx.p1.doc("privateTournaments/abc").set(ptData()));
await no("ptour: 1 player", ctx.p1.doc("privateTournaments/QQQQ2345").set(ptData({ playersList: ["أ"] })));
await no("ptour: 13 players", ctx.p1.doc("privateTournaments/QQQQ2346").set(ptData({ playersList: Array.from({ length: 13 }, (_, i) => "p" + i) })));
await no("ptour: extra field", ctx.p1.doc("privateTournaments/QQQQ2347").set(ptData({ admin: true })));
await no("ptour: empty name", ctx.p1.doc("privateTournaments/QQQQ2348").set(ptData({ name: "" })));
await ok("ptour: anyone gets it by code (guest)", ctx.guest.doc(PT).get());
await no("ptour: guest lists all", ctx.guest.collection("privateTournaments").get());
await no("ptour: other user lists all", ctx.p2.collection("privateTournaments").get());
await ok("ptour: owner lists his own", ctx.p1.collection("privateTournaments").where("ownerUid", "==", "u_p1").get());
await no("ptour: owner lists someone else's", ctx.p1.collection("privateTournaments").where("ownerUid", "==", "u_p2").get());
await ok("ptour: owner enters scores", ctx.p1.doc(PT).set({ matches: [{ p1: "أ", p2: "ب", s1: "3", s2: "1", round: 1 }], updatedAt: TS() }, { merge: true }));
await no("ptour: other user enters scores", ctx.p2.doc(PT).set({ matches: [{ p1: "أ", p2: "ب", s1: "9", s2: "0", round: 1 }], updatedAt: TS() }, { merge: true }));
await no("ptour: guest enters scores", ctx.guest.doc(PT).set({ matches: [], updatedAt: TS() }, { merge: true }));
await no("ptour: owner transfers it", ctx.p1.doc(PT).set({ ownerUid: "u_p2" }, { merge: true }));
await no("ptour: owner changes the players after the draw", ctx.p1.doc(PT).set({ playersList: ["أ", "ب"] }, { merge: true }));
await no("ptour: other user deletes", ctx.p2.doc(PT).delete());
await ok("ptour: owner deletes", ctx.p1.doc(PT).delete());

/* ===== الجلسات الحضورية (8 نوفمبر 2026) ===== */
const SS = "sessions/JKLM23";
const sessData = extra => Object.assign({ title: "ليلة ثقافة", place: "استراحة", hostUid: "u_p1", hostName: "سعد", status: "open", createdAt: TS() }, extra || {});
const MEM = (sid, uid) => "sessions/" + sid + "/members/" + uid;
const memData = extra => Object.assign({ name: "فهد", pts: 0, joinedAt: TS() }, extra || {});
await no("session: guest opens", ctx.guest.doc(SS).set(sessData()));
await ok("session: user opens his own", ctx.p1.doc(SS).set(sessData()));
await no("session: opens in someone else's name", ctx.p2.doc("sessions/NNNN23").set(sessData()));
await no("session: bad code", ctx.p1.doc("sessions/abc").set(sessData()));
await no("session: opens already ended", ctx.p1.doc("sessions/NNNN24").set(sessData({ status: "ended" })));
await no("session: extra field", ctx.p1.doc("sessions/NNNN25").set(sessData({ vip: true })));
await ok("session: anyone gets it by code", ctx.guest.doc(SS).get());
await no("session: guest lists all", ctx.guest.collection("sessions").get());
await ok("session: host lists his own", ctx.p1.collection("sessions").where("hostUid", "==", "u_p1").get());
await ok("member: attendee joins himself with 0 points", ctx.p2.doc(MEM("JKLM23", "u_p2")).set(memData()));
await no("member: attendee joins with points", ctx.fan.doc(MEM("JKLM23", "u_fan")).set(memData({ pts: 50 })));
await no("member: attendee joins in someone else's name", ctx.fan.doc(MEM("JKLM23", "u_p2")).set(memData()));
await no("member: guest joins", ctx.guest.doc(MEM("JKLM23", "u_guest")).set(memData()));
await ok("member: host adds a guest attendee", ctx.p1.doc(MEM("JKLM23", "g_AB23CD45")).set(memData({ name: "ضيف" })));
await no("member: non-host adds a guest attendee", ctx.p2.doc(MEM("JKLM23", "g_ZZ23CD45")).set(memData({ name: "ضيف" })));
await no("member: extra field", ctx.p1.doc(MEM("JKLM23", "g_XX23CD45")).set(memData({ admin: true })));
await ok("member: host gives points", ctx.p1.doc(MEM("JKLM23", "u_p2")).update({ pts: 3 }));
await no("member: attendee gives himself points", ctx.p2.doc(MEM("JKLM23", "u_p2")).update({ pts: 99 }));
await no("member: host sets absurd points", ctx.p1.doc(MEM("JKLM23", "u_p2")).update({ pts: 1000000 }));
await ok("member: attendee renames himself", ctx.p2.doc(MEM("JKLM23", "u_p2")).update({ name: "فهد 2" }));
await ok("member: anyone reads the board", ctx.guest.collection("sessions/JKLM23/members").get());
await no("member: other attendee deletes him", ctx.fan.doc(MEM("JKLM23", "u_p2")).delete());
await ok("member: attendee leaves", ctx.p2.doc(MEM("JKLM23", "u_p2")).delete());
await ok("member: host removes a guest", ctx.p1.doc(MEM("JKLM23", "g_AB23CD45")).delete());
await no("session: other user ends it", ctx.p2.doc(SS).update({ status: "ended" }));
await no("session: host transfers it", ctx.p1.doc(SS).update({ hostUid: "u_p2" }));
await ok("session: host ends it", ctx.p1.doc(SS).update({ status: "ended", endedAt: TS() }));
await no("member: joins after it ended", ctx.fan.doc(MEM("JKLM23", "u_fan")).set(memData()));
await no("member: host gives points after it ended", ctx.p1.doc(MEM("JKLM23", "u_p1")).set(memData({ pts: 1 })));
await no("session: other user deletes", ctx.p2.doc(SS).delete());
await ok("session: host deletes", ctx.p1.doc(SS).delete());

/* ===== ألعاب الجلسة: السوم وبرا السالفة (8 نوفمبر 2026) ===== */
await seed("sessions/GAME23", { title: "ج", place: "استراحة", hostUid: "u_p1", hostName: "سعد", status: "open" });
const SG = (g) => "sessions/GAME23/games/" + g;
const somG = extra => Object.assign({ active: true, gid: "sgame0001", hostUid: "u_p1", hostName: "سعد", phase: "lobby", round: 0, maxRounds: 10, seats: [], starter: "", shown: [], deal: "", pids: ["u_p1"], players: [{ uid: "u_p1", name: "سعد", av: "", bal: 10000 }] }, extra || {});
await ok("sgame som: session host (not admin) opens the table", ctx.p1.doc(SG("som")).set(somG()));
await no("sgame som: other user opens the table", ctx.p2.doc("sessions/GAME23/games/som2").set(somG()));
await ok("sgame som: attendee joins the lobby", ctx.p2.doc(SG("som")).set(somG({ pids: ["u_p1", "u_p2"], players: [{ uid: "u_p1", name: "سعد", av: "", bal: 10000 }, { uid: "u_p2", name: "فهد", av: "", bal: 10000 }] })));
await no("sgame som: attendee changes the round", ctx.p2.doc(SG("som")).set(somG({ round: 3, pids: ["u_p1", "u_p2"], players: [{ uid: "u_p1", name: "سعد", av: "", bal: 10000 }, { uid: "u_p2", name: "فهد", av: "", bal: 10000 }] })));
await ok("sgame som: anyone reads", ctx.guest.doc(SG("som")).get());
await ok("sgame som: platform admin keeps full access (catch-all rule)", ctx.admin.doc(SG("som")).set(somG({ phase: "bid" })));
const baraG = extra => Object.assign({ active: true, gid: "bgame0001", hostUid: "u_p1", hostName: "سعد", phase: "lobby", rounds: 5, round: 0, pids: ["u_p1"], players: { u_p1: { name: "سعد", av: "", score: 0 } } }, extra || {});
await ok("sgame bara: session host opens the table", ctx.p1.doc(SG("bara")).set(baraG()));
await ok("sgame bara: attendee joins the lobby", ctx.p2.doc(SG("bara")).set(baraG({ pids: ["u_p1", "u_p2"], players: { u_p1: { name: "سعد", av: "", score: 0 }, u_p2: { name: "فهد", av: "", score: 0 } } })));
await no("sgame bara: attendee gives himself score", ctx.p2.doc(SG("bara")).set(baraG({ pids: ["u_p1", "u_p2"], players: { u_p1: { name: "سعد", av: "", score: 0 }, u_p2: { name: "فهد", av: "", score: 500 } } })));
await seed(SG("bara"), baraG({ phase: "vote", round: 1, pids: ["u_p1", "u_p2", "u_fan"], players: { u_p1: { name: "a", av: "", score: 0 }, u_p2: { name: "b", av: "", score: 0 }, u_fan: { name: "c", av: "", score: 0 } } }));
const SV = u => "sessions/GAME23/baraVotes/" + u;
await ok("sgame bara vote: attendee votes for another", ctx.p2.doc(SV("u_p2")).set({ gid: "bgame0001", round: 1, target: "u_fan" }));
await no("sgame bara vote: for himself", ctx.p2.doc(SV("u_p2")).set({ gid: "bgame0001", round: 1, target: "u_p2" }));
await no("sgame bara vote: in someone else's name", ctx.fan.doc(SV("u_p2")).set({ gid: "bgame0001", round: 1, target: "u_p1" }));
await no("sgame bara vote: not at the table", ctx.guest.doc(SV("u_guest")).set({ gid: "bgame0001", round: 1, target: "u_p1" }));
await ok("sgame bara vote: owner reads his vote", ctx.p2.doc(SV("u_p2")).get());
await ok("sgame bara vote: session host reads it", ctx.p1.doc(SV("u_p2")).get());
await no("sgame bara vote: another attendee reads it (secret)", ctx.fan.doc(SV("u_p2")).get());
await ok("sgame bara vote: platform admin keeps full access (catch-all rule)", ctx.admin.doc(SV("u_p2")).get());
await ok("sgame bara vote: session host deletes votes", ctx.p1.doc(SV("u_p2")).delete());

/* ===== مجموعات البطولة الخاصة (8 نوفمبر 2026) ===== */
const GT = "privateTournaments/GRPS2345";
const grp = [{ n: "أ", p: ["أ", "ب", "ج"] }, { n: "ب", p: ["د", "هـ", "و"] }];
await ok("ptour groups: owner creates with 2 groups", ctx.p1.doc(GT).set(ptData({ playersList: ["أ", "ب", "ج", "د", "هـ", "و"], groups: grp, matches: [{ p1: "أ", p2: "ب", s1: "", s2: "", round: 1, g: 0 }] })));
await no("ptour groups: more than 8 groups", ctx.p1.doc("privateTournaments/GRPS2346").set(ptData({ groups: Array.from({ length: 9 }, (_, i) => ({ n: "g" + i, p: ["x"] })) })));
await no("ptour groups: groups not a list", ctx.p1.doc("privateTournaments/GRPS2347").set(ptData({ groups: "x" })));
await ok("ptour groups: owner enters a score (groups unchanged)", ctx.p1.doc(GT).set({ matches: [{ p1: "أ", p2: "ب", s1: "2", s2: "0", round: 1, g: 0 }], updatedAt: TS() }, { merge: true }));
await no("ptour groups: owner changes the groups after the draw", ctx.p1.doc(GT).set({ groups: [{ n: "أ", p: ["ج"] }, { n: "ب", p: ["أ"] }] }, { merge: true }));
await no("ptour groups: owner removes the groups", ctx.p1.doc(GT).set({ groups: DEL() }, { merge: true }));

/* ===== الأدوار الإقصائية في البطولة الخاصة (8 نوفمبر 2026) ===== */
const KT = "privateTournaments/KNOK2345";
const koTies = [{ r: 0, i: 0, a: "أ", b: "ب", sa: "", sb: "", pa: "", pb: "", bye: false }, { r: 1, i: 0, a: "", b: "", sa: "", sb: "", pa: "", pb: "", bye: false }];
await ok("ptour ko: owner creates", ctx.p1.doc(KT).set(ptData()));
await ok("ptour ko: owner saves the knockout", ctx.p1.doc(KT).set({ ko: koTies, updatedAt: TS() }, { merge: true }));
await ok("ptour ko: owner enters a knockout score", ctx.p1.doc(KT).set({ ko: [Object.assign({}, koTies[0], { sa: "3", sb: "1" }), koTies[1]], updatedAt: TS() }, { merge: true }));
await ok("ptour ko: owner deletes the knockout", ctx.p1.doc(KT).set({ ko: DEL(), updatedAt: TS() }, { merge: true }));
await no("ptour ko: another user writes the knockout", ctx.p2.doc(KT).set({ ko: koTies, updatedAt: TS() }, { merge: true }));
await no("ptour ko: more than 15 ties", ctx.p1.doc(KT).set({ ko: Array.from({ length: 16 }, (_, i) => ({ r: 0, i })), updatedAt: TS() }, { merge: true }));
await no("ptour ko: not a list", ctx.p1.doc(KT).set({ ko: "x", updatedAt: TS() }, { merge: true }));
await ok("ptour ko: guest reads it", ctx.guest.doc(KT).get());

/* ===== الفقرة الرابعة "ضد وند": اللي في بال المتسابق (10 نوفمبر 2026) ===== */
const DP = u => "duelPicks/" + u;
const pk = extra => Object.assign({ bid: "round_2", cur: 0, cat: "دول", pick: "اليابان", at: Date.now() }, extra || {});
await ok("duel: player saves own pick", ctx.p1.doc(DP("u_p1")).set(pk()));
await ok("duel: player changes own pick", ctx.p1.doc(DP("u_p1")).set(pk({ pick: "مصر" })));
await ok("duel: player reads own pick", ctx.p1.doc(DP("u_p1")).get());
await ok("duel: admin reads a pick", ctx.admin.doc(DP("u_p1")).get());
await no("duel: opponent reads the pick", ctx.p2.doc(DP("u_p1")).get());
await no("duel: fan reads the pick", ctx.fan.doc(DP("u_p1")).get());
await no("duel: guest reads the pick", ctx.guest.doc(DP("u_p1")).get());
await no("duel: player writes someone else's pick", ctx.p2.doc(DP("u_p1")).set(pk()));
await no("duel: guest writes a pick", ctx.guest.doc(DP("u_guest")).set(pk()));
await no("duel: empty pick", ctx.p1.doc(DP("u_p1")).set(pk({ pick: "" })));
await no("duel: pick too long", ctx.p1.doc(DP("u_p1")).set(pk({ pick: "x".repeat(41) })));
await no("duel: extra field", ctx.p1.doc(DP("u_p1")).set(pk({ win: true })));
await no("duel: cur not a number", ctx.p1.doc(DP("u_p1")).set(pk({ cur: "0" })));
await no("duel: player lists all picks", ctx.p1.collection("duelPicks").get());

/* ===== تفاعلات الجمهور (10 نوفمبر 2026) ===== */
const RXU = u => "room/main/liveRx/round_2/u/" + u;
await ok("rx: viewer writes own reactions", ctx.fan.doc(RXU("u_fan")).set({ c: { "👏": 3, "🔥": 1 }, n: 1, at: Date.now() }));
await ok("rx: viewer updates own reactions", ctx.fan.doc(RXU("u_fan")).set({ c: { "👏": 5 }, n: 2, at: Date.now() }));
await no("rx: writes someone else's reactions", ctx.fan.doc(RXU("u_p1")).set({ c: { "👏": 1 }, n: 1, at: Date.now() }));
await no("rx: guest writes reactions", ctx.guest.doc(RXU("u_guest")).set({ c: { "👏": 1 }, n: 1, at: Date.now() }));
await no("rx: extra field", ctx.fan.doc(RXU("u_fan")).set({ c: { "👏": 1 }, n: 3, at: Date.now(), x: 1 }));
await no("rx: too many emoji kinds", ctx.fan.doc(RXU("u_fan")).set({ c: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 }, n: 3, at: Date.now() }));
await no("rx: viewer writes the summary", ctx.fan.doc("room/main/liveRx/round_2").set({ b: {}, n: 1, at: Date.now() }));
await ok("rx: admin writes the summary", ctx.admin.doc("room/main/liveRx/round_2").set({ b: { u_fan: { "👏": 2 } }, n: 1, at: Date.now() }));
await ok("rx: guest reads the summary", ctx.guest.doc("room/main/liveRx/round_2").get());
await no("rx: viewer writes a recording", ctx.fan.doc("liveSecrets/rec_1").set({ x: 1 }));
await no("rx: viewer reads recordings list", ctx.fan.doc("liveSecrets/_recs").get());

await env.cleanup();
if (failed) { console.log(failed + " failed"); process.exit(1); }
console.log("all passed");
