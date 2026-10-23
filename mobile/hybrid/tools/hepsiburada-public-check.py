"""Read-only markup smoke check. No account, retailer JS, Supabase, ordering or payment.
This checks a public HTML snapshot; it does not claim live WebView variant compatibility.
"""
from html.parser import HTMLParser
from pathlib import Path
import hashlib, html, json, os, subprocess, tempfile
URL='https://www.hepsiburada.com/tudors-erkek-big-size-buyuk-beden-pamuklu-tek-cepli-saten-lacivert-gomlek-pm-HBC000071HJUP'
class Snapshot(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=False);self.parts=[];self.skip=False
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=='script':
   self.skip=d.get('type')!='application/ld+json'
   if self.skip:return
  if self.skip or tag in ('link','base','meta'):return
  safe=[(k,v) for k,v in attrs if not k.startswith('on') and k not in ('nonce','integrity')]
  self.parts.append('<'+tag+''.join(' '+k+('="'+html.escape(v,quote=True)+'"' if v is not None else '') for k,v in safe)+'>')
 def handle_endtag(self,tag):
  if tag=='script' and self.skip:self.skip=False;return
  if not self.skip:self.parts.append('</'+tag+'>')
 def handle_data(self,data):
  if not self.skip:self.parts.append(data)
 def handle_entityref(self,name):
  if not self.skip:self.parts.append('&'+name+';')
 def handle_charref(self,name):
  if not self.skip:self.parts.append('&#'+name+';')
class Result(HTMLParser):
 def __init__(self):super().__init__();self.capture=False;self.parts=[]
 def handle_starttag(self,tag,attrs):
  if dict(attrs).get('id')=='kinto-public-result':self.capture=True
 def handle_endtag(self,tag):
  if tag=='pre':self.capture=False
 def handle_data(self,data):
  if self.capture:self.parts.append(data)
with tempfile.TemporaryDirectory(prefix='kinto-hepsi-readonly-') as folder:
 raw=Path(folder,'source.html');subprocess.run(['curl','-fsSL','--max-time','30',URL,'-o',str(raw)],check=True)
 snap=Snapshot();snap.feed(raw.read_text());reader=Path('mobile/hybrid/android/app/src/main/assets/hepsiburada-reader.js').read_text()
 # Freeze a retailer URL only in the evaluation scope. All network connections are prohibited.
 scope='const location=new URL('+json.dumps(URL)+');const result='+reader+';document.getElementById("kinto-public-result").textContent=result;'
 csp="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-kinto-check'\">"
 page=Path(folder,'snapshot.html');page.write_text(csp+''.join(snap.parts)+'<pre id="kinto-public-result"></pre><script nonce="kinto-check">'+scope+'</script>')
 run=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--virtual-time-budget=3000','--dump-dom',page.as_uri()],capture_output=True,text=True,timeout=40,check=True)
 parsed=Result();parsed.feed(run.stdout);result=json.loads(''.join(parsed.parts))
 assert result.get('source')=='hepsiburada' and result.get('productId')=='HBC000071HJUP' and result.get('price',0)>0,result
 print('PASS_READONLY_HEPSI_MARKUP',json.dumps({k:result[k] for k in ['source','productId','price','currency','priceSource','observedOptions']},ensure_ascii=False),'source_sha256='+hashlib.sha256(raw.read_bytes()).hexdigest())
