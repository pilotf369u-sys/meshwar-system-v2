"""Compose an approved existing logo with typographic Play feature art; no fake UI."""
import argparse,pathlib,shutil
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--icon',required=True);p.add_argument('--out',required=True);a=p.parse_args();out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
icon=Image.open(a.icon).convert('RGBA');assert icon.size==(512,512)
# Keep the owner-approved Play icon unchanged.
shutil.copyfile(a.icon,out/'KINTO-Play-Icon-512.png')
# Feature art extends the brand with a shopping/parcel illustration; no enlarged duplicate app icon.
scale=3
im=Image.new('RGB',(1024*scale,500*scale),'#0a2f23');d=ImageDraw.Draw(im)
def box(coords):return tuple(round(v*scale)for v in coords)
def font(size,bold=False):return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold'if bold else '')+'.ttf',size*scale)
d.ellipse(box((554,36,976,458)),fill='#123f31')
d.ellipse(box((592,74,938,420)),outline='#23563e',width=scale)
d.line(box((76,103,166,103)),fill='#efd185',width=3*scale)
d.text(box((76,129)),'KINTO',font=font(48,True),fill='#efd185')
d.text(box((533,257)),'تسوّق. تابع. استلم.',font=font(34),fill='#f4f3e7',anchor='ra',direction='rtl',language='ar')
d.text(box((533,321)),'طلباتك من مكان واحد',font=font(24),fill='#bdcfc0',anchor='ra',direction='rtl',language='ar')
# Stylised shopping bag and parcel, not a fabricated screenshot.
d.rounded_rectangle(box((638,160,817,365)),radius=18*scale,fill='#1c5a41',outline='#efd185',width=4*scale)
d.arc(box((677,111,778,218)),180,360,fill='#efd185',width=5*scale)
d.line(box((677,163,677,185)),fill='#efd185',width=5*scale);d.line(box((778,163,778,185)),fill='#efd185',width=5*scale)
d.rounded_rectangle(box((754,267,918,396)),radius=13*scale,fill='#d6ba73',outline='#f4dfaa',width=3*scale)
d.line(box((808,270,808,319)),fill='#28533d',width=3*scale)
d.line(box((756,307,916,307)),fill='#ac8e4f',width=2*scale)
d.line(box((785,365,836,365)),fill='#28533d',width=3*scale)
d.line(box((785,377,819,377)),fill='#28533d',width=3*scale)
im=im.resize((1024,500),Image.Resampling.LANCZOS);im.save(out/'KINTO-Feature-Graphic-1024x500.png')
print('Created RGB1024x500 service illustration and unchanged approved512 icon; no screenshots fabricated')
