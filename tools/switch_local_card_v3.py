from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')
replacement = """async function loadStoreDetails(storeId){const id=String(storeId||'').trim();if(!id)return;const panel=document.getElementById('localStoreProductsPanel'),grid=document.getElementById('localStoreProductsGrid'),title=document.getElementById('localStoreProductsTitle'),meta=document.getElementById('localStoreProductsMeta');if(panel)panel.style.display='block';if(title)title.textContent='منتجات المتجر';if(meta)meta.textContent='';if(grid)grid.innerHTML='<div class=\"local-empty\">جاري تحميل منتجات المتجر...</div>'}
window.loadStoreDetails=loadStoreDetails;"""
s, n = re.subn(r"async function loadStoreDetails\(storeId\)\{.*?\}\nwindow\.loadStoreDetails=loadStoreDetails;", replacement, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit('legacy loadStoreDetails block not found exactly once')
s = re.sub(r'\n?<script type="module" src="js/local-store-enhancements\.js[^\"]*"></script>', '', s)
s = re.sub(r'\n?<script type="module" src="js/local-store-card-v2\.js[^\"]*"></script>', '', s)
if 'js/local-store-card-v3.js' not in s:
    s = s.replace('</body>', '<script type="module" src="js/local-store-card-v3.js"></script>\n</body>', 1)
p.write_text(s, encoding='utf-8')
