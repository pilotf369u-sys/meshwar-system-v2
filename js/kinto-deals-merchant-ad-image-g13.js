/* G13 merchant campaign ad image preparation. No upload or checkout side effects. */
(function () {
  'use strict';
  var maxBytes = 200 * 1024;
  async function prepare(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 32 || file.size > 8 * 1024 * 1024) throw Error('Invalid image');
    var bitmap = await createImageBitmap(file);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16000000) throw Error('Invalid image dimensions');
      var scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      var ctx = canvas.getContext('2d', {alpha: false});
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (var attempt = 0; attempt < 6; attempt++) {
        canvas.width = Math.max(1, Math.round(canvas.width));
        canvas.height = Math.max(1, Math.round(canvas.height));
        ctx = canvas.getContext('2d', {alpha: false});
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (var quality of [0.82, 0.68, 0.54, 0.40, 0.28]) {
          var blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
          if (blob && blob.type === 'image/webp' && blob.size <= maxBytes) return new File([blob], 'campaign-ad.webp', {type: 'image/webp'});
        }
        canvas.width = Math.max(1, Math.round(canvas.width * 0.82));
        canvas.height = Math.max(1, Math.round(canvas.height * 0.82));
      }
      throw Error('Image cannot be compressed under 200KB');
    } finally { bitmap.close(); }
  }
  window.KintoMerchantAdImageG13 = Object.freeze({prepare: prepare, maxOutputBytes: maxBytes});
}());
