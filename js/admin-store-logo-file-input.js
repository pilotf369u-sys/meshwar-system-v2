/* Admin store logo file picker: local image -> validated Data URL for logo_url. */
(function(){
  'use strict';
  const MAX_BYTES=512*1024;
  const ACCEPTED=/^image\/(png|jpeg|webp|gif|svg\+xml)$/i;

  function setPreview(src,name){
    const img=document.getElementById('storeFilePreview');
    const text=document.getElementById('storeFileName');
    if(img){
      if(src){img.src=src;img.style.display='block'}else{img.removeAttribute('src');img.style.display='none'}
    }
    if(text)text.textContent=name||'';
  }

  function syncFromLogoField(){
    const input=document.getElementById('storeImg');
    if(!input)return;
    const v=String(input.value||'').trim();
    if(/^data:image\//i.test(v))setPreview(v,'صورة مختارة من الجهاز');
    else setPreview(v&&/^(https?:\/\/|images\/)/i.test(v)?v:'',v?'الرابط/المسار الحالي':'');
  }

  function mount(){
    const logo=document.getElementById('storeImg');
    if(!logo||document.getElementById('storeLogoFile'))return;
    const wrap=document.createElement('span');
    wrap.id='storeLogoFileWrap';
    wrap.style.cssText='display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px;vertical-align:middle';
    wrap.innerHTML='<label for="storeLogoFile" class="btn-blue" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin:0">📁 اختيار صورة<input id="storeLogoFile" type="file" accept="image/*" style="display:none"></label><img id="storeFilePreview" alt="معاينة الشعار" style="display:none;width:70px;height:48px;object-fit:contain;border:1px solid rgba(246,200,95,.35);border-radius:8px;background:transparent;padding:3px"><span id="storeFileName" class="mini"></span>';
    logo.insertAdjacentElement('afterend',wrap);
    const file=document.getElementById('storeLogoFile');
    file.addEventListener('change',()=>{
      const f=file.files&&file.files[0];
      if(!f)return;
      if(!ACCEPTED.test(f.type||'')){
        file.value='';
        alert('اختر ملف صورة صالحاً: PNG / JPG / WEBP / GIF / SVG.');
        return;
      }
      if(f.size>MAX_BYTES){
        file.value='';
        alert('حجم الشعار كبير. الحد الأقصى 512KB للحفاظ على سرعة الواجهة وقاعدة البيانات.');
        return;
      }
      const reader=new FileReader();
      reader.onload=()=>{
        const value=String(reader.result||'');
        logo.value=value;
        logo.dispatchEvent(new Event('input',{bubbles:true}));
        logo.dispatchEvent(new Event('change',{bubbles:true}));
        const select=document.getElementById('storeImageSelect');
        if(select)select.value='';
        setPreview(value,`${f.name} — ${Math.ceil(f.size/1024)}KB`);
        const notice=document.getElementById('storesAdminNotice');
        if(notice)notice.textContent='تم تجهيز الشعار من الجهاز. اضغط حفظ لإرساله ضمن بيانات المتجر.';
      };
      reader.onerror=()=>alert('تعذر قراءة ملف الصورة.');
      reader.readAsDataURL(f);
    });
    logo.addEventListener('input',syncFromLogoField);
    syncFromLogoField();

    if(typeof window.storeLogoPreview==='function'){
      window.storeLogoPreview=function(s){
        const src=String(s&&s.logo_url||'').trim();
        if(!/^(https?:\/\/|images\/|data:image\/)/i.test(src))return'<span class="mini">بدون شعار</span>';
        return `<img src="${esc(src)}" alt="${esc(s&&s.name||'')}" style="width:74px;height:48px;object-fit:contain;background:transparent" onerror="this.style.display='none'">`;
      };
    }

    const baseEdit=window.editStore;
    if(typeof baseEdit==='function')window.editStore=function(index){const r=baseEdit(index);setTimeout(syncFromLogoField,0);return r};
    const baseReset=window.resetStoreForm;
    if(typeof baseReset==='function')window.resetStoreForm=function(){const r=baseReset();file.value='';setPreview('','');return r};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
