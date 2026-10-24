"""Native cold-launch visuals with synthetic document; no account/order/payment writes."""
import ast,os,subprocess,time,io
from pathlib import Path
from PIL import Image,ImageChops
source=Path(__file__).with_name('emulator-smoke.py');tree=ast.parse(source.read_text())
import re,xml.etree.ElementTree as E
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'adb','nodes','click'}],type_ignores=[]),str(source),'exec'))
package='com.kinto.preview.hybrid.v28';out=Path(os.environ['KINTO_APK']).parent
adb('install','--no-streaming','-r',os.environ['KINTO_APK']);adb('shell','pm','clear',package)
scale=adb('shell','settings','get','global','animator_duration_scale').strip()
assert (1.0 if scale in ('null','') else float(scale))>0,'Launch visual proof requires animations enabled at emulator boot'
adb('logcat','-c')
adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true')
for _ in range(30):
 if 'NATIVE_COVER_STARTED' in adb('logcat','-d','-s','KintoLaunch:I','*:S'):break
 time.sleep(.1)
else:raise AssertionError('Native launch never started')
record=subprocess.Popen(['adb','shell','screenrecord','--time-limit','7','/sdcard/kinto-launch.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(.1)
frames=[]
for i in range(9):
 b=subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=20);im=Image.open(io.BytesIO(b)).convert('RGB');im.save(out/f'launch-{i}.png');frames.append(im);time.sleep(.12)
# Screen-capture round trips can exceed the 2-second opening on API29.
# Use device-recorded video frames as the motion/opacity evidence, not a lower frame requirement.
record.wait(timeout=15)
video=out/'launch-motion.mp4';adb('pull','/sdcard/kinto-launch.mp4',str(video))
video_frames=out/'launch-video-frames';video_frames.mkdir(exist_ok=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(video),'-vf','fps=20,scale=360:-1',str(video_frames/'frame-%04d.png')],check=True,timeout=45)
recorded=[Image.open(p).convert('RGB') for p in sorted(video_frames.glob('frame-*.png'))]
assert recorded,'Native screen recording is empty'
w,h=recorded[0].size;green=(10,47,35)
def gold_bounds(im):
 crop=im.crop((0,int(h*.15),w,int(h*.60)))
 points=[(i%w,i//w) for i,(r,g,b) in enumerate(crop.getdata()) if r>110 and g>65 and b<105 and r>g*1.05]
 return len(points),max((x for x,y in points),default=0)-min((x for x,y in points),default=0)
visible=[im for im in recorded if gold_bounds(im)[0]>500]
valid=[im for im in visible if sum(abs(v-t)for v,t in zip(im.getpixel((w//8,h//2)),green))<12]
assert len(valid)>=3,'No three recorded native green frames with visible logo'
region=(w//4,h//4,3*w//4,3*h//4)
assert any(ImageChops.difference(valid[0].crop(region),im.crop(region)).getbbox() for im in valid[1:]),'No breathing change inside recorded logo region'
base=gold_bounds(valid[0])[1];peak=max(visible,key=lambda im:gold_bounds(im)[1]);peak_width=gold_bounds(peak)[1]
assert base>0 and peak_width>base*1.25,('No visible forward zoom',base,peak_width)
valid[0].save(out/'launch-native-start.png');peak.save(out/'launch-zoom-peak.png')
print('PASS_LOGO_OPACITY: three device-recorded native frames retain visible gold logo')
print('PASS_LAUNCH_ANIMATION: recorded breathing and visible forward zoom',base,peak_width)
# Snapshot dimensions remain useful for focusing the revealed UI.
w,h=frames[0].size
for attempt in range(12):
 snapshot=nodes();labels=' '.join(n.get('text','')for n in snapshot)
 if 'تشغيل فيديو الاختبار' in labels:break
 if attempt==2:adb('shell','input','tap',str(w//2),str(h//3))
 time.sleep(1)
if 'تشغيل فيديو الاختبار' not in labels:
 (out/'launch-reveal-failure.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=20))
 print(adb('logcat','-d','-t','100','AndroidRuntime:E','chromium:E','*:S'))
assert 'تشغيل فيديو الاختبار' in labels and not any(n.get('content-desc')=='KINTO launch screen' for n in snapshot),labels
assert 'جارٍ تجهيز' not in labels,labels
assert 'ZOOM_REVEAL_STARTED' in adb('logcat','-d','-s','KintoLaunch:I','*:S')
print('PASS_LAUNCH_REVEAL: zoom transition completed, no preparation text, underlying synthetic interface usable')
adb('shell','input','keyevent','82');click('الخصوصية وحذف الحساب',exact=True,scroll=True);time.sleep(2)
labels=' '.join(n.get('text','')for n in nodes());assert 'طلب حذف حساب KINTO' in labels and 'support@shopkinto.com' in labels,labels
print('PASS_ACCOUNT_DELETION_RESOURCE: native path renders bundled public request instructions; nothing sent')
adb('shell','input','keyevent','4');time.sleep(1)
adb('shell','am','start','-W','-n',package+'/com.kinto.trendyollab.MainActivity','--ez','webviewCompatFixture','true')
assert 'KINTO launch screen' not in ' '.join(n.get('content-desc','')for n in nodes())
print('PASS_LAUNCH_WARM: existing activity remains usable without another cover')
# Fresh anonymous offline launch: explicit retry, no infinite logo and no user session.
adb('shell','pm','clear',package);adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
try:
 adb('shell','am','start','-W','-n',package+'/com.kinto.trendyollab.MainActivity')
 for _ in range(8):
  labels=' '.join(n.get('text','')for n in nodes())
  if 'إعادة المحاولة' in labels:break
  time.sleep(2)
 assert 'إعادة المحاولة' in labels,labels
 click('إعادة المحاولة',exact=True);time.sleep(3)
 assert package in adb('shell','dumpsys','activity','activities')
 print('PASS_LAUNCH_OFFLINE: retry offered, retry does not crash; no account or production writes')
finally:
 adb('shell','svc','wifi','enable');adb('shell','pm','clear',package)
 for key in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:adb('shell','settings','put','global',key,'0')
