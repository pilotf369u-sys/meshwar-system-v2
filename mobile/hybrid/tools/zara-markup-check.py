"""Offline reader tests against sanitized observed Turkish mobile markup. No network or retailer JS."""
from pathlib import Path
from html.parser import HTMLParser
import json,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
class Result(HTMLParser):
 def __init__(self):super().__init__();self.on=False;self.parts=[]
 def handle_starttag(self,t,a):
  if dict(a).get('id')=='kinto-result':self.on=True
 def handle_endtag(self,t):
  if t=='pre':self.on=False
 def handle_data(self,d):
  if self.on:self.parts.append(d)
reader=(root/'android/app/src/main/assets/zara-reader.js').read_text()
for fixture in sorted((root/'android/checks/zara-markup').glob('*.html')):
 expected=json.loads(fixture.with_suffix('.json').read_text())
 scope='(()=>{const location=new URL('+json.dumps(expected['url'])+');const read=()=>'+reader+';const first=JSON.parse(read());document.getElementById("kinto-result").textContent=JSON.stringify(first);})();'
 csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-test\'">'
 with tempfile.TemporaryDirectory() as folder:
  page=Path(folder,'page.html');page.write_text(csp+fixture.read_text()+'<pre id="kinto-result"></pre><script nonce="test">'+scope+'</script>')
  r=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--dump-dom',page.as_uri()],capture_output=True,text=True,check=True,timeout=30)
  p=Result();p.feed(r.stdout);value=''.join(p.parts)
  assert value,'No reader result: '+r.stdout[-3000:]
  actual=json.loads(value)
  if fixture.stem=='product-2':assert actual['priceSource']=='visible',actual
  assert actual['source']=='zara' and actual['price']==float(expected['price']),actual
  assert actual['observedOptions']['color']==expected['color'] and actual['optionRequirements']['size'] is True,actual
  assert actual['image'].startswith('https://static.zara.net/assets/'),actual
  print('PASS_OFFLINE_ZARA_MOBILE_MARKUP',fixture.name,actual['price'],actual['observedOptions'])
