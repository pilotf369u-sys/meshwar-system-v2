"""Synthetic scroll/price relocation replay, not a claim of live retailer reproduction."""
from pathlib import Path
from html.parser import HTMLParser
import json,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
reader=(root/'android/app/src/main/assets/zara-reader.js').read_text()
fixture=(root/'android/app/src/main/assets/fixture-zara.html').read_text().split('<script>')[0]
script='''(()=>{const location=new URL('https://www.zara.com/tr/tr/kinto-fixture-p00000001.html');const read=()=>READER;
const results=[];const record=label=>results.push({label,value:JSON.parse(read())});record('header');
const panel=document.querySelector('.product-detail-card-info__fixed-info-panel'),price=panel.querySelector('.price-current');
const footer=document.createElement('div');footer.className='product-detail-card-info__main-buttons';footer.style='position:fixed;bottom:0';footer.append(price);document.body.append(footer);document.body.style.height='3000px';window.scrollTo(0,700);record('footer');
panel.append(price.cloneNode(true));record('identical-copies');
for(const data of document.querySelectorAll('.price-current data')){data.setAttribute('value','2000.00');data.textContent='2.000,00 TL';}record('changed-current-price');
for(const data of document.querySelectorAll('.price-current data'))data.remove();document.querySelector('script[type="application/ld+json"]').remove();record('missing-price');
document.getElementById('kinto-result').textContent=JSON.stringify(results);})();'''.replace('READER',reader)
class Result(HTMLParser):
 def __init__(self):super().__init__();self.on=False;self.parts=[]
 def handle_starttag(self,t,a):
  if dict(a).get('id')=='kinto-result':self.on=True
 def handle_endtag(self,t):
  if t=='pre':self.on=False
 def handle_data(self,d):
  if self.on:self.parts.append(d)
with tempfile.TemporaryDirectory() as folder:
 page=Path(folder,'scroll.html');page.write_text(fixture+'<pre id="kinto-result"></pre><script>'+script+'</script>')
 r=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,check=True,timeout=45)
 p=Result();p.feed(r.stdout);results=json.loads(''.join(p.parts))
 for test in results:
  label,v=test['label'],test['value']
  if label in ['header','footer','identical-copies']:assert v['price']==1000 and v['priceSource']=='visible',test
  if label=='footer':assert v['diagnostics']['scrollY']>0,test
  if label=='identical-copies':assert v['diagnostics']['visiblePrices']==2 and len(v['diagnostics']['purchasePriceNodes'])==2,test
  if label=='changed-current-price':assert v['price'] is None and v['warning']=='Z_PRICE_SETTLING' and v['diagnostics']['purchasePriceNodes'][0]['value']=='2000.00',test
  if label=='missing-price':assert v['price'] is None and v['warning']=='Z_PRICE_MISSING',test
  print('PASS_ZARA_SCROLL_DIAGNOSTIC',label,v['price'],v['warning'])
