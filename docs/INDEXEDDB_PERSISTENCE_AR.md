# تخزين المراجع واستعادتها

قاعدة neogeo-web-library-db، version 1، تضم handles وlibraryProfiles وmetadata وsettings. تحفظ handles مفاتيح roms/previews/bios بواسطة structured clone. يحفظ libraryProfiles/default أسماء العرض وschema ووضع handles أو session-files، وmetadata/index آخر فحص ناجح دون بايتات ROM أو BIOS.

هذه قاعدة جديدة مستقلة عن حفظ EmulatorJS. لا تتغير مفاتيح ng-webemu-settings-v012 أو neogeo-webemu-favorites-v1. إنشاء stores يتم في onupgradeneeded؛ versionchange يغلق الاتصال. أخطاء التخزين تظهر للمستخدم. أي تغيير مستقبلي للبنية يحتاج زيادة version وmigration صريحًا؛ لا يوجد migration تخميني لقاعدة قديمة غير موجودة.

لا يثق التشغيل بـmetadata تالفة: تُعاد قراءة المراجع والأذونات والملفات. أثبت الاختبار الحقيقي استعادة هوية Handle عبر isSameEntry بعد إغلاق الصفحة، كما أثبت أن metadata غير سليمة لا تسبب انهيارًا. اختبارات الوحدة تغطي quota/storage errors. ملفات fallback لا تحفظ في قاعدة handles.

تغيير origin من localhost إلى Pages لا ينقل IndexedDB تلقائيًا. اختر المجلدات على origin الجديد، وانقل حالات الحفظ عبر export/import. مسح Site Data قد يمس المراجع والحفظ، لكنه لا يحذف ملفات الجهاز. Forget Library يمس قاعدة المكتبة فقط.
