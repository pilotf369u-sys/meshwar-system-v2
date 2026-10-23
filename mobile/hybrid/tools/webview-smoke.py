"""Offline regression of app wrapper only; no role login or real invoice data."""
import subprocess,time,xml.etree.ElementTree as E,re,os
P='com.kinto.preview.hybrid.v8'
def adb(*args):
 r=subprocess.run(['adb',*args],capture_output=True,text=True,timeout=60)
 if r.returncode:raise RuntimeError(r.stdout+r.stderr)
 return r.stdout

def nodes():
 # UIAutomator may return success before its XML exists during WebView cold start.
 for attempt in range(5):
  try:
   adb('shell','rm','-f','/sdcard/kinto-compat.xml')
   adb('shell','uiautomator','dump','/sdcard/kinto-compat.xml')
   snapshot=adb('shell','cat','/sdcard/kinto-compat.xml')
   return list(E.fromstring(snapshot[snapshot.index('<?xml'):]).iter('node'))
  except (RuntimeError,ValueError,E.ParseError):
   if attempt==4:raise
   time.sleep(1)

def text():return ' '.join(n.get('text','') for n in nodes())
def click(label):
 for _ in range(8):
  for n in nodes():
   if label==n.get('text',''):
    b=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
    if len(b)==4 and b[2]>b[0] and b[3]>b[1]:adb('shell','input','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2));return
  time.sleep(1)
 raise AssertionError('Missing '+label+' '+text())
print(adb('install','--no-streaming','-r',os.environ['KINTO_APK']))
adb('shell','am','force-stop',P)
print(adb('shell','am','start','-n',P+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true'))
time.sleep(5)
s=text();assert 'طلب تجريبي' not in s and 'الموقع حي' not in s,s
for label,role in [('فاتورة العميل','CUSTOMER'),('فاتورة الموظف','STAFF'),('فاتورة التاجر','VENDOR')]:
 click(label)
 # Focus the attached document once; cold software-rendered WebViews may expose
 # only their title to accessibility until focused. Keep assertions on real body/layout.
 focused=False
 for _ in range(40):
  s=text()
  if 'INVOICE_'+role in s and 'LAYOUT_PASS' in s:break
  if not focused and 'طباعة / PDF' in s:
   adb('shell','input','tap','540','500');focused=True
  time.sleep(1)
 assert 'INVOICE_'+role in s,s
 assert 'LAYOUT_PASS' in s,s
 if role=='CUSTOMER':
  with open(os.path.join(os.path.dirname(os.environ['KINTO_APK']),'invoice-test.png'),'wb') as shot:subprocess.run(['adb','exec-out','screencap','-p'],stdout=shot,check=True,timeout=20)
 assert 'طباعة / PDF' in s,s
 click('إغلاق');time.sleep(1)
print('PASS: customer/staff/vendor document.write invoices including async window.open, visible print control and close; no persistent app header')
click('تشغيل فيديو الاختبار')
for _ in range(10):
 s=text()
 if 'VIDEO_PLAYING' in s:break
 time.sleep(1)
assert 'VIDEO_PLAYING' in s,s
print('PASS: H264 video source restored from read-only settings fixture, decoded and played inside WebView')
adb('shell','am','force-stop',P)
