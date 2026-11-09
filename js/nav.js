/* زر الرجوع في الجوال (8 نوفمبر 2026، طلب محمد): يرجع خطوة بخطوة (من صفحة بطولة للقائمة، من جلسة لقائمة الجلسات، من تبويب للتبويب اللي قبله)
   بدل ما يطلع من التطبيق كامل. كل تنقل مهم يحط حالة في سجل المتصفح history ({nav: {tab, tn, mj}})، و popstate (app.js) يرجّعها بـ navApply.
   النوافذ والغرفة والسوم والبث لها حالاتها (modalOpen و roomOpen ...) فوق حالة التنقل، فالرجوع يسكّرها أول.
   من الرئيسية (أول حالة) الرجوع يطلع من التطبيق مثل أي موقع. navSilent = نطبّق حالة من الرجوع بدون ما نضيف حالة جديدة. */
let navSilent = false;

function navCurrentTab() {
    const s = document.querySelector(".section.active");
    return s ? s.id : "home";
}
function navState() {
    const tab = navCurrentTab(), st = { tab: tab };
    if (tab === "tournaments" && typeof tn !== "undefined" && tn.open) st.tn = tn.mode === "private" ? { priv: tn.priv || "" } : { off: tn.official };
    if (tab === "majlis" && typeof sj !== "undefined") { st.mj = { pane: sj.pane }; if (sj.pane === "session" && sj.sid) st.mj.sess = sj.sid; }
    return st;
}
function navKey(n) { try { return JSON.stringify(n); } catch (e) { return ""; } }

/* بعد أي تنقل: حالة جديدة في السجل (لو تغيّرت) */
function navPush() {
    if (navSilent) return;
    const cur = window.history.state && window.history.state.nav;
    const now = navState();
    if (cur && navKey(cur) === navKey(now)) return;
    try { window.history.pushState({ nav: now }, ""); } catch (e) {}
}

/* رجوع: نطبّق حالة السجل على الشاشة بدون ما نضيف حالة */
function navApply(n) {
    if (!n || navKey(n) === navKey(navState())) return;
    navSilent = true;
    try {
        const tab = n.tab || "home";
        if (navCurrentTab() !== tab) showTabNow(document.querySelector('.bottom-nav .tab[data-sec="' + tab + '"]'), tab);
        if (tab === "tournaments") {
            if (n.tn && n.tn.off) { if (!(tn.open && tn.mode === "official" && tn.official === n.tn.off)) tnOpenOfficial(n.tn.off); }
            else if (n.tn && n.tn.priv) { if (!(tn.open && tn.priv === n.tn.priv)) tnOpenPrivate(n.tn.priv, true); }
            else if (tn.open) tnBack();
        }
        if (tab === "majlis") {
            const want = n.mj || { pane: "room" };
            if (want.pane !== sj.pane) mjSetPane(want.pane);
            if (want.sess && sj.sid !== want.sess) sessOpen(want.sess);
            else if (!want.sess && sj.sid && sj.pane === "session") sessLeave();
        }
    } finally { navSilent = false; }
}

window.addEventListener("DOMContentLoaded", () => {
    /* أول حالة (الرئيسية). لو الصفحة انعادت وهي على حالة قديمة نبدأ من الرئيسية */
    try { window.history.replaceState({ nav: navState() }, ""); } catch (e) {}
});
