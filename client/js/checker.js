(function () {
  const STORAGE_KEY = 'sr_afterpay';

  const form = document.getElementById('form');
  const msg = document.getElementById('msg');
  const preview = document.getElementById('preview');
  const pdfFrame = document.getElementById('pdfFrame');
  const openTab = document.getElementById('openTab');
  const downloadPdf = document.getElementById('downloadPdf');
  const feeNote = document.getElementById('feeNote');
  const schoolUnlockBtn = document.getElementById('schoolUnlockBtn');
  const schoolPin = document.getElementById('schoolPin');

  if (!form || !msg || !preview || !pdfFrame || !openTab) return;

  let lastPdfUrl = '';
  let lastDownloadName = 'report-card.pdf';

  async function downloadPdfFile() {
    if (!lastPdfUrl) return;
    try {
      const res = await fetch(lastPdfUrl, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('bad response');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = lastDownloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(lastPdfUrl, '_blank', 'noopener');
    }
  }

  if (downloadPdf) {
    downloadPdf.addEventListener('click', function () {
      downloadPdfFile();
    });
  }

  function showMsg(text, isError) {
    msg.classList.remove('hidden');
    msg.textContent = text;
    msg.className =
      'mt-4 rounded-2xl border-2 px-4 py-3.5 text-base font-bold leading-snug ' +
      (isError
        ? 'border-red-400/70 bg-red-950/75 text-red-50 shadow-lg shadow-red-950/40'
        : 'border-emerald-400/55 bg-emerald-950/55 text-emerald-50 shadow-lg shadow-emerald-950/25');
  }

  async function unlockReport(body) {
    const res = await fetch('/api/public/validate-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMsg(data.error || 'Something went wrong', true);
      return false;
    }
    showMsg('PIN accepted. Loading PDF…', false);
    if (data.pdfUrl) {
      lastPdfUrl = data.pdfUrl;
      const sid = (data.student && data.student.studentId) || body.studentId || 'report';
      const safe = String(sid).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'report';
      lastDownloadName = `report-${safe}.pdf`;

      pdfFrame.src = data.pdfUrl;
      openTab.href = data.pdfUrl;
      if (downloadPdf) {
        downloadPdf.disabled = false;
      }
      preview.classList.remove('hidden');
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    showMsg('No PDF URL returned.', true);
    return false;
  }

  async function startCheckout(e) {
    e.preventDefault();
    preview.classList.add('hidden');
    msg.classList.add('hidden');
    if (downloadPdf) downloadPdf.disabled = true;
    lastPdfUrl = '';

    const studentId = document.getElementById('studentId').value.trim();
    const email = document.getElementById('email').value.trim();
    const term = document.getElementById('term').value.trim();
    const year = document.getElementById('year').value.trim();

    if (!studentId) {
      showMsg('Enter your school reference.', true);
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMsg('Enter a valid email for payment.', true);
      return;
    }

    showMsg('Starting secure checkout…', false);

    try {
      const res = await fetch('/api/public/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          studentId,
          term: term || undefined,
          year: year || undefined,
          callbackUrl: `${window.location.origin}/payment.html`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showMsg(data.error || 'Could not start payment.', true);
        return;
      }
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      }
    } catch {
      showMsg('Network error. Try again.', true);
    }
  }

  async function resumeAfterPayment() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    const studentId = payload.studentId != null ? String(payload.studentId).trim() : '';
    const pin = payload.pin != null ? String(payload.pin).trim() : '';
    const term = payload.term != null ? String(payload.term).trim() : '';
    const year = payload.year != null ? String(payload.year).trim() : '';

    if (!studentId || !pin) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    document.getElementById('studentId').value = studentId;
    document.getElementById('term').value = term;
    document.getElementById('year').value = year;

    showMsg('Payment confirmed. Unlocking your report…', false);
    const ok = await unlockReport({
      studentId,
      pin,
      term: term || undefined,
      year: year || undefined,
    });
    if (ok) sessionStorage.removeItem(STORAGE_KEY);
  }

  form.addEventListener('submit', startCheckout);

  if (schoolUnlockBtn && schoolPin) {
    schoolUnlockBtn.addEventListener('click', async () => {
      preview.classList.add('hidden');
      msg.classList.add('hidden');
      if (downloadPdf) downloadPdf.disabled = true;
      lastPdfUrl = '';

      const studentId = document.getElementById('studentId').value.trim();
      const pin = schoolPin.value.trim();
      const term = document.getElementById('term').value.trim();
      const year = document.getElementById('year').value.trim();

      if (!studentId) {
        showMsg('Enter your school reference.', true);
        return;
      }
      if (!pin) {
        showMsg('Enter the PIN from your school.', true);
        return;
      }

      try {
        await unlockReport({
          studentId,
          pin,
          term: term || undefined,
          year: year || undefined,
        });
      } catch {
        showMsg('Network error. Try again.', true);
      }
    });
  }

  fetch('/api/public/payment-settings')
    .then((r) => r.json())
    .then((d) => {
      if (feeNote && d.amountLabel) {
        feeNote.textContent = `Secure checkout · ${d.amountLabel} · Your PIN is issued automatically after payment.`;
      }
    })
    .catch(() => {});

  resumeAfterPayment();
})();
