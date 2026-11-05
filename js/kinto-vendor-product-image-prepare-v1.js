/* Vendor product photo preparation only; does not change storage policies or product data. */
(() => {
  'use strict';
  const MAX_EDGE = 800;
  const TARGET_BYTES = 70 * 1024;
  const QUALITY = 0.50;
  async function prepare(file) {
    if (!(file instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
    if (!globalThis.createImageBitmap || !globalThis.document?.createElement) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size <= TARGET_BYTES) return file;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return file;
      let width = Math.max(1, Math.round(bitmap.width * scale));
      let height = Math.max(1, Math.round(bitmap.height * scale));
      let best = null;
      // Preserve Q50; shrink dimensions only as needed. Avoid blocking an
      // existing product save if the browser cannot reach the 70 KB target.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.drawImage(bitmap, 0, 0, width, height);
        const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', QUALITY));
        if (output?.type === 'image/webp' && (!best || output.size < best.size)) best = output;
        if (best && best.size <= TARGET_BYTES) break;
        if (width === 1 && height === 1) break;
        width = Math.max(1, Math.round(width * 0.85));
        height = Math.max(1, Math.round(height * 0.85));
      }
      if (!best || best.size >= file.size) return file;
      return new File([best], (file.name || 'product').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp', lastModified: file.lastModified || Date.now() });
    } catch {
      // Fail open to the original image; the existing upload/RLS checks still apply.
      return file;
    } finally {
      bitmap?.close?.();
    }
  }
  window.KintoVendorProductImagePrepareV1 = { prepare };
})();
