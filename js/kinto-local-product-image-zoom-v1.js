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
    let scale = 1, x = 0, y = 0;
    const pointers = new Map();
    let pinchDistance = 0, pinchScale = 1, dragAt = null;
    function render() {
      full.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      full.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    }
    function zoom(next) {
      scale = Math.max(1, Math.min(5, next));
      if (scale === 1) { x = 0; y = 0; }
      render();
    }
    const controls = document.createElement('div');
    controls.className = 'kinto-local-image-zoom-controls-v1';
    for (const [label, factor, aria] of [['−', 1 / 1.5, 'تصغير الصورة'], ['+', 1.5, 'تكبير الصورة']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', aria);
      button.addEventListener('click', () => zoom(scale * factor));
      controls.appendChild(button);
    }
    full.addEventListener('wheel', event => {
      event.preventDefault();
      zoom(scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2));
    }, { passive: false });
    full.addEventListener('dblclick', event => {
      event.preventDefault();
      zoom(scale > 1 ? 1 : 2);
    });
    full.addEventListener('pointerdown', event => {
      pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
      full.setPointerCapture(event.pointerId);
      if (pointers.size === 1) dragAt = {x:event.clientX, y:event.clientY};
      if (pointers.size === 2) {
        const [a,b] = [...pointers.values()];
        pinchDistance = Math.hypot(a.x-b.x, a.y-b.y); pinchScale = scale; dragAt = null;
      }
    });
    full.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, {x:event.clientX,y:event.clientY});
      if (pointers.size === 2) {
        const [a,b] = [...pointers.values()];
        if (pinchDistance) zoom(pinchScale * Math.hypot(a.x-b.x,a.y-b.y)/pinchDistance);
      } else if (dragAt && scale > 1) {
        x += event.clientX - dragAt.x; y += event.clientY - dragAt.y;
        dragAt = {x:event.clientX,y:event.clientY}; render();
      }
    });
    const endPointer = event => {
      pointers.delete(event.pointerId);
      pinchDistance = 0;
      dragAt = null;
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        dragAt = {x:p.x,y:p.y};
      }
    };
    full.addEventListener('pointerup', endPointer);
    full.addEventListener('pointercancel', endPointer);
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'kinto-local-image-zoom-close-v1';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'إغلاق الصورة المكبرة');
    dismiss.addEventListener('click', close);
    viewer.addEventListener('click', event => { if (event.target === viewer) close(); });
    viewer.append(full, controls, dismiss);
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
      width: auto; height: auto; object-fit: contain; cursor: zoom-in;
      touch-action: none; user-select: none; -webkit-user-drag: none; }
    .kinto-local-image-zoom-controls-v1 { position: absolute; bottom: 18px; left: 50%;
      transform: translateX(-50%); display: flex; gap: 12px; z-index: 2; }
    .kinto-local-image-zoom-controls-v1 button { background: #143c30; color: white;
      border: 1px solid #e6c46c; border-radius: 12px; width: 48px; height: 44px;
      font: bold 26px/1 Arial,sans-serif; cursor: pointer; }
    .kinto-local-image-zoom-close-v1 { position: absolute; top: 9px; inset-inline-end: 14px;
      color: white; background: #143c30; border: 1px solid #e6c46c; border-radius: 12px;
      font: bold 30px/1 Arial,sans-serif; width: 44px; height: 44px; cursor: pointer; }
  `;
  document.head.appendChild(styles);
})();
