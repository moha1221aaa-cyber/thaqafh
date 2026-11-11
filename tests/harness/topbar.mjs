/* شريط البث فوق (11 نوفمبر 2026، صورة محمد: زر إنهاء البث طالع برا الشاشة بعد ما انضاف عدد الحضور).
   كل عناصر الشريط لازم داخل الشاشة وما تركب على بعض، على جوالات ضيقة وبخط مكبّر. node tests/harness/topbar.mjs */
import { serve, FakeDB, seed, launch, device, until, sleep } from "./harness.mjs";

const srv = await serve(Number(process.env.HARNESS_PORT) || 8797);
let ok = true;
const check = (name, v, extra) => { if (!v) ok = false; console.log((v ? "PASS " : "FAIL ") + name + (extra !== undefined ? " " + JSON.stringify(extra) : "")); };
const browser = await launch({ wav: "silence.wav" });
try {
    for (const [w, h] of [[320, 640], [352, 700], [360, 740], [412, 900]]) {
        for (const zoom of [1, 1.15, 1.3]) {
            for (const who of ["host", "fan"]) {
                const db = new FakeDB(30);
                seed(db, "countdown", { sceneAt: Date.now(), ready1: true, ready2: true, hostSeen: Date.now() });
                const pg = await device(browser, db, who, { viewport: { width: w, height: h } });
                await until(() => pg.$("#liveScreen .lv-top .lv-eye"), 8000);
                const r = await pg.evaluate(z => {
                    document.documentElement.style.zoom = z; bcFitTop();
                    const top = document.querySelector("#liveScreen .lv-top");
                    const W = window.innerWidth;
                    const els = [...top.children].filter(e => getComputedStyle(e).display !== "none");
                    const box = els.map(e => { const b = e.getBoundingClientRect(); return { c: e.className.split(" ")[0], l: b.left, r: b.right, sw: e.scrollWidth, cw: e.clientWidth }; });
                    const out = box.filter(b => b.l < -1 || b.r > W + 1);
                    let over = [];
                    for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) if (box[i].l < box[j].r - 1 && box[j].l < box[i].r - 1) over.push(box[i].c + "/" + box[j].c);
                    const cut = box.filter(b => b.sw > b.cw + 2 && b.c !== "lv-round");
                    return { out: out.map(b => b.c), over, cut: cut.map(b => b.c), end: !!top.querySelector(".bc-endbtn") };
                }, zoom);
                check(`${who} ${w}x${h} zoom ${zoom}: الشريط داخل الشاشة بدون تداخل`, !r.out.length && !r.over.length && !r.cut.length && (who !== "host" || r.end), r);
                for (const l of pg.__logs.filter(l => /PAGEERROR/.test(l))) check("no page errors", false, l);
                await pg.context().close();
            }
        }
    }
} catch (e) { ok = false; console.log(e.stack || e); }
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
