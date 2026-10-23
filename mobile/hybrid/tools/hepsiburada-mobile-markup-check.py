"""Offline regression for the observed mobile seller/variant markup; no retailer scripts or network."""
from pathlib import Path
import json, subprocess, tempfile
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
URL='https://www.hepsiburada.com/test-pm-HBC000001'
# Mobile uses div variant boxes and a merchant-label badge, unlike desktop.
markup='<h1>Synthetic mobile product</h1><span data-test-id="merchant-name">TEST Seller</span><div data-test-id="merchant-label">Resmi Satıcı</div>'
for name,value in [('Beden','L'),('Renk','Haki')]:
 markup+=f'<div data-test-id="variant-row"><span data-test-id="variant-name">{name}</span><span data-test-id="variant-value">{value}</span><div data-test-id="variant-box-{name}-{value}"><span data-test-id="variant-box-name">{value}</span></div></div>'
product={'@type':'Product','sku':'HBCV000001','size':'L','color':'Haki','offers':{'@type':'Offer','url':URL,'price':'1000','priceCurrency':'TRY','seller':{'name':'TEST Seller'}}}
markup+='<script type="application/ld+json">'+json.dumps({'@type':'WebPage','@graph':[product]})+'</script>'
class Result(HTMLParser):
 def __init__(self):super().__init__();self.capture=False;self.parts=[]
 def handle_starttag(self,tag,attrs):
  if dict(attrs).get('id')=='kinto-result':self.capture=True
 def handle_endtag(self,tag):
  if tag=='pre':self.capture=False
 def handle_data(self,data):
  if self.capture:self.parts.append(data)
with tempfile.TemporaryDirectory() as folder:
 reader=(ROOT/'android/app/src/main/assets/hepsiburada-reader.js').read_text()
 page=Path(folder,'mobile.html')
 scope='(()=>{const location=new URL('+json.dumps(URL)+');const result='+reader+';document.getElementById("kinto-result").textContent=result;})();'
 page.write_text('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-test\'">'+markup+'<pre id="kinto-result"></pre><script nonce="test">'+scope+'</script>')
 run=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,timeout=30,check=True)
 parsed=Result();parsed.feed(run.stdout)
 if not ''.join(parsed.parts):raise AssertionError('Missing browser result: '+run.stdout[-8000:]+' stderr: '+run.stderr[-2000:])
 result=json.loads(''.join(parsed.parts))
 assert result['price']==1000 and result['priceSource']=='structured',result
 assert result['observedOptions']=={'size':'L','color':'Haki'},result
 print('PASS_OFFLINE_MOBILE_SELLER_VARIANTS')

# Real DOM regression for mobile sibling widgets, delayed options and unrelated prices.
# No retailer scripts, accounts, payment, or production writes.
with tempfile.TemporaryDirectory() as folder:
 reader=(ROOT/'android/app/src/main/assets/hepsiburada-reader.js').read_text()
 cases=[
  ('currency-sibling','<span data-test-id="current-price">799,90</span> TL','',799.9,None),
  ('old-generic-price','<span data-test-id="current-price">799,90 TL</span><del data-test-id="price">999,90 TL</del>','',799.9,None),
  ('plain-generic-old-price','<span data-test-id="current-price">799,90 TL</span><span data-test-id="price">999,90 TL</span>','',799.9,None),
  ('options-pending','<span data-test-id="current-price">799,90 TL</span>','<div data-test-id="variant-row"><span data-test-id="variant-name">Beden</span><span data-test-id="variant-value">Seçiniz</span></div>',None,799.9),
  ('options-selected-price-changed','<span data-test-id="current-price">899,90 TL</span>','<div data-test-id="variant-row"><span data-test-id="variant-name">Beden</span><span data-test-id="variant-value">L</span></div>',899.9,None),
  ('conflicting-current-prices','<span data-test-id="current-price">799,90 TL</span><span data-test-id="current-price">899,90 TL</span>','',None,None),
 ]
 for name,prices,variants,expected,display in cases:
  markup='<section><div data-test-id="buybox-area"><h1>TEST '+name+'</h1></div><div>'+prices+'</div>'+variants+'</section><aside><span data-test-id="price-current-price">200 TL</span><div data-test-id="variant-row"><span data-test-id="variant-name">Beden</span><span data-test-id="variant-value">M</span></div></aside>'
  scope='(()=>{const location=new URL('+json.dumps(URL)+');const result='+reader+';document.getElementById("kinto-result").textContent=result;})();'
  page=Path(folder,name+'.html')
  page.write_text('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-test\'">'+markup+'<pre id="kinto-result"></pre><script nonce="test">'+scope+'</script>')
  run=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,timeout=30,check=True)
  parsed=Result();parsed.feed(run.stdout);result=json.loads(''.join(parsed.parts))
  assert result['price']==expected and result['displayPrice']==display,(name,result)
  if name=='options-selected-price-changed':assert result['observedOptions']['size']=='L',result
  print('PASS_OFFLINE_MOBILE_PRICE',name)

# Replica of the retailer's current public mobile renderer (storefront-pwa 1.1.7001,
# chunk 5882): sticky-price/default-price/checkout-price/premium-price. The sticky
# bar is a sibling OUTSIDE the title/variant section. Earlier fixtures omitted it.
with tempfile.TemporaryDirectory() as folder:
 reader=(ROOT/'android/app/src/main/assets/hepsiburada-reader.js').read_text()
 header='<section><div data-test-id="buybox-area"><h1>TEST mobile</h1></div></section>'
 prior=lambda value:'<div data-test-id="prev-price"><span>'+value+' TL</span></div>'
 default=lambda value,old='':'<div data-test-id="default-price">'+(prior(old) if old else '')+'<div><span>'+value+' TL</span></div></div>'
 conditional=lambda kind,base,offer:'<div data-test-id="'+kind+'">'+prior(base)+'<div><span>' + ('Premium ile' if kind=='premium-price' else 'Sepete özel fiyat')+'</span></div><div>'+offer+' TL</div></div>'
 cases=[('brush-discount',default('399,00','499,38'),399,'visible'),('fissler-no-discount',default('18.999,00'),18999,'visible'),('agarta-basket',conditional('checkout-price','174','165,30'),174,'visible-before-conditional-offer'),('acar-basket',conditional('checkout-price','1.117,52','949,89'),1117.52,'visible-before-conditional-offer'),('membership',conditional('premium-price','999','899'),999,'visible-before-conditional-offer'),('conditional-no-base','<div data-test-id="checkout-price"><span>Sepete özel fiyat</span><div>165,30 TL</div></div>',None,''),('ambiguous-bars',default('399')+default('499'),None,'')]
 for name,block,expected,source in cases:
  markup=header+'<div data-test-id="sticky-price">'+block+'<button data-test-id="sticky-addToCart-button">Sepete ekle</button></div><aside><span data-test-id="price-current-price">55,64 TL</span><p>Ayda 55,64 TL taksitle</p></aside>'
  scope='(()=>{const location=new URL('+json.dumps(URL)+');const result='+reader+';document.getElementById("kinto-result").textContent=result;})();'
  page=Path(folder,name+'.html');page.write_text('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-test\'">'+markup+'<pre id="kinto-result"></pre><script nonce="test">'+scope+'</script>')
  run=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,timeout=30,check=True)
  parsed=Result();parsed.feed(run.stdout);result=json.loads(''.join(parsed.parts))
  assert result['price']==expected and result['priceSource']==source,(name,result)
  print('PASS_OFFLINE_STICKY_PRICE',name)
