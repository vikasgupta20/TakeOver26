/**
 * FlexSpace — Explore Community Page Logic
 * Handles animations, modal, form submission and confirmation.
 */
(function () {
  'use strict';

  // ─── NAV SCROLL ───
  const nav = document.getElementById('exNav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });

  // ─── HAMBURGER ───
  const hamburger = document.getElementById('exHamburger');
  const mobileMenu = document.getElementById('exMobileMenu');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });
  mobileMenu.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    });
  });

  // ─── HERO ENTRANCE ───
  document.querySelectorAll('.ex-reveal').forEach(el => {
    const d = parseInt(el.getAttribute('data-d') || '0', 10);
    setTimeout(() => el.classList.add('visible'), 300 + d * 150);
  });

  // ─── SCROLL REVEAL ───
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const s = parseInt(entry.target.getAttribute('data-s') || '0', 10);
        setTimeout(() => entry.target.classList.add('visible'), s * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.ex-sr').forEach(el => observer.observe(el));

  // ─── COUNTER ANIMATION ───
  const counterObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.getAttribute('data-count'), 10);
      const dur = 2000, start = performance.now();
      (function animate(now) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * target) + '+';
        if (p < 1) requestAnimationFrame(animate);
      })(start);
      counterObs.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.ex-stat-num[data-count]').forEach(c => counterObs.observe(c));

  // ─── SMOOTH ANCHOR ───
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href === '#') return;
      e.preventDefault();
      const t = document.querySelector(href);
      if (t) {
        const top = t.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ═══════════════════════════════════════════
  //  VISIT REQUEST MODAL
  // ═══════════════════════════════════════════
  const overlay = document.getElementById('visitModalOverlay');
  const formView = document.getElementById('visitFormView');
  const confirmView = document.getElementById('visitConfirmView');
  const form = document.getElementById('visitForm');
  const errorEl = document.getElementById('visitError');

  function openModal() {
    formView.style.display = '';
    confirmView.style.display = 'none';
    errorEl.style.display = 'none';
    form.reset();
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('vDate').setAttribute('min', today);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Open triggers
  ['btnHeroVisit', 'btnNavVisit', 'btnMobileVisit', 'btnCtaVisit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', openModal);
  });

  // Close triggers
  document.getElementById('visitModalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.getElementById('btnConfirmClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ─── FORM SUBMISSION ───
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const name = document.getElementById('vName').value.trim();
    const email = document.getElementById('vEmail').value.trim();
    const phone = document.getElementById('vPhone').value.trim();
    const visitDate = document.getElementById('vDate').value;
    const visitTime = document.getElementById('vTime').value;
    const visitorsCount = document.getElementById('vCount').value;
    const purpose = document.getElementById('vPurpose').value;

    // Client-side validation
    if (!name || name.length < 2) return showErr('Please enter your full name.');
    if (!email || !email.includes('@')) return showErr('Please enter a valid email address.');
    if (!phone || phone.length < 7) return showErr('Please enter a valid phone number.');
    if (!visitDate) return showErr('Please select a preferred visit date.');
    if (!visitTime) return showErr('Please select a time slot.');
    if (!visitorsCount) return showErr('Please select number of visitors.');
    if (!purpose) return showErr('Please select the purpose of visit.');

    // Check date is in the future
    const today = new Date().toISOString().split('T')[0];
    if (visitDate < today) return showErr('Visit date must be today or in the future.');

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Submitting...';

    try {
      const res = await fetch('/api/visitor-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone,
          visit_date: visitDate,
          visit_time: visitTime,
          visitors_count: parseInt(visitorsCount, 10) || 1,
          purpose
        })
      });

      const data = await res.json();

      if (res.ok) {
        // Show confirmation
        document.getElementById('confirmDetails').innerHTML =
          `<strong>Name:</strong> ${name}<br/>` +
          `<strong>Email:</strong> ${email}<br/>` +
          `<strong>Visit Date:</strong> ${visitDate}<br/>` +
          `<strong>Time Slot:</strong> ${visitTime}<br/>` +
          `<strong>Visitors:</strong> ${visitorsCount}<br/>` +
          `<strong>Purpose:</strong> ${purpose}`;

        formView.style.display = 'none';
        confirmView.style.display = '';
      } else {
        showErr(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Visit request error:', err);
      showErr('Network error. Please check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Submit Visit Request';
    }
  });

  function showErr(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
})();
