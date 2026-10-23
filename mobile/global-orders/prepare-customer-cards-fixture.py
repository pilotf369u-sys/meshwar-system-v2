from html.parser import HTMLParser
from pathlib import Path
class Styles(HTMLParser):
 def __init__(self):super().__init__();self.inside=False;self.parts=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='style':self.inside=True;self.parts.append('<style>')
  if tag=='link' and a.get('rel')=='stylesheet' and not a.get('href','').startswith(('https:','http:','//')):self.parts.append(self.get_starttag_text())
 def handle_endtag(self,tag):
  if tag=='style' and self.inside:self.inside=False;self.parts.append('</style>')
 def handle_data(self,data):
  if self.inside:self.parts.append(data)
root=Path(__file__).resolve().parents[2]
p=Styles();p.feed((root/'dashboard.html').read_text())
fixture=(root/'mobile/global-orders/customer-integrated-fixture.html').read_text().replace('<base href="../../">','<base href="./">')
fixture=fixture.replace('<link rel="stylesheet" href="css/kinto-world-panels-v1.css">',''.join(p.parts)+'<link rel="stylesheet" href="css/kinto-world-panels-v1.css">')
(root/'.kinto-customer-cards-test.html').write_text(fixture)
