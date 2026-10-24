"""New adapters: real touch capture, same native quote/confirmation, synthetic local drafts."""
import ast,json,os,time
from pathlib import Path
source=Path(__file__).with_name('emulator-smoke.py');module=ast.parse(source.read_text())
helpers=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in {'adb','nodes','click','recreate_shop_fixture','saved_drafts'}]
import subprocess,re,xml.etree.ElementTree as E
exec(compile(ast.Module(body=helpers,type_ignores=[]),str(source),'exec'))
package='com.kinto.preview.hybrid.v27'
adb('install','--no-streaming','-r',os.environ['KINTO_APK'])
for store,label,sku in [('mango','تجربة Mango','00000001-99'),('madparfum','تجربة MAD','TEST-MAD-0001')]:
 if os.environ.get('KINTO_ONLY_STORE') and os.environ['KINTO_ONLY_STORE']!=store:continue
 adb('shell','pm','clear',package)
 adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true');time.sleep(4)
 adb('shell','input','keyevent','82');click(label,scroll=True);time.sleep(5)
 # Deliberately leave retailer size unselected: test native current-product chooser.
 for _ in range(12):
  labels=' '.join(n.get('text','') for n in nodes())
  if '35750 IQD' in labels:break
  time.sleep(1)
 assert '35750 IQD' in labels,labels
 recreate_shop_fixture()
 # Deliberately leave retailer size unselected: test native current-product chooser.
 click('أضف إلى KINTO')
 if store=='mango':click('XS',exact=True)
 click('طابقت',scroll=True);click('أؤكد الإضافة');time.sleep(2)
 items=[p for p in saved_drafts() if p['source']==store];assert len(items)==1,items
 assert items[0]['productId']==sku and items[0]['price']==1000 and items[0]['optionsConfirmed'],items
 print('PASS_NEW_NATIVE',store,sku,'35750 IQD, restored product, real size touch, explicit confirmation, local TEST draft only')
adb('shell','pm','clear',package)
