"""Compose an approved existing logo with typographic Play feature art; no fake UI."""
import argparse,pathlib,shutil
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--icon',required=True);p.add_argument('--out',required=True);a=p.parse_args();out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
icon=Image.open(a.icon).convert('RGBA');assert icon.size==(512,512)
# Keep the owner-approved Play icon unchanged.
shutil.copyfile(a.icon,out/'KINTO-Play-Icon-512.png')
im=Image.new('RGB',(1024,500),'#0a2f23');d=ImageDraw.Draw(im)
d.rounded_rectangle((28,28,996,472),radius=28,outline='#536947',width=1)
d.line((78,122,176,122),fill='#efd185',width=3)
d.text((76,150),'KINTO',font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',78),fill='#efd185')
d.text((534,270),'تسوّق وتابع طلباتك',font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',32),fill='#f4f3e7',anchor='ra',direction='rtl',language='ar')
d.text((534,324),'من مكان واحد',font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',26),fill='#bfcfc1',anchor='ra',direction='rtl',language='ar')
small=icon.resize((316,316),Image.Resampling.LANCZOS);im.paste(small,(624,92),small)
im.save(out/'KINTO-Feature-Graphic-1024x500.png')
print('Created RGB1024x500 feature graphic and unchanged approved512 icon; no screenshots fabricated')
