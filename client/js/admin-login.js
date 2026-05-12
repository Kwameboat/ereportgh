(function () {
  const form = document.getElementById('form');
  const err = document.getElementById('err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const username = document.getElementById('user').value;
    const password = document.getElementById('pass').value;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        err.textContent = data.error || 'Login failed';
        err.classList.remove('hidden');
        return;
      }
      localStorage.setItem('admin_token', data.token);
      location.href = 'dashboard.html';
    } catch {
      err.textContent = 'Network error';
      err.classList.remove('hidden');
    }
  });
})();
