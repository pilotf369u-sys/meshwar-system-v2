"""Build a reviewable preparation ZIP only: no APK/AAB, credentials or upload."""
import argparse,hashlib,json,pathlib,shutil,zipfile
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--assets',required=True);p.add_argument('--output',required=True);args=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[2];source=root/'mobile/release';dest=pathlib.Path(args.output).resolve()
if dest==root or root in dest.parents:raise SystemExit('Deliverable must be outside checkout')
assets=pathlib.Path(args.assets)
listing=json.loads((source/'store-listing.ar.json').read_text())
assert len(listing['app_name'])<=30 and len(listing['short_description'])<=80 and len(listing['full_description'])<=4000
for name,size in [('KINTO-Play-Icon-512.png',(512,512)),('KINTO-Feature-Graphic-1024x500.png',(1024,500))]:
 with Image.open(assets/name) as im:assert im.size==size and im.format=='PNG'
files={}
for f in source.glob('*.md'):files['guide/'+f.name]=f.read_bytes()
for name in ['PRIVACY-OPERATIONS-DECISIONS.json','play-verified-config.example.json','CLOSED-TEST-LOG.csv','RETAILER-AUTHORIZATION-REQUEST.txt','store-listing.ar.json','release-notes.ar.txt','submission-state.json']:
 files['guide/'+name]=(source/name).read_bytes()
for f in (source/'site-drafts').glob('*.html'):files['site-drafts-NOT-APPROVED/'+f.name]=f.read_bytes()
for f in assets.glob('*.png'):files['store-assets/'+f.name]=f.read_bytes()
for f in (source/'evidence').glob('*'):
 if f.is_file() and f.suffix in ['.json','.xml','.html']:files['evidence/'+f.name]=f.read_bytes()
files['START-HERE.html']=('''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KINTO — حزمة تجهيز Google Play</title><style>body{margin:auto;max-width:800px;padding:24px;background:#0a2f23;color:#f4f3e7;font:17px/1.9 Tahoma,Arial}h1,h2,a{color:#efd185}section{padding:20px;background:#123f31;border-radius:16px;margin:18px 0}img{width:100%;border-radius:14px}strong{color:#efd185}li{margin:12px 0}</style><h1>KINTO — حزمة تجهيز Google Play</h1><p>مرجع التطبيق: نسخة28 المعتمدة من مهندس عمر. بريد الدعم يعمل حسب تأكيده. لا حاجة لتحديث هوستنكر أو إعادة تثبيت التطبيق لمراجعة هذه الملفات.</p><img src="store-assets/KINTO-Feature-Graphic-1024x500.png" alt="غلاف KINTO للمتجر"><section><h2>ما تحتويه الحزمة</h2><p>الشعار والغلاف، وصف المتجر، ملفات الخصوصية والإقرارات للمراجعة، خطة الاختبار، تعليمات المراجع وخطوات Console، نتائج الفحوص ومراجع Google الرسمية.</p><p><strong>هذه حزمة تحضير وليست ملف تطبيق جاهزاً للرفع.</strong> لا تحتوي AAB أو APK أو مفاتيح توقيع أو كلمات مرور أو بيانات عملاء.</p></section><section><h2>ما يمنع الرفع الآن</h2><ol><li>بيانات Console والتوقيع النهائي بعد قبول الحساب.</li><li>إجراء حذف حساب فعلي مجرّب، وسياسة احتفاظ معتمدة وصفحات عامة نهائية.</li><li>إكمال أدوات الإبلاغ والحظر وقواعد التقييمات.</li><li>حسم إذن عرض المتاجر وقراءة بياناتها؛ لا نغير المتاجر الحالية تلقائياً.</li><li>حساب مراجع مصطنع وصور الواجهات الحقيقية والفحوص النهائية ومسار Google.</li></ol></section><section><h2>نتيجة توافق إضافية</h2><p>نجح فتح الواجهة والخصوصية والعودة وإعادة المحاولة على محاكي أندرويد10. فشل تنسيق فاتورة العميل مع عارض الويب القديم74، ولم يصل الفحص إلى فاتورتي الموظف والتاجر أو الفيديو. بقيت هذه نقطة فحص مفتوحة، ولم نغيّر قرّاء المتاجر لإسكاتها.</p></section><section><h2>كيف نكمل</h2><p>نراجع القرارات التشغيلية في guide/OWNER-DECISIONS-AR.md. بعد اعتمادها نعالج الحذف والتقييمات ضمن إضافة مستقلة وفحص معزول، ثم بيانات Console والتوقيع. لا نتجاوز بوابة جاهزية بسبب اكتمال المواد أو قبول الهوية.</p><p>التفاصيل والأدلة في guide/PREPARATION-RESULTS.md وguide/PLAY-POLICY-MATRIX.md.</p></section></html>''').encode()
files['SHA256SUMS.txt']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(files.items())).encode()
assert not any(n.endswith(('.apk','.aab','.keystore','.jks','.p12')) for n in files)
dest.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
 for name,b in sorted(files.items()):z.writestr(name,b)
print(json.dumps({'path':str(dest),'files':len(files),'size':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'upload_ready':False}))
