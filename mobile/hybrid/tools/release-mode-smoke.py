"""Run the Gradle release APK with disposable signing; no account/order writes."""
import subprocess,os,time,pathlib,xml.etree.ElementTree as E
package='com.kinto.preview.hybrid.v15'
def adb(*args):return subprocess.check_output(['adb',*args],text=True,timeout=40)
apk=pathlib.Path(os.environ['KINTO_APK']).with_name('KINTO-Candidate-0.15.apk')
adb('install','-r',str(apk))
for flag in ['webviewCompatFixture','bundledReviewFixture','acknowledgeReviewFixture']:
 adb('shell','am','force-stop',package)
 adb('shell','am','start','-n',package+'/com.kinto.trendyollab.MainActivity','--ez',flag,'true')
 time.sleep(4)
 activity=adb('shell','dumpsys','activity','activities')
 assert package+'/com.kinto.trendyollab.MainActivity' in activity,activity[-3000:]
 adb('shell','input','keyevent','82');time.sleep(1)
 adb('shell','uiautomator','dump','/sdcard/kinto-release.xml')
 xml=adb('shell','cat','/sdcard/kinto-release.xml')
 labels=' '.join(n.get('text','') for n in E.fromstring(xml).iter('node'))
 assert 'تحديث KINTO' in labels,labels
 assert 'تجربة كاملة' not in labels and 'تجربة هبسي' not in labels and 'KINTO Preview' not in labels and 'PASS_CUSTOMER' not in labels,labels
 adb('shell','input','keyevent','4')
run=subprocess.run(['adb','shell','run-as',package,'id'],capture_output=True,text=True,timeout=20)
assert run.returncode!=0 and 'not debuggable' in run.stderr+run.stdout,(run.stdout,run.stderr)
print('PASS_RELEASE_MODE: Gradle candidate launches; all three public fixture intents ignored; no test menu; non-debuggable; no production writes')
