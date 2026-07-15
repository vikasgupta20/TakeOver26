/**
 * FlexSpace — Landing Page Animations & Interactivity
 */

(function () {
  'use strict';

  // ─── NAV SCROLL EFFECT ──────────────────────────
  const nav = document.getElementById('lpNav');

  function handleNavScroll() {
    if (window.scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', handleNavScroll, { passive: true });

  // ─── HAMBURGER TOGGLE ───────────────────────────
  const hamburger = document.getElementById('lpHamburger');
  const mobileMenu = document.getElementById('lpMobileMenu');

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });

  // Close mobile menu on link click
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    });
  });

  // ─── HERO ENTRANCE ANIMATIONS ──────────────────
  function animateHero() {
    const reveals = document.querySelectorAll('.lp-reveal');
    reveals.forEach((el) => {
      const delay = parseInt(el.getAttribute('data-delay') || '0', 10);
      setTimeout(() => {
        el.classList.add('visible');
      }, 300 + delay * 150);
    });
  }

  // Trigger hero animation on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', animateHero);
  } else {
    animateHero();
  }

  // ─── SCROLL REVEAL (IntersectionObserver) ──────
  const scrollElements = document.querySelectorAll('.lp-scroll-reveal');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const stagger = parseInt(entry.target.getAttribute('data-stagger') || '0', 10);
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, stagger * 80);
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    }
  );

  scrollElements.forEach((el) => observer.observe(el));

  // ─── COUNTER ANIMATION ─────────────────────────
  function animateCounters() {
    const counters = document.querySelectorAll('.lp-stat-number[data-count]');

    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = parseInt(el.getAttribute('data-count'), 10);
          const suffix = '+';
          const duration = 2000;
          const start = performance.now();

          function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * target);
            el.textContent = current + suffix;

            if (progress < 1) {
              requestAnimationFrame(update);
            }
          }
          requestAnimationFrame(update);
          counterObserver.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((c) => counterObserver.observe(c));
  }

  animateCounters();

  // ─── SMOOTH ANCHOR SCROLLING ───────────────────
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        const navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--lp-nav-height'), 10) || 72;
        const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
})();
