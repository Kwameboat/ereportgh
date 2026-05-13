(function () {
  const scene = document.getElementById('scene');
  const toggle = document.getElementById('lampToggle');
  const cord = document.getElementById('pullCord');
  if (scene && toggle && cord) {
    let on = true;
    function setLamp(next) {
      on = next;
      scene.classList.toggle('lamp-off', !on);
      toggle.textContent = on ? 'Lamp: ON' : 'Lamp: OFF';
    }
    function toggleLamp() {
      setLamp(!on);
    }
    function pullCord() {
      cord.classList.add('pulled');
      window.setTimeout(() => {
        cord.classList.remove('pulled');
      }, 180);
      toggleLamp();
    }
    toggle.addEventListener('click', () => {
      toggleLamp();
    });
    cord.addEventListener('click', pullCord);
    cord.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pullCord();
      }
    });
    cord.addEventListener('mousedown', () => {
      cord.classList.add('pulled');
    });
    window.addEventListener('mouseup', () => {
      cord.classList.remove('pulled');
    });
    window.addEventListener('blur', () => {
      cord.classList.remove('pulled');
    });
    setLamp(true);
  }

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
