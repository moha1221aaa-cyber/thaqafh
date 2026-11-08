// يجهّز مجلد www: الشعار وصفحة "ما فيه نت" بس.
// التطبيق نفسه يفتح الموقع من server.url في capacitor.config.json،
// فأي تحديث للموقع يوصل للتطبيق على طول بدون تحديث من المتجر.
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
mkdirSync("www", { recursive: true });
copyFileSync("../logo.png", "www/logo.png");
const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>فيكارو</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#0b1530;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
img{width:120px;height:120px;border-radius:24px}button{font:inherit;font-size:17px;padding:12px 28px;border:0;border-radius:14px;background:#2f6bff;color:#fff}</style></head>
<body><img src="logo.png" alt=""><h1 style="margin:0;font-size:22px">ما فيه اتصال بالنت</h1>
<p style="margin:0;opacity:.8">تأكد من النت وارجع جرّب</p>
<button onclick="location.href='https://thaqafah.pages.dev'">جرّب مرة ثانية</button></body></html>`;
writeFileSync("www/index.html", page);
writeFileSync("www/offline.html", page);
console.log("www جاهز");
