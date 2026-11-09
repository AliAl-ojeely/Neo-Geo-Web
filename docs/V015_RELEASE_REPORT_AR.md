# تقرير إصدار v0.1.5 — البنية الثابتة والمكتبة المحلية

تاريخ النتائج: 2026-11-08T03:30:56.088886+00:00. **PARTIAL_VALIDATION، وليس FULL PASS**. التحميل المحلي والتشغيل مثبتان، مع بقاء اختبار picker وتجديد الأذونات بصريًا والنشر الفعلي غير مكتمل.

## A. حالة المشروع

استؤنف v0.1.4 وأصبح الكود v0.1.5. محرك FBNeo لم يتغير ولم يُعد بناؤه. SHA-256: `2d2c70daffbc70448dec0516abec37a96486adaf8a2af090de5326b59bce24f9`. نقطة الاستعادة قبل التعديل: `PROJECT_ROOT\backups\before_v015_20261108_055853`. نسخة Python باقية وتجتاز اختبارات HTTP والمكتبة والصور والإعدادات. نجح أيضًا اختبار متصفح حقيقي لإقلاع Breakers عبر Python بالإصدار الجديد (legacy_browser_v015.json). لا إعادة تصميم للواجهة.

## B. استعادة ROM

كان العدد127 BOOT PASS وبقي127/191؛ **صفر ألعاب جديدة**. أُجريت مراجعة محدودة لتوقيعات متطلبات64 حالة مقابل الفهرس المحلي والمشتقات المثبتة. لم تظهر خطة مكتملة جديدة، فسُجلت64 حالة DEFERRED لهذه الجولة، دون محو أسباب BLOCKED التاريخية. القائمة في reports/v015_rom_recovery.json. لا ادعاء باستحالة استعادتها مستقبلًا. لم تُعد حملة الألعاب الـ127؛ اختُبرت Breakers وBang Bang Busters لتكامل مصدر الملفات الجديد فقط.

## C. الحزم المحلية

الموقع الخاص: `PRIVATE_PACKAGE_DIRECTORY`، خارج المستودع. لا تدخل الحزم إلى Pages. الأعداد التالية للمحتوى دون manifest الخارجي:

| الحزمة | الملفات | بايت | SHA-256 | سلامة ZIP |
| --- | --- | --- | --- | --- |
| ROMs | 127 | 1335348073 | `a796d8af40d0a883e8145224cea0ef344c9f231e65f36cbc669a751bd56b5f5b` | PASS |
| PREVIEWS | 127 | 5067423 | `1c266bd72622c3e4830ea4bb2017378407a69849c2185506a31312bb0d27ab41` | PASS |
| BIOS | 1 | 210414 | `8b003a2b200b6cff2bdde19b72a559c26c3302c0d4a1b446c5af4791439b240a` | PASS |

تضم127 ROM، منها49 مشتقة، و127 صورة مطابقة وBIOS أصليًا واحدًا. فُحص CRC والحجم وSHA والأسماء والخرائط وقائمة الأعضاء. لا بيانات ثنائية في JSON. ملفات اختبار b2b استُخرجت من هذه الحزم، دون فك ZIP اللعبة الداخلي.

## D. مدير المكتبة والأذونات

**PASS** لحفظ FileSystemDirectoryHandle/FileSystemFileHandle حقيقية من الجهاز عبر browser drag/drop، ثم استعادتها من IndexedDB بعد إغلاق الصفحة؛ isSameEntry=true والأذونات granted. ظهرت78 نسخة مطابقة الحجم من مكتبة NeoRAGEx الأصلية، والبقية49 تحتاج النسخ المحضرة. الفحص الكامل للهاش مطلوب قبل التشغيل.

Fallback عبر file inputs حقيقية: **PASS**. لم تُحفظ بايتات ROM أو handles وهمية، وتطلب reload إعادة التحديد. قاعدة جديدة بأربع stores؛ metadata تالفة لا تنهار بالتطبيق. نسيان المكتبة لا يمس حفظ الألعاب أو المفضلة والتفضيلات.

**NOT VERIFIED** لمربع Windows picker نفسه وتجديد الإذن أو رفضه بصريًا: فشلت أداة Windows برسالتي coordinate input geometry unavailable وFrameArrived timeout. فروع prompt/denied/deleted/storage errors لها اختبارات وحدة مستقلة. إعادة تشغيل المتصفح كله وEdge غير مختبرين؛ لا وعد باستمرار الإذن دائمًا.

## E. تكامل EmulatorJS

File باسم driver.zip، دون ROM Blob URL أو Service Worker. BIOS adapter يكتب الأرشيف الأصلي إلى /neogeo.zip. تحقق فعلي من MEMFS قبل Game Init:

- ROM: 13853692 بايت، SHA المصدر `ad152d2b9cb4103dbe3883b4567019d2f98468faca5a7c39a04e5b9dc3eaed27` وSHA داخل FS `ad152d2b9cb4103dbe3883b4567019d2f98468faca5a7c39a04e5b9dc3eaed27`.
- BIOS: 137154 بايت، SHA `37e3e653c26edfcb1f155799b672bf52efd66b536b0aa5bd65462a69116548bc`.
- الاسم المختلف: bbbuster.zip → b2b.zip → Driver b2b، **PASS**.

EJS_gameName وGame ID ثابتان وفق الهوية السابقة. EJS_CacheLimit=0. لا تعديل vendor أو WASM. أضيف تصدير/استيراد الحالة في لاعب Python وPages مع State Guard؛ لا نقل تلقائي بين origins.

## F. GitHub Pages

المخرجات `PROJECT_ROOT\dist\github-pages`: 55 ملفًا و10316418 بايت، مع .nojekyll والتراخيص والـpatches. البناء لا يحتاج config أو reports أو ROMs؛ جرى اختبار نسخة مصدر منفصلة بدونها. خادم الاختبار ثابت تحت /Neo-Geo-Web/ ولا يقدم APIs. روابط CSS/JS/Core/JSON نسبية وتحافظ على اسم Repository.

لم يُنشأ مستودع ولم يُنفذ push أو تفعيل Pages. workflow يدوي فقط. النشر على HTTPS الفعلي وGitHub Actions البعيد **NOT VERIFIED**. جاهزية البناء المحلية ليست إثبات نشر.

## G. الاختبارات والأدلة

اختبار Breakers: `PASS_WITH_PICKER_UI_NOT_VERIFIED`. النسخة المشتقة: `PASS_WITH_PICKER_UI_NOT_VERIFIED`. ظهرت شاشة اختيار الشخصية في Breakers بعد Coin/Start، مع 1331 إطارًا و730375 عينة PCM غير صفرية عند القياس. استجابة الإدخال والحفظ المتطابق بعد reload ورفض ملف مبتور32 بايت واستمرار الإطارات والعودة للمكتبة **PASS**. b2b أظهر عنوان اللعبة وتغير الرصيد.

BMP الصحيح حُمّل من Blob محلي بعرض222. الصور تُحمّل عند الحاجة مع placeholder وتنظيف Object URLs. الأدلة في reports/static_browser_v015 وstatic_browser_v015_derived. لا نرفع عدد Game Compatibility السابق4 إلى127 لمجرد نجاح هذا التكامل.

Python **44/44 PASS**. أربع مجموعات JavaScript سابقة و**11/11 اختبارًا جديدًا للمكتبة PASS**. آخر release verify: `PARTIAL`؛ رمز2 للحالة PARTIAL. سماعات فعلية وGamepad وMemory Cards وفساد حفظ بنفس الحجم **NOT VERIFIED**.

## H. الخصوصية والتراخيص

صفر طلبات /api/ وصفر طلبات HTTP خارج origin أثناء الاختبارين، مع cache معطل وحجب الاتصالات الخارجية. لا Upload APIs أو Analytics. CSP يقيد connect إلى self. لا Service Worker cache؛ لم يُثبت فتح Pages من جديد دون إنترنت بعد إغلاق المتصفح.

فُحصت الأصول العامة والحجوم والمسارات الحساسة. min.zip المسموح يحتوي JS/CSS فقط. استُبعد unrar غير الضروري ومحركا FBNeo الأصليان غير مثبتَي المصدر من البناء العام. بقي المحرك المعدل المثبت. GPL وFBNeo LICENSE وTHIRD_PARTY_NOTICES والـpatches وروابط المصدر المثبتة مرفقة. شروط FBNeo غير تجارية، ولا يمنح المشروع حقوق نشر ROM/BIOS/PREVIEWS.

لا Git في جذر المشروع، لذلك تاريخ المستودع **NOT_PRESENT**. عند وجوده يفحص github audit الملفات المتتبعة والتاريخ والحجوم؛ ignore لا يكفي للملفات المتتبعة مسبقًا. لا ملفات خاصة داخل الموقع العام.

## I. التعديلات والرجوع

أضيف app/web_distribution.py وموديولات web/library وكتالوج عام وأدوات build/package/audit/browser/source، وعدلت app.js/player.js/settings.js وmanage.py وrelease.py. أضيف README وLICENSE وNOTICES وworkflow وignore وتوثيق واختبارات. تفاصيل الملفات والهاشات في reports/v015_preservation.json.

أوقف الخادم قبل الاستعادة، ثم راجع --check:

    python tools/restore_v014.py --backup "PROJECT_ROOT\backups\before_v015_20261108_055853" --check
    python tools/restore_v014.py --backup "PROJECT_ROOT\backups\before_v015_20261108_055853"

تحفظ الاستعادة config الحالي وملفات الألعاب والصور وحفظ المتصفح. مخرجات dist والأدوات الجديدة والحزم الخاصة قد تبقى للمراجعة، ولا تحذف تلقائيًا.

## J. القيود والخطوة التالية

اختبر يدويًا picker وتجديد الإذن بعد إغلاق آخر صفحة وإعادة تشغيل Chrome، ثم Edge وHTTPS الفعلي. هذه القيود لا تلغي نجاح تحميل الملفات المثبت، لكنها تمنع FULL PASS. نتائج التوافق السابقة والتحمل محفوظة ولم تُعد بلا داعٍ.

    python manage.py web build
    python manage.py web verify
    python manage.py library verify
    python manage.py github audit
    python tools/static_preview_v015.py
    node tests/local_library.test.cjs
    python manage.py release verify

الموقع المنشور لا يحتاج Python أو Node؛ الأوامر أدوات تطوير فقط. **البناء الثابت جاهز للمراجعة والاختبار اليدوي، غير منشور، واعتماد الإصدار جزئي.**
