# عقد الواجهة مع Runtime

يمكن إعادة تصميم HTML/CSS دون إعادة بناء FBNeo. حافظ على selectors التالية أو حدّث طبقة UI عند تغييرها:

- المكتبة: game-grid، collection، collection-title، search، sort، refresh، banner، featured-title/description/image/play، feature-placeholder، results، stat-games/shots/size/bios، side-count، favorite-count، engine-health. أزرار data-view وdata-category للتصفية.
- اللاعب: game، player-title، player-message، diagnostic-log، debug-details، copy-diagnostics، export-diagnostics، .emulator-stage، .player-diagnostics.
- الإعدادات: settings-panel، save-settings، reset-settings، settings-message، settings-engine-status وأزرار data-tab. مفاتيح NGPrefs ثابتة.

في Static Build يأتي bootstrap ثم موديولات library بالترتيب قبل app/player/settings. NG_BASE مشتق من URL الخاص بـbootstrap، وليس جذر النطاق. لا تضف Python API إلى فرع NG_STATIC. في وضع Python لا يُحقن bootstrap وتبقى المسارات القديمة.

NGLocal يدير الاختيار والحفظ والفهرسة. الحدث ng-library-changed ينعش العرض. NGFileAccess يعزل الصلاحيات والـpickers، وNGBrowserROM يعزل ربط EmulatorJS، وNGPreviews يدير الصور وObject URLs، وNGSaveTransfer يدير الحالة فقط. يعرض NGLocal.data() شكل بيانات المكتبة المتوافق مع الواجهة السابقة.

حافظ على ترتيب preferences/runtime-diagnostics/fbneo-compat/state-guard/runtime-guard قبل player.js. لا تغيّر Save ID مع URL أو إعادة رسم الواجهة. لا تعرض أسماء المستخدم عبر innerHTML، ولا تعادل وجود ZIP بنجاح تشغيل اللعبة.
