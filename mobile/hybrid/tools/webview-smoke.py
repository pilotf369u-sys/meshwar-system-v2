"""Offline regression of app wrapper only; no role login or real invoice data."""
import subprocess,time,xml.etree.ElementTree as E,re,os
P='com.kinto.preview.hybrid.v2'
def adb(*args):
 r=subprocess.run(['adb',*args],capture_output=True,text=True,timeout=60)
 if r.returncode:raise RuntimeError(r.stdout+r.stderr)
 return r.stdout

def nodes():
 adb('shell','uiautomator','dump','/sdcard/kinto-compat.xml');s=adb('shell','cat','/sdcard/kinto-compat.xml');return list(E.fromstring(s[s.index('<?xml'):]).iter('node'))
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
 click(label);time.sleep(2);s=text();assert 'INVOICE_'+role in s,s;assert 'طباعة / PDF' in s,s;click('إغلاق');time.sleep(1)
print('PASS: customer/staff/vendor document.write invoices including async window.open, visible print control and close; no persistent app header')
click('تشغيل فيديو الاختبار')
for _ in range(10):
 s=text()
 if 'VIDEO_PLAYING' in s:break
 time.sleep(1)
assert 'VIDEO_PLAYING' in s,s
print('PASS: H264 video source restored from read-only settings fixture, decoded and played inside WebView')
adb('shell','am','force-stop',P)
