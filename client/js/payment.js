(function () {
  const STORAGE_KEY = 'sr_afterpay';
  const params = new URLSearchParams(location.search);
  const ref = params.get('reference');
  const out = document.getElementById('out');

  function redirectHome() {
    window.location.replace('index.html#check');
  }

  function showWait() {
    if (!out) return;
    out.classList.remove('hidden');
    out.className =
      'mx-auto mt-8 max-w-md rounded-2xl border-2 border-slate-200 bg-white px-5 py-8 text-center shadow-lg';
    out.innerHTML =
      '<p class="flex items-center justify-center gap-2 text-base font-bold text-slate-800">' +
      '<span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></span>' +
      'Confirming payment…</p>' +
      '<p class="mt-3 text-sm font-semibold text-slate-600">You will be redirected to your report.</p>';
  }

  async function verifyRef(reference) {
    showWait();
    try {
      const res = await fetch('/api/public/paystack/verify?reference=' + encodeURIComponent(reference));
      const data = await res.json();
      if (!res.ok) {
        if (out) {
          out.className =
            'mx-auto mt-8 max-w-md rounded-2xl border-2 border-red-300 bg-red-50 px-5 py-5 text-base font-bold text-red-900 shadow-lg';
          out.innerHTML =
            '<p>' +
            (data.error || 'Verification failed') +
            '</p>' +
            '<a href="index.html#check" class="mt-4 inline-block font-bold text-brand-800 underline">Back to home</a>';
        }
        return;
      }
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pin: data.pin,
          studentId: data.studentId || '',
          term: data.term || '',
          year: data.year || '',
        })
      );
      window.location.replace('index.html#check');
    } catch {
      if (out) {
        out.className =
          'mx-auto mt-8 max-w-md rounded-2xl border-2 border-red-300 bg-red-50 px-5 py-5 text-base font-bold text-red-900';
        out.innerHTML =
          '<p>Network error.</p><a href="index.html#check" class="mt-3 inline-block font-bold text-brand-800 underline">Try again</a>';
      }
    }
  }

  if (ref) {
    verifyRef(ref);
  } else {
    redirectHome();
  }
})();
