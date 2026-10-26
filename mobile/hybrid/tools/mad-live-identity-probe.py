"""Fresh anonymous public-page navigation only; no account/cart/order/payment actions."""
import subprocess,tempfile,pathlib,time,json,socket,base64,os,struct,urllib.request
reader=pathlib.Path('mobile/hybrid/android/app/src/main/assets/madparfum-reader.js').read_text()
product='https://www.madparfum.com/urun/mad-caramel-grace-prestige-50-ml-kadin-parfum-caramel-grace/'
class CDP:
 def __init__(self,url):
  from urllib.parse import urlsplit
  u=urlsplit(url);self.s=socket.create_connection(('127.0.0.1',u.port),timeout=15);self.id=0
  key=base64.b64encode(os.urandom(16)).decode();self.s.sendall(('GET '+u.path+' HTTP/1.1\r\nHost: '+u.netloc+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\n\r\n').encode());h=b''
  while not h.endswith(b'\r\n\r\n'):h+=self.read(1)
  assert b' 101 ' in h,h
 def read(self,n):
  b=b''
  while len(b)<n:
   x=self.s.recv(n-len(b))
   if not x:raise RuntimeError('CDP closed')
   b+=x
  return b
 def call(self,method,params={}):
  self.id+=1;data=json.dumps({'id':self.id,'method':method,'params':params}).encode();mask=os.urandom(4);n=len(data);header=bytes([129,128+n]) if n<126 else bytes([129,254])+struct.pack('!H',n);self.s.sendall(header+mask+bytes(v^mask[i%4] for i,v in enumerate(data)))
  while True:
   a,b=self.read(2);n=b&127
   if n==126:n=struct.unpack('!H',self.read(2))[0]
   elif n==127:n=struct.unpack('!Q',self.read(8))[0]
   assert not b&128 and a&15==1,(a,b)
   r=json.loads(self.read(n))
   if r.get('id')==self.id:return r
 def evaluate(self,expression):return self.call('Runtime.evaluate',{'expression':expression,'returnByValue':True}).get('result',{}).get('result',{}).get('value')
with tempfile.TemporaryDirectory() as tmp:
 proc=subprocess.Popen(['google-chrome','--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+tmp,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  active=pathlib.Path(tmp,'DevToolsActivePort')
  for _ in range(100):
   if active.exists():break
   time.sleep(.1)
  port=int(active.read_text().splitlines()[0]);pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'));page=next(p for p in pages if p.get('type')=='page' and p.get('url')=='about:blank');c=CDP(page['webSocketDebuggerUrl'])
  c.call('Network.setUserAgentOverride',{'userAgent':'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36'})
  c.call('Emulation.setDeviceMetricsOverride',{'width':393,'height':780,'deviceScaleFactor':2.75,'mobile':True})
  def sample(label):
   safe=c.evaluate("JSON.stringify({url:location.href,titles:Array.from(document.querySelectorAll('h1[data-testid=product-name]')).map(x=>x.textContent),canonicals:Array.from(document.querySelectorAll('link[rel=canonical]')).map(x=>x.href),schemas:Array.from(document.querySelectorAll('script[type=\"application/ld+json\"]')).flatMap(x=>{try{const p=JSON.parse(x.textContent);return p['@type']==='Product'?[{name:p.name,sku:p.sku,url:p.offers?.url}]:[];}catch{return [];}})})")
   assert safe and 'chrome-extension:' not in safe,safe
   result=c.evaluate(reader)
   print(label,safe,result,flush=True)
   v=json.loads(result);assert v.get('price')==999.99 and v.get('productId')=='CARAMEL GRACE' and v.get('observedOptions',{}).get('size')=='50 ml',v
   print('PASS_LIVE_MAD',label,'999.99 TRY, CARAMEL GRACE, 50 ml',flush=True)
  c.call('Page.navigate',{'url':product});time.sleep(8);sample('DIRECT')
  c.call('Page.navigate',{'url':'https://www.madparfum.com/'});time.sleep(8)
  clicked=c.evaluate("(()=>{const a=Array.from(document.querySelectorAll('a')).find(x=>x.pathname==='/kategori/kadin-3/');if(a){a.click();return true;}return false;})()")
  print('CATEGORY_CLICK',clicked,flush=True)
  if not clicked:c.call('Page.navigate',{'url':'https://www.madparfum.com/kategori/kadin-3/'})
  time.sleep(8)
  clicked=c.evaluate("(()=>{const a=Array.from(document.querySelectorAll('a')).find(x=>x.pathname.includes('/urun/')&&x.pathname.includes('caramel-grace'));if(a){a.click();return true;}return false;})()")
  print('PRODUCT_CLICK',clicked,flush=True);time.sleep(8);sample('INTERNAL_NAVIGATION')
 finally:proc.terminate();proc.wait(timeout=15)
