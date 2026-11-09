# File System Access

تُفحص الواجهات قبل استعمال showDirectoryPicker({mode:'read'}) أو showOpenFilePicker. تعمل على Chrome/Edge في secure context، أي HTTPS أو localhost. لا يُطلب write permission. لا تُستخدم مسارات Windows النصية للوصول إلى الملفات.

السحب إلى زر القسم يستعمل getAsFileSystemHandle، ويعطي handles حقيقية خاضعة لأذونات المتصفح. عند غياب APIs، يستخدم التطبيق file inputs وwebkitdirectory. ملفات هذا الوضع للجلسة فقط؛ يتطلب reload إعادة التحديد ولا يدعي حفظ وصول دائم.

تستعمل الاستعادة queryPermission دون إظهار حوار. requestPermission يُنفذ عند الضغط على الزر، وقد يتطلب المتصفح تأكيدًا. لا يوجد ضمان للوصول الصامت بعد إغلاق آخر تبويب أو إعادة تشغيل المتصفح. فقد قسم واحد لا يمس بقية المراجع.

أثبت المتصفح حفظ handles حقيقية واستعادتها من IndexedDB عبر السحب من الجهاز. تعذر اختبار مربع Windows picker وتجديد الإذن بصريًا بسبب فشل أداة التحكم؛ حالتهما NOT VERIFIED. فروع prompt/denied/deleted لها اختبارات وحدة منفصلة. Edge منفذ عبر feature detection، لكن الاختبار الفعلي على Chrome فقط.

مرجع: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
