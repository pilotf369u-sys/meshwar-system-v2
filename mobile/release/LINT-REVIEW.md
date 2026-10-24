# مراجعة فحص Android Lint

الفحص الكامل الأول كشف6أخطاء و22تحذيراً. لم نستخدمbaseline أو تعطيلlint أو تغييرشدةالملاحظات.

- خمسةWrongConstant: استبدالsetOrientation(1) بـLinearLayout.VERTICAL،وقيمته1. نفسالسلوك،لا تغييرتنسيقفعلي.
- SuspiciousIndentation واحد: تصحيحالمسافةقبلشرط فيbundledReview،لا تغييرالأقواس أوالشرط.
- ApplySharedPref مرتان: commit متعمدلحفظالتسليمالمحلي ومفتاحإعادةالمحاولةقبلالمتابعة؛ لاتبديلعشوائيإلىكتابةغيرمتزامنة.
- SetJavaScriptEnabled ثلاث: مطلوبلواجهةKINTO وقراءةالمتاجر والفواتير. فصلعملياتومخازنWebView،منعfile/content/mixed-content،لاaddJavascriptInterface ولاتجاوزSSLمرصود؛ التحذيرليستدقيقXSSشاملاًللموقع.
- DataExtractionRules: تمتإضافةاستثناءكلالمجالاتمنالسحابةونقلالجهازعلىAndroid12+،معallowBackup=falseالقائم. لا حذفبياناتحالـية ولاتغييرجلسةعادية؛ اختبارنقلOEMفعليمازالخارجنطاقالمحاكي.
- UnusedAttribute/ObsoleteSdkInt: توافقنسخAndroid،ليسعطلاًمرصوداً.
- DiscouragedApi: getIdentifier للشعاريلزملمسارSDK-onlyبدونRgenerated؛ minifyمعطل. لا تغييرلأصلالشعارالمعتمد.
- MonochromeLauncherIcon: يوجدأصلmonochrome ومواردv33؛ التحذيرعلىمواردv26. لانتغيّرأيقونةالمالكالمعتمدةلإسكاتتحذيرقديم.
- SetTextI18n: الواجهةالعربيةوالعلامةKINTO مضمّنتانبالكود؛ توسيعاللغاتمؤجل. لا ادعاءدعملغاتغيرموجودة.

النتيجةالنهائيةوالعددالمتبقّيمنالتحذيراتيوثّقانبعدCI،لايعتبرالفحصالأولناجحاً. تُحفظتقاريرHTML/XMLكأدلةداخلحزمةالتحضيردونبياناتعميل.
