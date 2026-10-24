"""Offline native handoff boundary only. No website submission, session or payment.
Fresh emulator app state; synthetic verified captures injected only into debug prefs.
"""
import ast,json,os,time,subprocess,re,uuid,xml.etree.ElementTree as E
from pathlib import Path
source=Path(__file__).with_name('emulator-smoke.py');module=ast.parse(source.read_text())
exec(compile(ast.Module(body=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in {'adb','nodes','click','saved_drafts'}],type_ignores=[]),str(source),'exec'))
package='com.kinto.preview.hybrid.v27'
adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
profiles=[('zara','https://www.zara.com/tr/tr/test-p03548255.html'),('madamecoco','https://www.madamecoco.com/test-nt0000000001-101/'),('mango','https://shop.mango.com/tr/tr/p/kadin/test/17084040/99/01'),('madparfum','https://www.madparfum.com/urun/test-caramel-grace/')]
try:
 for store,url in profiles:
  adb('shell','pm','clear',package)
  adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true');time.sleep(2)
  adb('shell','am','force-stop',package)
  key=str(uuid.uuid4())
  item={'testOrderCode':'TEST-HANDOFF-'+store,'source':store,'url':url,'title':'TEST '+store,'image':'','price':1000,'quantity':1,'selectedOptions':{'size':'L','color':'Haki'},'optionsConfirmed':True,'fixture':False,'requestKey':key,'convertedTotal':'35750','displayCurrency':'IQD'}
  sibling=dict(item,testOrderCode='TEST-UNSENT-SIBLING',requestKey=str(uuid.uuid4()),fixture=True)
  prefs=E.Element('map');E.SubElement(prefs,'string',{'name':'preview_global_orders_v1'}).text=json.dumps([sibling,item])
  local=Path(os.environ['KINTO_APK']).parent/'TEST-offline-handoff.xml';E.ElementTree(prefs).write(local,encoding='utf-8',xml_declaration=True)
  adb('push',str(local),'/data/local/tmp/TEST-offline-handoff.xml');adb('shell','chmod','644','/data/local/tmp/TEST-offline-handoff.xml')
  adb('shell','run-as',package,'mkdir','-p','shared_prefs');adb('shell','run-as',package,'cp','/data/local/tmp/TEST-offline-handoff.xml','shared_prefs/com.kinto.trendyollab.MainActivity.xml')
  adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true');time.sleep(2)
  for attempt in range(2):
   adb('shell','input','keyevent','82');click('منتجات بانتظار الإرسال');click('إكمال الطلب للمراجعة');time.sleep(1)
   xml=E.fromstring(adb('shell','run-as',package,'cat','shared_prefs/com.kinto.trendyollab.MainActivity.xml'));p={x.get('name'):x.text for x in xml}
   assert p['world_batch_key_v1']==key,p
   ids=json.loads(p['world_batch_ids_v1']);payload=json.loads(p['world_batch_signature_v1'])
   assert ids==[item['testOrderCode']] and len(payload)==1,(ids,payload)
   assert payload[0]['url']==url and payload[0]['selectedOptions']==item['selectedOptions'] and payload[0]['optionsConfirmed'] is True,payload
   assert payload[0]['pricingSource']=='admin-global-v1' and payload[0]['fixture'] is False,payload
   assert len(json.loads(p['preview_global_orders_v1']))==2,'draft removed without trusted receipt'
  print('PASS_OFFLINE_NATIVE_HANDOFF',store,'one item, options, stable retry key, sibling preserved; no session or server write')
finally:
 adb('shell','pm','clear',package);adb('shell','svc','wifi','enable')
