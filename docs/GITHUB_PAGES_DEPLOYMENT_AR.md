# بناء GitHub Pages ونشره

    python manage.py web build
    python manage.py web verify
    python manage.py github audit
    python tools/static_preview_v015.py

افتح http://127.0.0.1:8776/Neo-Geo-Web/ . هذا خادم ملفات ثابتة للتطوير، بلا APIs. الموقع المنشور لا يحتاج Python أو Node. انشر محتوى dist/github-pages فقط. URLs نسبية وNG_BASE يحافظ على اسم Repository. لا تستخدم file://. لا حاجة إلى COOP/COEP لأن المحرك legacy وبلا threads.

build يقرأ web/data/catalog.json العام، ولا يحتاج config أو تقارير خاصة أو ROMs. الحزمة Public_Source منفصلة، واختُبر البناء منها دون تلك البيانات. workflow المرفق يعمل بـworkflow_dispatch يدويًا فقط. لم يُنشأ GitHub Repository ولم يُنفذ push ولم تُفعّل Pages. يحتاج المالك ضبط Pages عند النشر.

راجع تراخيص FBNeo غير التجارية وإتاحة المصدر والـpatches، ولا تنشر الحزم الخاصة. dist متجاهل Git؛ لا تضفه بالقوة. يمكن رفع محتوى الموقع إلى مستودع مستقل، أو نشر مصدر التطبيق وأصول software المسموح بها وفق allowlist ثم تشغيل workflow.

CSP يقيد الاتصالات إلى self ويمنع forms وobjects، ويسمح blob/data وWASM/eval اللازمين لـEmscripten. لا Service Worker ولا cache عام. صفر طلبات خارجية أثناء اللعب لا يثبت فتح Pages من جديد دون إنترنت بعد إغلاق المتصفح. HTTPS فعلي وEdge وworkflow بعيد NOT VERIFIED حتى يجري اختبارها.

المراجع: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits وhttps://developer.chrome.com/docs/capabilities/web-apis/file-system-access
