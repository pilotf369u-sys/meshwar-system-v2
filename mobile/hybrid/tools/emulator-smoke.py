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
print(adb('shell','am','start','-n','com.kinto.preview.hybrid.v4/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true'))
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
raw=adb('shell','run-as','com.kinto.preview.hybrid.v4','cat','shared_prefs/com.kinto.trendyollab.MainActivity.xml')
root=E.fromstring(raw);s=next(x.text for x in root if x.get('name')=='preview_global_orders_v1')
orders=json.loads(s);assert len(orders)==1,orders
p=orders[0]
assert p['testOnly'] is True and p['serverSubmitted'] is False and p['fixture'] is True,p
assert p['pricingSource']=='synthetic-fixture' and p['convertedTotalIQD']=='35750',p
assert p['selectedOptions']=={'size':'L','color':'Haki'},p
assert p['sourcePerUsd']=='40' and p['targetPerUsd']=='1300' and p['displayCurrency']=='IQD' and p['pricingRevision']==1,p
assert p['shipping'] is None and p['testOrderCode'].startswith('TEST-'),p
# Separate WebView storage directories exist in the shared UID, and no generic bridge.
dirs=adb('shell','run-as','com.kinto.preview.hybrid.v4','ls')
assert 'app_webview_kinto-account' in dirs and 'app_webview_external-shopping' in dirs,dirs
print('PASS: install, launch, product reader, L/Haki, 35750 synthetic quote, explicit confirmation, persisted local TEST order, separate WebView directories')
print(json.dumps({k:p[k] for k in ['testOrderCode','testOnly','serverSubmitted','selectedOptions','convertedTotalIQD','shipping']},ensure_ascii=False))
