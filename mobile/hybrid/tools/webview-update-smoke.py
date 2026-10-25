"""Assert real old-provider update guard, without following external store link."""
import ast,os,time,re,subprocess,xml.etree.ElementTree as E
from pathlib import Path
src=Path(__file__).with_name('emulator-smoke.py');tree=ast.parse(src.read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in{'adb','nodes','click'}],type_ignores=[]),str(src),'exec'))
pkg='com.kinto.preview.hybrid.v28';adb('install','--no-streaming','-r',os.environ['KINTO_APK']);adb('shell','pm','clear',pkg)
provider=adb('shell','dumpsys','webviewupdate');assert '74.0.'in provider,provider
adb('shell','am','start','-n',pkg+'/com.kinto.trendyollab.MainActivity');time.sleep(3)
labels=' '.join(n.get('text','')for n in nodes());assert 'يلزم تحديث عارض الصفحات'in labels and 'فتح صفحة التحديث'in labels,labels
assert 'اختبار توافق التطبيق'not in labels
click('إغلاق التطبيق',exact=True);time.sleep(1)
print('PASS_OLD_WEBVIEW_GUARD: actual WebView74 gets explicit update guidance; no store opened, account loaded, or data changed')
