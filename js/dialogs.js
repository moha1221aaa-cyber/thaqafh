/* نوافذ الموقع (8 نوفمبر 2026، طلب محمد): بدل نوافذ المتصفح الأصلية ("هذا الموقع يعرض...") اللي ما تناسب تصميم الموقع.
   uiAlert(رسالة) و uiConfirm(رسالة، خيارات) و uiPrompt(رسالة، قيمة افتراضية، خيارات) كلها Promise (تنتظر بـ await)،
   و window.alert يرجع لنفس النافذة (بدون انتظار). تتصف في طابور لو انفتحت أكثر من وحدة، و Esc يلغي و Enter يؤكد.
   خيارات: { title, ok, cancel, danger, type, placeholder, icon }. اللون الأحمر للأزرار تلقائياً لو الرسالة فيها حذف أو إنهاء أو مسح...
   الاختبارات تشغّل نوافذ المتصفح الأصلية بـ window.__UI_NATIVE = true (tests/harness). */
(function () {
    const nativeAlert = window.alert.bind(window), nativeConfirm = window.confirm.bind(window), nativePrompt = window.prompt.bind(window);
    const queue = [];
    let busy = false, lastFocus = null;

    const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    const icon = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const DANGER = /حذف|مسح|إنهاء|انهاء|تصفير|تسكّر|تسكر|تطلّع|تطلع من|نمسح|إعادة القرعة|اعادة القرعة|إعادة ضبط|بنرجّع|ينمسح|تفريغ|إخراج/;
    const GOOD = /^(تم|تمت|انضاف|انحذف|انسوت|بدأت|رجع|اننسخ|انضميت|نجح)/;

    function show(spec) {
        return new Promise(resolve => { queue.push({ spec, resolve }); pump(); });
    }
    function pump() {
        if (busy || !queue.length) return;
        busy = true;
        const { spec, resolve } = queue.shift();
        lastFocus = document.activeElement;
        const kind = spec.kind, msg = String(spec.message == null ? "" : spec.message);
        const danger = spec.danger != null ? spec.danger : (kind !== "alert" && DANGER.test(msg));
        const ic = spec.icon || (kind === "prompt" ? "pencil" : kind === "alert" ? (GOOD.test(msg.trim()) ? "check-circle" : /^(ما |فشل|خطأ|لازم|اكتب|الحد|تعذّر|سجّل)/.test(msg.trim()) ? "alert" : "bell") : danger ? "alert" : "alert");
        const tone = kind === "alert" && ic === "check-circle" ? "good" : danger ? "bad" : "info";
        const title = spec.title || (kind === "confirm" ? (danger ? "تأكيد الإجراء" : "تأكيد") : kind === "prompt" ? "اكتب هنا" : tone === "good" ? "تم" : "تنبيه");
        const ov = document.createElement("div");
        ov.className = "ui-dlg-ov";
        ov.innerHTML = `
<div class="ui-dlg ${tone}" role="${kind === "alert" ? "alertdialog" : "dialog"}" aria-modal="true" aria-labelledby="uiDlgT" aria-describedby="uiDlgM">
<div class="ui-dlg-ic">${icon(ic)}</div>
<h3 id="uiDlgT">${esc(title)}</h3>
<p id="uiDlgM" class="ui-dlg-m">${esc(msg)}</p>
${kind === "prompt" ? `<input class="ui-dlg-in" id="uiDlgIn" type="${spec.type === "password" ? "password" : "text"}" value="${esc(spec.value)}" placeholder="${esc(spec.placeholder || "")}" autocomplete="off" autocapitalize="off" spellcheck="false" dir="auto">` : ""}
<div class="ui-dlg-btns">
${kind === "alert" ? "" : `<button type="button" class="ui-b ghost" data-r="0">${esc(spec.cancel || "إلغاء")}</button>`}
<button type="button" class="ui-b ${danger ? "danger" : "brand"}" data-r="1">${esc(spec.ok || (kind === "alert" ? "تمام" : kind === "prompt" ? "تأكيد" : danger ? "نعم، نفّذ" : "نعم"))}</button>
</div>
</div>`;
        document.querySelectorAll(".ui-dlg-ov").forEach(o => o.remove());   /* بقايا نافذة قبلها تنطفي */
        document.body.appendChild(ov);
        const input = ov.querySelector("#uiDlgIn"), okBtn = ov.querySelector('[data-r="1"]');
        let done = false;
        function close(yes) {
            if (done) return; done = true;
            const val = input ? input.value : null;
            document.removeEventListener("keydown", onKey, true);
            ov.classList.remove("in"); ov.classList.add("out");
            if (queue.length) ov.remove(); else setTimeout(() => { ov.remove(); }, 160);   /* لو فيه نافذة جاية نشيل هذي فوراً عشان ما تتكرر */
            try { if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); } catch (e) {}
            busy = false;
            resolve(kind === "alert" ? undefined : kind === "confirm" ? !!yes : (yes ? val : null));
            setTimeout(pump, 30);
        }
        function onKey(e) {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(kind === "alert"); }
            else if (e.key === "Enter" && (kind === "prompt" ? e.target === input : e.target.tagName !== "BUTTON")) { e.preventDefault(); e.stopPropagation(); close(true); }
            else if (e.key === "Tab") {   /* التركيز يبقى داخل النافذة */
                const f = [...ov.querySelectorAll("input,button")];
                const i = f.indexOf(document.activeElement);
                e.preventDefault();
                f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
            }
        }
        document.addEventListener("keydown", onKey, true);
        ov.addEventListener("click", e => {
            if (e.target === ov) return close(kind === "alert");
            const b = e.target.closest && e.target.closest("[data-r]");
            if (b) close(b.dataset.r === "1");
        });
        requestAnimationFrame(() => {
            ov.classList.add("in");
            if (input) { input.focus(); input.select(); } else okBtn.focus();
        });
    }

    const native = () => !!window.__UI_NATIVE;
    window.uiAlert = function (message, opts) {
        if (native()) { nativeAlert(message); return Promise.resolve(); }
        return show(Object.assign({ kind: "alert", message }, opts || {}));
    };
    window.uiConfirm = function (message, opts) {
        if (native()) return Promise.resolve(nativeConfirm(message));
        return show(Object.assign({ kind: "confirm", message }, opts || {}));
    };
    window.uiPrompt = function (message, value, opts) {
        if (native()) return Promise.resolve(nativePrompt(message, value));
        return show(Object.assign({ kind: "prompt", message, value: value == null ? "" : value }, opts || {}));
    };
    /* alert القديم ما ينتظر: يطلع نفس النافذة */
    window.alert = function (message) { window.uiAlert(message); };
})();
