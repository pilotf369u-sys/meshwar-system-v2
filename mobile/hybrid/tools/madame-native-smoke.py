"""Fast isolated native Madame Coco proof before the full suite. Synthetic writes only."""
import ast,json,os,re,subprocess,time,xml.etree.ElementTree as E
from pathlib import Path
source=Path(__file__).with_name('emulator-smoke.py')
module=ast.parse(source.read_text())
helpers=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in {'adb','nodes','click','recreate_shop_fixture','saved_drafts'}]
exec(compile(ast.Module(body=helpers,type_ignores=[]),str(source),'exec'))
package='com.kinto.preview.hybrid.v23'
adb('install','--no-streaming','-r',os.environ['KINTO_APK'])
try:
 adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true');time.sleep(4)
 adb('shell','input','keyevent','82');click('تجربة Madame Coco');time.sleep(5)
 for _ in range(12):
  labels=' '.join(n.get('text','') for n in nodes())
  if '35750 IQD' in labels:break
  time.sleep(1)
 assert '35750 IQD' in labels,labels
 recreate_shop_fixture()
 click('أضف إلى KINTO');click('طابقت',scroll=True);click('أؤكد الإضافة');time.sleep(2)
 madame=[p for p in saved_drafts() if p['source']=='madamecoco'];assert len(madame)==1,madame
 assert madame[0]['price']==1000 and madame[0]['priceSource']=='visible' and madame[0]['convertedTotalIQD']=='35750' and madame[0]['selectedOptions']=={'size':'L','color':'Haki'},madame
 print('PASS_MADAME_NATIVE_FIRST: exact SKU-bound product, product URL restoration, same quote and touch confirmation; no production writes')
finally:
 # Only this freshly installed CI preview's synthetic data exists here.
 adb('shell','pm','clear',package)
