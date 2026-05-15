/**
 * Executive admin shell: sidebar nav scroll + mobile drawer.
 * Does not touch API logic (see admin-dashboard.js).
 */
(function () {
  const sidebar = document.getElementById('execSidebar');
  const overlay = document.getElementById('execOverlay');
  const menuBtn = document.getElementById('execMenuBtn');
  const navLinks = document.querySelectorAll('[data-nav-section]');

  function closeDrawer() {
    if (sidebar) sidebar.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-visible');
  }

  function openDrawer() {
    if (sidebar) sidebar.classList.add('is-open');
    if (overlay) overlay.classList.add('is-visible');
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      if (sidebar && sidebar.classList.contains('is-open')) closeDrawer();
      else openDrawer();
    });
  }

  if (overlay) overlay.addEventListener('click', closeDrawer);

  function setActiveNav(id) {
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-nav-section') === id);
    });
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      const id = link.getAttribute('data-nav-section');
      const target = id ? document.getElementById(id) : null;
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveNav(id);
        closeDrawer();
      }
    });
  });

  if ('IntersectionObserver' in window) {
    const sections = Array.from(document.querySelectorAll('[id^="sec-"]'));
    const obs = new IntersectionObserver(
      function (entries) {
        const visible = entries
          .filter(function (en) {
            return en.isIntersecting;
          })
          .sort(function (a, b) {
            return b.intersectionRatio - a.intersectionRatio;
          })[0];
        if (visible) setActiveNav(visible.target.id);
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0.1, 0.25] }
    );
    sections.forEach(function (sec) {
      obs.observe(sec);
    });
  } else if (navLinks.length) {
    setActiveNav(navLinks[0].getAttribute('data-nav-section'));
  }

  window.execAdminSetUser = function (admin) {
    const nameEl = document.getElementById('adminUserName');
    const roleEl = document.getElementById('adminUserRole');
    if (nameEl && admin) nameEl.textContent = admin.username || 'Admin';
    if (roleEl && admin) {
      roleEl.textContent = admin.role === 'superadmin' ? 'Superadmin' : 'Administrator';
    }
  };
})();
