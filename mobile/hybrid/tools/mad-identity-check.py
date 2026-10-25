"""Replay the live-observed malformed canonical and the owner's exact Caramel report."""
from pathlib import Path
import tempfile,subprocess,json
from html.parser import HTMLParser
root=Path(__file__).resolve().parents[1];reader=(root/'android/app/src/main/assets/madparfum-reader.js').read_text()
script=r'''(()=>{let location=new URL('https://www.madparfum.com/urun/mad-caramel-grace-prestige-50-ml-kadin-parfum-caramel-grace/');const out=[],read=()=>JSON.parse(eval(READER)),record=name=>out.push({name,value:read()});record('initial');const correct=document.querySelector('link[rel=canonical]'),bad=document.createElement('link');bad.rel='canonical';bad.href=new URL('undefined'+location.pathname,location.href).href;document.head.append(bad);record('observed-hydrated-duplicate');const dup=correct.cloneNode(true);document.head.append(dup);record('repeated-correct');dup.remove();correct.remove();record('only-malformed');document.head.append(correct);bad.setAttribute('href','https://www.madparfum.com/urun/other-product/');record('other-product-canonical');bad.setAttribute('href','https://evil.test'+location.pathname);record('external-canonical');bad.href=new URL('undefined'+location.pathname,location.href).href;const h=document.querySelector('h1[data-testid=product-name]'),before=h.textContent;h.textContent='OTHER PRODUCT';record('wrong-title');h.textContent=before;const s=document.querySelector('script[type="application/ld+json"]'),original=s.textContent,p=JSON.parse(original);p.sku='';s.textContent=JSON.stringify(p);record('missing-sku');s.textContent=original;location=new URL(location.href.replace('caramel-grace/','other-product/'));record('transition-old-dom');document.getElementById('kinto-result').textContent=JSON.stringify(out);})();'''.replace('READER',json.dumps(reader))
class Result(HTMLParser):
 def __init__(self):super().__init__();self.on=False;self.parts=[]
 def handle_starttag(self,t,a):
  if t=='pre' and ('id','kinto-result') in a:self.on=True
 def handle_endtag(self,t):
  if t=='pre':self.on=False
 def handle_data(self,s):
  if self.on:self.parts.append(s)
with tempfile.TemporaryDirectory() as tmp:
 page=Path(tmp,'test.html');page.write_text((root/'android/checks/mad-price/caramel.html').read_text()+'<pre id="kinto-result"></pre><script>'+script+'</script>')
 r=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--host-resolver-rules=MAP * ~NOTFOUND','--timeout=10000','--virtual-time-budget=3000','--user-data-dir='+str(Path(tmp,'profile')),'--dump-dom',page.as_uri()],capture_output=True,text=True,timeout=25,check=True)
 p=Result();p.feed(r.stdout);out=json.loads(''.join(p.parts))
 for case in out:
  v=case['value'];valid=case['name'] in ['initial','observed-hydrated-duplicate','repeated-correct']
  assert (v['price']==999.99 and v['productId']=='CARAMEL GRACE' and v['observedOptions']['size']=='50 ml') if valid else v['price'] is None,case
  print('PASS_MAD_IDENTITY',case['name'],v['price'],v['diagnostics']['identityChecks'])
 assert len(out)==9
