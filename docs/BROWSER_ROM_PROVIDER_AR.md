# تحميل ROM وBIOS داخل المتصفح

المسار: Handle → getFile → ArrayBuffer → SHA-256 → File باسم driver.zip → EJS_gameUrl. لا ROM Blob URL ولا Service Worker ولا خادم وسيط. EmulatorJS 4.2.3 يدعم File في toData/downloadFile، ثم يعيّن config.gameUrl=File.name قبل getBaseFileName(true). فرع arcade يكتب ZIP دون فكّه باسم Driver.

EJS_gameName يظل Driver كما سابقًا. EJS_gameID مشتق من filename الأصلي بخوارزمية FNV السابقة؛ لا يتغير مع إعادة الزيارة. مثال bbbuster.zip يُحمّل باسم b2b.zip ويختار Driver b2b. manifest يحتفظ بعلاقة parent الأصلية، لكن الأعضاء المطلوبة مدمجة في الأرشيفات المحضّرة ذاتيًا، لذلك dependencies التشغيلية فارغة.

adapter صغير يستبدل downloadBios في prototype قبل إنشاء EmulatorJS. يكتب BIOS الأصلي كأرشيف واحد إلى /neogeo.zip، ثم يقرأه من MEMFS ويتحقق من SHA. يقرأ ROM من MEMFS أيضًا ويطابقه مع المصدر قبل بدء Core. NGLocalRuntime يسجل الاسم والحجم والهاش دون بيانات ثنائية. لا تعديل لمكتبات vendor المصغرة أو WASM.

EJS_CacheLimit=0 بالتهجئة الفعلية في loader يمنع نسخ ROM تلقائيًا إلى cache. الملفات تحرر عند pagehide؛ Object URLs للصور والتصدير تُلغى عند انتهاء استعمالها. التحقق من close صريح لكل AudioContext/WebGL ليس ضمن الدليل الحالي. checkForUpdates الاختياري معطل لمنع CDN probe.

أزرار تصدير/استيراد الحالة موجودة في لاعب Python وPages. الاستيراد يمر عبر NGStateGuard قبل native load. لا تنتقل الحالات تلقائيًا بين origins؛ استخدم اللعبة نفسها. Memory Cards وفساد payload بنفس الحجم NOT VERIFIED.
