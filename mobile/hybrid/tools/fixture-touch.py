"""Read-only CDP geometry fallback for the synthetic Zara fixture's AX omission.
Real adb touch still selects the size; quote/options assertions are unchanged.
Never inspect a production retailer/customer page.
"""
import urllib.request,json,socket,base64,os,struct,time,re

def zara_size_touch(adb,nodes):
 visible=nodes()
 for n in visible:
  if n.get('text')=='L':
   b=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
   if len(b)==4 and b[2]>b[0] and b[3]>b[1]:
    adb('shell','input','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2));return
 sockets=re.findall(r'@([\w.-]*webview_devtools_remote[\w.-]*)',adb('shell','cat','/proc/net/unix'))
 expression="""(()=>{if(location.hostname!=='www.zara.com'||location.pathname!=='/tr/tr/kinto-fixture-p00000001.html')throw Error('fixture only');const r=document.querySelector('#kinto-zara-current');if(r.querySelector('[data-qa-action=product-detail-info-color-copy]').textContent!=='0000/001/044')throw Error('identity');const b=r.querySelector('[data-qa-action=size-in-stock]');if(b.textContent.trim()!=='L')throw Error('size');const q=b.getBoundingClientRect();if(q.width<=0||q.height<=0||q.top<0||q.bottom>innerHeight)throw Error('not visible');return {x:q.x+q.width/2,y:q.y+q.height/2,width:innerWidth};})()"""
 def receive(sock,n):
  b=b''
  while len(b)<n:
   part=sock.recv(n-len(b))
   if not part:raise RuntimeError('CDP closed')
   b+=part
  return b
 for name in sockets:
  adb('forward','tcp:9222','localabstract:'+name)
  try:
   pages=json.load(urllib.request.urlopen('http://127.0.0.1:9222/json',timeout=5))
   page=next((p for p in pages if p.get('url','').startswith('https://www.zara.com/tr/tr/kinto-fixture-p00000001.html')),None)
   if not page:continue
   from urllib.parse import urlsplit
   u=urlsplit(page['webSocketDebuggerUrl']);sock=socket.create_connection(('127.0.0.1',9222),timeout=10)
   with sock:
    key=base64.b64encode(os.urandom(16)).decode();sock.sendall(('GET '+u.path+' HTTP/1.1\r\nHost: 127.0.0.1:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
    header=b''
    while not header.endswith(b'\r\n\r\n'):header+=receive(sock,1)
    assert b' 101 ' in header,header
    data=json.dumps({'id':1,'method':'Runtime.evaluate','params':{'expression':expression,'returnByValue':True}}).encode();mask=os.urandom(4);encoded=bytes(v^mask[i%4] for i,v in enumerate(data));sock.sendall(bytes([129,254])+struct.pack('!H',len(data))+mask+encoded)
    while True:
     a,b=receive(sock,2);length=b&127
     if length==126:length=struct.unpack('!H',receive(sock,2))[0]
     elif length==127:length=struct.unpack('!Q',receive(sock,8))[0]
     assert not b&128 and (a&15)==1,(a,b)
     message=json.loads(receive(sock,length))
     if message.get('id')==1:break
    point=message['result']['result']['value']
   views=[]
   for n in visible:
    if n.get('class')=='android.webkit.WebView':
     b=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
     if len(b)==4:views.append(b)
   bounds=max(views,key=lambda b:(b[2]-b[0])*(b[3]-b[1]));scale=(bounds[2]-bounds[0])/point['width'];x=bounds[0]+point['x']*scale;y=bounds[1]+point['y']*scale
   assert bounds[0]<x<bounds[2] and bounds[1]<y<bounds[3],(bounds,point)
   adb('shell','input','tap',str(round(x)),str(round(y)))
   print('PASS_FIXTURE_TOUCH: exact reference-bound L located read-only and selected through physical adb touch')
   return
  finally:adb('forward','--remove','tcp:9222')
 raise AssertionError('Synthetic L unavailable in AX and fixture CDP geometry')
