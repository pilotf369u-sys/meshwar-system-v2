(() => {
 if (location.protocol !== 'https:' || !(location.hostname === 'trendyol.com' || location.hostname.endsWith('.trendyol.com'))) return;
 if (document.getElementById('kinto-lab-order')) return;
 const button = document.createElement('button');
 button.id = 'kinto-lab-order'; button.type = 'button';
 button.textContent = 'اطلب عبر KINTO — تجربة';
 button.style.cssText = 'position:fixed;bottom:20px;left:12px;right:12px;z-index:2147483647;background:#0a2f23;color:#f2cd78;border:2px solid #d6ad4a;border-radius:14px;padding:14px;font:bold 16px system-ui;box-shadow:0 4px 20px #0004;';
 button.addEventListener('click', () => { location.href = 'kinto-lab://capture'; });
 document.body.appendChild(button);
})();
