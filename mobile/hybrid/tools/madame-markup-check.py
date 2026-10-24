"""Sanitized observed mobile markup and adversarial DOM replay, no retailer scripts/accounts."""
from pathlib import Path
from html.parser import HTMLParser
import json,subprocess,tempfile
root=Path(__file__).resolve().parents[1];reader=(root/'android/app/src/main/assets/madamecoco-reader.js').read_text()
class Result(HTMLParser):
 def __init__(self):super().__init__();self.on=False;self.parts=[]
 def handle_starttag(self,t,a):
  if dict(a).get('id')=='kinto-result':self.on=True
 def handle_endtag(self,t):
  if t=='pre':self.on=False
 def handle_data(self,d):
  if self.on:self.parts.append(d)
for fixture in sorted((root/'android/checks/madame-markup').glob('*.html')):
 expected=json.loads(fixture.with_suffix('.json').read_text())
 script='''(()=>{let location=new URL(HREF);const read=()=>READER;const output=[];const record=label=>output.push({label,result:JSON.parse(read())});const root=document.querySelector('.product-info'),schema=document.querySelector('script[type="application/ld+json"]'),original=schema.textContent;record('observed');window.scrollTo(0,500);record('scroll');
 for(const e of document.querySelectorAll('pz-price'))if(e.closest('.product-info,.sticky-add-to-cart')){const n=Number(e.textContent);e.textContent=n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL';}record('hydrated-price');
 const holder=root.querySelector('.product-info__price');const extra=document.createElement('div');extra.className='price -retail';extra.innerHTML='<pz-price>9999.99</pz-price>';holder.append(extra);record('old-price');extra.remove();
 const current=root.querySelector('.price pz-price'),raw=current.textContent;current.textContent='1.00';record('real-price-conflict');current.textContent=raw;
 let g=JSON.parse(original);g.additionalVariants.find(v=>v.sku===SKU).offers.priceCurrency='USD';schema.textContent=JSON.stringify(g);record('wrong-currency');schema.textContent=original;
 g=JSON.parse(original);g.additionalVariants.find(v=>v.sku===SKU).offers.availability='https://schema.org/OutOfStock';schema.textContent=JSON.stringify(g);record('unavailable');schema.textContent=original;
 const anchor=root.querySelector('.variant-color.-selected'),old=anchor.getAttribute('value');anchor.setAttribute('value','Wrong color');record('option-conflict');anchor.setAttribute('value',old);
 location=new URL('https://www.madamecoco.com/different-nt9999999999-101/');record('new-url-old-dom');location=new URL(HREF);
 const modal=document.createElement('pz-select');modal.innerHTML='<option selected>Renk Seçin</option>';root.append(modal);record('store-stock-modal');modal.remove();
 const extraGroup=document.createElement('pz-variant');extraGroup.setAttribute('key','hacim');extraGroup.setAttribute('name','Hacim');extraGroup.innerHTML='<pz-variant-option selected value="300ML">300ML</pz-variant-option>';root.querySelector('.product-info__variants').append(extraGroup);record('additional-option');extraGroup.querySelector('pz-variant-option').removeAttribute('selected');record('additional-unselected');extraGroup.remove();
 g=JSON.parse(original);g.additionalVariants.find(v=>v.sku===SKU).image='https://4d0873.akinoncloudcdn.com.evil.test/products/evil.jpg';schema.textContent=JSON.stringify(g);record('untrusted-image');schema.textContent=original;
 document.getElementById('kinto-result').textContent=JSON.stringify(output);})();'''.replace('HREF',json.dumps(expected['url'])).replace('SKU',json.dumps(expected['sku'])).replace('READER',reader)
 with tempfile.TemporaryDirectory() as folder:
  page=Path(folder,'test.html');page.write_text(fixture.read_text()+'<pre id="kinto-result"></pre><script>'+script+'</script>')
  r=subprocess.run(['google-chrome','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,check=True,timeout=45)
  p=Result();p.feed(r.stdout);results=json.loads(''.join(p.parts))
  for test in results:
   label,v=test['label'],test['result']
   if label in ['real-price-conflict','wrong-currency','unavailable','option-conflict','new-url-old-dom','additional-unselected']:assert v['price'] is None,test
   else:
    assert v['price']==expected['price'] and v['productId']==expected['sku'] and v['priceSource']=='visible',test
    assert v['observedOptions']=={'size':expected['size']+('; Hacim: 300ml' if label=='additional-option' else ''),'color':expected['color']},test
   if label=='untrusted-image':assert v['image']=='',test
   if label=='observed':assert v['image'].startswith('https://4d0873.akinoncloudcdn.com/products/'),test
   print('PASS_MADAME_DOM',fixture.stem,label,v['price'],v['warning'])
