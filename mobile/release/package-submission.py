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
for name in ['VALIDATION-20261025.json','INTEGRATION-BASELINE-20261026.json','COMMERCE-POLICY-VALIDATION-20261026.json','PRIVACY-OPERATIONS-DECISIONS.json','play-verified-config.example.json','CLOSED-TEST-LOG.csv','RETAILER-AUTHORIZATION-REQUEST.txt','STORAGE-SUPPORT-QUESTION.txt','store-listing.ar.json','release-notes.ar.txt','submission-state.json']:
 files['guide/'+name]=(source/name).read_bytes()
for f in (source/'site-drafts').glob('*.html'):files['site-drafts-NOT-APPROVED/'+f.name]=f.read_bytes()
for name in ['KINTO-Play-Icon-512.png','KINTO-Feature-Graphic-1024x500.png']:files['store-assets/'+name]=(assets/name).read_bytes()
# Explicit review-source list: never add a whole checkout or arbitrary logs/media.
review_paths = [
 'sql/kinto-privacy-controls-v1.sql',
 'sql/kinto-privacy-controls-rollback-v1.sql',
 'sql/kinto-privacy-media-v1.sql',
 'sql/kinto-privacy-media-rollback-v1.sql',
 'sql/kinto-privacy-chat-v1.sql',
 'sql/kinto-privacy-checkpoint-v1.sql',
 'sql/kinto-privacy-progress-v1.sql',
 'sql/kinto-privacy-transaction-preview-v1.sql',
 'sql/kinto-privacy-transaction-preview-rollback-v1.sql',
 'sql/kinto-privacy-progress-rollback-v1.sql',
 'sql/kinto-privacy-review-erasure-v1.sql',
 'sql/kinto-privacy-review-erasure-rollback-v1.sql',
 'mobile/privacy/checkpoint.py',
 'sql/kinto-privacy-chat-rollback-v1.sql',
 'supabase/config.toml',
 'supabase/functions/kinto-privacy-media-v1/index.ts',
 'supabase/functions/kinto-privacy-media-v1/worker.mjs',
 'sql/kinto-privacy-inventory-readonly-v1.sql',
 'sql/kinto-privacy-invoice-contract-readonly-v1.sql',
 'sql/kinto-privacy-storage-config-readonly-v1.sql',
 'sql/kinto-privacy-session-contract-readonly-v1.sql',
 'sql/kinto-privacy-dependencies-readonly-v1.sql',
 'sql/kinto-privacy-session-media-contract-readonly-v1.sql',
 'mobile/privacy/OBSERVED-SCHEMA-20261025.md',
 'mobile/privacy/OWNER-DEPENDENCIES-20261025.json',
 'mobile/privacy/OWNER-SESSION-MEDIA-20261025.json',
 'mobile/privacy/OWNER-STORAGE-CONFIG-20261025.json',
 'mobile/privacy/OWNER-CUSTOMER-PROFILE-20261025.json',
 'mobile/privacy/OWNER-INVOICE-CATALOG-20261026.json',
 'mobile/privacy/OWNER-INVOICE-CONTRACT-20261026.json',
 'js/kinto-privacy-client-v1.js',
 'js/kinto-privacy-page-v1.js',
 'js/kinto-privacy-admin-v1.js',
 'js/customer-product-reviews-v135.js',
 'js/store-product-reviews-v140.js',
 'review-policy.html',
 'account-deletion.html',
 'mobile/privacy/README.md',
 'mobile/privacy/chat-attachment-inventory.mjs',
 'mobile/privacy/transactional-preview.mjs',
]
for name in review_paths:files['review-source-NOT-DEPLOY/'+name]=(root/name).read_bytes()
# A safe, explicit record of compiled/native and isolated-test results, not arbitrary raw logs.
files['evidence/VALIDATION-20261025.json']=(source/'VALIDATION-20261025.json').read_bytes()
state=json.loads((source/'submission-state.json').read_text())
assert state['production_upload_ready'] is False,'This builder creates review packs only'
files['START-HERE.html']=('''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KINTO — مراجعة حزمة النشر</title><style>body{margin:auto;max-width:800px;padding:24px;background:#0a2f23;color:#f4f3e7;font:17px/1.9 Tahoma,Arial}h1,h2,a{color:#efd185}section{padding:20px;background:#123f31;border-radius:16px;margin:18px 0}img{width:100%;border-radius:14px}</style><h1>KINTO — حزمة مراجعة النشر</h1><p>مرجع التطبيق: نسخة28 المعتمدة. لا إعادة بناء لوظائف التطبيق أو تكرار تجارب البيع السابقة.</p><img src="store-assets/KINTO-Feature-Graphic-1024x500.png" alt="غلاف KINTO للمتجر"><section><h2>ما اكتمل</h2><p>وصف المتجر والشعار والغلاف، وإضافات الخصوصية والبلاغات والحظر وطلب الحذف مع فحوص معزولة ناجحة. نجحت الفواتير للعميل والموظف والتاجر والفيديو علىAPI36. المحرك القديم74 يعرض إرشاد التحديث. لا تغيير للقراء أو التسعير أو الافتتاحية المعتمدة.</p></section><section><h2>ما يحتاج إغلاقاً قبل الرفع</h2><p>الحذف المتكامل والاحتفاظ والصفحات المنشورة، وإذن تكامل المتاجر، وبياناتConsole والتوقيع والحزمة النهائية وحساب المراجع وصور الواجهات. في الحساب الشخصي تذكرGoogle أن الاسم القانوني يظهر علىالمتجر؛ اسمKINTO داخل التطبيق لا يخفيه من ملف المطوّر.</p><p><a href="guide/READY-FOR-UPLOAD.md">حالة الجاهزية الدقيقة</a> · <a href="guide/PLAY-POLICY-RECHECK-20261025.md">المصادر الرسمية</a></p></section><section><h2>حدود هذه الملفات</h2><p>هذه حزمة مراجعة، وليستAAB أوAPK للرفع أو التثبيت. الملفات تحتreview-source-NOT-DEPLOY لا تُنسخ إلىهوستنكر أو تُنفّذ علىSupabase مباشرة. يلزم اعتماد دمجها معالنسخة الحالية وتطبيقها بصورة منسقة. لا مفاتيح أو كلمات مرور أو بيانات دخول أو اسم شخصي فيها.</p></section></html>''').encode()
files['CONTENTS.json']=json.dumps({'purpose':'review only, not for upload or direct deployment','runtime_reference':state['application_runtime_reference'],'production_upload_ready':False,'paths':sorted(files)},ensure_ascii=False,indent=2).encode()
files['SHA256SUMS.txt']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(files.items())).encode()
assert not any(n.endswith(('.apk','.aab','.keystore','.jks','.p12')) for n in files)
dest.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
 for name,b in sorted(files.items()):z.writestr(name,b)
print(json.dumps({'path':str(dest),'files':len(files),'size':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'upload_ready':False}))
