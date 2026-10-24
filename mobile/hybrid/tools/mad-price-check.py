"""Owner-reported Dubai mobile price layout: offline observed DOM, no production writes."""
from pathlib import Path
import tempfile,subprocess,json
from html.parser import HTMLParser
root=Path(__file__).resolve().parents[1]
reader=(root/'android/app/src/main/assets/madparfum-reader.js').read_text()
script=r'''(()=>{let location=new URL('https://www.madparfum.com/urun/mad-dubai-signature-discovery-set-unisex-3x-10-ml-discovery-set-dubai/');const out=[],read=()=>JSON.parse(eval(READER)),record=name=>out.push({name,value:read()});record('observed');
 const main=document.querySelector('main'),price=main.querySelector('[data-testid=price]'),button=main.querySelector('[data-testid=product-add-to-cart]'),schema=document.querySelector('script[type="application/ld+json"]'),original=schema.textContent;
 const footer=document.createElement('aside');document.body.append(footer);footer.append(price.cloneNode(true),button);record('portalled-purchase');
 price.setAttribute('aria-hidden','true');footer.querySelector('[data-testid=price]').setAttribute('aria-hidden','true');record('mobile-accessibility-price-copy');
 const copy=schema.cloneNode(true);document.body.append(copy);record('duplicate-equivalent-schema');
 const h=main.querySelector('h1');h.textContent=h.textContent.replace('3x 10','3× 10');record('typographic-name');
 main.querySelector('[data-testid=retail-price]').setAttribute('data-testid','price');record('crossed-out-amount');
 const other=document.createElement('span');other.setAttribute('data-testid','price');other.textContent='1,00 ₺';document.body.append(other);record('unrelated-price');other.remove();
 price.style.display='none';record('sticky-only');price.style.display='';window.scrollTo(0,1000);record('scroll');
 footer.querySelector('[data-testid=price]').textContent='899,99 ₺';record('real-price-conflict');footer.querySelector('[data-testid=price]').textContent='699,99 ₺';
 let p=JSON.parse(original);p.sku='OTHER-SKU';copy.textContent=JSON.stringify(p);record('conflicting-schema');copy.remove();
 p=JSON.parse(original);p.offers.priceCurrency='USD';schema.textContent=JSON.stringify(p);record('currency');p.offers.priceCurrency='try';p.offers.availability='https://schema.org/OutOfStock';schema.textContent=JSON.stringify(p);record('stock');schema.textContent=original;
 const opt=main.querySelector('select option[selected]');opt.textContent='100 ml';record('volume-conflict');opt.textContent='30 ml';
 location=new URL(location.href.replace('discovery-set-dubai/','other-product/'));record('url-transition');
 document.getElementById('kinto-result').textContent=JSON.stringify(out);})();'''.replace('READER',json.dumps(reader))
class Result(HTMLParser):
 def __init__(self):super().__init__();self.active=False;self.parts=[]
 def handle_starttag(self,t,a):
  if t=='pre' and ('id','kinto-result') in a:self.active=True
 def handle_endtag(self,t):
  if t=='pre':self.active=False
 def handle_data(self,s):
  if self.active:self.parts.append(s)
with tempfile.TemporaryDirectory() as tmp:
 page=Path(tmp,'test.html');page.write_text((root/'android/checks/mad-price/dubai.html').read_text()+'<pre id="kinto-result"></pre><script>'+script+'</script>')
 r=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND','--timeout=10000','--virtual-time-budget=3000','--user-data-dir='+str(Path(tmp,'profile')),'--dump-dom',page.as_uri()],capture_output=True,text=True,timeout=25,check=True)
 p=Result();p.feed(r.stdout);results=json.loads(''.join(p.parts))
 for case in results:
  name,v=case['name'],case['value']
  if name in ['real-price-conflict','conflicting-schema','currency','stock','volume-conflict','url-transition']:assert v['price'] is None,case
  else:assert v['price']==699.99 and v['productId']=='DISCOVERY.SET.DUBAI' and v['observedOptions']['size']=='30 ml',case
  print('PASS_MAD_PRICE',name,v['price'],v['warning'])
 assert len(results)==15,len(results)
