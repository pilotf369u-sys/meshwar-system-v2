# مراجعة Android Lint

الفحص الكامل الأول كشف6أخطاء و22تحذيراً. لم نستخدم baseline أو تعطيل Lint أو تغيير شدة الملاحظات.

- خمسة WrongConstant: استبدال setOrientation(1) بـLinearLayout.VERTICAL، وقيمته1. نفس الاتجاه دون تغيير منطق العرض.
- SuspiciousIndentation واحد: تصحيح المسافة قبل شرط bundledReview، دون تغيير الشرط أو الأقواس.
- ApplySharedPref مرتان: commit متعمد لحفظ التسليم المحلي ومفتاح إعادة المحاولة قبل المتابعة؛ لا نغيّره إلى كتابة غير متزامنة لمجرد إسكات التحذير.
- SetJavaScriptEnabled ثلاث: مطلوب لواجهة KINTO والمتاجر والفواتير. تمت مراجعة فصل مخازن WebView ومنع file/content/mixed-content؛ لم نجد addJavascriptInterface أو تجاوز SSL. هذا ليس تدقيق XSS شاملاً للموقع.
- DataExtractionRules: أضيفت استثناءات جميع المجالات من السحابة ونقل الجهاز على Android12+، مع allowBackup=false وقواعد المنع القديمة. لا حذف لبيانات حالية ولا تغيير للجلسة العادية. نقل OEM فعلي لم يُختبر.
- UnusedAttribute وObsoleteSdkInt: توافق موارد وإصدارات، دون عطل مثبت.
- DiscouragedApi: جلب الشعار بالاسم يخدم مسار SDK-only دون R مولّد؛ التصغير معطل. بقي الشعار المعتمد نفسه.
- MonochromeLauncherIcon: أصل monochrome وموارد v33 موجودة؛ التنبيه على موارد v26. لا نغيّر أيقونة المالك لإسكات هذا التنبيه فقط.
- SetTextI18n: الواجهة عربية والعلامة KINTO مضمّنتان بالكود؛ توسيع اللغات غير منفذ، ولا ندعي دعماً غير موجود.

تسجل النتيجة النهائية وعدد التحذيرات بعد CI في PREPARATION-RESULTS.md. نحفظ تقارير HTML/XML دون بيانات عملاء. المرجع لقواعد النسخ: https://developer.android.com/identity/data/autobackup
