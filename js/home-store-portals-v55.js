/* KINTO HOME STORE PORTALS V61 — isolated homepage navigation + header back control + showcase sizing */
(function(){
  const INTL_ID='internationalStoresSection', LOCAL_ID='localStoresPublic';
  let portalShell,contentHead,headerBack,current=null;
  const q=id=>document.getElementById(id);
  const unique=s=>[...new Set(s.filter(Boolean))];
  function collectLogos(section,local){
    if(!section)return[];
    const selectors=local?['.local-public-logo','img[src]']:['.store-logo','img[src]'];
    for(const sel of selectors){
      const srcs=unique([...section.querySelectorAll(sel)].map(img=>img.getAttribute('src')).filter(x=>x&& !/^data:/i.test(x)));
      if(srcs.length)return srcs.slice(0,5);
    }
    return[];
  }
  function logoStrip(section,local){
    const wrap=document.createElement('div');wrap.className='mw-v55-logo-strip';
    const logos=collectLogos(section,local);
    if(!logos.length){for(let i=0;i<4;i++){const f=document.createElement('span');f.className='mw-v55-logo-fallback';f.textContent=local?'K':'✦';wrap.appendChild(f)}return wrap}
    logos.forEach(src=>{const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';wrap.appendChild(img)});
    return wrap;
  }
  function makePortal(kind,title,subtitle,icon,section){
    const btn=document.createElement('button');btn.type='button';btn.className='mw-v55-portal';btn.dataset.kind=kind;btn.setAttribute('aria-pressed','false');
    const top=document.createElement('div');top.className='mw-v55-portal-top';
    const ico=document.createElement('span');ico.className='mw-v55-icon';ico.textContent=icon;
    const arrow=document.createElement('span');arrow.className='mw-v55-arrow';arrow.textContent='←';
    top.append(ico,arrow);
    const h=document.createElement('h3');h.textContent=title;
    const p=document.createElement('p');p.textContent=subtitle;
    btn.append(top,h,p,logoStrip(section,kind==='local'));
    btn.addEventListener('click',()=>show(kind,true));
    return btn;
  }
  function setActiveSections(kind){
    const intl=q(INTL_ID),local=q(LOCAL_ID);
    [intl,local].forEach(el=>{if(el){el.classList.add('mw-v55-section-hidden');el.classList.remove('mw-v55-active')}});
    const active=kind==='local'?local:intl;
    if(active){active.classList.remove('mw-v55-section-hidden');active.classList.add('mw-v55-active')}
  }
  function updatePortalPressed(kind){
    portalShell?.querySelectorAll('.mw-v55-portal').forEach(b=>b.setAttribute('aria-pressed',b.dataset.kind===kind?'true':'false'));
  }
  function normalizeShowcases(){
    const candidates=[
      document.querySelector('#meshwarVideoAd > div'),
      document.querySelector('.header-container.kinto-featured-store')
    ].filter(Boolean);
    candidates.forEach(el=>el.classList.add('kinto-v61-showcase-frame'));
  }
  function ensureHeaderBack(){
    if(headerBack?.isConnected)return headerBack;
    const controls=q('meshwarHeaderControls');if(!controls)return null;
    headerBack=document.createElement('button');
    headerBack.type='button';
    headerBack.id='mwV61HeaderBack';
    headerBack.className='mw-v55-back mw-v61-header-back';
    headerBack.innerHTML='<span aria-hidden="true">↩</span><span>اختيار نوع المتجر</span>';
    headerBack.hidden=true;
    headerBack.addEventListener('click',()=>landing(true));
    controls.prepend(headerBack);
    return headerBack;
  }
  function ensureContentHead(){
    if(contentHead)return contentHead;
    contentHead=document.createElement('div');contentHead.className='mw-v55-content-head';contentHead.hidden=true;
    const title=document.createElement('div');title.className='mw-v55-content-title';
    contentHead.append(title);
    const anchor=q(INTL_ID)||q(LOCAL_ID);anchor?.parentNode?.insertBefore(contentHead,anchor);
    return contentHead;
  }
  function show(kind,pushHash){
    current=kind;document.body.classList.add('mw-v55-browse-mode');
    setActiveSections(kind);updatePortalPressed(kind);
    const head=ensureContentHead();head.hidden=false;head.querySelector('.mw-v55-content-title').textContent=kind==='local'?'المتاجر المحلية':'المتاجر العالمية';
    const back=ensureHeaderBack();if(back)back.hidden=false;
    try{window.showStoresTab?.(kind==='local'?'local':'international')}catch{}
    setActiveSections(kind);
    if(pushHash)history.replaceState(history.state,'',kind==='local'?'#local-stores':'#global-stores');
    const active=q(kind==='local'?LOCAL_ID:INTL_ID);setTimeout(()=>active?.scrollIntoView({behavior:'smooth',block:'start'}),40);
  }
  function landing(clearHash){
    current=null;document.body.classList.remove('mw-v55-browse-mode');
    [q(INTL_ID),q(LOCAL_ID)].forEach(el=>{if(el){el.classList.add('mw-v55-section-hidden');el.classList.remove('mw-v55-active')}});
    updatePortalPressed('');if(contentHead)contentHead.hidden=true;if(headerBack)headerBack.hidden=true;
    if(clearHash&&/#(?:global|local)-stores$/i.test(location.hash))history.replaceState(history.state,'',location.pathname+location.search);
    portalShell?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function build(){
    const intl=q(INTL_ID),local=q(LOCAL_ID);if(!intl&&!local)return;
    q('meshwarStoreTabs')?.setAttribute('aria-hidden','true');
    normalizeShowcases();ensureHeaderBack();
    portalShell=document.createElement('section');portalShell.className='mw-v55-portal-shell';portalShell.id='kintoStorePortalsV55';
    const head=document.createElement('div');head.className='mw-v55-portal-head';
    const h=document.createElement('h2');h.textContent='اختر وجهتك للتسوق';
    const p=document.createElement('p');p.textContent='واجهة واحدة نظيفة، ومساحتان منفصلتان للمتاجر العالمية والمحلية.';head.append(h,p);
    const portals=document.createElement('div');portals.className='mw-v55-portals';
    portals.append(makePortal('global','المتاجر العالمية','أبرز المتاجر العالمية في تبويب مستقل ونظيف.','🌍',intl),makePortal('local','المتاجر المحلية','متاجر محلية مختارة في مساحة مستقلة دون تكديس الصفحة.','🏪',local));
    portalShell.append(head,portals);
    const anchor=q('meshwarStoreTabs')||intl||local;anchor?.parentNode?.insertBefore(portalShell,anchor);
    ensureContentHead();
    const hash=String(location.hash||'').toLowerCase();
    if(hash==='#global-stores')show('global',false);else if(hash==='#local-stores')show('local',false);else landing(false);
    const mo=new MutationObserver(()=>{
      portalShell?.querySelectorAll('.mw-v55-portal').forEach(btn=>{
        const kind=btn.dataset.kind,section=q(kind==='local'?LOCAL_ID:INTL_ID),strip=btn.querySelector('.mw-v55-logo-strip');
        if(!strip||strip.querySelector('img'))return;const logos=collectLogos(section,kind==='local');if(!logos.length)return;strip.replaceWith(logoStrip(section,kind==='local'));
      });
    });
    if(local)mo.observe(local,{childList:true,subtree:true});if(intl)mo.observe(intl,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
})();
