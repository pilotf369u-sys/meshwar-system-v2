"""Replay the reported Zara carousel contamination with synthetic data and real DOM layout."""
from pathlib import Path
from html.parser import HTMLParser
import json,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
reader=(root/'android/app/src/main/assets/zara-reader.js').read_text()
def card(pid,price,color,left=0):
 reference=pid.lstrip('0').zfill(7)
 return f'''<article class="product-detail-card__article" style="position:absolute;left:{left}vw;top:0;width:100vw"><div class="product-detail-card-info__fixed-info-panel"><h1>PRODUCT {pid}</h1><p><span class="product-color-extended-name__name">{color}</span><button class="product-color-extended-name__reference">{reference[:4]}/{reference[4:]}/800</button></p><div class="product-detail-card-info__price-amount price"><span class="price-current" data-qa-id="price-container-current"><data data-currency="TRY" value="{price}.00">{price},00 TL</data></span></div><div class="product-detail-card-info__main-buttons"><div class="product-detail-card-info__price-amount-simplified product-detail-card-info__price-amount-simplified--hidden price"><span class="price-current" data-qa-id="price-container-current"><data data-currency="TRY" value="{price}.00">{price},00 TL</data></span></div></div></div></article>'''
def group(pid,price,color):
 return {'@type':'ProductGroup','productGroupID':pid,'name':'PRODUCT '+pid,'hasVariant':[{'color':color,'size':'M','image':['https://static.zara.net/assets/test.jpg'],'offers':{'@type':'Offer','price':str(price),'priceCurrency':'TRY','url':'https://www.zara.com/tr/tr/test-p'+pid+'.html','availability':'https://schema.org/InStock'}}]}
class Result(HTMLParser):
 def __init__(self):super().__init__();self.on=False;self.parts=[]
 def handle_starttag(self,t,a):
  if dict(a).get('id')=='kinto-result':self.on=True
 def handle_endtag(self,t):
  if t=='pre':self.on=False
 def handle_data(self,d):
  if self.on:self.parts.append(d)
for pid,price,color,other in [('03548255',4890,'Bej',6990),('02678247',4290,'Siyah',4890)]:
 html='<meta charset="utf-8"><style>body{margin:0;height:3000px}</style>'+card('09999001',other,'Antrasit grisi',-100)+card(pid,price,color)+card('09999002',price,'Antrasit grisi',100)+'<script type="application/ld+json">'+json.dumps(group(pid,price,color))+'</script>'
 script='''(()=>{let location=new URL(URL_HERE);const read=()=>READER;const results=[];const record=label=>results.push({label,value:JSON.parse(read())});record('three-cards');window.scrollTo(0,600);record('vertical-scroll');
 const target=Array.from(document.querySelectorAll('article')).find(e=>e.querySelector('h1').textContent==='PRODUCT '+PID);const panel=target.querySelector('.product-detail-card-info__fixed-info-panel');const footer=target.querySelector('.product-detail-card-info__main-buttons');footer.style='position:fixed;bottom:0';target.append(footer);record('sticky-footer');
 location=new URL('https://www.zara.com/tr/tr/test-p09999001.html');record('offscreen-product-url');location=new URL(URL_HERE);
 const duplicate=target.cloneNode(true);document.body.append(duplicate);record('duplicate-matching-card');duplicate.remove();
 const d=target.querySelector('data');d.setAttribute('value','1.00');d.textContent='1,00 TL';record('real-current-conflict');d.setAttribute('value',String(PRICE)+'.00');d.textContent=String(PRICE)+',00 TL';
 for(const ref of target.querySelectorAll('.product-color-extended-name__reference'))ref.textContent='invalid';record('missing-reference');
 document.getElementById('kinto-result').textContent=JSON.stringify(results);})();'''.replace('URL_HERE',json.dumps('https://www.zara.com/tr/tr/test-p'+pid+'.html')).replace('PID',json.dumps(pid)).replace('PRICE',str(price)).replace('READER',reader)
 with tempfile.TemporaryDirectory() as folder:
  page=Path(folder,'carousel.html');page.write_text(html+'<pre id="kinto-result"></pre><script>'+script+'</script>')
  r=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,check=True,timeout=45)
  p=Result();p.feed(r.stdout);results=json.loads(''.join(p.parts))
  for test in results:
   label,v=test['label'],test['value']
   if label in ['three-cards','vertical-scroll','sticky-footer']:
    assert v['price']==price and v['priceSource']=='visible' and v['observedOptions']['color']==color,test
    assert v['title']=='PRODUCT '+pid and v['diagnostics']['visiblePrices']==2,test
   if label=='offscreen-product-url':assert v['price'] is None and v['warning']=='Z_PRODUCT_NOT_ACTIVE',test
   if label=='duplicate-matching-card':assert v['price'] is None and v['warning']=='Z_PRODUCT_SCOPE_AMBIGUOUS',test
   if label=='real-current-conflict':assert v['price'] is None and v['warning']=='Z_PRICE_AMBIGUOUS',test
   if label=='missing-reference':assert v['price'] is None and v['warning']=='Z_PRODUCT_SCOPE_MISSING',test
   print('PASS_ZARA_CARD_SCOPE',pid,label,v['price'],v.get('warning',''))
