/* Product image zoom only for the local storefront details modal.
   No changes to product data, cart, orders, stock or authentication. */
(() => {
  'use strict';
  const modalSelector = '#kintoProductModalV145';
  let viewer = null;
  let previousFocus = null;
  function close() {
    if (!viewer) return;
    viewer.remove();
    viewer = null;
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    previousFocus = null;
  }
  function open(img) {
    if (!img?.src) return;
    close();
    previousFocus = document.activeElement;
    viewer = document.createElement('div');
    viewer.className = 'kinto-local-image-zoom-v1';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'تكبير صورة المنتج');
    const full = document.createElement('img');
    full.src = img.currentSrc || img.src;
    full.alt = img.alt || 'صورة المنتج';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'kinto-local-image-zoom-close-v1';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'إغلاق الصورة المكبرة');
    dismiss.addEventListener('click', close);
    viewer.addEventListener('click', event => { if (event.target === viewer) close(); });
    viewer.append(full, dismiss);
    document.body.appendChild(viewer);
    dismiss.focus({preventScroll: true});
  }
  document.addEventListener('click', event => {
    const image = event.target.closest?.(modalSelector + '.open .kinto-product-media > img');
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    open(image);
  }, true);
  document.addEventListener('keydown', event => {
    if (!viewer) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);
  const styles = document.createElement('style');
  styles.textContent = `
    ${modalSelector} .kinto-product-media > img { cursor: zoom-in; }
    .kinto-local-image-zoom-v1 { position: fixed; inset: 0; z-index: 2147483646;
      display: flex; align-items: center; justify-content: center; padding: 54px 12px 18px;
      background: rgba(0,0,0,.93); cursor: zoom-out; }
    .kinto-local-image-zoom-v1 > img { display: block; max-width: 100%; max-height: 100%;
      width: auto; height: auto; object-fit: contain; cursor: default; }
    .kinto-local-image-zoom-close-v1 { position: absolute; top: 9px; inset-inline-end: 14px;
      color: white; background: #143c30; border: 1px solid #e6c46c; border-radius: 12px;
      font: bold 30px/1 Arial,sans-serif; width: 44px; height: 44px; cursor: pointer; }
  `;
  document.head.appendChild(styles);
})();
