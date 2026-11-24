# قبول KOF 2003 وMetal Slug 5 — المختبر الخاص

## الحالة وحدود التنفيذ

هذا الدليل لإعادة اختبار الحزمتين. سبق توثيق إقلاعهما في ثلاثة متصفحات. حُفظ الكتالوج النشط وCore وBIOS Policy. لم يُكرر أمر تشغيل المتصفحات الذي رفضته السياسة سابقًا، ولم يُستخدم مسار بديل لتجاوز الرفض. الأوامر التالية للتشغيل اليدوي بواسطة صاحب الجهاز، وليست اختبارات نُفذت بالفعل.

ملفات المختبر داخل `work\recovery\kof2003-acceptance` خاصة؛ لا تُنشر الحزم أو ملفات التعريف أو نسخ BIOS في GitHub. لا تختَر مجلد مكتبتك الأصلي لهذه التجارب؛ استخدم مجلدات fixture أدناه. أدوات الاختبار لا تغير تخطيط المفاتيح أو إعدادات متصفحك المعتاد.

## تجهيز المختبر لأول مرة

من جذر المشروع شغّل `py -3 manage.py web build`. استعمل مكتبة محلية وBIOS معتمدين، وعيّن `NG_FBNEO_SOURCE` إلى checkout محلي للمراجعة المثبتة في `tools/compatibility_lab/priority_import_signatures.json`. يتوقع التدقيق أيضًا مرجع MAME XML المطابق في `work/recovery/neogeo_reference.xml` وملفي HBMAME المحددين في قائمة المراجع تحت `work/recovery/final-five-resume/reference-source/hbmame`. أنشئ تقريري الاستيراد الخاصين بواسطة `import_priority_games.py` مع `--game kof2003` أو `--game mslug5` و`--output` داخل work. احفظ مخرجات JSON بصيغة UTF-8 في `reports/FINAL_FIVE_KOF2003_RESUME_IMPORT.json` و`reports/MSLUG5_ACCEPTANCE_IMPORT.json` على الترتيب. جهّز المختبر بأمرَي `py -3 -m tools.compatibility_lab.prepare_kof2003_acceptance` ثم `py -3 -m tools.compatibility_lab.prepare_mslug5_acceptance`. يحتفظ كل اختبار بملفاته تحت work.

## 1. فحص المختبر وتشغيل الموقع

في PowerShell من المشروع الصحيح:

```powershell
# Run from the repository root.
py -3 -m tools.compatibility_lab.verify_final_acceptance_lab
py -3 -m tools.compatibility_lab.serve_kof2003_acceptance
```

اترك هذه النافذة مفتوحة. العنوان الوحيد للاختبار هو:

`http://127.0.0.1:8793/Neo-Geo-Web/`

المجلد `site` نسخة معزولة من التوزيع الموجود، مع إضافة مرشحين فقط. مسارات fixture خارج مجلد الموقع ولا يقدمها خادم الموقع كملفات عامة.

## 2. فتح متصفحات مرئية بملفات تعريف اختبار مستقلة

نفّذ يدويًا في نافذة PowerShell ثانية. لا تستخدم ملف تعريفك اليومي، ولا تغيّر أرقام المنافذ بين مراحل الاختبار. هذه الأوامر لا تغلق متصفحات المستخدم ولا تمسح تخزينها.

```powershell
# Run from the repository root.
$lab = Join-Path (Get-Location) 'work\recovery\kof2003-acceptance'
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' "--user-data-dir=$lab\profile-chrome" '--remote-debugging-port=9381' '--no-first-run' 'about:blank'
& 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe' "--user-data-dir=$lab\profile-brave" '--remote-debugging-port=9382' '--no-first-run' 'about:blank'
& 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' "--user-data-dir=$lab\profile-edge" '--remote-debugging-port=9383' '--no-first-run' 'about:blank'
```

إذا لم يوجد برنامج في المسار المذكور، استخدم مسار تثبيته الفعلي فقط. إذا رفض المتصفح تفعيل منفذ التصحيح، سجّل ذلك كعائق؛ لا تعطّل حماية Brave أو سياسات الجهاز. أدوات الاختبار تتصل بـ127.0.0.1 فقط، ولا تبدأ المتصفحات أو تغلقها بنفسها.

## 3. الاختبار المؤتمت الموجود — مع تشغيل المتصفحات يدويًا

نفّذ لكل متصفح ولعبة، مع إبقاء خادم الموقع قيد التشغيل:

```powershell
foreach ($browser in 'chrome','brave','edge') {
    foreach ($game in 'kof2003','mslug5') {
        .\tools\compatibility_lab\run_final_acceptance.ps1 -Browser $browser -Game $game -Mode Online -Run run-01
    }
}
```

الأداة تستخدم `work/recovery/final-priority/verify_static.cjs` المعتمد، وتحدد ملفات fixture تلقائيًا. تفحص اختيار Driver، تقدم الإطارات، ضغط/تحرير المدخلات، Pause/Resume، الحفظ والاستعادة، العودة للمكتبة، وتجهز نسخة متصفح خاصة للـROM وBIOS بموافقة الاختبار داخل ملفات التعريف المعزولة. لا تُنسخ مكتبة المستخدم الكبيرة.

يحظر المختبر طلبات HTTP الخارجية الصادرة من تبويب الاختبار ويسجل المحاولات. هذا ليس دليلًا على حجب اتصالات المتصفح الخلفية أو جميع اتصالات الجهاز.

توجد ملاحظة مهمة في الأداة القديمة: قد تسجل PASS مع أن قيمة fullscreen هي false أو عينة الصوت صفر؛ لذلك يجب مراجعة القيم الفعلية. أداة التلخيص الجديدة لا تقبل هاتين الحالتين. لا تعني صور المقدمة أو وصول المدخلات إلى RetroPad وحدها بدء القتال.

إذا كان تشغيل ملفات ps1 محظورًا بسياسة PowerShell، لا تغير Execution Policy. يمكن تشغيل نفس الأداة مباشرة، مثل Chrome وKOF 2003:

```powershell
node .\tools\browser_game_runner\verify_static.cjs http://127.0.0.1:9381 http://127.0.0.1:8793/Neo-Geo-Web/ "$lab\fixture" kof2k3fd "$lab\evidence\chrome\candidate-kof2003\run-01\online" --online kof2003.zip
```

اختر مسار إخراج جديدًا إذا وجد تقرير سابق؛ لا تكتب فوق أدلة فشل أو نجاح محفوظة. لا تستخدم هذه الصيغة لتجاوز رفض صادر من سياسة أداة أو متصفح؛ المقصود تشغيل Node مباشرة بالطريقة المسموح بها محليًا فقط.

## 4. اختيار الشخصيات واللعب الحقيقي والصوت المرئي/المسموع

بعد نجاح Online، نفّذ لكل متصفح ولعبة:

```powershell
.\tools\compatibility_lab\run_final_acceptance.ps1 -Browser chrome -Game kof2003 -Mode Manual -Run run-01
```

كرر مع Brave وEdge، ثم مع `-Game mslug5`. يفتح المساعد تبويبًا مرئيًا ويدع التحكم لك؛ لا يضغط أزرار اللعبة. بعد Online تكون النسخة الخاصة محفوظة في تخزين ملف التعريف التجريبي. افتح اللعبة الصحيحة من المكتبة واضغط Start الخاص بالمحاكي.

إذا احتاجت الصفحة إعادة ربط الملفات، اختر:

| اللعبة | ROMs | BIOS | PREVIEWS |
|---|---|---|---|
| KOF 2003 | `work\recovery\kof2003-acceptance\fixture\ROMs` | `fixture\BIOS\neogeo.zip` داخل المختبر | `fixture\PREVIEWS` داخل المختبر |
| Metal Slug 5 | `work\recovery\kof2003-acceptance\fixture-mslug5\ROMs` | `fixture-mslug5\BIOS\neogeo.zip` | `fixture-mslug5\PREVIEWS` |

الهوية الأصلية لـKOF 2003 هي `kof2003.zip` والملف المختار `kof2k3fd.zip` وDriver ‏`kof2k3fd`. لـMetal Slug 5 الهوية `mslug5.zip` والملف المختار `mslug5fd.zip` وDriver ‏`mslug5fd`.

لوحة اللاعب الأول المحفوظة: الاتجاهات، A/S/D/F، Coin=3، Start=1؛ Q=A+B، R=A+B+C، E=C+D، وW غير معين. لا تغير ملف التحكم المستورد. إذا كان التركيز في الطرفية، انقر سطح اللعبة قبل استخدام المفاتيح.

سيطلب المساعد ثلاث مراحل منفصلة: شاشة اختيار الشخصيات، قتال فعلي في KOF أو مهمة فعلية في Metal Slug، ثم اللعب بعد تجربة الاتجاهات والأزرار الأربعة. في كل مرحلة عد إلى الطرفية واكتب YES فقط إذا رأيتها بالفعل؛ ستُحفظ لقطة من خرج المحاكي وعينة تشخيص. يطلب كذلك تأكيد الصوت المسموع وصحة الرسوم والاستجابة الفعلية. NO يبقي المعيار NOT VERIFIED.

هذه شهادة مستخدم مرفقة بقياسات رقمية وصور، ولا تتحول تلقائيًا إلى اعتماد نهائي. راجع الصور المحفوظة للتأكد من ظهور مواجهة أو مهمة حقيقية بدل شاشة BIOS أو المقدمة.

## 5. إعادة الفتح وOffline واستعادة الحفظ

بعد استكمال Online وManual للمتصفحات الثلاثة:

1. أوقف خادم المختبر بـCtrl+C في نافذته الأولى.
2. أغلق نوافذ ملفات تعريف الاختبار الثلاثة فقط. لا تغلق متصفحك الشخصي أو تحذف ملف تعريف الاختبار.
3. أعد فتح المتصفحات بالأوامر نفسها في الخطوة 2، مع المسارات والمنافذ نفسها، والخادم متوقف.
4. نفّذ:

```powershell
foreach ($browser in 'chrome','brave','edge') {
    foreach ($game in 'kof2003','mslug5') {
        .\tools\compatibility_lab\run_final_acceptance.ps1 -Browser $browser -Game $game -Mode Offline -Run run-01
    }
}
py -3 -m tools.compatibility_lab.summarize_final_acceptance --run run-01
```

اختبار Offline يشترط أن يكون الخادم غير متاح، ويفتح الصفحة من Service Worker ويعيد تشغيل اللعبة من نسخة المتصفح، ثم يحمّل الحفظ السابق ويقيس استمرار الإطارات. يقارن الملخص بصمة الحفظ بين Online وOffline. إعادة تشغيل المتصفح بنفس ملف التعريف خطوة بشرية يجب تسجيل إنجازها؛ لا يستنتج المساعد حصولها من مجرد فتح تبويب جديد.

## الأدلة والتسليم

النتائج والصور:

`work\recovery\kof2003-acceptance\evidence\<browser>\candidate-<game>\run-01\online|manual|offline`

الملخص:

`reports\FINAL_ACCEPTANCE_BROWSER_STATUS_run-01.json`

إذا كانت المراحل مكتملة، سيظل الملخص `SCREENSHOT_REVIEW_REQUIRED` حتى مراجعة أدلة اللعب. الأداة لا تعدل الكتالوج النشط. أرسل ملفات النتائج واللقطات ذات الصلة للمراجعة، دون ملفات ROM أو BIOS أو ملفات تعريف المتصفح.
