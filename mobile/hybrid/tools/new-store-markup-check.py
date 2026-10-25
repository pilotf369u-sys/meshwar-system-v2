"""Offline sanitized retailer DOM replay. No retailer/cart/account writes."""
from pathlib import Path
import subprocess,json,tempfile
from html.parser import HTMLParser
root=Path(__file__).resolve().parents[1]
class Result(HTMLParser):
 def __init__(self):super().__init__();self.active=False;self.parts=[]
 def handle_starttag(self,t,a):
  if t=='pre' and ('id','kinto-result') in a:self.active=True
 def handle_endtag(self,t):
  if t=='pre':self.active=False
 def handle_data(self,s):
  if self.active:self.parts.append(s)
urls={'mango':'https://shop.mango.com/tr/tr/p/kadin/elbise-ve-tulum/test/37007788/99/00','madparfum':'https://www.madparfum.com/urun/bruno-gold-overdose-100-ml-unisex-parfum-bruno-gold-overdose/'}
for store,url in urls.items():
 reader=(root/f'android/app/src/main/assets/{store}-reader.js').read_text()
 script=r'''(()=>{let location=new URL(URL_VALUE);const results=[],read=()=>JSON.parse(eval(READER));const record=name=>results.push({name,value:read()});record('initial');
 if(STORE==='mango'){const initial=results[0].value;if(!initial.availableSizes.includes('XS')||initial.price!==null)throw Error('native choices absent or auto-selected');document.querySelector('button[id^="product.sizeSelector.available."]').click();record('selected');}
 record('scroll');const old=location;location=new URL(STORE==='mango'?old.href.replace('/37007788/','/99999999/'):old.href.replace('/urun/','/urun/other-'));record('transition');location=old;
 const price=document.querySelector(STORE==='mango'?'[itemprop=offers]':'[data-testid=price]'),copy=price.cloneNode(true);if(STORE==='mango'){copy.querySelector('[itemprop=price]').setAttribute('content','999');copy.querySelector('[class*="textBody"]').textContent='999 TL';}else copy.textContent='999 ₺';price.after(copy);record('conflict');copy.remove();
 const oldprice=price.cloneNode(true),del=document.createElement('del');del.append(oldprice);price.after(del);record('old');del.remove();
 if(STORE==='mango'){const c=price.querySelector('[itemprop=priceCurrency]');c.setAttribute('content','USD');record('currency');c.setAttribute('content','TRY');const b=document.querySelector('button[id^="product.sizeSelector.available."]');b.setAttribute('aria-disabled','true');record('unavailable-size');if(read().availableSizes.includes('XS'))throw Error('unavailable size leaked into choices');b.setAttribute('aria-disabled','false');}
 else{const s=Array.from(document.querySelectorAll('script[type="application/ld+json"]'))[0],original=s.textContent,p=JSON.parse(original);p.offers.priceCurrency='USD';s.textContent=JSON.stringify(p);record('currency');p.offers.priceCurrency='try';p.offers.availability='https://schema.org/OutOfStock';s.textContent=JSON.stringify(p);record('stock');s.textContent=original;const b=document.querySelector('[data-testid^=product-variant-] button span'),before=b.textContent;b.textContent='Seçiniz';record('options');b.textContent=before;}
 document.getElementById('kinto-result').textContent=JSON.stringify(results);})();'''.replace('URL_VALUE',json.dumps(url)).replace('READER',json.dumps(reader)).replace('STORE',json.dumps(store))
 with tempfile.TemporaryDirectory() as folder:
  page=Path(folder,'test.html');page.write_text((root/f'android/checks/new-store-markup/{store}.html').read_text()+'<pre id="kinto-result"></pre><script>'+script+'</script>')
  r=subprocess.run(['google-chrome','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,check=True,timeout=45)
  p=Result();p.feed(r.stdout);results=json.loads(''.join(p.parts))
 for case in results:
  name,v=case['name'],case['value'];expected=3299.99 if store=='mango' else 2299.99
  if name in ['transition','conflict','currency','unavailable-size','stock','options']:assert v.get('price') is None,case
  elif store=='mango' and name=='initial':assert v['optionsPending'] and v['displayPrice']==expected and v['price'] is None,case
  else:assert v['price']==expected and v['observedOptions']['size'] and v['image'],case
  print('PASS_NEW_STORE_DOM',store,name,v.get('price'),v.get('warning'))
