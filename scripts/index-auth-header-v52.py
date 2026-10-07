from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')

# Give the top control strip a stable mount point used by session restoration.
old='<div class="flex flex-wrap items-center justify-end gap-2"><a href="#localStoresPublic"'
new='<div id="meshwarHeaderControls" class="flex flex-wrap items-center justify-end gap-2"><a href="#localStoresPublic"'
assert old in s, 'top header controls not found'
s=s.replace(old,new,1)

# Replace the old base floating rule too, so no cascade can resurrect bottom/left positioning.
s=s.replace('.user-auth-zone { position: absolute; top: 25px; left: 25px; z-index: 1000; }', '.user-auth-zone { position: static; display:flex; align-items:center; gap:8px; z-index:auto; }',1)

# Install one canonical runtime mount and make the post-login session handler use it every time.
marker='        async function restoreCustomerSession() {'
assert marker in s, 'restoreCustomerSession not found'
helper="""        // INDEX_AUTH_HEADER_RUNTIME_LOCK_V52 — the header is the only legal auth mount.\n        function ensureCustomerAuthInHeader(){\n            const host=document.getElementById('meshwarHeaderControls');\n            const zone=document.querySelector('.user-auth-zone');\n            if(!host||!zone)return zone||null;\n            if(zone.parentElement!==host)host.appendChild(zone);\n            zone.style.setProperty('position','static','important');\n            zone.style.setProperty('left','auto','important');\n            zone.style.setProperty('right','auto','important');\n            zone.style.setProperty('top','auto','important');\n            zone.style.setProperty('bottom','auto','important');\n            zone.style.setProperty('display','flex','important');\n            zone.style.setProperty('align-items','center','important');\n            zone.style.setProperty('gap','8px','important');\n            return zone;\n        }\n\n"""
s=s.replace(marker,helper+marker,1)
s=s.replace("        async function restoreCustomerSession() {\n            const authLink", "        async function restoreCustomerSession() {\n            ensureCustomerAuthInHeader();\n            const authLink",1)

# Re-assert placement after both signed-out and signed-in state mutations.
s=s.replace("                if (logoutBtn) logoutBtn.style.display = 'none';\n                return null;", "                if (logoutBtn) logoutBtn.style.display = 'none';\n                ensureCustomerAuthInHeader();\n                return null;",1)
s=s.replace("                if (logoutBtn) logoutBtn.style.display = 'inline-block';\n                return customer;", "                if (logoutBtn) logoutBtn.style.display = 'inline-flex';\n                ensureCustomerAuthInHeader();\n                return customer;",1)
s=s.replace("                if (logoutBtn) logoutBtn.style.display = 'none';\n                return null;", "                if (logoutBtn) logoutBtn.style.display = 'none';\n                ensureCustomerAuthInHeader();\n                return null;",1)

# Guard against any late script attempting to move/recreate the auth zone elsewhere.
needle="        document.addEventListener('DOMContentLoaded', async function() {"
assert needle in s, 'DOMContentLoaded handler not found'
guard="""        document.addEventListener('DOMContentLoaded',()=>{\n            ensureCustomerAuthInHeader();\n            const observer=new MutationObserver(()=>ensureCustomerAuthInHeader());\n            observer.observe(document.body,{childList:true,subtree:true});\n        },{once:true});\n\n"""
s=s.replace(needle,guard+needle,1)

assert s.count('id="meshwarHeaderControls"')==1
assert 'INDEX_AUTH_HEADER_RUNTIME_LOCK_V52' in s
assert 'position: absolute; top: 25px; left: 25px' not in s
p.write_text(s,encoding='utf-8')
