from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
html=(root/'employee-dashboard.html').read_text()
html=re.sub(r'<script\b[^>]*src=[\"\']https?:[^>]*>\s*</script>','',html,flags=re.I)
html=re.sub(r'<link\b[^>]*href=[\"\']https?:[^>]*>','',html,flags=re.I)
stub="""window.addEventListener('kinto-world-orders-loaded',()=>{const d=document.querySelector('#kintoWorldEmbedded .world-order-details');if(d)d.open=true;});window.__worldCalls=[];sessionStorage.setItem('kinto_world_staff_session_v1',JSON.stringify({token:'TEST-world',expiresAt:'2030-01-01'}));window.fetch=async function(url,init){const path=new URL(typeof url==='string'?url:url.url,location.href).pathname;window.__worldCalls.push(path);let data;if(path.endsWith('kinto_world_list_v1'))data=[{id:'TEST-global',reference:'KG-TEST-FULL-PAGE',state:'review',revision:0,request:{items:[{title:'TEST product',quantity:1}],contact:{name:'TEST customer',phone:'+9647701234567',address:'TEST destination address'}},estimates:[{amount:'35750.00000000000000000000',currency:'IQD'}]}];else if(path.endsWith('kinto_world_dispatch_directory_v1'))data={branches:[],couriers:[]};else if(path.endsWith('kinto_world_dispatch_list_v1'))data=[];else throw Error('UNEXPECTED_API '+path);return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});};"""
html=html.replace('<head>','<head><script>'+stub+'</script>',1)
(root/'.kinto-employee-page-test.html').write_text(html)
