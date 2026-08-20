from pathlib import Path

p=Path('js/local-store-pricing.js')
s=p.read_text(encoding='utf-8')
old="function safeUrl(v){const s=String(v||'').trim();return /^(https?:\\/\\/|images\\/)/i.test(s)?s:''}"
new="function safeUrl(v){const s=String(v||'').trim();return /^(https?:\\/\\/|images\\/|data:image\\/(?:png|jpeg|webp|gif|svg\\+xml);base64,)/i.test(s)?s:''}"
if old not in s:
    raise SystemExit('target safeUrl not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
