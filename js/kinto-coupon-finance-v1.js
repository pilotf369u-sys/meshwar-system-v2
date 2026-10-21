/* Read-only coupon collection math. Original order prices are never mutated. */
(function(root){'use strict';
 const number=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
 const currency=v=>{const c=String(v||'').trim().toUpperCase();return ({'$':'USD',TL:'TRY','€':'EUR'})[c]||c};
 function goods(o){const price=number(o?.total_price),discount=number(o?.reward_discount_amount);return currency(o?.currency)===currency(o?.reward_discount_currency)?Math.max(0,price-discount):price}
 function breakdown(s,money,c){if(s?.coupon_finance_version!=='v1')return '';return '<div class="mini">الأصلي: '+money(s.original_goods_amount,c)+'<br>كوبون التاجر: '+money(s.vendor_coupon_discount,c)+'<br>كوبون KINTO: '+money(s.kinto_coupon_discount,c)+'<br>أساس العمولة: '+money(s.gross_amount,c)+'</div>'}
 root.KintoCouponFinanceV1=Object.freeze({goods,breakdown});
})(typeof window==='object'?window:globalThis);
