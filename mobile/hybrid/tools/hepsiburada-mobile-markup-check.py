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
 scope='const location=new URL('+json.dumps(URL)+');const result='+reader+';document.getElementById("kinto-result").textContent=result;'
 page.write_text('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-test\'">'+markup+'<pre id="kinto-result"></pre><script nonce="test">'+scope+'</script>')
 run=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,timeout=30,check=True)
 parsed=Result();parsed.feed(run.stdout);result=json.loads(''.join(parsed.parts))
 assert result['price']==1000 and result['priceSource']=='structured',result
 assert result['observedOptions']=={'size':'L','color':'Haki'},result
 print('PASS_OFFLINE_MOBILE_SELLER_VARIANTS')
