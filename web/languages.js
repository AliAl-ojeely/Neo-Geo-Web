/* Central first-party UI catalog. Technical identifiers and vendor menus are separate. */
'use strict';
(function (root) {
  const CATALOG = {
    offline: {
      remove_scope: { en: "Remove deletes ONLY this feature's offline cache. It does not clear your browser cache or your personal game data.", ar: "زر «إزالة» يحذف ذاكرة التخزين الخاصة بهذه الميزة فقط، دون مسح ذاكرة المتصفح بالكامل أو بيانات ألعابك الشخصية." },
      removed: { en: "Offline package removed", ar: "أُزيلت حزمة التشغيل دون إنترنت" },
      remove_success_note: { en: "Only the offline website and emulator cache was deleted. Your other site data, ROMs, BIOS, preferences and game saves are unchanged. An internet connection will be needed to install it again or reload the site.", ar: "حُذفت ذاكرة ملفات الموقع والمحرك الخاصة بالوضع دون إنترنت فقط. لم تتغير بيانات الموقع الأخرى أو ROMs أو BIOS أو الإعدادات أو ملفات الحفظ. ستحتاج إلى الإنترنت لإعادة تثبيت الحزمة أو إعادة تحميل الموقع." },
      cleanup_available: { en: "Incomplete offline files found. You can remove them safely.", ar: "عُثر على ملفات تشغيل دون إنترنت غير مكتملة؛ يمكنك إزالتها بأمان." },
      remove_incomplete: { en: "Some offline cache files remain. Please retry Remove.", ar: "لا تزال بعض ملفات التخزين دون إنترنت موجودة. يُرجى إعادة محاولة الإزالة." },
      storage_heading: { en: "Where is the offline package stored?", ar: "أين تُحفظ حزمة التشغيل دون إنترنت؟" },
      storage_location: { en: "Website and emulator files are saved in this browser's Cache Storage for this site. They are NOT downloaded to your Downloads folder and are not a separate ZIP file.", ar: "تُحفظ ملفات الموقع والمحرك داخل مساحة التخزين المحلية لهذا المتصفح (Cache Storage)، وليست في مجلد التنزيلات (Downloads) ولا في ملف ZIP مستقل." },
      storage_site: { en: "Storage site address:", ar: "عنوان الموقع المرتبط بالتخزين:" },
      storage_scope: { en: "This storage belongs to the current browser profile and site address (including its port). A different browser, profile or site address does not automatically share it. Clearing site data can erase the package.", ar: "تخص مساحة التخزين هذا المتصفح وملف المستخدم وعنوان الموقع، بما في ذلك رقم المنفذ. إذا فتحت الموقع من عنوان أو متصفح آخر، فلن تستخدم تلقائيًا الحزمة نفسها. وقد يؤدي مسح بيانات الموقع إلى حذفها." },
      storage_inspect: { en: "On desktop, view it with F12 > Application > Cache Storage. Look for neogeo-static-offline-v1-.... The physical disk folder is browser-managed and may differ between devices and profiles.", ar: "للاطلاع عليها من الكمبيوتر: افتح أدوات المطور (F12)، ثم Application > Cache Storage. يختار المتصفح موقع الملفات الفعلي على القرص ولا يوجد مسار ثابت مشترك بين الأجهزة." },
      storage_saved: { en: "Saved to this browser's Cache Storage for:", ar: "تم حفظ الملفات في مساحة المتصفح المحلية المرتبطة بهذا العنوان:" },
      storage_privacy: { en: "Your personal ROM and BIOS files stay in the local locations you selected; they are not copied or moved into this package automatically.", ar: "تظل ملفات الألعاب ROM وBIOS في مواقعها الأصلية التي اخترتها، ولا تُنقل أو تُنسخ إلى هذه الحزمة تلقائيًا." },
      extension_note: {
        en: 'Troubleshooting: If offline setup fails, a download-manager browser extension, such as Internet Download Manager (IDM), may have intercepted a file request. Temporarily disable IDM integration or other download-manager extensions, then retry. You can re-enable them after setup.',
        ar: 'تنبيه: إذا فشل تجهيز التشغيل دون إنترنت، فقد تكون إضافة Internet Download Manager ‏(IDM) أو إحدى إضافات إدارة التنزيلات قد اعترضت طلب أحد الملفات. عطّل الإضافة مؤقتًا ثم أعد المحاولة، ويمكنك إعادة تفعيلها بعد اكتمال التجهيز.'
      },
      title: { en: 'Fully Offline Emulator', ar: 'دون الحاجة الى الاتصال بالانترنت بشكل كامل' },
      button: { en: "Install", ar: "تثبيت" },
      description: { en: 'Save the website and the complete emulator runtime locally for access without an internet connection.', ar: 'احتفظ بملفات الموقع والمحاكي كاملة داخل المتصفح لتشغيلها دون اتصال بالإنترنت.' },
      dialog_title: { en: 'Prepare fully offline emulation', ar: 'تجهيز المحاكي للعمل دون إنترنت' },
      confirm_intro: { en: 'The browser will download and verify every published website file required by this emulator, including its pages, interface, catalog, fonts/images, EmulatorJS and FBNeo/WebAssembly. The files will be stored in this browser for offline use.', ar: 'سيحمّل المتصفح ويتحقق من جميع ملفات الموقع اللازمة، وتشمل الصفحات والواجهة والفهرس والصور وملفات EmulatorJS ومحرك FBNeo/WebAssembly، ثم يحتفظ بها في تخزين المتصفح.' },
      download_size: { en: 'Website download', ar: 'حجم تنزيل ملفات الموقع' },
      files: { en: 'files', ar: 'ملفًا' },
      category_fbneo: { en: 'FBNeo + WebAssembly', ar: 'محرك FBNeo وWebAssembly' },
      category_emulatorjs: { en: 'EmulatorJS runtime', ar: 'ملفات محاكي EmulatorJS' },
      category_assets: { en: 'Site scripts, styles and images', ar: 'سكربتات الموقع والتنسيقات والصور' },
      category_pages: { en: 'Site pages', ar: 'صفحات الموقع' },
      category_other: { en: 'Catalog, licenses and support files', ar: 'فهرس الألعاب والتراخيص والملفات المساعدة' },
      local_files_note: { en: 'ROMs, BIOS and personal previews are NOT downloaded or copied. Continue using your own local files. Their saved folder references and browser permissions are separate.', ar: 'لن تُنزَّل أو تُنسخ ملفات ROMs أو BIOS أو صور مكتبتك الخاصة. سيستمر التشغيل باستخدام ملفاتك المحلية، وتظل صلاحيات الوصول إلى مجلداتها مستقلة.' },
      permissions_note: { en: 'After restarting the browser you may need to click Reconnect Saved Sources or grant file access again, even while offline. Do not clear site data or use private mode if you need persistence.', ar: 'بعد إعادة فتح المتصفح قد يلزم الضغط على «إعادة ربط المصادر المحفوظة» أو تجديد إذن قراءة الملفات حتى دون إنترنت. لا تمسح بيانات الموقع ولا تستخدم الوضع الخاص إن أردت الاحتفاظ بها.' },
      updates_note: { en: 'An internet connection is needed only for the initial website download and future updates. This does not stop the browser itself from attempting update checks while online.', ar: 'يلزم الاتصال بالإنترنت للتنزيل الأول وللتحديثات المستقبلية فقط. قد يحاول المتصفح نفسه فحص التحديثات أثناء الاتصال.' },
      start_download: { en: "Install", ar: "تثبيت" },
      cancel: { en: 'Cancel', ar: 'إلغاء' },
      downloading: { en: 'Downloading and verifying offline files', ar: 'جارٍ تنزيل ملفات التشغيل والتحقق منها' },
      ready: { en: 'Offline emulator ready', ar: 'المحاكي جاهز للعمل دون إنترنت' },
      ready_note: { en: 'You can now disconnect from the internet, reopen this site and play with your own local ROMs and BIOS.', ar: 'يمكنك الآن قطع الاتصال بالإنترنت وفتح هذا الموقع مجددًا واللعب باستخدام ملفات ROMs وBIOS المحلية.' },
      update_button: { en: "Update", ar: "تحديث" },
      update_available: { en: 'Offline pack saved; a newer website build is available', ar: 'حزمة دون إنترنت محفوظة؛ يوجد إصدار أحدث من الموقع' },
      remove_button: { en: "Remove", ar: "إزالة" },
      remove_explanation: { en: "Remove ONLY the Fully Offline Emulator website and engine caches from this browser profile? Other site caches, preferences, IndexedDB, game saves, ROMs, BIOS and local file references will NOT be deleted. Once removed, you will need an internet connection to reinstall or reload this site.", ar: "هل تريد إزالة ملفات الموقع والمحرك المخزنة لميزة التشغيل دون إنترنت فقط من هذا المتصفح؟ لن تُحذف ذاكرات التخزين الأخرى للموقع أو الإعدادات أو IndexedDB أو ملفات الحفظ أو ROMs أو BIOS أو مراجع الملفات المحلية. بعد الإزالة ستحتاج إلى الإنترنت لإعادة التثبيت أو تحميل الموقع من جديد." },
      not_installed: { en: 'Offline package not installed', ar: 'لم تُثبَّت حزمة التشغيل دون إنترنت' },
      failed: { en: 'Offline setup failed', ar: 'فشل تجهيز التشغيل دون إنترنت' },
      incomplete: { en: 'Not all offline files were saved.', ar: 'لم تُحفظ جميع الملفات اللازمة.' },
      invalid_manifest: { en: 'The offline asset list is invalid.', ar: 'قائمة ملفات التشغيل دون إنترنت غير صالحة.' },
      unsupported: { en: 'This browser or context does not support secure Service Workers.', ar: 'المتصفح أو سياق الصفحة لا يدعم Service Workers الآمنة.' },
      static_only: { en: 'Offline installation is available on the static GitHub Pages site.', ar: 'تثبيت التشغيل دون إنترنت متاح في نسخة GitHub Pages الثابتة.' },
      worker_unavailable: { en: 'Offline worker is unavailable. Reload while online and retry.', ar: 'خدمة التخزين دون إنترنت غير متاحة. أعد فتح الموقع أثناء الاتصال ثم حاول مجددًا.' },
      timeout: { en: 'The offline operation timed out. Try again with a stable connection.', ar: 'انتهت مهلة التجهيز دون إنترنت. حاول مجددًا باتصال ثابت.' },
      retry_note: { en: 'No complete offline package was activated. You can safely retry.', ar: 'لم تُفعَّل حزمة غير مكتملة؛ يمكنك إعادة المحاولة بأمان.' },
      no_game_copy: { en: 'Your personal games, BIOS and saved preferences were not removed.', ar: 'لم تُحذف ألعابك الخاصة أو BIOS أو إعداداتك المحفوظة.' }
    },
    offline_update: {
      title: { en: 'Offline Update Manager', ar: 'مدير تحديثات التشغيل دون إنترنت' },
      description: { en: 'Compare your installed offline package with the latest published site build. Download only after approval.', ar: 'قارن حزمة التشغيل دون إنترنت المثبتة بأحدث إصدار منشور. لن يبدأ التنزيل إلا بعد موافقتك.' },
      check_button: { en: 'Check for updates', ar: 'التحقق من التحديثات' },
      update_button: { en: 'Install verified update', ar: 'تثبيت التحديث المتحقق منه' },
      checking: { en: 'Checking offline package...', ar: 'جارٍ فحص حزمة التشغيل دون إنترنت...' },
      up_to_date: { en: 'Your offline package is up to date.', ar: 'حزمة التشغيل دون إنترنت محدثة.' },
      available: { en: 'An offline update is available.', ar: 'يتوفر تحديث جديد لحزمة التشغيل دون إنترنت.' },
      not_installed: { en: 'Install Fully Offline Emulator first using the card above.', ar: 'ثبّت حزمة المحاكي للعمل دون إنترنت أولًا من الخيار أعلاه.' },
      static_only: { en: 'Update checks are available on the published static website.', ar: 'التحقق من التحديثات متاح في نسخة الموقع الثابت المنشورة.' },
      offline: { en: 'Offline now. Your saved package is unchanged; check again when connected.', ar: 'أنت غير متصل حاليًا. حزمة التشغيل محفوظة كما هي؛ أعد الفحص عند الاتصال.' },
      unavailable: { en: 'Could not check for updates. Your installed package is unchanged.', ar: 'تعذر فحص التحديثات. لم تتغير الحزمة المثبتة.' },
      installed_build: { en: 'Installed build ID', ar: 'بصمة الحزمة المثبتة' },
      published_build: { en: 'Published build ID', ar: 'بصمة الحزمة المنشورة' },
      download_size: { en: 'Verified package download', ar: 'حجم تنزيل الحزمة المتحقق منها' },
      files: { en: 'files', ar: 'ملفًا' },
      invalid_manifest: { en: 'The published asset manifest is invalid.', ar: 'قائمة ملفات الإصدار المنشور غير صالحة.' },
      worker_outdated: { en: 'The newer Service Worker is not active. Reload online and try again; the old package remains usable.', ar: 'لم تنشط خدمة التشغيل الجديدة. أعد تحميل الصفحة أثناء الاتصال وحاول مجددًا؛ تظل الحزمة القديمة قابلة للاستخدام.' },
      worker_unavailable: { en: 'No existing Service Worker updater was found. Reload online and retry.', ar: 'تعذر الوصول إلى خدمة التحديث. أعد فتح الصفحة أثناء الاتصال ثم حاول مجددًا.' },
      changed_retry: { en: 'The published build changed during confirmation. Check again before installing.', ar: 'تغير الإصدار المنشور أثناء التأكيد. أعد فحص التحديثات قبل التثبيت.' },
      confirming: { en: 'Confirm the update in the Fully Offline dialog.', ar: 'يرجى الموافقة على التحديث في نافذة التشغيل دون إنترنت.' },
      preparing: { en: 'Preparing the approved update...', ar: 'جارٍ تجهيز التحديث بعد الموافقة...' },
      downloading: { en: 'The verified download has started in Fully Offline Emulator above.', ar: 'بدأ تنزيل الحزمة المتحقق منها في قسم التشغيل دون إنترنت أعلاه.' },
      privacy_note: { en: 'Checks fetch only the small published manifest. No ROMs, BIOS, saves or personal data are uploaded. An update requires confirmation and preserves the old package until verification. Reopen all website tabs after updating.', ar: 'يحمّل الفحص قائمة الملفات المنشورة الصغيرة فقط، ولا يرفع ROM أو BIOS أو ملفات الحفظ أو البيانات الشخصية. يتطلب التحديث موافقتك وتبقى الحزمة القديمة حتى اكتمال التحقق. أعد فتح تبويبات الموقع بعد التحديث.' }
    },
    performance_monitor: {
      title: { en: 'Performance Monitor', ar: 'مراقبة الأداء' },
      browser_measurement: { en: 'BROWSER + FBNeo', ar: 'المتصفح + FBNeo' },
      fps: { en: 'Browser FPS', ar: 'إطارات المتصفح' },
      frame: { en: 'Frame interval', ar: 'الفاصل بين الإطارات' },
      gameFps: { en: 'Game FPS (core)', ar: 'إطارات اللعبة (المحرك)' },
      emulationSpeed: { en: 'Emulation speed', ar: 'سرعة المحاكاة' },
      memory: { en: 'JS Heap', ar: 'ذاكرة JavaScript' },
      session: { en: 'Active session', ar: 'مدة اللعب النشطة' },
      chart: { en: 'Frame pacing · 30s', ar: 'انتظام الإطارات · 30 ثانية' },
      limitations: {
        en: 'Core frames / ~59.18 Hz. Does not detect original game slowdowns.',
        ar: 'إطارات المحرك / نحو 59.18 هرتز. لا يقيس البطء الأصلي داخل اللعبة.'
      },
      unavailable: { en: 'N/A', ar: 'غير متاح' },
      export: { en: 'Export performance JSON', ar: 'تصدير تقرير الأداء JSON' },
      settings_title: { en: 'Performance Monitor', ar: 'مراقبة الأداء' },
      settings_description: {
        en: 'Choose the HUD size (Full, Medium or Small) and position during gameplay. Fullscreen-safe; disabled by default.',
        ar: 'اختر حجم لوحة الأداء (كامل أو متوسط أو صغير) ومكانها أثناء اللعب. تعمل في وضع ملء الشاشة، وهي معطلة افتراضيًا.'
      },
      settings_toggle: { en: 'Show monitor while playing', ar: 'إظهار مراقبة الأداء أثناء اللعب' },
      hud_size_label: { en: 'HUD size', ar: 'حجم لوحة الأداء' },
      hud_position_label: { en: 'HUD position', ar: 'موضع لوحة الأداء' },
      hud_full: { en: 'Full — all metrics + graph', ar: 'كامل — جميع المؤشرات مع الرسم' },
      hud_medium: { en: 'Medium — four key metrics', ar: 'متوسط — أربعة مؤشرات أساسية' },
      hud_small: { en: 'Small — Game FPS and session only', ar: 'صغير — إطارات اللعبة ومدة اللعب فقط' },
      hud_top_left: { en: 'Top left', ar: 'أعلى اليسار' },
      hud_top_center: { en: 'Top center', ar: 'أعلى المنتصف' },
      hud_top_right: { en: 'Top right', ar: 'أعلى اليمين' },
      hud_middle_left: { en: 'Middle left', ar: 'منتصف اليسار' },
      hud_middle_right: { en: 'Middle right', ar: 'منتصف اليمين' },
      hud_bottom_left: { en: 'Bottom left', ar: 'أسفل اليسار' },
      hud_bottom_center: { en: 'Bottom center', ar: 'أسفل المنتصف' },
      hud_bottom_right: { en: 'Bottom right', ar: 'أسفل اليمين' },
    },
    startup: {
      loading: { en: 'Loading', ar: 'جارٍ التحميل' },
      preparing_arcade: {
        en: 'Preparing your arcade…',
        ar: 'جارٍ تجهيز مكتبة الألعاب…'
      }
    },
    app: {
      last_played_game_description: { en: 'Last played game — continue playing from your local library.', ar: 'آخر لعبة لعبتها — تابع اللعب باستخدام مكتبتك المحلية.' },
      load_more_games: { en: 'Load More Games', ar: 'تحميل المزيد من الألعاب' },
      showing_games_count: { en: 'Showing {shown} of {total} games', ar: 'عرض {shown} من أصل {total} لعبة' },
      fighting: {
        en: 'Fighting',
        ar: 'قتال'
      },
      action: {
        en: 'Action',
        ar: 'أكشن'
      },
      shooters: {
        en: 'Shooters',
        ar: 'تصويب'
      },
      sports: {
        en: 'Sports',
        ar: 'رياضة'
      },
      puzzles: {
        en: 'Puzzles',
        ar: 'ألغاز'
      },
      other: {
        en: 'Other',
        ar: 'أخرى'
      },
      play: {
        en: 'Play',
        ar: 'تشغيل'
      },
      game_image: {
        en: 'Game image:',
        ar: 'صورة لعبة'
      },
      play_game: {
        en: 'Play game',
        ar: 'تشغيل اللعبة'
      },
      remove_from_favorites: {
        en: 'Remove from favorites',
        ar: 'إزالة من المفضلة'
      },
      add_to_favorites: {
        en: 'Add to favorites',
        ar: 'أضف إلى المفضلة'
      },
      favorite_games: {
        en: 'Favorite games',
        ar: 'الألعاب المفضلة'
      },
      games_with_previews: {
        en: 'Games with previews',
        ar: 'الألعاب المصوّرة'
      },
      all_games: {
        en: 'All games',
        ar: 'جميع الألعاب'
      },
      search_results_in: {
        en: 'Search results in',
        ar: 'نتائج البحث في'
      },
      browse: {
        en: 'Browse',
        ar: 'تصفح'
      },
      no_games_are_linked_yet_use_the: {
        en: 'No games are linked yet. Use the Local Library Manager above to select ROMs and neogeo.zip.',
        ar: 'لم يتم ربط أي أشرطة ألعاب بعد. استخدم لوحة «مدير المكتبة المحلية» أعلاه لاختيار مجلد ROMs وملف neogeo.zip.'
      },
      your_favorites_are_empty_select_the_heart: {
        en: 'Your favorites are empty. Select the heart on a game card to add it here.',
        ar: 'قائمة المفضلة فارغة حالياً. اضغط رمز ♥ أعلى أي بطاقة لعبة لإضافتها هنا.'
      },
      no_games_match_this_category_or_search: {
        en: 'No games match this category or search.',
        ar: 'لا توجد ألعاب مطابقة لهذا التصنيف أو عبارة البحث الحالية.'
      },
      a_verified_arcade_game_from_your_local: {
        en: 'A verified arcade game from your local library. Play without uploading your files.',
        ar: 'شريط أركيد موثّق من مكتبتك المحلية. انطلق مباشرة إلى شاشة اللعب بكامل دقة الصوت والتحكم دون رفع أي ملفات للإنترنت.'
      },
      ready: {
        en: 'Ready ✓',
        ar: 'جاهز ✓'
      },
      missing: {
        en: 'Missing',
        ar: 'مفقود'
      },
      fbneo_is_included: {
        en: 'FBNeo is included',
        ar: 'FBNeo مضمّن في الموقع'
      },
      engine_ready: {
        en: 'Engine ready',
        ar: 'المحرك جاهز للتشغيل'
      },
      engine_installation_required: {
        en: 'Engine installation required',
        ar: 'المحرك يحتاج تثبيتًا'
      },
      fbneo_files_are_incomplete_run_py_3: {
        en: 'FBNeo files are incomplete. Run py -3 manage.py engine install',
        ar: 'محرك FBNeo غير مكتمل. نفّذ py -3 manage.py engine install'
      },
      link_bios_neogeo_zip_using_the_local: {
        en: 'Link BIOS (neogeo.zip) using the Local Library Manager below.',
        ar: 'اربط ملف BIOS (neogeo.zip) من لوحة المكتبة المحلية أدناه.'
      },
      neogeo_zip_was_not_found_in_roms: {
        en: 'neogeo.zip was not found in ROMs.',
        ar: 'لم يتم العثور على neogeo.zip في مجلد ROMs.'
      },
      link_previews_to_display_game_images: {
        en: 'Link PREVIEWS to display game images.',
        ar: 'اربط مجلد PREVIEWS من لوحة المكتبة لإظهار صور الألعاب.'
      },
      no_matching_images_found_check_previews: {
        en: 'No matching images found. Check PREVIEWS.',
        ar: 'لم يتم العثور على صور مطابقة. تحقق من مجلد PREVIEWS.'
      },
      could_not_load_the_local_game_library: {
        en: 'Could not load the local game library:',
        ar: 'فشل تحميل مكتبة الألعاب من الخادم المحلي:'
      }
    },
    shortcuts: {
      open: { en: 'Keyboard shortcuts', ar: 'اختصارات لوحة المفاتيح' },
      title: { en: 'Keyboard Shortcuts', ar: 'اختصارات لوحة المفاتيح' },
      description: { en: 'Quick reference for the built-in emulator actions and default game controls.', ar: 'دليل سريع لاختصارات المحاكي المدمجة وأزرار اللعب الافتراضية.' },
      quick_title: { en: 'Emulator shortcuts', ar: 'اختصارات المحاكي' },
      fullscreen: { en: 'Enter fullscreen', ar: 'ملء الشاشة' },
      fullscreen_desc: { en: 'While playing, press + or Numpad +.', ar: 'أثناء اللعب، اضغط + أو علامة + في لوحة الأرقام.' },
      pause: { en: 'Pause / resume', ar: 'إيقاف مؤقت / متابعة' },
      pause_desc: { en: 'Press Tab while the game is running.', ar: 'اضغط Tab أثناء تشغيل اللعبة.' },
      exit: { en: 'Return to library', ar: 'العودة إلى المكتبة' },
      exit_desc: { en: 'Press Esc twice within two seconds during gameplay.', ar: 'اضغط Esc مرتين خلال ثانيتين أثناء اللعب.' },
      search: { en: 'Search the library', ar: 'البحث في المكتبة' },
      search_desc: { en: 'On Home, press / to focus search; Esc clears it.', ar: 'في الصفحة الرئيسية، اضغط / للبحث؛ وEsc لمسح البحث.' },
      defaults_title: { en: 'Default game controls', ar: 'أزرار اللعب الافتراضية' },
      move: { en: 'Player 1 movement', ar: 'حركة اللاعب الأول' },
      move_desc: { en: 'Move using the arrow keys.', ar: 'استخدم أسهم لوحة المفاتيح للحركة.' },
      actions: { en: 'Player 1 buttons', ar: 'أزرار اللاعب الأول' },
      actions_desc: { en: 'Neo-Geo A, B, C, D in this order.', ar: 'أزرار Neo-Geo: ‏A وB وC وD بالترتيب.' },
      credit: { en: 'Start / coin', ar: 'البدء / إضافة رصيد' },
      credit_desc: { en: '1 = Player 1 Start; 3 = Player 1 Coin.', ar: '‏1 = بدء اللاعب الأول؛ 3 = إضافة رصيد للاعب الأول.' },
      combos: { en: 'Player 1 combinations', ar: 'اختصارات دمج الأزرار' },
      combos_desc: { en: 'Q = A+B, R = A+B+C, E = C+D.', ar: '‏Q = A+B، وR = A+B+C، وE = C+D.' },
      p2: { en: 'Player 2 defaults', ar: 'الإعدادات الافتراضية للاعب الثاني' },
      p2_desc: { en: 'Numpad movement; J/K/L/P for A/B/C/D; 2 = Start, 4 = Coin. Enable Num Lock if needed.', ar: 'الحركة بلوحة الأرقام؛ J/K/L/P للأزرار A/B/C/D؛ 2 للبدء و4 لإضافة رصيد. فعّل Num Lock عند الحاجة.' },
      note: { en: 'Game controls can be customized in Settings. You can also enter fullscreen from the emulator toolbar; the browser may use Esc to leave fullscreen first.', ar: 'يمكن تخصيص أزرار اللعب من الإعدادات. ويمكن أيضًا تفعيل ملء الشاشة من شريط المحاكي؛ وقد يستخدم المتصفح Esc أولًا للخروج من ملء الشاشة.' },
      done: { en: 'Got it', ar: 'فهمت' }
    },
    index: {
      neo_geo_web_port_play_local_neo: {
        en: 'Neo-Geo Web Port — Play local Neo Geo games in your browser.',
        ar: 'Neo-Geo Web Port — تشغيل ألعاب Neo Geo المحلية داخل متصفحك.'
      },
      neo_geo_web_port_library: {
        en: 'Neo-Geo Web Port — Library',
        ar: 'Neo-Geo Web Port — المكتبة'
      },
      back_to_home: {
        en: 'Back to home',
        ar: 'العودة إلى الصفحة الرئيسية'
      },
      main_navigation: {
        en: 'Main navigation',
        ar: 'التنقل الرئيسي'
      },
      library: {
        en: 'Library',
        ar: 'المكتبة'
      },
      favorites: {
        en: 'Favorites',
        ar: 'المفضلة'
      },
      local_sources: {
        en: 'Local sources',
        ar: 'المصادر المحلية'
      },
      settings: {
        en: 'Settings',
        ar: 'الإعدادات'
      },
      featured_game: {
        en: 'Featured game',
        ar: 'اللعبة المميزة'
      },
      arcade: {
        en: 'Arcade,',
        ar: 'الأركيد،'
      },
      without_limits: {
        en: 'without limits.',
        ar: 'بلا حدود.'
      },
      neo_geo_the_way_you_love_to: {
        en: 'Neo Geo, the way you love to play.',
        ar: 'Neo Geo كما تحب أن تلعب.'
      },
      link_your_local_games_for_a_focused: {
        en: 'Link your local games for a focused arcade experience. Your files stay on your device.',
        ar: 'اربط ألعابك المحلية واستمتع بتجربة أركيد نظيفة ومباشرة من المتصفح؛ دون رفع ملفات الألعاب لأي خادم.'
      },
      start_playing: {
        en: 'Start playing',
        ar: 'ابدأ اللعب'
      },
      manage_library: {
        en: 'Manage library',
        ar: 'إدارة مكتبتك'
      },
      checking_engine: {
        en: 'Checking engine…',
        ar: 'فحص المحرك...'
      },
      featured_game_image: {
        en: 'Featured game image',
        ar: 'صورة اللعبة المميزة'
      },
      library_status: {
        en: 'Library status',
        ar: 'حالة المكتبة'
      },
      known_games: {
        en: 'Known games',
        ar: 'الألعاب المعروفة'
      },
      game_previews: {
        en: 'Game previews',
        ar: 'معاينات الألعاب'
      },
      archive_size: {
        en: 'Archive size',
        ar: 'حجم الأرشيف'
      },
      bios_status: {
        en: 'BIOS status',
        ar: 'نظام التشغيل'
      },
      search_games_series_or_rom_filenames: {
        en: 'Search games, series, or ROM filenames…',
        ar: 'ابحث عن لعبة، سلسلة، أو اسم ROM...'
      },
      search_library: {
        en: 'Search library',
        ar: 'البحث في المكتبة'
      },
      sort: {
        en: 'Sort',
        ar: 'الترتيب'
      },
      sort_games: {
        en: 'Sort games',
        ar: 'ترتيب الألعاب'
      },
      by_name: {
        en: 'By name',
        ar: 'بالاسم'
      },
      by_size: {
        en: 'By size',
        ar: 'بالحجم'
      },
      by_rom_filename: {
        en: 'By ROM filename',
        ar: 'بملف ROM'
      },
      game_categories: {
        en: 'Game categories',
        ar: 'تصنيفات الألعاب'
      },
      loading_your_local_library: {
        en: 'Loading your local library…',
        ar: 'جارٍ تحميل مكتبتك المحلية...'
      },
      site_footer: {
        en: 'Site footer',
        ar: 'تذييل موقع المحاكي'
      },
      neo_geo_web_port_home: {
        en: 'Neo-Geo Web Port — Home',
        ar: 'Neo-Geo Web Port — الصفحة الرئيسية'
      },
      '2026_neo_geo_web_port_website_design': {
        en: '© 2026 Neo-Geo Web Port — Website design and development by the project owner.',
        ar: '© 2026 Neo-Geo Web Port — حقوق تصميم وتطوير الموقع محفوظة لصاحب المشروع.'
      },
      neo_geo_games_and_trademarks_belong_to: {
        en: 'Neo Geo games and trademarks belong to their respective owners. Your files are not uploaded.',
        ar: 'ألعاب Neo Geo وعلاماتها التجارية ملك لأصحاب حقوقها. ملفات المستخدم لا تُرفع إلى الموقع.'
      },
      library_setup_guide: {
        en: 'Library setup guide',
        ar: 'دليل تشغيل المكتبة'
      },
      back_to_top: {
        en: 'Back to top',
        ar: 'العودة إلى أعلى الصفحة'
      },
      close_setup_guide: {
        en: 'Close setup guide',
        ar: 'إغلاق دليل البداية'
      },
      ready_for_neo_geo: {
        en: 'Ready for Neo Geo?',
        ar: 'جاهز لعالم Neo Geo؟'
      },
      prepare_these_three_local_sources_and_link: {
        en: 'Prepare these three local sources and link them to the player. No file uploads are needed.',
        ar: 'لأفضل تجربة تشغيل محلية، جهّز هذه المصادر الثلاثة على جهازك واربطها بالمحاكي. لا يحتاج الموقع إلى رفع ملفاتك إلى الإنترنت.'
      },
      required: {
        en: 'Required',
        ar: 'ضروري'
      },
      your_game_files_extract_the_game_package: {
        en: 'Your game files. Extract the game package, then select the',
        ar: 'ملفات الألعاب التي ستشغّلها. بعد استخراج حزمة الألعاب، اختر مجلد'
      },
      folder_containing_the_zip_games_keep_each: {
        en: 'folder containing the ZIP games. Keep each game ZIP compressed.',
        ar: 'الذي يحتوي على ألعاب بصيغة ZIP؛ اترك ملفات كل لعبة مضغوطة كما هي.'
      },
      recommended: {
        en: 'Recommended',
        ar: 'لأفضل عرض'
      },
      previews_help_you_recognize_games_in_the: {
        en: 'Previews help you recognize games in the library. Select the',
        ar: 'صور معاينة الألعاب، لتظهر أغلفة ولقطات الألعاب داخل المكتبة ويسهل التعرف إليها. اختر مجلد'
      },
      folder_after_extracting_the_image_package_games: {
        en: 'folder after extracting the image package. Games work without previews.',
        ar: 'بعد استخراج حزمة الصور. يمكن تشغيل الألعاب بدونه، لكن العرض سيكون أقل اكتمالًا.'
      },
      neo_geo_system_files_required_by_fbneo: {
        en: 'Neo Geo system files required by FBNeo. Select',
        ar: 'ملفات نظام Neo Geo التي يحتاجها FBNeo لبدء الألعاب. اختر ملف'
      },
      from_the_bios_folder_keep_this_inner: {
        en: 'from the BIOS folder. Keep this inner ZIP compressed.',
        ar: 'من مجلد BIOS؛ لا تفك ضغط الملف الداخلي نفسه.'
      },
      swipe_horizontally_to_view_all_three_sources: {
        en: 'Swipe horizontally to view all three sources ← →',
        ar: 'مرّر البطاقات أفقيًا لعرض المصادر الثلاثة ← →'
      },
      files_stay_on_your_device_brave_may: {
        en: 'Files stay on your device. Brave may ask you to select session files again after closing the browser. Games are never copied into browser storage without your consent.',
        ar: 'الملفات تبقى على جهازك. في Brave قد تحتاج إلى اختيار ملفات الجلسة مجددًا بعد إغلاق المتصفح؛ ولن ينسخ المحاكي ألعابك إلى التخزين دون موافقتك.'
      },
      got_it_set_up_library: {
        en: 'Got it — set up library',
        ar: 'فهمت — إعداد المكتبة'
      },
      explore_first: {
        en: 'Explore first',
        ar: 'سأتصفح الموقع أولًا'
      }
    },
    player: {
      neo_geo_web_port_player: {
        en: 'Neo-Geo Web Port — Player',
        ar: 'Neo-Geo Web Port — تشغيل الألعاب'
      },
      back_to_library: {
        en: 'Back to library',
        ar: 'العودة للمكتبة'
      },
      press_esc_again_to_return_to_library: {
        en: 'Press Esc again to return to the library',
        ar: 'اضغط Esc مرة ثانية للعودة إلى المكتبة'
      },
      current_game: {
        en: 'Current game',
        ar: 'عنوان اللعبة النشطة'
      },
      initializing_emulator: {
        en: 'Initializing emulator…',
        ar: 'تهيئة المحاكي...'
      },
      checking_local_game_files: {
        en: 'Checking local game files…',
        ar: 'جارٍ فحص ملفات اللعبة المحلية...'
      },
      focus_on_the_game: {
        en: 'Focus on the game',
        ar: 'ركز على اللعبة'
      },
      click_the_game_screen_to_focus_the: {
        en: 'Click the game screen to focus the keyboard, or use the EmulatorJS toolbar.',
        ar: 'انقر داخل الشاشة لتوجيه لوحة المفاتيح، أو استخدم شريط أدوات EmulatorJS للتحكم.'
      },
      diagnostics_and_save_states: {
        en: 'Diagnostics and save states',
        ar: 'التشخيص التقني وملفات الحفظ'
      },
      no_events_yet: {
        en: 'No events yet.',
        ar: 'لا توجد أحداث بعد.'
      },
      copy_report: {
        en: 'Copy report',
        ar: 'نسخ التقرير'
      },
      export_json: {
        en: 'Export JSON',
        ar: 'تصدير JSON'
      },
      runtime_report_copied_you_can_share_it: {
        en: 'Runtime report copied. You can share it in the conversation.',
        ar: 'تم نسخ تقرير التشغيل. يمكنك إرساله في المحادثة.'
      },
      automatic_copying_failed_select_the_diagnostic_text: {
        en: 'Automatic copying failed. Select the diagnostic text and copy it manually.',
        ar: 'تعذر النسخ التلقائي؛ حدد النص الموجود في مربع التشخيص وانسخه يدويًا.'
      },
      no_valid_game_zip_selected_return_to: {
        en: 'No valid game ZIP selected. Return to the library.',
        ar: 'لم يتم اختيار ملف لعبة ZIP صالح. ارجع إلى المكتبة.'
      },
      the_selected_file_is_not_in_the: {
        en: 'The selected file is not in the local library.',
        ar: 'الملف المحدد غير موجود في مكتبة الألعاب المحلية.'
      },
      fbneo_files_are_incomplete_p0_p1_stop: {
        en: 'FBNeo files are incomplete ({p0}/{p1}). Stop the server and run: py -3 manage.py engine install',
        ar: 'ملفات FBNeo غير مكتملة ({p0}/{p1}). أوقف الخادم ثم نفّذ: py -3 manage.py engine install'
      },
      bios_neogeo_zip_was_not_found_in: {
        en: 'BIOS (neogeo.zip) was not found in ROMs.',
        ar: 'ملف BIOS (neogeo.zip) غير موجود في ROMs.'
      },
      required_asset_missing: {
        en: 'Required asset missing:',
        ar: 'ملف أساسي مفقود:'
      },
      run_py_3_manage_py_engine_install: {
        en: '— run py -3 manage.py engine install',
        ar: '— نفّذ py -3 manage.py engine install'
      },
      cannot_read_the_game_or_bios_from: {
        en: 'Cannot read the game or BIOS from the local server.',
        ar: 'لا يمكن قراءة اللعبة أو BIOS من الخادم المحلي.'
      },
      file_checks_complete_starting_fbneo_select_start: {
        en: 'File checks complete. Starting FBNeo. Select Start/Play in the emulator when it appears.',
        ar: 'اكتملت فحوص الملفات. جارٍ تشغيل واجهة FBNeo. اضغط زر Start/Play داخل المحاكي عندما يظهر.'
      },
      emulator_ready_select_start_to_launch_the: {
        en: 'Emulator ready. Select Start to launch the game. If the screen stays black, open diagnostics and copy the report.',
        ar: 'واجهة المحاكي جاهزة. اضغط Start لتشغيل اللعبة. إذا بقيت الشاشة سوداء، افتح «تشخيص تشغيل اللعبة» وانسخ التقرير.'
      },
      fbneo_could_not_initialize_the_game_open: {
        en: 'FBNeo could not initialize the game. Open diagnostics or export JSON to see the required file.',
        ar: 'رفض FBNeo تهيئة اللعبة. افتح التشخيص أو صدّر JSON لقراءة الملف المطلوب.'
      },
      could_not_load_the_local_loader_js: {
        en: 'Could not load the local loader.js file.',
        ar: 'تعذّر تحميل ملف loader.js من المشروع المحلي.'
      },
      could_not_initialize_the_game_or_engine: {
        en: 'Could not initialize the game or engine assets:',
        ar: 'فشل تهيئة اللعبة أو ملفات المحرك:'
      }
    },
    settings: {
      library_load_more_title: {
        en: 'Load More Games',
        ar: 'عرض الألعاب على دفعات'
      },
      library_load_more_description: {
        en: 'Show 30 games at a time with Load More Games. Turn off to show all matching games immediately. Game card animations stay enabled.',
        ar: 'اعرض 30 لعبة في كل دفعة باستخدام زر «تحميل المزيد من الألعاب». عند تعطيل الخيار تظهر جميع الألعاب المطابقة مباشرة، مع استمرار حركات ظهور الألعاب.'
      },
      library_load_more_enable: {
        en: 'Enable Load More Games',
        ar: 'تفعيل زر تحميل المزيد من الألعاب'
      },
      neo_geo_web_port_settings: {
        en: 'Neo-Geo Web Port — Settings',
        ar: 'Neo-Geo Web Port — الإعدادات'
      },
      neo_geo_web_port_home_page: {
        en: 'Neo-Geo Web Port — Home page',
        ar: 'Neo-Geo Web Port — الرئيسية'
      },
      setup_guide: {
        en: 'Setup guide',
        ar: 'دليل البداية'
      },
      settings_overview: {
        en: 'Settings overview',
        ar: 'مقدمة الإعدادات'
      },
      your_space: {
        en: 'Your space.',
        ar: 'مساحتك.'
      },
      your_rules: {
        en: 'Your rules.',
        ar: 'قواعدك.'
      },
      customize_controls_audio_and_video_in_one: {
        en: 'Customize controls, audio, and video in one place. Saved preferences apply to the next game session.',
        ar: 'كل ما تحتاجه لتخصيص تجربة اللعب والصوت والعرض في مكان واحد. الإعدادات المحفوظة تُطبّق عند بدء الجلسة التالية.'
      },
      system_sections: {
        en: 'System sections',
        ar: 'أقسام النظام'
      },
      emulator_settings_sections: {
        en: 'Emulator settings sections',
        ar: 'أقسام إعدادات المحاكي'
      },
      controls_and_keys: {
        en: 'Controls and keys',
        ar: 'التحكم والأزرار'
      },
      file_directories: {
        en: 'File directories',
        ar: 'مجلدات الملفات'
      },
      video_and_display: {
        en: 'Video and display',
        ar: 'الفيديو والعرض'
      },
      audio: {
        en: 'Audio',
        ar: 'الصوت'
      },
      system: {
        en: 'System',
        ar: 'الجهاز والنظام'
      },
      more_options: {
        en: 'More options',
        ar: 'خيارات إضافية'
      },
      reading_engine_status: {
        en: 'Reading engine status…',
        ar: 'جارٍ قراءة حالة المحرك...'
      },
      save_changes: {
        en: 'Save changes',
        ar: 'حفظ التعديلات'
      },
      restore_defaults: {
        en: 'Restore defaults',
        ar: 'استعادة الافتراضي'
      },
      configure_keyboard_bindings_and_check_connected_controllers: {
        en: 'Configure keyboard bindings and check connected controllers.',
        ar: 'إعداد أزرار لوحة المفاتيح وفحص أذرع التحكم المتصلة.'
      },
      directories_and_sources: {
        en: 'Directories and sources',
        ar: 'المجلدات والمصادر'
      },
      manage_local_roms_previews_and_bios_references: {
        en: 'Manage local ROMs, PREVIEWS, and BIOS references.',
        ar: 'إدارة مراجع ROMs وPREVIEWS وBIOS المحلية.'
      },
      video_and_graphics: {
        en: 'Video and graphics',
        ar: 'العرض والرسوم'
      },
      adjust_aspect_ratio_pixel_edges_and_display: {
        en: 'Adjust aspect ratio, pixel edges, and display effects.',
        ar: 'ضبط نسبة العرض وحواف البيكسلات والمؤثرات البصرية.'
      },
      audio_system: {
        en: 'Audio system',
        ar: 'النظام الصوتي'
      },
      set_the_default_startup_volume: {
        en: 'Set the default startup volume.',
        ar: 'ضبط مستوى الصوت الافتراضي عند بدء التشغيل.'
      },
      emulator_interface_language_and_system_preferences: {
        en: 'Emulator interface language and system preferences.',
        ar: 'لغة واجهة المحاكي وإعدادات النظام.'
      },
      automatic_startup_fullscreen_exit_confirmation_and_diagnostics: {
        en: 'Automatic startup, fullscreen, exit confirmation, and diagnostics.',
        ar: 'التشغيل التلقائي وملء الشاشة وتأكيد الخروج والتشخيص.'
      },
      reading_path: {
        en: 'Reading path…',
        ar: 'جارٍ قراءة المسار...'
      },
      global_controls_neo_geo_custom: {
        en: 'Global controls — Neo Geo Custom',
        ar: 'التحكم الموحد — Neo Geo Custom'
      },
      set_both_players_keys_once_new_sessions: {
        en: "Set both players' keys once. New sessions use the profile without changing emulator files.",
        ar: 'اضبط الأزرار مرة واحدة للاعبين؛ تطبق تلقائيًا عند فتح كل لعبة Neo Geo جديدة، دون تغيير ملفات المحاكي الأصلية.'
      },
      controller_check_gamepad: {
        en: 'Controller check — Gamepad',
        ar: 'فحص يد التحكم — Gamepad'
      },
      check_connected_controllers_before_configuring_them_in: {
        en: 'Check connected controllers before configuring them in EmulatorJS.',
        ar: 'تحقق من يد التحكم المتصلة قبل ضبط أزرارها داخل EmulatorJS.'
      },
      check_controllers: {
        en: 'Check controllers',
        ar: 'فحص يد التحكم'
      },
      local_library_roms_previews_bios: {
        en: 'Local library (ROMs / PREVIEWS / BIOS)',
        ar: 'المكتبة المحلية (ROMs / PREVIEWS / BIOS)'
      },
      the_browser_stores_read_only_references_without: {
        en: 'The browser stores read-only references, without Windows path strings or file uploads.',
        ar: 'تُحفظ مراجع القراءة فقط في المتصفح؛ لا مسارات Windows نصية ولا رفع للملفات.'
      },
      open_local_library_manager: {
        en: 'Open Local Library Manager',
        ar: 'فتح مدير المكتبة المحلية واختيار المجلدات'
      },
      game_directory_roms: {
        en: 'Game directory (ROMs)',
        ar: 'مسار ملفات الألعاب (ROMs)'
      },
      the_server_reads_zips_in_place_without: {
        en: 'The server reads ZIPs in place without copying the 2.7 GB library.',
        ar: 'يقرأ الخادم ملفات ZIP من المجلد الأصلي دون نسخ 2.7 GB.'
      },
      preview_directory_previews: {
        en: 'Preview directory (PREVIEWS)',
        ar: 'مسار صور المعاينة (PREVIEWS)'
      },
      '190_bmp_previews_linked_to_original_neoragex': {
        en: '190 BMP previews linked to original NeoRAGEx IDs.',
        ar: '190 صورة BMP مرتبطة بمعرفات NeoRAGEx الأصلية.'
      },
      game_area_and_aspect_ratio: {
        en: 'Game area and aspect ratio',
        ar: 'حجم مساحة اللعب ونسبة العرض'
      },
      choose_how_the_game_fits_your_browser: {
        en: 'Choose how the game fits your browser window.',
        ar: 'اختيار الحجم ونسبة العرض الأنسب لشاشة المتصفح.'
      },
      fit_window: {
        en: 'Fit window',
        ar: 'ملاءمة الشاشة الكاملة (Fit)'
      },
      classic_arcade_4_3: {
        en: 'Classic arcade 4:3',
        ar: 'نسبة أركيد 4:3 كلاسيكية'
      },
      compact_original_size: {
        en: 'Compact / original size',
        ar: 'مساحة مدمجة / شاشة قياسية'
      },
      sharp_pixels: {
        en: 'Sharp pixels',
        ar: 'حواف البيكسل الحادة'
      },
      keep_pixel_art_crisp_instead_of_applying: {
        en: 'Keep pixel art crisp instead of applying smoothing.',
        ar: 'عرض رسوم البيكسل بحواف حادة واضحة بدل التنعيم الضبابي الافتراضي.'
      },
      enable_sharp_pixels: {
        en: 'Enable sharp pixels',
        ar: 'تفعيل بيكسلات حادة (Pixelated Rendering)'
      },
      scanlines: {
        en: 'Scanlines',
        ar: 'خطوط مسح الشاشة (Scanlines)'
      },
      add_arcade_style_scanlines_over_the_game: {
        en: 'Add arcade-style scanlines over the game area.',
        ar: 'تأثير خطوط شاشات الأركيد الكلاسيكية فوق مساحة اللعب دون التأثير على الأداء.'
      },
      show_scanlines: {
        en: 'Show scanlines',
        ar: 'إظهار خطوط Scanlines'
      },
      arcade_contrast_crt: {
        en: 'Arcade contrast (CRT)',
        ar: 'تباين شاشة الأركيد (CRT)'
      },
      adjust_contrast_and_color_saturation_for_an: {
        en: 'Adjust contrast and color saturation for an arcade-style display.',
        ar: 'تحسين تباين الشاشة وإشباع الألوان لمحاكاة توهج شاشات الأركيد الكلاسيكية.'
      },
      enable_crt_effect: {
        en: 'Enable CRT effect',
        ar: 'تفعيل تأثير شاشة CRT'
      },
      master_volume: {
        en: 'Master volume',
        ar: 'مستوى الصوت الرئيسي'
      },
      set_the_initial_game_volume: {
        en: 'Set the initial game volume.',
        ar: 'يضبط مستوى الصوت الأولي عند إقلاع اللعبة.'
      },
      volume: {
        en: 'Volume',
        ar: 'مستوى الصوت'
      },
      emulator_menu_language: {
        en: 'Emulator menu language',
        ar: 'لغة واجهة التشغيل'
      },
      language_of_emulatorjs_menus_inside_the_player: {
        en: 'Language of EmulatorJS menus inside the player.',
        ar: 'لغة قوائم EmulatorJS المدمجة داخل شاشة اللعب.'
      },
      arabic_ar_ar: {
        en: 'Arabic (ar-AR)',
        ar: 'العربية (ar-AR)'
      },
      automatic_startup: {
        en: 'Automatic startup',
        ar: 'التشغيل التلقائي'
      },
      start_after_file_checks_your_browser_may: {
        en: 'Start after file checks. Your browser may require a click to enable audio.',
        ar: 'بدء اللعبة تلقائيًا فور انتهاء فحص الملفات (قد يطلب المتصفح نقرة لتفعيل الصوت).'
      },
      start_when_ready: {
        en: 'Start when ready',
        ar: 'بدء اللعبة تلقائيًا عند الجاهزية'
      },
      fullscreen_on_startup: {
        en: 'Fullscreen on startup',
        ar: 'ملء الشاشة عند الإقلاع'
      },
      request_fullscreen_when_the_game_starts: {
        en: 'Request fullscreen when the game starts.',
        ar: 'طلب الدخول في وضع الشاشة الكاملة عند بدء اللعب.'
      },
      start_in_fullscreen: {
        en: 'Start in fullscreen',
        ar: 'تفعيل ملء الشاشة عند البدء'
      },
      confirm_exit: {
        en: 'Confirm exit',
        ar: 'تأكيد الخروج'
      },
      ask_before_closing_the_emulator: {
        en: 'Ask before closing the emulator.',
        ar: 'إظهار تنبيه تأكيد عند محاولة إغلاق المحاكي.'
      },
      ask_before_exiting: {
        en: 'Ask before exiting',
        ar: 'طلب التأكيد قبل الخروج'
      },
      runtime_diagnostics: {
        en: 'Runtime diagnostics',
        ar: 'سجل التشخيص التقني'
      },
      record_loading_stages_and_sha_256_checks: {
        en: 'Record loading stages and SHA-256 checks to investigate startup problems.',
        ar: 'تسجيل مراحل تحميل المحرك وفحص SHA-256 في شاشة اللاعب لتسهيل الفحص.'
      },
      enable_runtime_diagnostics: {
        en: 'Enable runtime diagnostics',
        ar: 'تفعيل سجل تشخيص تشغيل الألعاب'
      },
      you_have_unsaved_changes_select_save_changes: {
        en: 'You have unsaved changes. Select Save changes to keep them.',
        ar: 'تنبيه: لديك تغييرات غير محفوظة — اضغط «حفظ التعديلات».'
      },
      detected: {
        en: '✓ Detected:',
        ar: '✓ تم اكتشاف:'
      },
      no_active_controllers_detected_connect_one_press: {
        en: 'No active controllers detected. Connect one, press a button, and check again.',
        ar: 'لم تُكتشف أي يد تحكم نشطة. وصّل الذراع واضغط أحد أزرارها ثم أعد الفحص.'
      },
      settings_saved_locally_game_preferences_apply_to: {
        en: '✓ Settings saved locally. Game preferences apply to the next session.',
        ar: '✓ تم حفظ الإعدادات محليًا بنجاح. ستُطبّق الخيارات عند فتح لعبة جديدة.'
      },
      could_not_save_to_browser_storage: {
        en: 'Could not save to browser storage.',
        ar: 'تعذّر الحفظ في التخزين المحلي للمتصفح.'
      },
      defaults_restored: {
        en: '↺ Defaults restored.',
        ar: '↺ تمت استعادة القيم الافتراضية بنجاح.'
      }
    },
    state_guard: {
      this_save_state_is_damaged_or_incompatible: {
        en: 'This save state is damaged or incompatible with the current game.',
        ar: 'ملف الحفظ تالف أو غير متوافق مع اللعبة الحالية.'
      }
    },
    controls_ui: {
      one_control_profile_for_all_neo_geo: {
        en: 'One control profile for all Neo Geo games',
        ar: 'ملف تحكم واحد لجميع ألعاب Neo Geo'
      },
      your_custom_layout_for_both_players_updated: {
        en: 'Your custom layout for both players. Updated keys apply to newly opened games.',
        ar: 'توزيعك المخصص للاعبين؛ غيّر أي مفتاح هنا وسيُستخدم عند فتح أي لعبة جديدة.'
      },
      player: {
        en: 'Player',
        ar: 'اللاعب'
      },
      player_1_p1: {
        en: 'Player 1 — P1',
        ar: 'اللاعب الأول — P1'
      },
      player_2_p2: {
        en: 'Player 2 — P2',
        ar: 'اللاعب الثاني — P2'
      },
      player_2_needs_num_lock_for_the: {
        en: 'Player 2 needs Num Lock for the keypad. Physical controllers use existing EmulatorJS mappings; NeoRAGEx button numbers do not necessarily match the Gamepad API.',
        ar: 'تنبيه: يحتاج اللاعب الثاني إلى تشغيل Num Lock عند استخدام لوحة الأرقام. يد التحكم المادية تستخدم تعيينات EmulatorJS الحالية؛ لا نفترض أن أرقام NeoRAGEx القديمة تطابق Gamepad API.'
      },
      restore_custom_layout: {
        en: 'Restore custom layout',
        ar: 'استعادة التوزيع المخصص'
      },
      export_controls_json: {
        en: 'Export controls JSON',
        ar: 'تصدير الإعدادات JSON'
      },
      import_controls_json: {
        en: 'Import controls JSON',
        ar: 'استيراد الإعدادات JSON'
      },
      select_a_binding_and_press_a_key: {
        en: 'Select a binding and press a key. No need to configure each game separately.',
        ar: 'انقر على أي مفتاح لتسجيل مفتاح جديد؛ لا حاجة لضبط الأزرار لكل لعبة.'
      },
      change_p3: {
        en: 'Change {p3}',
        ar: 'تغيير {p3}'
      },
      change: {
        en: 'Change',
        ar: 'تغيير'
      },
      press_a_key: {
        en: 'Press a key…',
        ar: 'اضغط المفتاح الآن...'
      },
      press_a_key_to_assign_it_to: {
        en: 'Press a key to assign it to',
        ar: 'اضغط مفتاحًا لتعيينه إلى'
      },
      or_esc_to_cancel: {
        en: ', or Esc to cancel.',
        ar: '، أو Esc للإلغاء.'
      },
      restore_the_custom_layout_for_both_players: {
        en: 'Restore the custom layout for both players?',
        ar: 'استعادة التوزيع المخصص للاعبين؟'
      },
      restore_controls: {
        en: 'Restore controls',
        ar: 'استعادة التحكم'
      },
      default_player_bindings_restored: {
        en: 'Default player bindings restored.',
        ar: 'تمت استعادة الأزرار الافتراضية للاعبين.'
      },
      could_not_save_settings: {
        en: 'Could not save settings.',
        ar: 'تعذّر حفظ الإعدادات.'
      },
      controls_json_is_ready_to_download: {
        en: 'Controls JSON is ready to download.',
        ar: 'تم تجهيز ملف إعدادات التحكم للتنزيل.'
      },
      global_bindings_imported: {
        en: 'Global bindings imported.',
        ar: 'تم استيراد التعيينات العامة بنجاح.'
      },
      bindings_file_rejected: {
        en: 'Bindings file rejected:',
        ar: 'رفض ملف التعيينات:'
      },
      could_not_read_the_bindings_file: {
        en: 'Could not read the bindings file.',
        ar: 'تعذر قراءة ملف التعيينات.'
      },
      key_capture_cancelled: {
        en: 'Key capture cancelled.',
        ar: 'تم إلغاء تسجيل المفتاح.'
      },
      use_a_single_key_without_ctrl_alt: {
        en: 'Use a single key without Ctrl, Alt, or Win.',
        ar: 'استخدم مفتاحًا منفردًا دون Ctrl أو Alt أو Win.'
      },
      this_key_is_already_assigned_to: {
        en: 'This key is already assigned to',
        ar: 'هذا المفتاح مستخدم بالفعل لـ'
      },
      this_key_is_unsupported_or_conflicts_with: {
        en: 'This key is unsupported or conflicts with browser shortcuts.',
        ar: 'المفتاح غير مدعوم أو يتعارض مع اختصارات المتصفح.'
      },
      key_saved_it_will_apply_to_all: {
        en: 'Key saved. It will apply to all games in the next session.',
        ar: 'تم حفظ المفتاح وتطبيقه على جميع الألعاب عند بدء الجلسة التالية.'
      },
      key_capture_cancelled_because_the_window_lost: {
        en: 'Key capture cancelled because the window lost focus.',
        ar: 'أُلغي تسجيل المفتاح بسبب فقدان التركيز.'
      }
    },
    global_controls: {
      up_jump: {
        en: 'Up — jump',
        ar: 'أعلى — قفز'
      },
      down_crouch: {
        en: 'Down — crouch',
        ar: 'أسفل — انحناء'
      },
      left: {
        en: 'Left',
        ar: 'اتجاه اليسار'
      },
      right: {
        en: 'Right',
        ar: 'اتجاه اليمين'
      },
      neo_geo_a_light_punch_kof_98: {
        en: 'Neo Geo A — light punch (KOF 98)',
        ar: 'Neo Geo A — لكمة خفيفة (KOF 98)'
      },
      neo_geo_b_light_kick_kof_98: {
        en: 'Neo Geo B — light kick (KOF 98)',
        ar: 'Neo Geo B — ركلة خفيفة (KOF 98)'
      },
      neo_geo_c_heavy_punch_kof_98: {
        en: 'Neo Geo C — heavy punch (KOF 98)',
        ar: 'Neo Geo C — لكمة قوية (KOF 98)'
      },
      neo_geo_d_heavy_kick_kof_98: {
        en: 'Neo Geo D — heavy kick (KOF 98)',
        ar: 'Neo Geo D — ركلة قوية (KOF 98)'
      },
      combo_a_b_simultaneous: {
        en: 'Combo — A + B (simultaneous)',
        ar: 'اختصار مركب — A + B (معًا)'
      },
      combo_a_b_c_simultaneous: {
        en: 'Combo — A + B + C (simultaneous)',
        ar: 'اختصار مركب — A + B + C (معًا)'
      },
      combo_c_d_simultaneous: {
        en: 'Combo — C + D (simultaneous)',
        ar: 'اختصار مركب — C + D (معًا)'
      },
      start_start_game: {
        en: 'START — start game',
        ar: 'START — بدء اللعب'
      },
      coin_select_add_credit: {
        en: 'COIN / SELECT — add credit',
        ar: 'COIN / SELECT — إضافة رصيد'
      },
      left_arrow: {
        en: 'Left arrow ←',
        ar: 'سهم اليسار ←'
      },
      up_arrow: {
        en: 'Up arrow ↑',
        ar: 'سهم الأعلى ↑'
      },
      right_arrow: {
        en: 'Right arrow →',
        ar: 'سهم اليمين →'
      },
      down_arrow: {
        en: 'Down arrow ↓',
        ar: 'سهم الأسفل ↓'
      },
      semicolon: {
        en: 'Semicolon (;)',
        ar: 'فاصلة منقوطة (;)'
      },
      equals: {
        en: 'Equals (=)',
        ar: 'علامة يساوي (=)'
      },
      comma: {
        en: 'Comma (,)',
        ar: 'الفاصلة (,)'
      },
      hyphen: {
        en: 'Hyphen (-)',
        ar: 'شرطة (-)'
      },
      period: {
        en: 'Period (.)',
        ar: 'النقطة (.)'
      },
      slash: {
        en: 'Slash (/)',
        ar: 'الشرطة المائلة (/)'
      },
      quote: {
        en: "Quote (')",
        ar: "علامة الاقتباس (')"
      },
      digit: {
        en: 'Digit',
        ar: 'رقم'
      },
      key: {
        en: 'Key',
        ar: 'المفتاح'
      },
      unknown_key: {
        en: 'Unknown key (',
        ar: 'رمز غير معروف ('
      },
      same_player: {
        en: 'Same player',
        ar: 'اللاعب نفسه'
      },
      other_player: {
        en: 'Other player',
        ar: 'اللاعب الآخر'
      }
    },
    tab_pause: {
      paused_press_tab_to_resume: {
        en: 'Press Tab to continue',
        ar: 'للمتابعة اضغط Tab'
      },
      click_the_game_to_focus_controls_press: {
        en: 'Click the game to focus controls. Press Tab to pause or resume, including in fullscreen.',
        ar: 'انقر داخل اللعبة للتحكم. اضغط Tab للإيقاف المؤقت أو الاستئناف، حتى في ملء الشاشة.'
      }
    },
    filesystem_access: {
      duplicate_filenames: {
        en: 'Duplicate filenames:',
        ar: 'أسماء ملفات متكررة:'
      }
    },
    indexeddb_store: {
      close_older_library_tabs_to_update_storage: {
        en: 'Close older library tabs to update storage.',
        ar: 'أغلق تبويبات المكتبة القديمة لتحديث التخزين.'
      },
      could_not_store_library_references: {
        en: 'Could not store library references.',
        ar: 'تعذر تخزين مراجع المكتبة.'
      }
    },
    library_manager: {
      select_a_directory_for_this_source: {
        en: 'Select a directory for this source.',
        ar: 'اختر مجلدًا لهذا القسم.'
      },
      bios_invalid_select_the_matching_inner_neogeo: {
        en: 'BIOS_INVALID: select the matching inner neogeo.zip.',
        ar: 'BIOS_INVALID: اختر neogeo.zip الداخلي المطابق.'
      },
      bios_invalid_extract_the_outer_package_then: {
        en: 'BIOS_INVALID: extract the outer package, then select the inner neogeo.zip.',
        ar: 'BIOS_INVALID: استخرج الحزمة الخارجية ثم اختر neogeo.zip الداخلي.'
      },
      could_not_read_optional_copies: {
        en: 'Could not read optional copies:',
        ar: 'تعذر قراءة النسخ الاختيارية:'
      },
      could_not_save_library_metadata: {
        en: 'Could not save library metadata:',
        ar: 'تعذر حفظ بيانات الفهرسة:'
      }
    },
    library_ui: {
      local_library_manager: {
        en: 'Local Library Manager',
        ar: 'مدير المكتبة المحلية'
      },
      select_roms_folder: {
        en: 'Select ROMs folder',
        ar: 'اختيار مجلد ROMs'
      },
      select_previews_folder: {
        en: 'Select PREVIEWS folder',
        ar: 'اختيار مجلد PREVIEWS'
      },
      select_bios_file_neogeo_zip: {
        en: 'Select BIOS file (neogeo.zip)',
        ar: 'اختيار ملف BIOS (neogeo.zip)'
      },
      select_bios_folder: {
        en: 'Select BIOS folder',
        ar: 'اختيار مجلد BIOS'
      },
      save_library: {
        en: 'Save library',
        ar: 'حفظ المكتبة'
      },
      reconnect_saved_sources: {
        en: 'Reconnect saved sources',
        ar: 'إعادة ربط المصادر المحفوظة'
      },
      rescan: {
        en: 'Rescan',
        ar: 'إعادة الفحص'
      },
      protect_browser_storage: {
        en: 'Protect browser storage',
        ar: 'حماية تخزين المتصفح'
      },
      forget_references: {
        en: 'Forget references',
        ar: 'نسيان المراجع'
      },
      local_read_access_only_files_are_not: {
        en: 'Local read access only. Files are not uploaded. Select the inner',
        ar: 'قراءة محلية فقط — الملفات لا تُرفع لأي خادم. اختر ملف'
      },
      after_extracting_the_package_or_drop_a: {
        en: 'after extracting the package, or drop a folder or file onto the selection buttons. File-input fallback in browsers such as Brave works for this session only. No ROM is copied without separate consent inside the player.',
        ar: 'الداخلي بعد استخراج الحزمة، أو اسحب المجلد/الملف مباشرة إلى أزرار الاختيار أعلاه. وضع الملفات البديل في بعض المتصفحات كـ Brave يعمل للجلسة الحالية فقط ولا ينسخ أي ROM دون موافقة اختيارية منفصلة داخل شاشة اللعب.'
      },
      file_session_expired_select_files_again: {
        en: 'File session expired; select files again',
        ar: 'انتهت جلسة الملفات؛ أعد الاختيار'
      },
      connected: {
        en: 'Connected ✓',
        ar: 'متصل ✓'
      },
      permission_renewal_required: {
        en: 'Permission renewal required',
        ar: 'يلزم تجديد الإذن'
      },
      permission_denied: {
        en: 'Permission denied',
        ar: 'الإذن مرفوض'
      },
      not_connected: {
        en: 'Not connected',
        ar: 'غير متصل'
      },
      file_does_not_match: {
        en: 'File does not match',
        ar: 'ملف غير مطابق'
      },
      could_not_read: {
        en: 'Could not read',
        ar: 'تعذرت القراءة'
      },
      storage_unavailable: {
        en: 'Storage unavailable',
        ar: 'تعذر التخزين'
      },
      roms_game_files: {
        en: 'ROMs — game files',
        ar: 'ROMs — ملفات الألعاب'
      },
      previews_game_images: {
        en: 'PREVIEWS — game images',
        ar: 'PREVIEWS — صور الألعاب'
      },
      bios_system_files: {
        en: 'BIOS — system files',
        ar: 'BIOS — ملفات النظام'
      },
      connected_through_local_companion: {
        en: 'Connected through local companion ✓',
        ar: 'متصل عبر المساعد المحلي ✓'
      },
      not_selected: {
        en: 'Not selected',
        ar: 'لم يحدد'
      },
      p0_p1_p2_p3_files: {
        en: '{p0}: {p1} — {p2} — {p3} files',
        ar: '{p0}: {p1} — {p2} — {p3} ملفات'
      },
      local_companion_connected_directories_are_saved_in: {
        en: 'Local companion connected. Directories are saved in private settings on your device, not uploaded to GitHub.',
        ar: 'المساعد المحلي: متصل. المجلدات محفوظة في إعداد خاص بجهازك ولا تُرفع إلى GitHub.'
      },
      fallback_session_only_selections_remain_available_while: {
        en: 'FALLBACK_SESSION_ONLY — selections remain available while the library tab is open. Playing here keeps that session alive. After closing it, select files again or opt in to keeping one game in the player.',
        ar: 'FALLBACK_SESSION_ONLY — تبقى الاختيارات أثناء بقاء نافذة المكتبة مفتوحة؛ التشغيل هنا لا يغادرها. بعد إغلاقها يلزم إعادة الاختيار، أو حفظ نسخة لعبة واحدة اختياريًا في اللاعب.'
      },
      files_match_the_expected_size_sha_256: {
        en: 'files match the expected size; SHA-256 is checked before launch.',
        ar: 'ملفًا مطابق الحجم؛ يُفحص SHA-256 قبل التشغيل.'
      },
      bios_not_ready: {
        en: 'BIOS not ready',
        ar: 'BIOS غير جاهز'
      },
      saved_library_found_select_reconnect_saved_sources: {
        en: 'Saved library found. Select Reconnect saved sources to restore access.',
        ar: 'تم العثور على مكتبتك المحفوظة. اضغط «إعادة ربط المصادر المحفوظة» لاستعادتها فوراً.'
      },
      permission_was_denied_for_one_source_select: {
        en: 'Permission was denied for one source. Select that source again; other references are preserved.',
        ar: 'رُفض إذن أحد الأقسام. أعد اختيار ذلك القسم فقط؛ المراجع الأخرى محفوظة.'
      },
      click_to_select_or_drop_a_folder: {
        en: 'Click to select, or drop a folder or file here',
        ar: 'اختر بالضغط أو اسحب المجلد/الملف إلى هذا الزر'
      },
      select_files_for: {
        en: 'Select files for',
        ar: 'تحديد ملفات'
      },
      your_browser_file_picker_will_open_brave: {
        en: 'Your browser file picker will open. Brave may show its own read-access warning. Files are not uploaded. Select only directories you trust.',
        ar: 'سيظهر مربع اختيار الملفات الخاص بالمتصفح. قد يعرض Brave تحذيرًا أصليًا قبل السماح بالقراءة؛ لا تُرفع الملفات إلى الإنترنت. وافق فقط على مجلدات تثق بها.'
      },
      choose_files: {
        en: 'Choose files',
        ar: 'اختيار الملفات'
      },
      drag_and_drop_is_unavailable_use_the: {
        en: 'Drag and drop is unavailable. Use the selection button.',
        ar: 'السحب غير مدعوم؛ استخدم زر الاختيار.'
      },
      forget_saved_library_references_your_game_files: {
        en: 'Forget saved library references? Your game files and save states will not be deleted.',
        ar: 'هل تريد نسيان مراجع المكتبة المحفوظة؟ لن تُحذف ملفات ألعابك أو حالات الحفظ.'
      },
      forget_library_references: {
        en: 'Forget library references',
        ar: 'نسيان مراجع المكتبة'
      },
      persistent_storage_enabled_this_does_not_grant: {
        en: 'Persistent storage enabled. This does not grant permanent access to Windows folders.',
        ar: 'تم تفعيل تخزين أكثر ثباتًا. لا يمنح هذا الإجراء إذنًا دائمًا لمجلدات Windows.'
      },
      the_browser_did_not_grant_extra_storage: {
        en: 'The browser did not grant extra storage protection. File access still depends on browser permissions.',
        ar: 'لم يمنح المتصفح حماية تخزين إضافية. يظل حفظ الملفات مرتبطًا بصلاحيات المتصفح.'
      },
      storage_status: {
        en: 'Storage status',
        ar: 'حالة التخزين'
      }
    },
    local_companion: {
      could_not_read_the_file_from_the: {
        en: 'Could not read the file from the local companion:',
        ar: 'تعذر قراءة الملف من المساعد المحلي:'
      }
    },
    player_recovery: {
      renew_permission_to_read_the_roms_folder: {
        en: 'Renew permission to read the ROMs folder.',
        ar: 'يلزم تجديد إذن قراءة مجلد ROMs.'
      },
      the_roms_folder_is_not_connected: {
        en: 'The ROMs folder is not connected.',
        ar: 'مجلد ROMs غير متصل حالياً.'
      },
      the_required_game_file_is_not_in: {
        en: 'The required game file is not in the selected directory.',
        ar: 'ملف اللعبة المطلوب غير موجود في المجلد المختار.'
      },
      the_file_size_differs_use_the_prepared: {
        en: 'The file size differs. Use the prepared compatible archive with the required filename.',
        ar: 'حجم الملف مختلف. استخدم الأرشيف المتوافق المحضّر بالاسم المطلوب.'
      },
      game_bytes_do_not_match_the_verified: {
        en: 'Game bytes do not match the verified version. Select the correct compatibility package.',
        ar: 'بايتات اللعبة لا تطابق النسخة المثبتة؛ اختر حزمة التوافق الصحيحة.'
      },
      renew_permission_to_read_bios: {
        en: 'Renew permission to read BIOS.',
        ar: 'يلزم تجديد إذن قراءة ملف BIOS.'
      },
      select_the_inner_bios_file_neogeo_zip: {
        en: 'Select the inner BIOS file, neogeo.zip, again.',
        ar: 'أعد اختيار ملف BIOS الداخلي neogeo.zip.'
      },
      the_bios_hash_does_not_match_extract: {
        en: 'The BIOS hash does not match. Extract the package, then select the inner neogeo.zip.',
        ar: 'ملف BIOS غير مطابق للبصمة المعتمدة. اختر neogeo.zip الداخلي بعد استخراج الحزمة.'
      },
      the_previous_file_input_session_has_ended: {
        en: 'The previous file-input session has ended. Select files here or use your optional browser copy.',
        ar: 'اختيارات وضع الملفات كانت للجلسة السابقة فقط. اختر الملفات هنا أو استخدم النسخة الاختيارية المحفوظة في المتصفح.'
      },
      reconnect_game_files_and_bios_without_leaving: {
        en: 'Reconnect game files and BIOS without leaving the player',
        ar: 'استعادة ملفات اللعبة وBIOS دون مغادرة شاشة اللعب'
      },
      allow_roms_access: {
        en: 'Allow ROMs access',
        ar: 'السماح بقراءة ROMs'
      },
      allow_bios_access: {
        en: 'Allow BIOS access',
        ar: 'السماح بقراءة BIOS'
      },
      select_neogeo_zip: {
        en: 'Select neogeo.zip',
        ar: 'اختيار ملف neogeo.zip'
      },
      retry_launch_now: {
        en: 'Retry launch now',
        ar: 'إعادة محاولة التشغيل الآن'
      },
      file_input_fallback_lasts_only_for_the: {
        en: 'File-input fallback lasts only for the current library session. We never copy the library automatically. Folder permissions do not transfer between localhost, 127.0.0.1, or different ports.',
        ar: 'في وضع الملفات البديل تبقى الملفات أثناء جلسة المكتبة الحالية فقط. لا ننسخ مكتبتك تلقائيًا. صلاحية المجلدات لا تنتقل بين localhost و127.0.0.1 أو المنافذ المختلفة.'
      },
      required: {
        en: 'Required:',
        ar: 'المطلوب:'
      },
      size: {
        en: '/ size:',
        ar: '/ الحجم:'
      },
      waiting_for_files_or_renewed_permission_continue: {
        en: 'Waiting for files or renewed permission. Continue using the recovery controls below.',
        ar: 'بانتظار ربط الملفات أو تجديد الإذن — يمكنك المتابعة مباشرة من البطاقة أدناه.'
      },
      optional_browser_vault_keep_only_this_game: {
        en: 'Optional browser vault — keep only this game for future sessions',
        ar: 'خزنة المتصفح الاختيارية — حفظ نسخة من هذه اللعبة فقط للجلسات القادمة'
      },
      i_explicitly_agree_to_copy: {
        en: 'I explicitly agree to copy',
        ar: 'أوافق صراحةً على نسخ'
      },
      and_bios_only: {
        en: 'and BIOS only (',
        ar: 'وملف BIOS فقط ('
      },
      bytes_into_this_site_s_indexeddb_storage: {
        en: "bytes) into this site's IndexedDB storage. The rest of the library will not be copied.",
        ar: 'بايت) إلى تخزين هذا الموقع (IndexedDB). لا يتم نسخ المكتبة كلها.'
      },
      save_optional_copy: {
        en: 'Save optional copy',
        ar: 'حفظ النسخة الاختيارية'
      },
      local_copy_saved_this_game_and_bios: {
        en: 'LOCAL_COPY_SAVED — this game and BIOS will remain available on this origin after closing the tab, unless site data is cleared.',
        ar: 'LOCAL_COPY_SAVED — ستتوفر هذه اللعبة وBIOS بعد إغلاق التبويب على هذا Origin، ما لم تُمسح بيانات الموقع.'
      },
      remove_this_game_s_browser_copy: {
        en: "Remove this game's browser copy",
        ar: 'حذف نسخة هذه اللعبة من المتصفح'
      },
      local_copy_removed_the_browser_copy_was: {
        en: 'LOCAL_COPY_REMOVED — the browser copy was removed. Original files and save states are unchanged.',
        ar: 'LOCAL_COPY_REMOVED — تم حذف النسخة المخزنة؛ لم تُمس ملفاتك الأصلية أو حالات الحفظ.'
      }
    },
    rom_provider: {
      missing_dependency: {
        en: 'Missing dependency:',
        ar: 'اعتماد ناقص:'
      }
    },
    save_transfer: {
      export_save_state: {
        en: 'Export save state',
        ar: 'تصدير حالة الحفظ'
      },
      import_save_state: {
        en: 'Import save state',
        ar: 'استيراد حالة الحفظ'
      },
      start_the_game_first: {
        en: 'Start the game first.',
        ar: 'شغّل اللعبة أولًا.'
      },
      unsupported_save_state_file_size: {
        en: 'Unsupported save-state file size.',
        ar: 'حجم ملف الحفظ غير مدعوم.'
      }
    },
    session_navigation: {
      local_library_session_page: {
        en: 'Local library session page',
        ar: 'صفحة ضمن جلسة المكتبة المحلية'
      }
    },
    message_box: {
      close: {
        en: 'Close',
        ar: 'إغلاق'
      },
      cancel: {
        en: 'Cancel',
        ar: 'إلغاء'
      },
      ok: {
        en: 'OK',
        ar: 'موافق'
      },
      message: {
        en: 'Message',
        ar: 'رسالة'
      },
      notice: {
        en: 'Notice',
        ar: 'تنبيه'
      },
      confirm: {
        en: 'Confirm',
        ar: 'تأكيد'
      }
    },
    common: {
      keyNamed: {
        en: 'Key {key}',
        ar: 'المفتاح {key}'
      },
      digitNamed: {
        en: 'Digit {digit}',
        ar: 'رقم {digit}'
      },
      displayLanguage: {
        en: 'Display Language',
        ar: 'لغة العرض'
      },
      languageHint: {
        en: 'Updates immediately and is remembered on this browser.',
        ar: 'تُطبّق فورًا ويُحفظ اختيارك في هذا المتصفح.'
      },
      storageMemoryOnly: {
        en: 'Language changed for this visit. Browser storage is unavailable; it may not persist after closing.',
        ar: 'تغيّرت اللغة لهذه الزيارة. تخزين المتصفح غير متاح، وقد لا يُحفظ الاختيار بعد الإغلاق.'
      },
      languageSaved: {
        en: 'Display language saved.',
        ar: 'تم حفظ لغة العرض.'
      },
      gamePageTitle: {
        en: '{title} — Neo-Geo Web Port',
        ar: '{title} — Neo-Geo Web Port'
      },
      playNamed: {
        en: 'Play {title}',
        ar: 'تشغيل {title}'
      },
      imageNamed: {
        en: 'Image of {title}',
        ar: 'صورة لعبة {title}'
      },
      unknownKey: {
        en: 'Unknown key ({code})',
        ar: 'رمز غير معروف ({code})'
      }
    },
    errors: {
      stateBytes: {
        en: 'State must contain bytes',
        ar: 'يجب أن يحتوي ملف الحفظ على بيانات بايت.'
      },
      stateBounds: {
        en: 'State size is outside supported bounds',
        ar: 'حجم حالة الحفظ خارج الحدود المدعومة.'
      },
      stateHeader: {
        en: 'Unsupported or damaged state header',
        ar: 'ترويسة حالة الحفظ غير مدعومة أو تالفة.'
      },
      stateBlockHeader: {
        en: 'Truncated state block header',
        ar: 'ترويسة كتلة الحفظ غير مكتملة.'
      },
      stateEnd: {
        en: 'Invalid state terminator',
        ar: 'علامة نهاية حالة الحفظ غير صالحة.'
      },
      stateBlockSize: {
        en: 'State block exceeds available bytes',
        ar: 'تتجاوز كتلة الحفظ حجم البيانات المتاحة.'
      },
      stateMemory: {
        en: 'Invalid core memory block',
        ar: 'كتلة ذاكرة المحرك غير صالحة.'
      },
      stateBlock: {
        en: 'Unsupported state block',
        ar: 'كتلة حالة الحفظ غير مدعومة.'
      },
      stateMissing: {
        en: 'State is missing required blocks',
        ar: 'تفتقد حالة الحفظ كتلًا مطلوبة.'
      },
      stateGame: {
        en: 'State core-memory size does not match this game',
        ar: 'حجم ذاكرة حالة الحفظ لا يطابق هذه اللعبة.'
      }
    }
  };
  const KEY = 'neogeo-ui-language-v1';
  const LEGACY_KEY = 'ng-webemu-settings-v012';
  const missing = new Set();
  const rendered = new Map();
  const bindings = new WeakMap();
  let language = 'en';
  let storageAvailable = true;
  const valid = value => value === 'en' || value === 'ar';

  // Read only language fields; never rewrite an existing preference record during migration.
  try {
    const saved = root.localStorage?.getItem(KEY);
    if (valid(saved)) language = saved;
    else if (saved == null) {
      const legacy = JSON.parse(root.localStorage?.getItem(LEGACY_KEY) || 'null');
      const migrated = { 'en-US': 'en', 'ar-AR': 'ar' }[legacy?.language];
      if (valid(migrated)) {
        language = migrated;
        root.localStorage?.setItem(KEY, language);
      }
    }
  } catch (_) {
    storageAvailable = false;
  }

  // Return a visible fallback once per missing key, and keep unsafe parameter values out of labels.
  function reportMissing(key) {
    if (!missing.has(key)) {
      missing.add(key);
      if (root.NG_I18N_DEBUG || ['localhost', '127.0.0.1'].includes(root.location?.hostname))
        root.console?.warn('Missing UI translation: ' + key);
    }
    return '[' + key + ']';
  }

  function entry(key) {
    const [namespace, name] = String(key).split('.');
    return Object.hasOwn(CATALOG, namespace) && Object.hasOwn(CATALOG[namespace], name)
      ? CATALOG[namespace][name]
      : null;
  }

  // Parameters are plain text; callers embedding translated values in HTML must escape them.
  function format(key, params = {}, lang = language) {
    const value = entry(key);
    const template = value?.[lang] || value?.en;
    if (typeof template !== 'string' || !template.trim()) return reportMissing(key);
    return template.replace(/\{(\w+)\}/g, (_, name) => {
      const value = params[name];
      return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
        ? String(value)
        : '{' + name + '}';
    });
  }

  // Remember rendered phrases so visible text can change without recreating DOM controls or listeners.
  function t(key, params = {}) {
    const value = format(key, params);
    for (const lang of ['en', 'ar'])
      rendered.set(format(key, params, lang), { key, params: { ...params } });
    return value;
  }

  for (const [namespace, values] of Object.entries(CATALOG))
    for (const name of Object.keys(values)) {
      const key = namespace + '.' + name;
      if (!/\{\w+\}/.test(values[name].en)) t(key);
    }

  // Bind whole labels, or composed messages containing translated phrases, while preserving raw values.
  function describe(value) {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (rendered.has(trimmed)) {
      return [value.match(/^\s*/)[0], rendered.get(trimmed), value.match(/\s*$/)[0]];
    }
    const candidates = [...rendered.keys()]
      .filter(x => x.length > 12 && value.includes(x))
      .sort((a, b) => b.length - a.length);
    const parts = [];
    let remaining = value;
    while (remaining) {
      let found = null,
        at = remaining.length;
      for (const phrase of candidates) {
        const index = remaining.indexOf(phrase);
        if (index >= 0 && index < at) {
          found = phrase;
          at = index;
        }
      }
      if (!found) {
        parts.push(remaining);
        break;
      }
      if (at) parts.push(remaining.slice(0, at));
      parts.push(rendered.get(found));
      remaining = remaining.slice(at + found.length);
    }
    return parts;
  }

  function translated(node, name, value) {
    let map = bindings.get(node);
    if (!map) {
      map = new Map();
      bindings.set(node, map);
    }
    let binding = map.get(name);
    if (!binding || binding.last !== value) binding = { parts: describe(value), last: value };
    const output = binding.parts
      .map(part => (typeof part === 'string' ? part : format(part.key, part.params)))
      .join('');
    binding.last = output;
    map.set(name, binding);
    return output;
  }

  // Update text and accessible attributes in place, excluding emulator output, filenames, and raw logs.
  function applyTranslations(scope = root.document) {
    if (!scope || (!scope.nodeType && !scope.querySelectorAll)) return;
    const doc = root.document;
    if (doc?.documentElement) {
      doc.documentElement.lang = language;
      doc.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }
    const nodes = scope.nodeType ? [scope] : [];
    const walker = doc?.createTreeWalker?.(scope, 5);
    if (walker) {
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
    }
    const protectedSelector =
      'script,style,code,#game,[data-no-i18n],.game-title,.file-name,.setting-path';
    for (const node of nodes) {
      const element = node.nodeType === 3 ? node.parentElement : node;
      if (element?.closest?.(protectedSelector)) continue;
      if (node.nodeType === 3 && node.nodeValue?.trim()) {
        // Explicit bindings take precedence over phrase matching, including after repeated language switches.
        const key = element?.getAttribute?.('data-i18n-text');
        const directKeys = key?.split('|') || [];
        const directTextNodes = key
          ? Array.from(element.childNodes || []).filter(child => child.nodeType === 3 && child.nodeValue.trim())
          : [];
        const segment = directTextNodes.indexOf(node);
        if (segment >= 0 && directKeys.length === directTextNodes.length) {
          const leading = node.nodeValue.match(/^\s*/)[0];
          const trailing = node.nodeValue.match(/\s*$/)[0];
          const value = leading + format(directKeys[segment]) + trailing;
          if (value !== node.nodeValue) node.nodeValue = value;
          continue;
        }
        if (element?.closest?.('#diagnostic-log') && !rendered.has(node.nodeValue.trim()))
          continue;
        const value = translated(node, 'text', node.nodeValue);
        if (value !== node.nodeValue) node.nodeValue = value;
      } else if (node.nodeType === 1) {
        // Use declared attribute keys rather than guessing from their currently displayed wording.
        let declared = {};
        const mapping = node.getAttribute?.('data-i18n-attrs');
        if (mapping) {
          try {
            const parsed = JSON.parse(mapping);
            if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') declared = parsed;
          } catch (_) {
            root.console?.warn?.('Invalid data-i18n-attrs mapping');
          }
        }
        for (const name of ['title', 'aria-label', 'placeholder', 'alt', 'content']) {
          if (name === 'content' && node.getAttribute('name') !== 'description') continue;
          const old = node.getAttribute?.(name);
          if (old == null) continue;
          const value = typeof declared[name] === 'string'
            ? format(declared[name])
            : translated(node, name, old);
          if (value !== old) node.setAttribute(name, value);
        }
      }
    }
    for (const select of scope.querySelectorAll?.('[data-ui-language]') || [])
      select.value = language;
  }

  // Persist only the dedicated UI key and synchronize same-origin parent/child session pages.
  function setLanguage(next, { persist = true, broadcast = true } = {}) {
    if (!valid(next)) next = 'en';
    language = next;
    let saved = storageAvailable;
    if (persist) {
      try {
        if (!root.localStorage) throw Error('Storage unavailable');
        root.localStorage.setItem(KEY, language);
        storageAvailable = true;
        saved = true;
      } catch (_) {
        storageAvailable = false;
        saved = false;
      }
    }
    applyTranslations();
    if (typeof root.CustomEvent === 'function')
      root.document?.dispatchEvent?.(
        new root.CustomEvent('ng-language-changed', { detail: { language, persisted: saved } })
      );
    if (broadcast && root.location?.origin) {
      const message = { type: 'ng-ui-language', language };
      if (root.parent && root.parent !== root)
        root.parent.postMessage(message, root.location.origin);
      root.document
        ?.querySelectorAll?.('iframe')
        .forEach(frame => frame.contentWindow?.postMessage(message, root.location.origin));
    }
    return saved;
  }

  root.NGI18n = Object.freeze({
    KEY,
    catalog: CATALOG,
    t,
    getLanguage: () => language,
    setLanguage,
    applyTranslations,
    getMissingKeys: () => [...missing],
    translateText: value =>
      describe(String(value))
        .map(part => (typeof part === 'string' ? part : format(part.key, part.params)))
        .join('')
  });
  if (root.document?.documentElement) {
    root.document.documentElement.setAttribute?.('data-i18n-pending', '');
    root.document.documentElement.lang = language;
    root.document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }
  root.addEventListener?.('storage', event => {
    if (event.key === KEY)
      setLanguage(valid(event.newValue) ? event.newValue : 'en', {
        persist: false,
        broadcast: false
      });
  });
  root.addEventListener?.('message', event => {
    if (
      event.origin !== root.location?.origin ||
      event.data?.type !== 'ng-ui-language' ||
      !valid(event.data.language)
    )
      return;
    const trusted =
      event.source === root.parent ||
      [...(root.document?.querySelectorAll?.('iframe') || [])].some(
        frame => frame.contentWindow === event.source
      );
    if (trusted && event.data.language !== language)
      setLanguage(event.data.language, { persist: false });
  });

  // Observe late rendering rather than replacing entire components, preserving active inputs and consent.
  function ready() {
    applyTranslations();
    root.document.documentElement.removeAttribute?.('data-i18n-pending');
    if (typeof root.MutationObserver === 'function') {
      const observer = new root.MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'childList')
            for (const node of record.addedNodes) applyTranslations(node);
          else
            applyTranslations(
              record.target.nodeType === 3 ? record.target.parentElement : record.target
            );
        }
      });
      observer.observe(root.document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'aria-label', 'placeholder', 'alt']
      });
    }
  }
  if (root.document?.readyState === 'loading')
    root.document.addEventListener('DOMContentLoaded', ready);
  else if (root.document?.documentElement) ready();
})(globalThis);
