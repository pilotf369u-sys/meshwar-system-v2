"""Only synthetic local order writes; no customer login or production checkout."""
import json,os,re,subprocess,time,xml.etree.ElementTree as E

def adb(*args,timeout=90):
 p=subprocess.run(['adb',*args],capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError(p.stdout+p.stderr)
 return p.stdout

def nodes():
 # UIAutomator may return success before its XML exists during WebView cold start.
 for attempt in range(5):
  try:
   adb('shell','rm','-f','/sdcard/kinto-smoke.xml')
   adb('shell','uiautomator','dump','/sdcard/kinto-smoke.xml')
   snapshot=adb('shell','cat','/sdcard/kinto-smoke.xml')
   return list(E.fromstring(snapshot[snapshot.index('<?xml'):]).iter('node'))
  except (RuntimeError,ValueError,E.ParseError):
   if attempt==4:raise
   time.sleep(1)

def click(text,attempts=6,scroll=False):
 for _ in range(attempts):
  for n in nodes():
   if text in n.get('text',''):
    b=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
    if len(b)==4 and b[2]>b[0] and b[3]>b[1]:
     adb('shell','input','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2));return
  if scroll:adb('shell','input','swipe','500','1400','500','500','400')
  time.sleep(2)
 raise AssertionError('Missing control: '+text+'; texts='+repr([n.get('text') for n in nodes()]))

print(adb('install','--no-streaming','-r',os.environ['KINTO_APK']))
print(adb('shell','am','start','-n','com.kinto.preview.hybrid.v15/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true'))
time.sleep(8)
adb('shell','input','keyevent','82');click('تجربة كاملة');time.sleep(8)
labels=['الرئيسية','المتاجر','السلة','طلباتي','الدردشة','مفضلاتي','حسابي']
for _ in range(12):
 texts=' '.join(n.get('text','') for n in nodes())
 if all(label in texts for label in labels) and "35750 IQD" in texts:break
 time.sleep(1)
with open(os.path.join(os.path.dirname(os.environ['KINTO_APK']),'store-test.png'),'wb') as shot:subprocess.run(['adb','exec-out','screencap','-p'],stdout=shot,check=True,timeout=20)
if not all(label in texts for label in labels):
 print(adb('logcat','-d','-t','160','AndroidRuntime:E','chromium:E','*:S'))
 print(adb('shell','dumpsys','activity','activities')[-5000:])
assert 'KINTO | المتاجر العالمية' not in texts and 'العودة إلى KINTO' not in texts,texts
for label in labels:assert label in texts,texts
assert "35750 IQD" in texts,texts
click('السلة')
for _ in range(12):
 returned=' '.join(n.get('text','') for n in nodes())
 if 'NAV_CART_PASS' in returned:break
 time.sleep(1)
with open(os.path.join(os.path.dirname(os.environ['KINTO_APK']),'navigation-return-test.png'),'wb') as shot:subprocess.run(['adb','exec-out','screencap','-p'],stdout=shot,check=True,timeout=20)
assert 'NAV_CART_PASS' in returned,returned
print('PASS: no external store top strip; seven customer navigation actions visible; cart action returns to trusted KINTO renderer')
adb('shell','input','keyevent','82');click('تجربة كاملة');time.sleep(5)
click('أضف إلى KINTO')
time.sleep(2)
for _ in range(8):
 texts=' '.join(n.get('text','') for n in nodes())
 if '35750' in texts:break
 adb('shell','input','swipe','500','1400','500','700','350');time.sleep(1)
assert '35750' in texts, texts
click('طابقت',scroll=True);click('أؤكد الإضافة')
time.sleep(2)
raw=adb('shell','run-as','com.kinto.preview.hybrid.v15','cat','shared_prefs/com.kinto.trendyollab.MainActivity.xml')
root=E.fromstring(raw);s=next(x.text for x in root if x.get('name')=='preview_global_orders_v1')
orders=json.loads(s);assert len(orders)==1,orders
p=orders[0]
assert p['testOnly'] is True and p['serverSubmitted'] is False and p['fixture'] is True,p
assert p['pricingSource']=='synthetic-fixture' and p['convertedTotalIQD']=='35750',p
assert p['selectedOptions']=={'size':'L','color':'Haki'},p
assert p['sourcePerUsd']=='40' and p['targetPerUsd']=='1300' and p['displayCurrency']=='IQD' and p['pricingRevision']==1,p
assert p['shipping'] is None and p['testOrderCode'].startswith('TEST-'),p
# Separate WebView storage directories exist in the shared UID, and no generic bridge.
dirs=adb('shell','run-as','com.kinto.preview.hybrid.v15','ls')
assert 'app_webview_kinto-account' in dirs and 'app_webview_external-shopping' in dirs,dirs
print('PASS: install, launch, product reader, L/Haki, 35750 synthetic quote, explicit confirmation, persisted local TEST order, separate WebView directories')
print(json.dumps({k:p[k] for k in ['testOrderCode','testOnly','serverSubmitted','selectedOptions','convertedTotalIQD','shipping']},ensure_ascii=False))

# Synthetic captures must never reach the live customer submission page.
click('إكمال الطلب للمراجعة')
time.sleep(1)
texts=' '.join(n.get('text','') for n in nodes())
assert 'بيانات الاختبار المصطنعة لا تُرسل' in texts,texts
print('PASS: synthetic fixture explicitly blocked from server submission')

# Capture a second product; the new confirmation must show ONLY that product.
click('حسنًا');time.sleep(2)
adb('shell','input','keyevent','82');click('تجربة كاملة');time.sleep(5)
click('أضف إلى KINTO');click('طابقت',scroll=True);click('أؤكد الإضافة');time.sleep(2)
visible=nodes();assert sum('حذف هذا المنتج من المسودة'==n.get('text','') for n in visible)==1,visible
assert any('تأكيد منتج واحد'==n.get('text','') for n in visible),visible
with open(os.path.join(os.path.dirname(os.environ['KINTO_APK']),'product-review-test.png'),'wb') as shot:subprocess.run(['adb','exec-out','screencap','-p'],stdout=shot,check=True,timeout=20)
raw=adb('shell','run-as','com.kinto.preview.hybrid.v15','cat','shared_prefs/com.kinto.trendyollab.MainActivity.xml');prefs=E.fromstring(raw);saved=json.loads(next(x.text for x in prefs if x.get('name')=='preview_global_orders_v1'));assert len(saved)==2 and saved[0]['requestKey']!=saved[1]['requestKey'],saved
# A synthetic trusted-page acknowledgement removes exactly its one product, then replay is harmless.
ack=saved[0]['requestKey'];sent_id=saved[0]['testOrderCode'];remaining_id=saved[1]['testOrderCode']
for name,value in [('world_batch_key_v1',ack),('world_batch_ids_v1',json.dumps([sent_id]))]:
 node=next((x for x in prefs if x.get('name')==name),None)
 if node is None:node=E.SubElement(prefs,'string',{'name':name})
 node.text=value
adb('shell','am','force-stop','com.kinto.preview.hybrid.v15')
local=os.path.join(os.path.dirname(os.environ['KINTO_APK']),'synthetic-draft-prefs.xml');E.ElementTree(prefs).write(local,encoding='utf-8',xml_declaration=True)
adb('push',local,'/data/local/tmp/kinto-synthetic-prefs.xml');adb('shell','chmod','644','/data/local/tmp/kinto-synthetic-prefs.xml');adb('shell','run-as','com.kinto.preview.hybrid.v15','cp','/data/local/tmp/kinto-synthetic-prefs.xml','shared_prefs/com.kinto.trendyollab.MainActivity.xml')
adb('shell','am','start','-n','com.kinto.preview.hybrid.v15/com.kinto.trendyollab.MainActivity','--ez','acknowledgeReviewFixture','true');time.sleep(4)
def saved_drafts():
 xml=E.fromstring(adb('shell','run-as','com.kinto.preview.hybrid.v15','cat','shared_prefs/com.kinto.trendyollab.MainActivity.xml'));return json.loads(next(x.text for x in xml if x.get('name')=='preview_global_orders_v1'))
assert [x['testOrderCode'] for x in saved_drafts()]==[remaining_id],saved_drafts()
adb('shell','am','force-stop','com.kinto.preview.hybrid.v15');adb('shell','am','start','-n','com.kinto.preview.hybrid.v15/com.kinto.trendyollab.MainActivity','--ez','acknowledgeReviewFixture','true','--es','acknowledgeKeyFixture',ack);time.sleep(3)
assert [x['testOrderCode'] for x in saved_drafts()]==[remaining_id]
# Per-product removal affects only the local unsent draft.
adb('shell','input','keyevent','82');click('منتجات بانتظار الإرسال');click('حذف هذا المنتج')
for n in nodes():
 if n.get('text')=='حذف' and n.get('class')=='android.widget.Button':
  b=list(map(int,re.findall(r'\d+',n.get('bounds',''))));adb('shell','input','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2));break
else:raise AssertionError('Delete confirmation absent')
time.sleep(1);assert saved_drafts()==[]
print('PASS: one-product confirmation, unique stable request keys, trusted acknowledgement removes one draft, replay safe, per-product deletion; no production writes')

# Load the real bundled review assets without a customer session or any write.
adb('shell','am','force-stop','com.kinto.preview.hybrid.v15')
adb('shell','am','start','-n','com.kinto.preview.hybrid.v15/com.kinto.trendyollab.MainActivity','--ez','bundledReviewFixture','true')
for _ in range(12):
 texts=' '.join(n.get('text','') for n in nodes())
 if 'PASS_CUSTOMER_INTEGRATED_UI' in texts:break
 time.sleep(1)
assert 'PASS_CUSTOMER_INTEGRATED_UI' in texts,texts
print('PASS: embedded My Orders, saved profile, consent and submission fixture; no production writes')

# The second supported store reuses the exact confirmation/pricing boundary with a distinct reader.
adb('shell','am','force-stop','com.kinto.preview.hybrid.v15')
adb('shell','am','start','-n','com.kinto.preview.hybrid.v15/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true');time.sleep(4)
adb('shell','input','keyevent','82');click('تجربة هبسي بوردا');time.sleep(5)
for _ in range(12):
 labels=' '.join(n.get('text','') for n in nodes())
 if '35750 IQD' in labels:break
 time.sleep(1)
if '35750 IQD' not in labels:
 print(adb('logcat','-d','-t','200','AndroidRuntime:E','chromium:E','*:S'))
 print(adb('shell','dumpsys','activity','activities')[-5000:])
 with open(os.path.join(os.path.dirname(os.environ['KINTO_APK']),'hepsiburada-review-test.png'),'wb') as shot:subprocess.run(['adb','exec-out','screencap','-p'],stdout=shot,check=True,timeout=20)
assert '35750 IQD' in labels,labels
click('أضف إلى KINTO');click('طابقت',scroll=True);click('أؤكد الإضافة');time.sleep(2)
hepsi=saved_drafts();assert len(hepsi)==1 and hepsi[0]['source']=='hepsiburada' and hepsi[0]['url'].endswith('-p-HBCV0000TEST'),hepsi
assert hepsi[0]['fixture'] is True and hepsi[0]['convertedTotalIQD']=='35750' and hepsi[0]['selectedOptions']=={'size':'L','color':'Haki'},hepsi
with open(os.path.join(os.path.dirname(os.environ['KINTO_APK']),'hepsiburada-review-test.png'),'wb') as shot:subprocess.run(['adb','exec-out','screencap','-p'],stdout=shot,check=True,timeout=20)
click('إكمال الطلب للمراجعة');time.sleep(1)
assert 'بيانات الاختبار المصطنعة لا تُرسل' in ' '.join(n.get('text','') for n in nodes())
print('PASS: Hepsiburada isolated reader, TRY price/admin-shaped conversion, L/Haki confirmation, one-product draft and synthetic server-submit refusal; no production writes')
