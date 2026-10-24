(() => {
 const coco=['madamecoco.com','www.madamecoco.com'].includes(location.hostname);
 const cocoProduct=()=>{const m=location.pathname.match(/-([a-z0-9]{5,30})-\d{1,5}\/?$/i);return !!m&&/[a-z]/i.test(m[1])&&/\d/.test(m[1]);};
 const zara=['zara.com','www.zara.com'].includes(location.hostname);
 const hepsi=['hepsiburada.com','www.hepsiburada.com','m.hepsiburada.com'].includes(location.hostname);
 if (location.protocol !== 'https:' || !(coco || zara || hepsi || location.hostname === 'trendyol.com' || location.hostname.endsWith('.trendyol.com'))) return;
 if (window.__kintoLabV2) { window.__kintoLabV2.sync(); return; }
 const sync = () => {
  const product = coco ? cocoProduct() : zara ? /^\/tr\/tr\/[^/]+-p\d{8}\.html$/.test(location.pathname) : hepsi ? /-(?:p|pm)-[A-Za-z0-9]{3,40}\/?$/.test(location.pathname) : /-p-\d+(?:\/.*)?$/.test(location.pathname);
  let button = document.getElementById('kinto-lab-order');
  if (!product) { button?.remove(); return; }
  if (button) return;
  button = document.createElement('button');button.id='kinto-lab-order';button.type='button';button.dir='rtl';button.textContent='＋ أضف إلى KINTO\nجارٍ التحقق من السعر';
  // Small side button leaves Trendyol's bottom purchase bar uncovered.
  button.style.cssText='position:fixed;top:45%;right:8px;z-index:2147483647;background:#0a2f23;color:#f2cd78;border:1px solid #d6ad4a;border-radius:12px;padding:10px 12px;font:bold 13px system-ui;max-width:200px;white-space:pre-line;line-height:1.6;box-shadow:0 3px 12px #0003;';
  button.addEventListener('click',()=>{location.href='kinto-lab://capture';});document.body.appendChild(button);
 };
 window.__kintoLabV2={sync};sync();
 window.addEventListener('popstate',sync);
 // Single-page product navigation may not emit onPageFinished.
 window.__kintoLabV2.timer=setInterval(sync,1000);
})();
