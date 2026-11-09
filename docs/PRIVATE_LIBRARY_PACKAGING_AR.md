# الحزم المحلية الخاصة

    python manage.py library package
    python manage.py library verify

تكتب الأوامر خارج المستودع في المجلد المجاور Neo-Geo-Web-private-v015. الحزم الثلاث: NeoGeo_ROMs_Package.zip وNeoGeo_PREVIEWS_Package.zip وNeoGeo_BIOS_Package.zip. البنية: ROMs/driver.zip، PREVIEWS/الصورة الأصلية، BIOS/neogeo.zip، مع manifest.json خارجي لكل حزمة.

تضم 127 ROM ناجحة سابقًا، منها 49 مشتقة مثبتة، و127 صورة BMP مطابقة، وBIOS أصليًا واحدًا. لا تُفك أرشيفات ROM أو neogeo.zip الداخلية. manifest يحفظ Original Game ID وSelected Filename وDriver وparent وPreview Filename وOriginal Preview ID والحجم وSHA وCore Hash. لا تُضاف الألعاب المحجوبة.

التحقق يشمل testzip وCRC أثناء القراءة وأحجام الأعضاء وSHA لكل ملف وحزمة، ومطابقة قائمة الملفات دون إضافات. هذه فحوص ملفات مع الاستناد إلى نتائج الإقلاع السابقة؛ ليست إعادة تشغيل للـ127 لعبة. نتائجها في dist/reports/package_hashes.json.

الحزم PRIVATE_LOCAL_ONLY وليست PUBLICLY_REDISTRIBUTABLE. لا يمنح المشروع حقوق توزيع الألعاب أو الصور أو BIOS. المجلد خارج المستودع وله .gitignore يحظر محتواه. github audit يفحص التتبع والتاريخ عند وجود Git؛ ignore وحده لا يحمي ملفات تتبعت سابقًا.

استخرج الحزم ثم اختر ROMs وPREVIEWS وملف neogeo.zip الداخلي. حزمة BIOS الخارجية ليست الملف الذي يقرأه FBNeo. لا رفع تلقائي ولا تنزيل ملفات ROM/BIOS من مصادر غير مصرح بها.
