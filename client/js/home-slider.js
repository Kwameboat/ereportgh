/**
 * Hero carousel: one slide visible at a time (fade) + autoplay.
 * Avoids stacked 3D slides that caused overlapping text.
 */
(function () {
  const y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();

  const root = document.querySelector('[data-slider-3d]');
  if (!root) return;

  const hero = document.querySelector('[data-hero]');

  const slides = root.querySelectorAll('.hero-slide');
  const dots = root.querySelectorAll('[data-slide-dot]');
  const prev = root.querySelector('[data-slider-prev]');
  const next = root.querySelector('[data-slider-next]');

  let index = 0;
  let timer = null;
  const interval = 5500;

  /** Matches each slide’s overlay accent (teal → emerald → violet → sky) */
  const HERO_THEMES = [
    { top: '#020617', mid: '#115e59', bot: '#f8fafc' },
    { top: '#022c22', mid: '#047857', bot: '#f8fafc' },
    { top: '#1e1b4b', mid: '#6d28d9', bot: '#f8fafc' },
    { top: '#082f49', mid: '#0369a1', bot: '#f8fafc' },
  ];

  function applyHeroTheme(i) {
    if (!hero) return;
    const t = HERO_THEMES[i % HERO_THEMES.length];
    hero.style.setProperty('--hero-top', t.top);
    hero.style.setProperty('--hero-mid', t.mid);
    hero.style.setProperty('--hero-bot', t.bot);
    hero.setAttribute('data-hero-slide', String(i));
  }

  function layout() {
    slides.forEach(function (slide, j) {
      const on = j === index;
      slide.classList.toggle('is-active', on);
      if (on) {
        slide.style.opacity = '1';
        slide.style.visibility = 'visible';
        slide.style.pointerEvents = 'auto';
        slide.style.zIndex = '2';
      } else {
        slide.style.opacity = '0';
        slide.style.visibility = 'hidden';
        slide.style.pointerEvents = 'none';
        slide.style.zIndex = '0';
      }
      slide.style.transform = 'none';
    });
  }

  function setDotState(el, on) {
    if (on) {
      el.className =
        'slider-dot is-active h-2 rounded-full bg-white shadow-md shadow-black/40 ring-2 ring-white/40';
      el.style.width = '2rem';
      el.style.opacity = '1';
    } else {
      el.className =
        'slider-dot h-2 w-2 rounded-full bg-white/85 opacity-40 transition hover:opacity-75';
      el.style.width = '';
      el.style.opacity = '';
    }
    el.setAttribute('aria-current', on ? 'true' : 'false');
  }

  function go(i) {
    index = (i + slides.length) % slides.length;
    layout();
    applyHeroTheme(index);
    dots.forEach(function (d, j) {
      setDotState(d, j === index);
    });
  }

  function nextSlide() {
    go(index + 1);
  }

  function prevSlide() {
    go(index - 1);
  }

  function startAuto() {
    stopAuto();
    timer = setInterval(nextSlide, interval);
  }

  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  if (prev) {
    prev.addEventListener('click', function () {
      prevSlide();
      startAuto();
    });
  }
  if (next) {
    next.addEventListener('click', function () {
      nextSlide();
      startAuto();
    });
  }

  dots.forEach(function (dot, j) {
    dot.addEventListener('click', function () {
      go(j);
      startAuto();
    });
  });

  if (root) {
    root.addEventListener('mouseenter', stopAuto);
    root.addEventListener('mouseleave', startAuto);
  }

  if (hero) {
    hero.addEventListener(
      'focusin',
      function () {
        stopAuto();
      },
      true
    );
    hero.addEventListener('focusout', function (e) {
      if (!hero.contains(e.relatedTarget)) startAuto();
    });
  }

  go(0);
  startAuto();

  window.addEventListener(
    'resize',
    function () {
      layout();
    },
    { passive: true }
  );
})();
