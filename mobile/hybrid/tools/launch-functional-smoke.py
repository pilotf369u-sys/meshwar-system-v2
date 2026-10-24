"""API29 functional launch only. This does not certify animation timing or smoothness."""
import ast,os,subprocess,time,re,xml.etree.ElementTree as E
from pathlib import Path
source=Path(__file__).with_name('emulator-smoke.py');tree=ast.parse(source.read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in {'adb','nodes','click'}],type_ignores=[]),str(source),'exec'))
package='com.kinto.preview.hybrid.v28';out=Path(os.environ['KINTO_APK']).parent
adb('install','--no-streaming','-r',os.environ['KINTO_APK']);adb('shell','pm','clear',package)
print('DEVICE_API',adb('shell','getprop','ro.build.version.sdk').strip())
print('WEBVIEW_PROVIDER',adb('shell','dumpsys','webviewupdate'))
print('ANIMATOR_SCALE',adb('shell','settings','get','global','animator_duration_scale').strip())
print('POWER_SAVER',adb('shell','settings','get','global','low_power').strip())
adb('logcat','-c');adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true')
for _ in range(20):
 snapshot=nodes();labels=' '.join(n.get('text','')for n in snapshot)
 if 'تشغيل فيديو الاختبار' in labels:break
 time.sleep(1)
assert 'تشغيل فيديو الاختبار' in labels,labels
assert 'NATIVE_COVER_STARTED' in adb('logcat','-d','-s','KintoLaunch:I','*:S')
assert not any(n.get('content-desc')=='KINTO launch screen'for n in snapshot)
print('PASS_API29_LAUNCH_FUNCTIONAL: native cover started and revealed usable interface; motion NOT certified')
adb('shell','input','keyevent','82');click('الخصوصية وحذف الحساب',exact=True,scroll=True);time.sleep(2)
labels=' '.join(n.get('text','')for n in nodes());assert 'طلب حذف حساب KINTO' in labels and 'support@shopkinto.com'in labels,labels
print('PASS_API29_PRIVACY_ENTRY: request resource accessible; nothing sent or deleted')
adb('shell','input','keyevent','4');time.sleep(1)
adb('shell','am','start','-W','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true')
assert 'KINTO launch screen'not in ' '.join(n.get('content-desc','')for n in nodes())
print('PASS_API29_WARM: no repeated opening on existing activity')
adb('shell','pm','clear',package);adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
try:
 adb('shell','am','start','-W','-n',package+'/com.kinto.trendyollab.MainActivity')
 for _ in range(8):
  labels=' '.join(n.get('text','')for n in nodes())
  if 'إعادة المحاولة'in labels:break
  time.sleep(2)
 assert 'إعادة المحاولة'in labels,labels
 click('إعادة المحاولة',exact=True);time.sleep(3)
 assert package in adb('shell','dumpsys','activity','activities')
 print('PASS_API29_OFFLINE: explicit retry and no crash; no production writes')
finally:
 adb('shell','svc','wifi','enable');adb('shell','pm','clear',package)
 for key in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:adb('shell','settings','put','global',key,'0')
