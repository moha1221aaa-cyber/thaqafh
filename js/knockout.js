/* الأدوار الإقصائية (8 نوفمبر 2026، طلب محمد): بعد دور المجموعات أو الدوري، المتأهلين يلعبون إقصاء (ربع النهائي، نصف النهائي، النهائي).
   ko = مصفوفة مواجهات مسطحة [{ r: رقم الدور (0 = الأول), i: رقم المواجهة بالدور, a, b: الأسماء, sa, sb: النتيجة, pa, pb: الحسم لو تعادلوا, bye }].
   أسماء الأدوار اللاحقة تنملأ لحالها من الفائزين (koRecalc)، ولو تغيّر فائز دور سابق تنمسح نتيجة المواجهة اللي بعده.
   يتحفظ في نفس وثيقة البطولة (league/current أو league/qualifiers أو privateTournaments/<رمز>)، ومن تغيّرت أسماء متسابقيه يختفي. */

function koPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
/* ترتيب القرعة القياسي: 1 ضد الأخير، والأول والثاني ما يتقابلون إلا في النهائي. P=8 ← 1,8,4,5,2,7,3,6 */
function koSeedOrder(P) {
    let o = [1, 2];
    while (o.length < P) { const m = o.length * 2 + 1; o = [].concat.apply([], o.map(s => [s, m - s])); }
    return o;
}
function koTie(r, i, a, b, bye) {
    return { r: r, i: i, a: a || "", b: b || "", sa: "", sb: "", pa: "", pb: "", bye: !!bye };
}
/* pairs = أزواج الدور الأول بالترتيب [[a, b], ...] (عددها قوة 2)، والباقي أدوار فاضية */
function koFromPairs(pairs) {
    const ties = pairs.map((p, i) => koTie(0, i, p[0], p[1], !p[1] && !!p[0]));
    let cnt = pairs.length / 2, r = 1;
    while (cnt >= 1) { for (let i = 0; i < cnt; i++) ties.push(koTie(r, i)); cnt /= 2; r++; }
    return koRecalc(ties);
}
/* seeds بالترتيب (الأقوى أول). لو العدد مو قوة 2 الأعلى ترتيباً يعدّي الدور الأول بدون لعب (bye) */
function koFromSeeds(seeds) {
    const P = Math.max(2, koPow2(seeds.length)), order = koSeedOrder(P), pairs = [];
    for (let i = 0; i < P; i += 2) pairs.push([seeds[order[i] - 1] || "", seeds[order[i + 1] - 1] || ""]);
    return koFromPairs(pairs);
}
/* مجموعات (عددها 2 أو 4 أو 8): أول المجموعة ضد ثاني مجموعة ثانية، وما يتقابل أبناء المجموعة الواحدة إلا في النهائي.
   top[g] = [الأول، الثاني] */
function koFromGroups(top) {
    const g = top.length, pairs = [];
    const mate = i => i ^ 1;
    for (let i = 0; i < g; i += 2) pairs.push([top[i][0], top[mate(i)][1]]);
    for (let i = 1; i < g; i += 2) pairs.push([top[i][0], top[mate(i)][1]]);
    return koFromPairs(pairs);
}

function koNum(v) { return v === "" || v == null ? null : Number(v); }
/* الفائز بالاسم، أو "" لو ما انحسم */
function koWinner(t) {
    if (!t) return "";
    if (t.bye) return t.a || "";
    if (!t.a || !t.b) return "";
    const sa = koNum(t.sa), sb = koNum(t.sb);
    if (sa === null || sb === null || isNaN(sa) || isNaN(sb)) return "";
    if (sa !== sb) return sa > sb ? t.a : t.b;
    const pa = koNum(t.pa), pb = koNum(t.pb);
    if (pa === null || pb === null || isNaN(pa) || isNaN(pb) || pa === pb) return "";
    return pa > pb ? t.a : t.b;
}
function koRounds(ko) {
    const n = ko.reduce((a, t) => Math.max(a, t.r), -1) + 1, out = [];
    for (let r = 0; r < n; r++) out.push(ko.filter(t => t.r === r).sort((x, y) => x.i - y.i));
    return out;
}
function koRoundName(count) {
    return count === 1 ? "النهائي" : count === 2 ? "نصف النهائي" : count === 4 ? "ربع النهائي" : count === 8 ? "دور الـ16" : "دور الـ" + count * 2;
}
/* يملأ أسماء الأدوار من الفائزين، ويمسح نتيجة أي مواجهة تغيّر طرفيها */
function koRecalc(ko) {
    const rounds = koRounds(ko);
    for (let r = 1; r < rounds.length; r++) {
        rounds[r].forEach((t, i) => {
            const a = koWinner(rounds[r - 1][2 * i]), b = koWinner(rounds[r - 1][2 * i + 1]);
            if (t.a !== a || t.b !== b) { t.a = a; t.b = b; t.sa = ""; t.sb = ""; t.pa = ""; t.pb = ""; }
        });
    }
    return ko;
}
function koChampion(ko) {
    if (!ko || !ko.length) return "";
    const rounds = koRounds(ko), fin = rounds[rounds.length - 1];
    return fin && fin.length === 1 ? koWinner(fin[0]) : "";
}
/* القيمة المحفوظة تنفع بس لو كل أسمائها من المتسابقين الحاليين */
function koValid(ko, names) {
    return Array.isArray(ko) && ko.length >= 1 && ko.length <= 15
        && ko.every(t => t && typeof t.r === "number" && typeof t.i === "number" && (!t.a || names.indexOf(t.a) !== -1) && (!t.b || names.indexOf(t.b) !== -1));
}

/* ===== البدء: المتأهلين من الترتيب الحالي ===== */
async function koStart() {
    const ctx = tCtx();
    if (!ctx.canEdit || ctx.kind === "none") return;
    if (ctx.ko && !await uiConfirm("فيه أدوار إقصائية شغالة، نعيد بناءها ونمسح نتايجها؟")) return;
    if (ctx.players.length < 3) return alert("لازم 3 متسابقين على الأقل");
    const left = ctx.matches.filter(m => m.s1 === "" || m.s2 === "" || m.s1 == null || m.s2 == null).length;
    if (left && !await uiConfirm(`باقي ${left} مواجهة ما انلعبت في ${ctx.groups ? "دور المجموعات" : "الدوري"}، والمتأهلين يتحددون من الترتيب الحالي. نكمل؟`)) return;
    tableStats(ctx.players, ctx.matches);
    let ko;
    const groups = ctx.groups && ctx.groups.length > 1 ? ctx.groups : null;
    if (groups) {
        const top = groups.map(g => ctx.players.filter(p => g.p.indexOf(p.name) !== -1).slice(0, 2).map(p => p.name));
        if (top.some(t => t.length < 2)) return alert("كل مجموعة لازم فيها متسابقين على الأقل");
        if ([2, 4, 8].indexOf(groups.length) !== -1) ko = koFromGroups(top);
        else {   /* عدد مجموعات غريب: الأول ثم الثاني من كل مجموعة بالترتيب، والأعلى يعدّي بدون لعب */
            const win = top.map(t => t[0]), run = top.map(t => t[1]);
            const rank = n => ctx.players.findIndex(p => p.name === n);
            ko = koFromSeeds(win.sort((a, b) => rank(a) - rank(b)).concat(run.sort((a, b) => rank(a) - rank(b))));
        }
    } else {
        const opts = [2, 4, 8].filter(n => n <= ctx.players.length);
        const ans = await uiPrompt(`كم متأهل للأدوار الإقصائية؟ (${opts.join(" أو ")}). يتأهل الأعلى ترتيباً.`, String(opts.indexOf(4) !== -1 ? 4 : opts[opts.length - 1]));
        if (ans === null) return;
        const n = parseInt(ans, 10);
        if (opts.indexOf(n) === -1) return alert("اكتب " + opts.join(" أو "));
        ko = koFromSeeds(ctx.players.slice(0, n).map(p => p.name));
    }
    ctx.saveKo(ko);
    tn.pane = "matches";
    renderTournamentsPage();
}
async function koDelete() {
    const ctx = tCtx();
    if (!ctx.canEdit || !ctx.ko || !await uiConfirm("نحذف الأدوار الإقصائية ونتايجها؟")) return;
    ctx.saveKo(null);
    tn.pane = "stand";
    renderTournamentsPage();
}

/* ===== الرسم: مواجهات الإقصاء تنعرض مع باقي المواجهات (القادمة والسابقة)، نفس شكل بطاقة المواجهة ===== */
function koSet(r, i, field, value) {
    const ctx = tCtx();
    if (!ctx.canEdit || !ctx.ko) return;
    const t = ctx.ko.find(x => x.r === r && x.i === i);
    if (!t || ["sa", "sb", "pa", "pb"].indexOf(field) === -1) return;
    let v = String(value).trim();
    if (v !== "") { v = String(Math.max(0, Math.min(999, Math.floor(Number(v)) || 0))); }
    t[field] = v;
    koRecalc(ctx.ko);
    ctx.saveKo(ctx.ko);
    renderMatches();
}

const KO_UNKNOWN_AV = "https://ui-avatars.com/api/?name=%3F&background=1e293b&color=94a3b8&bold=true&size=128";
function koSide(ctx, name, win) {
    const d = document.createElement("div");
    d.className = "match-player" + (win && win === name ? " ko-w" : "");
    const url = name ? getPlayerAvatar(name, ctx.links || {}).url : KO_UNKNOWN_AV;
    d.innerHTML = `<img loading="lazy" decoding="async" src="${safeSrc(url)}" class="match-player-img" alt="">
<div class="match-player-name">${name ? escapeHTML(name) : `<span class="ko-wait">ينتظر</span>`}</div>`;
    return d;
}
function koTieCard(ctx, t) {
    const w = koWinner(t), ready = !!(t.a && t.b) && !t.bye, edit = ctx.canEdit && ready;
    const div = document.createElement("div");
    div.className = "match ko-tie" + (w ? " is-done" : "");
    div.dataset.r = t.r; div.dataset.i = t.i;
    const box = document.createElement("div");
    box.className = "match-score-box";
    const inp = (side, v) => {
        const x = document.createElement("input");
        x.type = "number"; x.min = "0"; x.className = "ko-s"; x.value = v; x.disabled = !edit;
        x.setAttribute("aria-label", "نتيجة " + (t[side] || ""));
        x.onchange = () => koSet(t.r, t.i, side === "a" ? "sa" : "sb", x.value);
        return x;
    };
    const sep = document.createElement("span"); sep.className = "match-sep"; sep.textContent = ":";
    box.appendChild(inp("a", t.sa)); box.appendChild(sep); box.appendChild(inp("b", t.sb));
    div.appendChild(koSide(ctx, t.a, w)); div.appendChild(box); div.appendChild(koSide(ctx, t.b, w));
    if (t.bye) div.insertAdjacentHTML("beforeend", `<div class="ko-note">يتأهل مباشرة</div>`);
    const tied = !t.bye && t.a && t.b && koNum(t.sa) !== null && koNum(t.sa) === koNum(t.sb);
    if (tied) {
        const tb = document.createElement("div");
        tb.className = "ko-tb";
        tb.innerHTML = `<span>تعادل: سؤال الحسم</span>`;
        const mk = (side, v) => {
            const x = document.createElement("input");
            x.type = "number"; x.min = "0"; x.value = v; x.disabled = !ctx.canEdit;
            x.setAttribute("aria-label", "حسم " + (t[side] || ""));
            x.onchange = () => koSet(t.r, t.i, side === "a" ? "pa" : "pb", x.value);
            return x;
        };
        const colon = document.createElement("i"); colon.textContent = ":";
        tb.appendChild(mk("a", t.pa)); tb.appendChild(colon); tb.appendChild(mk("b", t.pb));
        div.appendChild(tb);
    }
    return div;
}

/* يضيف الإقصائيات لقوائم المواجهات: اللي ما انحسمت (أو تنتظر طرف) في القادمة، واللي انحسمت في السابقة (الأحدث فوق) */
function koAppend(ctx, upDiv, pastDiv, filterText) {
    const clearEmpty = d => d.querySelectorAll(":scope > .empty-state").forEach(e => e.remove());
    if (!ctx.ko) {
        /* من يقدر يبدأها يشوف بطاقة البدء بآخر القادمة */
        if (ctx.canEdit && !filterText && ctx.players.length >= 3) {
            clearEmpty(upDiv);
            const c = document.createElement("div");
            c.className = "ko-start";
            c.innerHTML = `<div class="ko-start-ic">${ic("crown")}</div><div class="ko-start-t"><b>الأدوار الإقصائية</b><small>بعد ${ctx.groups ? "المجموعات يتأهل الأول والثاني من كل مجموعة" : "الدوري يتأهل الأعلى ترتيباً"}، ويلعبون إقصاء لين النهائي.</small></div><button type="button" onclick="koStart()">ابدأها</button>`;
            upDiv.appendChild(c);
        }
        return;
    }
    const rounds = koRounds(ctx.ko), champ = koChampion(ctx.ko);
    const match = t => !filterText || [t.a, t.b].some(n => n && n.toLowerCase().includes(filterText));
    const build = (target, pick, desc, prepend) => {
        const frag = document.createDocumentFragment();
        const order = rounds.map((ties, r) => r);
        if (desc) order.reverse();
        let any = false;
        order.forEach(r => {
            const ties = rounds[r].filter(t => pick(t) && match(t));
            if (!ties.length) return;
            any = true;
            const h = document.createElement("h3");
            h.className = "round-head ko-rt" + (desc ? " past" : "");
            h.textContent = koRoundName(rounds[r].length);
            frag.appendChild(h);
            ties.forEach(t => frag.appendChild(koTieCard(ctx, t)));
        });
        if (!any) return;
        clearEmpty(target);
        if (prepend) target.insertBefore(frag, target.firstChild); else target.appendChild(frag);
    };
    build(upDiv, t => !koWinner(t), false, false);
    build(pastDiv, t => !!koWinner(t), true, true);
    if (champ && !filterText) {
        [upDiv, pastDiv].forEach(d => d.insertAdjacentHTML("afterbegin", `<div class="ko-champ">${ic("crown")}<span>البطل</span><b>${escapeHTML(champ)}</b></div>`));
    }
}
