"""Minimal branch boundary: two static pages and two links only; no business changes."""
from pathlib import Path
import subprocess,hashlib
base='5e717436fed47d665ac36690293bf1ad43b4e3f4'
root=Path(__file__).resolve().parents[2]
relative='js/customer-navigation-drawer-v156.js'
added="addItem(settings,{icon:'fa-shield-halved',label:'سياسة الخصوصية',href:'privacy-app-kinto.html',publicRoute:true});addItem(settings,{icon:'fa-user-minus',label:'طلب حذف الحساب',href:'account-deletion.html',publicRoute:true});".encode()
original=subprocess.check_output(['git','show',base+':'+relative],cwd=root)
current=(root/relative).read_bytes()
assert current.count(added)==1 and current.replace(added,b'',1)==original
tracked=subprocess.check_output(['git','diff','--name-only',base],cwd=root,text=True).splitlines()
allowed=lambda p:p in [relative,'privacy-app-kinto.html','account-deletion.html','.github/workflows/kinto-play-minimum.yml'] or p.startswith('mobile/release-minimum/')
assert all(allowed(p) for p in tracked),tracked
for name in ['privacy-app-kinto.html','account-deletion.html']:
 s=(root/name).read_text();assert '<script' not in s.lower() and '<form' not in s.lower()
 assert 'support@shopkinto.com' in s and 'KINTO' in s
 assert 'طلب حذف' in s and 'كلمة المرور' in s
 assert 'مسودة للمراجعة' not in s and 'قيد الإعداد' not in s
 assert 'http://' not in s
 assert 'supabase' not in s.lower() or name=='privacy-app-kinto.html'
print('PASS_MINIMUM_SCOPE: original drawer bytes preserved except two links; static public resources; no business/backend/signing changes')
