# نتيجة الإضافات والفحوصات — 25 أكتوبر 2026

الحالة: مكتمل للاختبار والمراجعة على فرع مستقل؛ **غير مدمج، غير منشور، وغير جاهز لرفع الإنتاج إلى Google Play**.

- الفرع: `app/privacy-controls-20261025`، مسودة PR #1107 فوق فرع التحضير PR #1106.
- نقطة الرجوع: `rollback/before-privacy-controls-20261025` عند `3e0936e58d7b2081f060698cd7fc56abecc6b01d`.
- النسخة المرئية المعتمدة28 وحركة الشعار بقيتا كما وافق المالك. لا مفاتيح إنتاج جديدة ولا تغيير في assetlinks أو البصمة.

## المنفذ

طلب حذف من العميل المسجل، إيصال استلام واضح، متابعة وإلغاء؛ وطابور أدمن داخل اللوحة الحالية للتحقق ومراجعة الارتباطات. استقبال الطلب ليس إتمام الحذف. منفذ المحو مقفل افتراضياً ولا يظهر له زر تنفيذ؛ الحسابات ذات البيانات التشغيلية تحتاج جرداً وسياسة احتفاظ معتمدة منفصلين.

قواعد تقييم وصور بموافقة صريحة قبل الإرسال، وربطها بالجلسة والتحقق الحالي من الطلب المسلّم. إبلاغ عن التقييم وصاحبه، حظر شخصي وإلغاء حظر، معالجة البلاغات لدى الأدمن دون حذف تلقائي. أُصلح تبديل قائمة الأدمن أثناء وصول رد قائمة سابقة. لا تدخل في السعر أو المخزون أو المدفوعات.

إرشاد أصلي لتحديث WebView المعروف بإصداره الأقدم من80، دون تعديل قارئات المتاجر والتسعير. حد80 يعالج عدم دعم صياغةJavaScript الحالية، ولا يعني اعتماد كل محرك من80 فما فوق.

## ما اختُبر فعلياً

1. PostgreSQL17 منفصل: دوال الجلسة والتقييم المشحونة بالمستودع، ملكية الطلب، موافقة المحتوى، انقضاء/إبطال الجلسة، حظر شخصي مع بقاء العرض العام، منع تكرار البلاغ، منع العميل من الأدمن، تقييد الجداول الخاصة، تحقق الأدمن، وإخفاء التقييم فقط.
2. محو حساب مصطنع جديد بلا عمليات في المخطط المصغر: حُذف صفه وجلسته، فُصلت هويته عن إيصال الطلب، وبطل الرمز القديم. مُنع المحو عند غياب اعتماد السياسة وتغير المخطط ووجود طلب. هذه ليست تجربة حذف حساب الإنتاج ذي الطلبات.
3. Chromium بواجهة فعلية مع اعتراض كل اتصالSupabase إلى جسرSQL محلي: قبول القواعد/الإرسال، إبلاغ، حظر وإلغاء، عرض تعليق كنص دون تنفيذه، طلب الحذف/إلغاؤه، منع كتابة الموظف من وضع مشاهدة العميل، وطابور الأدمن ومعالجته. لا أخطاء صفحة غير معالجة. قراءات الأهلية بيانات اختبار؛ الكتابات المذكورة تستخدمSQL المثبت فعلياً في قاعدة الاختبار.
4. تجربة رجوع SQL: تعطيل النقاط الجديدة وإزالة حارسي إدراج التقييم فقط، مع بقاء التذاكر والبلاغات والطلبات والدوال القديمة. قورنت بيانات الطلبات وتعريفات الدوال قبل/بعد، دون اختلاف.
5. أندرويدAPI29 مع WebView74 فعلي: ظهر إرشاد التحديث والإغلاق، دون فتح المتجر أو حساب أو تغيير بيانات.
6. أندرويدAPI36 مع WebView133.0.6943.137: فتح الواجهة بعد الغطاء، الخصوصية، عودة دافئة، انقطاع وإعادة محاولة؛ فواتير عميل/موظف/تاجر مصطنعة بما فيها النافذة غير المتزامنة وزر الطباعة والإغلاق؛ وتشغيلH264 فعلي. لا تسجيل دخول حقيقي ولا طلب/دفع إنتاجي، ولا شهادة جديدة لسلاسة الحركة.
7. قارئات JavaScript:54 اختباراً ناجحاً، واختباراتMarkup/MAD/حدودJava والتسعير، واختبارا الخصوصية وستة حواجز إعداد الإنتاج. لا تعديل لمنطق قارئات المتاجر الستة أو الصرف والعمولة.
8. البناء: APK/AAB غير مخصصين للرفع، Lint صفر أخطاء و21 تحذيراً معروفة. INTERNET فقط، min28/target36، غير قابل للتصحيح، دون ملفات اختبار أو مفاتيح أو مكتباتnative. جرد الحزمة فيVALIDATION-20261025.json.

الأدلة:
- قاعدة البيانات/الواجهة/الرجوع: https://github.com/pilotf369u-sys/meshwar-system-v2/actions/runs/40185233968
- البناء وأندرويد29/36: https://github.com/pilotf369u-sys/meshwar-system-v2/actions/runs/40184699677
- تفاصيل التنفيذ وحدوده: mobile/privacy/README.md

## ما بقي قبل الإنتاج

- اعتماد مسؤول معالجة الحذف وحدود/سبب/مدة الاحتفاظ، وإكمال جرد الهوية فيJSON والرسائل والتخزين والنسخ الاحتياطية والحسابات ذات المعاملات. الحارس مقفل، وأعلام جاهزية الحذف والإنتاج لم تُرفع.
- مراجعةSQL على المخطط الكامل ثم تفويض تطبيقه ونشر الصفحات المرافقة. لا نشر مستقل لحارس الموافقة قبل الواجهة؛ الصفحات القديمة المخزنة مؤقتاً تحتاج تحديثاً لإنشاء التقييم.
- نشر سياسة عامة نهائية ومورد الحذف والتحقق من الروابط الحية؛ لم يتغير هوستنكر أوSupabase في هذا العمل.
- حسم إذن استخدام محتوى المتاجر وفق الملف المحفوظ، وبياناتConsole وملكية التطبيق ومفتاحه ورقم الإصدار النهائي. لا نغيّرالتوقيع الحالي.
- حساب مراجع وبيانات اختبار معتمدة، ثم رحلة العمليات على الحزمة النهائية الموقعة، الصور النهائية وPlay pre-launch والاختبار المطلوب منConsole. محاكي الاختبار لا يغني عن ذلك.

لا يوجد APK جديد مطلوب تثبيته فوق28 في هذه الخطوة. مفاتيحCI مؤقتة؛ لا تُستخدم حزمها كترقية للنسخة المقبولة أو كإصدارمتجر.

## متابعة الجرد المصدرية في اليوم نفسه

أُضيفت خريطة نسخ الهوية داخل JSON والفواتير والعالمية والدفع والدردشة والصور، وملف فحص مخطط للقراءة فقط. لم يتغير أي كود تشغيل للتطبيق في هذه المتابعة، ولم يُقرأ مخطط الإنتاج. مسار الإغلاق والمعلومات التشغيلية المتبقية في PRIVACY-PUBLISH-CHECKLIST-AR.md.

نجح الفحص الجديد على PostgreSQL17 دون تغيير بيانات الحسابات والطلبات أو تعريفات الدوال أو الجداول، ودون إخراج بيانات أشخاص. أُعيدت اختبارات الواجهة والحظر والبلاغات وطلب الحذف والإلغاء ووضع الموظف والرجوع، ونجحت كلها:
https://github.com/pilotf369u-sys/meshwar-system-v2/actions/runs/40186204067

نقطة رجوع هذه المتابعة: `rollback/before-privacy-inventory-20261025` عند `57d33d5ca5d443a0cad6d56a5f46d0069308fa41`. بقي المنفذ والجاهزية الإنتاجية مقفلين؛ طلب المالك مواصلة التطوير لا يثبت اسم الجهة أو بلد النشاط أو مدة الاحتفاظ أو تفويض المتاجر.

## Dependency-driven safety completion — 25 October

Run40199669940/job121187963889 passed on disposable PostgreSQL17 and Chromium. Approval now detects constraint-only changes, disabled triggers, replaced function bodies, RLS flags and policy-only changes, in addition to columns. Each change was rolled back and stale approval was rejected before data writes. Browser verification confirmed admin-visible preflight details, one explicit preflight call and zero erasure calls. Observed text order identity/details types and secondary sessions still hold unsafe erasure; local/global orders, messages and sessions remained unchanged. Rollback and original function preservation passed. Java source scope and review-pack tests also passed locally.

This is not full account deletion on the production schema. No production SQL, storage deletion, merge, Hostinger deployment, APK rebuild or signing change occurred. Existing six readers/pricing and accepted28 launch are untouched. Financial retention, legal operator jurisdiction, storage object ownership/cleanup and actual backup expiry/restore handling remain unresolved. A service goal of7/30 days does not establish a financial retention period. No production gate is raised.

## Review-image erasure worker — source implemented, production disabled

Run40205957447/job121206817125 passed. The new server-only RPC/worker queue checks an existing admin session, exact verified request, both reviewed base/media policies, current image ownership and source identity. It uses bounded secret leases, blocks source reassignment/cancellation while media deletion is irreversible, retries after failure and handles duplicate completion. Browser roles cannot obtain paths or acknowledge removal. Removal uses the Storage API and exact-name absence verification; database image bytes use the observed FK cascade. Completed jobs clear the source path. No financial tables are written.

Tests:15 worker cases;3 actual SDK2.57.4 transport cases with intercepted fetch; real competing PostgreSQL transactions; expired/stale leases and capped retries; synthetic legacy image bytes actually removed; another owner's image/customer and all orders unchanged. Existing browser, observed text schema and rollback checks passed. No real Storage API, Edge deployment, production SQL, key insertion, APK rebuild, merge or Hostinger update occurred.

Remaining scope is explicit: orphan/uncommitted review uploads, support-chat attachments and shared-reference ownership, both account/session paths, transactional-account data and actual backup expiry/restore handling. Media completion always reports account_deleted=false. Existing custom portal functions exist in the owner catalog but are not in checkout; the scoped next READ ONLY query obtains their definitions plus attachment/storage policies and profile links. It reads no account/file/payment rows. Full account erasure and Play readiness stay false.

## Owner session/media export received and dual-session cleanup verified

The fourth owner READ ONLY report supplied8/8 named definitions,27 storage policy definitions and the profiles-to-auth.users FK. Six comparable SQL bodies match shipped/previously exported implementations while preserving quoted literals and ignoring comments/formatting/keyword case. No existing login, attachment or Storage policy is replaced. Curated metadata/hashes only are stored in OWNER-SESSION-MEDIA-20261025.json.

Run40207097014/job121210264752 passed. The internal finalizer helper drains both customer token tables, verifies the secondary UUID ownership column and removes only the target customer's sessions. A synthetic old primary token was rejected by the actual exported identity validator. Unknown secondary shape failed before primary deletion. Repetition is idempotent; other customer tokens/profile values and all orders were unchanged. Full media/browser/drift/rollback checks also passed. There is no public helper endpoint, new auth.users deletion or claim that revoking tokens alone deletes an account.

Legacy portal readers reference old columns; their existence does not prove current successful execution or rights. No production RPC invocation or repair was performed. profiles is linked to auth.users, not proven to be the same identity as customers. Full transactional-account/chat/orphan-upload/backup fulfillment still remains held; live policies/gates stay disabled. No additional owner query is requested at this checkpoint.

## Non-financial preferences and restore ledger — tested in isolation

Run40208367842/job121214091139 passed. The gated fresh-profile finalizer now handles exact-owner carts, composite-owned favorites, notification-read state and block links to the erased account. Preference ownership keys are validated, all managed tables are locked before deletion, and unknown incoming cascading dependencies or DELETE triggers hold the entire operation. Completed verification notes are cleared. No financial record, order state, price or product is changed.

A new private ledger stores only a hash of the random customer UUID, receipt ID, completion time and export sequence. It is inserted atomically with profile/preferences/token deletion. Forced final-step failure restored every deletion and emitted no false completion tombstone. A simulated old-backup row was detected read-only from externally supplied hashes; empty/invalid input was rejected and the detector never authorizes restoration or certifies full coverage. Operator export is private and bounded to500 rows per call.

Other-owner cart/favorite/read-state/profile values, all orders and product catalog were unchanged; previous session/media/browser/drift/rollback tests passed. Actual Supabase backup settings, external ledger preservation and provider backup restoration were not inspected or changed. A ledger in the same database alone is insufficient because an old restore also loses later ledger entries. Production remains disabled. Full transactional-account, chat/associated files, orphan uploads and actual backup fulfillment are still unfinished; this result does not make the Play bundle upload-ready.
