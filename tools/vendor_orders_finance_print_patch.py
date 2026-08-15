from pathlib import Path
import re

p = Path('vendor-dashboard.html')
s = p.read_text(encoding='utf-8')

old_table = '''<p class="vendor-muted mb-3 text-xs text-slate-400">الطلبات الجديدة تبقى ضمن دورة `local_orders` للتدقيق المالي والتشغيلي قبل التسليم والتحريك.</p>
        <div class="overflow-x-auto"><table class="w-full min-w-[700px] text-sm"><thead class="border-b border-white/10 text-slate-400"><tr><th class="p-3">الطلب</th><th>المنتج</th><th>الكمية</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody id="ordersBody"></tbody></table></div>'''
new_table = '''<p class="vendor-muted mb-3 text-xs text-slate-400">تظهر هنا طلبات هذا المتجر فقط من دورة الطلبات الرئيسية، مع إخفاء هاتف العميل وعنوانه التفصيلي حفاظًا على الخصوصية.</p>
        <div class="overflow-x-auto"><table class="w-full min-w-[820px] text-sm"><thead class="border-b border-white/10 text-slate-400"><tr><th class="p-3">رقم الطلب</th><th>المنتج</th><th>الكمية</th><th>المحافظة / المدينة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="ordersBody"></tbody></table></div>'''
if old_table not in s:
    raise SystemExit('orders table block not found')
s = s.replace(old_table, new_table, 1)

old_js = re.compile(r'''async function loadOrders\(\)\{.*?function renderStats\(\)\{.*?\}\n\nObject\.assign''', re.S)
new_js = r'''function normalizeOrderDetails(v){if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}}
function isDeliveredOrder(status){const s=String(status||'').trim().toLowerCase();return ['delivered','completed','complete','تم التسليم','تم التوصيل','مكتمل','مكتملة'].includes(s)}
function orderCity(o){const d=normalizeOrderDetails(o?.details);return d.governorate||d.city||d.province||d.customer_city||'غير محددة'}
function orderProductName(o){const d=normalizeOrderDetails(o?.details);return d.product_name||'منتج محلي'}
function orderQuantity(o){const d=normalizeOrderDetails(o?.details);return Math.max(1,Number(d.quantity||1)||1)}
function orderCommissionRate(o){const d=normalizeOrderDetails(o?.details);const n=Number(d.commission_rate);return Number.isFinite(n)&&n>=0&&n<100?n:Number(vendorStore?.commission_rate||10)}
function orderExtra(o,...keys){const d=normalizeOrderDetails(o?.details);for(const k of keys){const n=Number(d[k]);if(Number.isFinite(n))return n}return 0}
function financialTotals(){const delivered=orders.filter(o=>isDeliveredOrder(o.status));let sales=0,commission=0,transport=0,expenses=0,penalties=0;for(const o of delivered){const amount=Number(o.total_price||0);sales+=Number.isFinite(amount)?amount:0;commission+=(Number.isFinite(amount)?amount:0)*(orderCommissionRate(o)/100);transport+=orderExtra(o,'shipping_fee','transport_fee','delivery_fee');expenses+=orderExtra(o,'expenses','store_expenses');penalties+=orderExtra(o,'return_penalty','return_penalties','penalty')}return{sales:Math.ceil(sales),commission:Math.ceil(commission),transport:Math.ceil(transport),expenses:Math.ceil(expenses),penalties:Math.ceil(penalties),net:Math.ceil(sales-commission-transport-expenses-penalties)}}
async function loadOrders(){if(!vendorStore)return;try{const{data,error}=await sb.from('orders').select('id,order_code,total_price,currency,status,created_at,details').contains('details',{source:'local_store',store_id:String(vendorStore.id)}).order('created_at',{ascending:false}).limit(200);if(error)throw error;orders=data||[];$('ordersBody').innerHTML=orders.map(o=>`<tr class="border-b border-white/5"><td class="p-3"><div class="font-bold">${esc(o.order_code||String(o.id).slice(0,8))}</div><div class="vendor-muted text-xs text-slate-500">${new Date(o.created_at).toLocaleString('ar')}</div></td><td>${esc(orderProductName(o))}</td><td>${orderQuantity(o)}</td><td>${esc(orderCity(o))}</td><td><span class="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">${esc(o.status||'انتظار رد الموظف')}</span></td><td><button type="button" onclick="printShippingLabel('${esc(o.id)}')" class="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-500/20">🖨️ طباعة الملصق</button></td></tr>`).join('')||'<tr><td colspan="6" class="p-6 text-center text-slate-400">لا توجد طلبات واردة لهذا المتجر.</td></tr>';renderFinance();renderStats()}catch(e){console.error('Vendor orders load error:',e);showNotice('تعذر تحميل الطلبات: '+(e.message||e),true)}}
async function loadFinance(){renderFinance();renderStats()}
function financeCurrency(){const x=[...new Set(orders.map(r=>r.currency).filter(Boolean))];return x.length===1?x[0]:(vendorStore?.exchange_target_currency||vendorStore?.default_currency||'IQD')}
function renderFinance(){const t=financialTotals(),cur=financeCurrency();$('finSales').textContent=money(t.sales,cur);$('finCommission').textContent=money(t.commission,cur);$('finCosts').textContent=money(t.transport+t.expenses,cur);$('finPenalties').textContent=money(t.penalties,cur);$('finNet').textContent=money(t.net,cur)}
function renderStats(){const low=products.filter(p=>Number(p.stock_quantity||0)<=Number(p.low_stock_threshold||0)).length,t=financialTotals(),cur=financeCurrency();$('statProducts').textContent=products.length;$('statLowStock').textContent=low;$('statOrders').textContent=orders.length;$('statSales').textContent=money(t.sales,cur);$('statNet').textContent=money(t.net,cur)}
function printShippingLabel(orderId){const o=orders.find(x=>String(x.id)===String(orderId));if(!o)return showNotice('تعذر العثور على الطلب للطباعة.',true);const code=o.order_code||String(o.id).slice(0,8),product=orderProductName(o),qty=orderQuantity(o),city=orderCity(o),date=new Date(o.created_at).toLocaleDateString('ar-IQ');const w=window.open('','_blank','width=520,height=760');if(!w)return showNotice('يرجى السماح بالنوافذ المنبثقة لطباعة الملصق.',true);w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>MeshWar Cargo - ${esc(code)}</title><style>@page{size:100mm 150mm;margin:4mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#0f172a;background:#fff}.label{width:92mm;min-height:142mm;border:2px solid #0f172a;border-radius:4mm;padding:5mm;display:flex;flex-direction:column;gap:4mm}.brand{text-align:center;border-bottom:2px solid #0f172a;padding-bottom:3mm}.brand h1{margin:0;font-size:20pt}.brand p{margin:1mm 0 0;font-size:9pt}.order{text-align:center;font-size:18pt;font-weight:900;direction:ltr}.barcode{height:28mm;display:flex;align-items:center;justify-content:center}.barcode svg{max-width:100%;height:100%}.grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cbd5e1}.cell{padding:4mm;border:1px solid #cbd5e1}.label-title{font-size:8pt;color:#64748b;margin-bottom:1mm}.value{font-size:12pt;font-weight:800}.product{grid-column:1/-1}.privacy{margin-top:auto;text-align:center;font-size:8pt;color:#64748b;border-top:1px dashed #94a3b8;padding-top:3mm}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.label{break-inside:avoid}}</style><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script></head><body><div class="label"><div class="brand"><h1>MeshWar Cargo</h1><p>ملصق شحن متجر محلي</p></div><div class="order">${esc(code)}</div><div class="barcode"><svg id="barcode"></svg></div><div class="grid"><div class="cell product"><div class="label-title">المنتج</div><div class="value">${esc(product)}</div></div><div class="cell"><div class="label-title">الكمية</div><div class="value">${qty}</div></div><div class="cell"><div class="label-title">التاريخ</div><div class="value">${esc(date)}</div></div><div class="cell product"><div class="label-title">المحافظة / المدينة</div><div class="value">${esc(city)}</div></div></div><div class="privacy">بيانات التواصل والعنوان التفصيلي محفوظة لدى منصة MeshWar فقط.</div></div><script>window.addEventListener('load',()=>{try{JsBarcode('#barcode',${JSON.stringify(String(code))},{format:'CODE128',displayValue:false,height:70,margin:0,width:2})}catch(e){console.error(e)}setTimeout(()=>window.print(),250)});<\/script></body></html>`);w.document.close()}

Object.assign'''
ns, n = old_js.subn(new_js, s, count=1)
if n != 1:
    raise SystemExit('orders/finance JS block not found')
s = ns.replace("Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders});", "Object.assign(window,{vendorLogin,vendorLogout,toggleTheme,openProductModal,closeProductModal,editProduct,saveProduct,deleteProduct,saveExchangeRate,loadOrders,printShippingLabel});", 1)
p.write_text(s, encoding='utf-8')

# Ensure new storefront orders persist city/governorate into non-sensitive order details for future vendor labels.
p = Path('js/local-store-card-v3.js')
s = p.read_text(encoding='utf-8')
s = s.replace("customers?select=id,name,phone&id=eq.", "customers?select=*&id=eq.", 1)
old = "local_currency:'IQD',quantity:1}"
new = "local_currency:'IQD',quantity:1,governorate:customer.governorate||customer.city||customer.province||''}"
if old not in s:
    raise SystemExit('order details payload marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

p = Path('index.html')
s = p.read_text(encoding='utf-8')
s, n = re.subn(r'js/local-store-card-v3\.js\?v=[^"\']+', 'js/local-store-card-v3.js?v=vendor-orders-v1', s, count=1)
if n != 1:
    raise SystemExit('index cache-bust marker not found')
p.write_text(s, encoding='utf-8')
