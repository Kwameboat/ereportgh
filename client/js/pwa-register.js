(function () {
  if (!('serviceWorker' in navigator)) return;

  const DISMISS_KEY = 'sr_pwa_install_dismissed';
  const promptEl = document.getElementById('installPrompt');
  const installBtn = document.getElementById('installNowBtn');
  const dismissBtn = document.getElementById('installDismissBtn');
  let deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function showPrompt() {
    if (!promptEl || isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return;
    promptEl.classList.remove('hidden');
  }

  function hidePrompt(rememberDismiss) {
    if (!promptEl) return;
    promptEl.classList.add('hidden');
    if (rememberDismiss) localStorage.setItem(DISMISS_KEY, '1');
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      // Silent fail: app should still work as normal website.
    });
  });

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    showPrompt();
  });

  if (installBtn) {
    installBtn.addEventListener('click', async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch {
        // Ignore browser-specific prompt errors.
      }
      deferredPrompt = null;
      hidePrompt(false);
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', function () {
      hidePrompt(true);
    });
  }

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hidePrompt(false);
    localStorage.removeItem(DISMISS_KEY);
  });
})();
