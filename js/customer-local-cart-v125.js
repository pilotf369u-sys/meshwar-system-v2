/* KINTO V125 — customer dashboard embedded local-store cart controls. */
(()=>{'use strict';
  const root=document.querySelector('[data-kinto-cart-embedded]');
  if(!root)return;
  const cart=()=>window.KintoLocalCartV93;
  const itemKey=row=>`${row.store_id}::${row.product_id}::${['color','size','volume'].map(name=>String(row.selected_options?.[name]||'').trim()).join('|')}`;
  root.addEventListener('change',event=>{
    const input=event.target.closest?.('[data-cart-select]');
    if(input)cart()?.setSelected(input.dataset.key,input.checked);
  });
  root.addEventListener('click',event=>{
    if(event.target.closest?.('#kintoLocalCartCheckout')){cart()?.checkout();return}
    const button=event.target.closest?.('[data-cart-action]');
    if(!button)return;
    const api=cart(),key=button.dataset.key,item=api?.getItems().find(row=>itemKey(row)===key);
    if(!api)return;
    if(button.dataset.cartAction==='remove')api.remove(key);
    else if(item&&button.dataset.cartAction==='plus')api.setQuantity(key,item.quantity+1);
    else if(item&&button.dataset.cartAction==='minus')api.setQuantity(key,Math.max(1,item.quantity-1));
  });
  window.addEventListener('kinto:local-cart-change',()=>cart()?.render?.());
  cart()?.render?.();
})();
