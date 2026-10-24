"""Fast isolated native Zara proof before the full suite. Synthetic writes only."""
import ast,json,os,re,subprocess,time,xml.etree.ElementTree as E
from pathlib import Path
source=Path(__file__).with_name('emulator-smoke.py')
module=ast.parse(source.read_text())
helpers=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in {'adb','nodes','click','recreate_shop_fixture','saved_drafts'}]
exec(compile(ast.Module(body=helpers,type_ignores=[]),str(source),'exec'))
package='com.kinto.preview.hybrid.v22'
adb('install','--no-streaming','-r',os.environ['KINTO_APK'])
try:
 adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true');time.sleep(4)
 adb('shell','input','keyevent','82');click('تجربة زارا');time.sleep(5)
 for _ in range(12):
  labels=' '.join(n.get('text','') for n in nodes())
  if '35750 IQD' in labels:break
  time.sleep(1)
 assert '35750 IQD' in labels,labels
 recreate_shop_fixture()
 click('L',exact=True,scrollUp=True);time.sleep(2)
 click('أضف إلى KINTO');click('طابقت',scroll=True);click('أؤكد الإضافة');time.sleep(2)
 zara=[p for p in saved_drafts() if p['source']=='zara'];assert len(zara)==1,zara
 assert zara[0]['fixture'] is True,zara
 assert zara[0]['price']==1000 and zara[0]['priceSource']=='visible' and zara[0]['convertedTotalIQD']=='35750' and zara[0]['selectedOptions']=={'size':'L','color':'Haki'},zara
 print('PASS_ZARA_NATIVE_FIRST: active reference-bound card, product URL restoration, same quote and touch confirmation; no production writes')
finally:
 # Only this freshly installed CI preview's synthetic data exists here.
 adb('shell','pm','clear',package)
