# تطبيق منصة فيكارو الثقافية (أندرويد وآيفون)

مبني بـ Capacitor 8. التطبيق يفتح موقع الدوري من `server.url` في `capacitor.config.json`
(الحين https://masro7-league.pages.dev)، فأي تحديث للموقع يوصل للتطبيق على طول.
الموقع الأصلي ومستودعه (---Feekaro) ما تغيّروا.

- `android/` و `ios/`: مشاريع التطبيق (الصلاحيات: المايك والتنبيهات والشاشة ما تطفي، والصوت بالخلفية في الآيفون).
- `build-web.mjs`: يجهّز `www/` (الشعار وصفحة "ما فيه نت").
- `.github/workflows/android.yml`: يبني APK للتجربة ويحطه في Releases باسم `android-latest`.
  التوقيع بـ `android/app/test.keystore` (للتجربة بس، مو للمتجر).
- `.github/workflows/ios.yml`: يتأكد إن الآيفون يتبنى (بدون توقيع).

للتجربة على نسخة ثانية من الموقع: غيّر `server.url`.
