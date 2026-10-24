# مطابقة Google Play — 24 أكتوبر2026

المرجع الحالي: نسخة28 التي اعتمدها المالك؛ دعم البريد support@shopkinto.com أكد المالك أنه يعمل. تأكيد المالك ليس تجربة إرسال قمنا بها. الحالة العامة: التحضير متقدم، الرفع محجوب حتى إغلاق البنود التالية. لا ضمان لقبول المراجعة.

| البند | الدليل / النتيجة | الحالة |
|---|---|---|
| Target API | Gradle وAPK: target36، min28 | منفذ؛ فحص compiled فيCI |
| ذاكرة16KB | لا مكتبات native داخل APK/AAB؛ Java وWebView النظام | جرد الحزمة، ليس اختبار جهاز16KB |
| صلاحيات | INTERNET فقط، HTTPS، لا وصول شامل للصور/الموقع/الهاتف | يفحص APK الفعلي |
| التوقيع | preview منفصل؛ assetlinks الإنتاج بلا تغيير | توقيع AAB النهائي ينتظرConsole |
| التجربة | KINTO حساب/طلبات/فواتير/دعم؛28 معتمد من المالك | محاكي36؛29 يفحص في هذه الحزمة |
| الخصوصية | الجرد والنص المقترح موجودان؛ لا سياسة عامة مثبتة | يلزم اعتماد وتفعيل الرابط داخل التطبيق وخارجه |
| حذف الحساب | بدء الطلب داخل التطبيق وملف عام؛ البريد مؤكد | الحذف الفعلي واحتفاظ السجلات وتجربة حساب مصطنع غير منجزة |
| المتاجر الخارجية | قيمة إضافية مستقلة، لا ادعاء شراكة | قيود صريحة في شروطTrendyol ومحتوىZara؛ راجعRETAILER-PERMISSIONS،لا تفويض مثبت |
| التقييمات والصور UGC | مراجعة أدمن موجودة فيadmin-product-reviews-v138.js | لم نجد دليلاً على الإبلاغ/حظر المستخدم وقبول سياسة قبل الرفع في واجهات التقييم المفحوصة؛ فجوة امتثال تحتاج تنفيذ وفحص مستقل |
| بياناتGoogle | لا يصح اختيار«لا نجمع»؛ بيانات حساب/مشتريات/رسائل وصور | جرد +ورقة إجابات، ليست إقراراً نهائياً |
| البيع | منتجات مادية وشحن؛ لاGoogle Billing لهذه المعاملات | أي SKU رقمي فعلي يحتاج تصنيفاً منفصلاً، لا يكفي اسم التبويب |
| صور ووصف | شعار المالك، غلاف جديد، نص عربي | لقطات الواجهات النهائية وحساب المراجع لم تُنشأ دون بيانات اختبار |
| جمهور/إعلانات/تصنيف | لاSDK إعلان أصلي؛ محتوى الويب ليس مستثنى | لا تخمين التصنيف أو«لا إعلانات» قبل مراجعة المحتوى الفعلي |
| Console | الهوية قيد التحقق؛ لا وصول موثّق للتطبيق/المفاتيح | مانع حسابي |

## المراجع الرسمية التي تم التحقق منها

- Target SDK: https://developer.android.com/google/play/requirements/target-sdk
- 16KB: https://developer.android.com/guide/practices/page-sizes
- بيانات/سياسة/حذف: https://support.google.com/googleplay/android-developer/answer/10144311
- تفاصيلالحذف: https://support.google.com/googleplay/android-developer/answer/13327111
- Data Safety وتعريفWebView: https://support.google.com/googleplay/android-developer/answer/10787469
- WebView/affiliate: https://support.google.com/googleplay/android-developer/answer/9899034
- المحتوى المنشأ من المستخدم: https://support.google.com/googleplay/android-developer/answer/9876937
- السلعالمادية: https://support.google.com/googleplay/android-developer/answer/9858738
- تعليماتالمراجع: https://support.google.com/googleplay/android-developer/answer/9859455
- الاختبارالشخصي: https://support.google.com/googleplay/android-developer/answer/14151465
- أصولالمتجر: https://support.google.com/googleplay/android-developer/answer/9866151?hl=en

المتطلبات تتغير؛ نطابق التنبيهات المعروضة فيConsole عند الرفع. تشغيل التطبيق فيWebView أو نجاحه سابقاً ليس إذناً من المتاجر ولا موافقةGoogle. لا نزيل متجراً ولا نعدل التقييمات أو مسار البيع بقرار ضمني من هذا المستند.

التحقق الحي: سياسةالخصوصيةHTTP200 لكنهاصفحةقيدالإعداد؛ حذفالحسابHTTP404. راجعLIVE-PAGES-CHECK.
