# إصلاح Brave واستعادة المكتبة — v0.1.5.1

تاريخ التحقيق: 8 نوفمبر 2026. المشروع النشط: D:/dev/Neo-Geo-Web-Port، مع مزامنة الإصلاح إلى D:/dev/Neo-Geo-Web. نطاق النتيجة **HOTFIX ACCEPTANCE PASS**؛ ليس إعلان توافق جميع الألعاب أو اعتماد إصدار كامل.

## السبب الجذري المثبت

اختُبر Brave Browser الفعلي على Windows، ProductVersion 157.1.99.55، بواسطة ملف اختبار معزول وCDP دون تعطيل Shields أو تفعيل File System Access بالقوة. أعاد كل من typeof showDirectoryPicker وtypeof showOpenFilePicker القيمة undefined. لذلك استُخدم file input fallback.

قبل الإصلاح: ظهرت breakers.zip وkof98.zip في المكتبة بعد اختيار ROMs وPREVIEWS وBIOS والضغط على حفظ. بقيت File objects في ذاكرة index.html فقط؛ لم تُحفظ كـFileSystemHandles. عند الانتقال الكامل إلى player.html صارت games=[] رغم ثبات Origin على http://127.0.0.1:8776. رفع prepare الخطأ العام قبل تحميل EmulatorJS أو Core. الدليل reports/v0151_brave_before.json.

إذن السبب ليس BIOS أو FBNeo أو عدم ضغط حفظ في هذه الحالة. توجد مشكلة تشخيص مستقلة: حذف الملفات المختلفة الحجم من games كان يحوّل اختلاف الاسم/الحجم إلى الرسالة العامة نفسها. يوجد أيضًا مسار إذن prompt قابل للتجديد لم يكن له علاج داخل اللاعب.

## الإصلاح المحدود

- في fallback، يفتح رابط اللعبة لاعبًا داخل iframe من Origin نفسه، مع بقاء صفحة المكتبة ومراجع الملفات حية. العودة تغلق اللاعب وتعيد المكتبة دون navigation مدمّر للجلسة. الجسر لا يعطي المراجع إلا للـiframe الذي أنشأه التطبيق، ويطبع الملفات في سياق الأب عند إعادة الربط لتجنب الاحتفاظ بسياق لاعب مغلق.
- داخل اللاعب واجهة استعادة لا تغادر الصفحة: تجديد ROMs/BIOS، اختيار ROMs أو BIOS كملف أو مجلد، عرض الملف والـDriver والحجم وOrigin، ثم إعادة المحاولة. لا تُسجل BOOTSTRAP FAIL لمجرد انتهاء إذن أو جلسة؛ يظهر LOCAL_LIBRARY_RECOVERY/WAITING.
- requestPermission يبدأ مباشرة من click دون await queryPermission قبله. المراجع الأصلية القابلة للتخزين تُحفظ فور اختيارها، حتى عند نسيان زر حفظ المكتبة. عند فشل التخزين لا تُدّعى استمرارية ناجحة، وتبقى الجلسة متاحة.
- حل هوية اللعبة يبدأ من الكتالوج، وليس games المصفاة فقط. kof98.zip هو Library ID؛ الملف المحضّر kof98h.zip، Driver kof98h، والحجم40655947 بايت. يُفحص الحجم ثم SHA-256 قبل Core، وتظل هوية الحفظ السابقة ثابتة.
- أخطاء مستقلة: ROM_DIRECTORY_PERMISSION_REQUIRED، ROM_DIRECTORY_NOT_CONNECTED، ROM_FILE_NOT_FOUND، ROM_SIZE_MISMATCH، ROM_HASH_MISMATCH، BIOS_PERMISSION_REQUIRED، BIOS_NOT_CONNECTED، BIOS_INVALID، FALLBACK_SESSION_ONLY.
- أُضيفت query version إلى scripts في Static Build لمنع استعمال شيفرة0.1.5 القديمة بعد تحديث الصفحة. لا تغيير CSS أو Core أو سياسة CRC أو بيانات ROM/BIOS.

## الاستمرارية في Brave: ما هو دائم وما هو مؤقت؟

اختيار المجلد بواسطة file input لا يمنح إذنًا دائمًا ولا يمكن حفظ مراجع الملفات عبر إغلاق المتصفح. تبقى الاختيارات خلال نافذة المكتبة الحية، ثم يظهر قيد FALLBACK_SESSION_ONLY بوضوح بعد إغلاقها. لا مسارات Windows في localStorage ولا نسخ تلقائي للمكتبة.

يوجد خيار منفصل في اللاعب: «نسخة اختيارية لهذه اللعبة في المتصفح». يتطلب checkbox موافقة صريحة يذكر اسم ROM والحجم مع BIOS، ثم ضغط حفظ. ينسخ هذين الملفين فقط إلى localCopies؛ لا PREVIEWS ولا جميع الألعاب. يمكن حذف نسخة هذه اللعبة دون مساس بالأصل أو حالات الحفظ. البيانات مرتبطة بالـOrigin، وقد تُفقد إذا مسح المستخدم أو المتصفح بيانات الموقع أو أخلاها بسبب سياسة التخزين. لا وعد بالتخزين الدائم المطلق.

ترقية neogeo-web-library-db من version1 إلى2 تضيف localCopies فقط. لا حذف stores أو إعادة تهيئة قواعد EmulatorJS أو localStorage. Forget Library ينسى المراجع فقط ولا يحذف النسخ الاختيارية أو حفظ الألعاب. تغيير localhost إلى127.0.0.1 أو المنفذ ينشئ Origin مختلفًا؛ ليس خطأ Core، ولا يمكن نقل تلك الصلاحيات صامتًا.

## نتائج Brave الفعلية

| الاختبار | النتيجة |
| --- | --- |
| اختيار ROMs/PREVIEWS/BIOS وحفظ الجلسة في Brave | PASS |
| Breakers من ملفات الجلسة مع إطارات وصوت رقمي | PASS |
| العودة للمكتبة دون فقد ملفات fallback | PASS |
| KOF98 عبر kof98h.zip وDriver kof98h | PASS |
| إدخال Coin/Start داخل iframe لكلتا اللعبتين وصورة تفاعلية | PASS |
| إغلاق التبويب وإعادة فتحه دون ادعاء بقاء ملفات fallback | PASS |
| استعادة داخل اللاعب ثم تشغيل KOF98 دون إعادة تحميل الصفحة | PASS |
| حفظ نسخة Breakers الاختيارية بعد موافقة منفصلة | PASS |
| إغلاق Brave بالكامل وإعادة تشغيله بالملف نفسه | PASS |
| تشغيل النسخة الاختيارية بعد ذلك دون إعادة اختيار الملفات | PASS |
| استعادة حالة Breakers بنفس SHA-256 عبر إعادة التشغيل | PASS |
| بقاء المفضلة وvolume63 | PASS |
| ترقية قاعدة version1 مع بقاء metadata/settings والمفضلة | PASS |
| عدم طلب Python APIs أو HTTP خارجي في جولة التكامل | PASS، صفر طلبات |

ظهرت في KOF98 شاشة ADVANCED/EXTRA مع CREDIT01، وسُجل وصول ضغطي Coin وStart وإفلاتهما عند مدخل Core. الصور والأرقام في reports/v0151_brave/controls، ودليل إعادة تشغيل المتصفح في reports/v0151_brave/restart.json. لم يُستخدم Mock لإعلان إقلاع اللعبة.

اختبارات الكود: **19/19 JavaScript للمكتبة PASS**، والمجموعات الأربع القديمة PASS. **48/48 Python في المشروع الأصلي PASS**، منها أربعة لاختبار أمان مُثبت التحديث؛ وفي Port المحدود توجد هذه الاختبارات الأربعة فقط ونتيجتها4/4 PASS. اختُبر dry-run، الحفظ والنسخة الاحتياطية، رفض traversal والملفات المحمية والحزمة المحرفة. فُصلت نتائج هذه الاختبارات عن تشغيل المتصفح.

## الملفات والنسخ الاحتياطية

تغير filesystem-access/indexeddb-store/library-manager/library-ui/rom-provider، وأضيف session-navigation وplayer-recovery. تغير player.js لانتظار الاستعادة والتركيز على اللاعب، وweb_distribution.py لترتيب الموديولات وكسر cache. تحديث الإصدار في manage/server/HTML/diagnostics/catalog لا يغير أعضاء ROM. أضيف مُثبت مستقل واختبارات وتوثيق. قائمة الملفات والهاشات في reports/v0151_preservation.json وhotfix_manifest.json داخل الحزمة.

نقطتا الاستعادة قبل التعديل مسجلتان في work/v0151/backup.txt داخل كل مشروع، تحت backups/before_v0151_20261108_071918. لا تُرجع قارئ IndexedDB القديم ذي version1 فوق قاعدة ترقت إلى2؛ أي رجوع للكود يحتفظ بقارئ indexeddb-store.js المتوافق مع2، ولا يحذف بيانات المتصفح أو يخفض مخططها. الملفات الجديدة يمكن أن تبقى خاملة عند رجوع بقية الكود.

## التثبيت وإعادة الاختبار

نسخة Port الحالية معدلة ومبنية بالفعل. لحاسوب أو نسخة أخرى: أوقف الخادم، وفك حزمة Hotfix خارج المشروع، ثم من مجلد الحزمة:

    py -3 upgrade_v0151.py --project "D:/dev/Neo-Geo-Web-Port" --check
    py -3 upgrade_v0151.py --project "D:/dev/Neo-Geo-Web-Port"

ومن Terminal داخل Port:

    py -3 manage.py web build
    py -3 manage.py web verify
    py -3 manage.py test
    node tests/local_library.test.cjs
    py -3 tools/static_preview_v015.py

العنوان: http://127.0.0.1:8776/Neo-Geo-Web/ . تأكد أن الخادم يخدم Port لا نسخة أخرى؛ يفضّل تشغيل script بمساره المطلق عند وجود أكثر من نسخة. حدّث الصفحة مرة واحدة لاستقبال hotfix، دون مسح Site Data، ثم اختر الملفات. بعد ذلك الاستعادة وإعادة المحاولة داخل اللاعب لا تتطلبان reload.

## حدود التحقق

Brave الحقيقي اختُبر في وضع headless مع File inputs حقيقية وملفات محلية وأحداث متصفح فعلية. حوار اختيار Windows اليدوي وسماعات فعلية وذراع فعلية NOT VERIFIED. لا ندّعي وجود FSA دائم في Brave عندما تكون الواجهات undefined. مسار طلب إذن native له اختبارات وحدة؛ لم يُفرض تفعيل API غير موجودة.

لا Service Worker ولا وعد بفتح موقع GitHub Pages لأول مرة أو من جديد دون شبكة. النسخة الاختيارية تحتفظ ببيانات لعبة، وليست cache لأصول التطبيق. لم يُنشر شيء أو يُنشأ GitHub Repository. عدد توافق الألعاب العام ما زال127/191 و64 محجوبة؛ لم تُعد حملة127 لعبة. نسخة Python الأصلية والسياسة الصارمة للمحرك محفوظتان.
