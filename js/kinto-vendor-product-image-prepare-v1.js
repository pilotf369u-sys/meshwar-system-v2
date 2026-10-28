/* Vendor product photo preparation only; does not change storage policies or product data. */
(() => {
  'use strict';
  const MAX_EDGE = 1600;
  const MIN_BYTES = 350 * 1024;
  const QUALITY = 0.84;
  async function prepare(file) {
    if (!(file instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
    if (!globalThis.createImageBitmap || !globalThis.document?.createElement) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < MIN_BYTES) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', QUALITY));
      if (!output || output.type !== 'image/webp' || output.size >= file.size) return file;
      return new File([output], (file.name || 'product').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp', lastModified: file.lastModified || Date.now() });
    } catch {
      // Fail open to the original image; the existing upload/RLS checks still apply.
      return file;
    } finally {
      bitmap?.close?.();
    }
  }
  window.KintoVendorProductImagePrepareV1 = { prepare };
})();
