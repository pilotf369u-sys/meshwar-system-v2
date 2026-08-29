from pathlib import Path
p=Path('admin-dashboard.html')
s=p.read_text(encoding='utf-8')
old="function normalizeAdminOrderMetrics(o){if(!o)return o;const q=adminOrderQuantity(o),total=adminOrderBoundNumber(o,['total_price','product_price','item_price'],['total_price','product_price','productPrice','item_price','itemPrice','price','item_total','product_total']),fee=adminOrderBoundNumber(o,['delivery_fee','shipping_fee','shipping_cost'],['delivery_fee','deliveryFee','shipping_fee','shippingFee','shipping_cost','shippingCost','delivery_cost','deliveryCost','freight_fee']);o._quantity=q;o._total_price=Number.isFinite(total)?total:null;o._delivery_fee=Number.isFinite(fee)?fee:null;if((o.total_price===null||o.total_price===undefined||o.total_price===''||Number(o.total_price)===0)&&o._total_price!==null)o.total_price=o._total_price;if((o.delivery_fee===null||o.delivery_fee===undefined||o.delivery_fee===''||Number(o.delivery_fee)===0)&&o._delivery_fee!==null)o.delivery_fee=o._delivery_fee;o._unit_price=o._total_price!==null&&q>0?o._total_price/q:null;return o}"
new="function normalizeAdminOrderMetrics(o){if(!o)return o;const q=adminOrderQuantity(o),raw=o.total_price,total=raw===null||raw===undefined||raw===''?null:Number(raw);o._quantity=q;o._total_price=Number.isFinite(total)?total:null;o._unit_price=o._total_price!==null&&q>0?o._total_price/q:null;return o}"
if old not in s: raise SystemExit('V36 normalize block not found')
s=s.replace(old,new,1)
oldrow="price=o._total_price!==null&&o._total_price!==undefined?o._total_price:'',deliveryFee=o._delivery_fee!==null&&o._delivery_fee!==undefined?o._delivery_fee:''"
newrow="hasPrice=o.total_price!==null&&o.total_price!==undefined&&o.total_price!==''&&Number(o.total_price)>0,price=hasPrice?o.total_price:'',deliveryFee=o.delivery_fee!==null&&o.delivery_fee!==undefined&&o.delivery_fee!==''?o.delivery_fee:''"
if oldrow not in s: raise SystemExit('admin row V36 binding not found')
s=s.replace(oldrow,newrow,1)
p.write_text(s,encoding='utf-8')
