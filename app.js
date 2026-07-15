/* ═══════════════════════════════════════════════════════════════
   FlexSpace — Application Logic (Full-Stack)
   Vanilla JS • Fetch API • Session-based Auth • GSAP animations
   ═══════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  API HELPERS
// ─────────────────────────────────────────────

const API = {
  async get(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    data._status = res.status;
    return data;
  },
  async put(url, body) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    data._status = res.status;
    return data;
  },
  async del(url) {
    const res = await fetch(url, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    const data = await res.json();
    data._status = res.status;
    return data;
  }
};


// ─────────────────────────────────────────────
//  THEME TOGGLE (Light / Dark)
// ─────────────────────────────────────────────

function initThemeToggle() {
  const toggle = document.getElementById('themeToggle');
  const sunIcon = document.getElementById('themeIconSun');
  const moonIcon = document.getElementById('themeIconMoon');
  if (!toggle || !sunIcon || !moonIcon) return;

  // Load saved theme
  const saved = localStorage.getItem('flexspace-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }

  toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('flexspace-theme', 'dark');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('flexspace-theme', 'light');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  });
}

/** Check if light mode is active */
function isLightMode() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}


// ─────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────

/** Get a YYYY-MM-DD date string for today or tomorrow */
function getDateKey(dayLabel) {
  const d = new Date();
  if (dayLabel === 'tomorrow') d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** Get a human-readable date string */
function getDateDisplay(dayLabel) {
  const d = new Date();
  if (dayLabel === 'tomorrow') d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Format hour for display */
function formatHour(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${suffix}`;
}

/** Format a YYYY-MM-DD date to a readable string */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format date more compactly for cards */
function formatDateShort(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Capitalize first letter */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Get skill level display label */
function getSkillLabel(level) {
  if (level === 'any') return 'Any Level';
  return capitalize(level);
}


// ─────────────────────────────────────────────
//  APPLICATION STATE
// ─────────────────────────────────────────────
const state = {
  user: null,               // Current logged-in user
  facilities: [],           // Facility groups from API
  activeFacility: null,     // Currently selected facility (parent)
  activeUnit: null,         // Currently selected sub-unit (or parent if no units)
  activeDay: 'today',       // 'today' | 'tomorrow'
  selectedSlot: null,       // { start, end, label } or null
  slots: [],                // Current slot data from API
  // Find Players state
  fpActiveTab: 'discover',  // 'discover' | 'mygames'
  fpMyGamesTab: 'hosted',   // 'hosted' | 'joined'
  fpJoiningRequestId: null, // ID of request being joined
  fpJoiningData: null,      // Data of request being joined
  fpCreateBookingId: null,  // Booking ID for creating player request
  fpCreateBookingData: null // Booking data for creating player request
};

let liveSlotsInitialized = false;


// ─────────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────────
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  navbar:          $('#navbar'),
  navLinks:        $('#navLinks'),
  hamburger:       $('#hamburger'),
  navAuthButtons:  $('#navAuthButtons'),
  navUserMenu:     $('#navUserMenu'),
  userAvatarBtn:   $('#userAvatarBtn'),
  userAvatarInitial: $('#userAvatarInitial'),
  userNameDisplay: $('#userNameDisplay'),
  userDropdown:    $('#userDropdown'),
  navDashboardLink:$('#navDashboardLink'),
  navFindPlayersLink: $('#navFindPlayersLink'),
  facilitiesGrid:  $('#facilitiesGrid'),
  scheduleHeader:  $('#scheduleHeader'),
  scheduleEye:     $('#scheduleEyebrow'),
  dayTabs:         $('#dayTabs'),
  tabToday:        $('#tabToday'),
  tabTomorrow:     $('#tabTomorrow'),
  slotsGrid:       $('#slotsGrid'),
  slotsLegend:     $('#slotsLegend'),
  btnBack:         $('#btnBack'),
  // Booking confirmation modal
  modalOverlay:    $('#modalOverlay'),
  modalClose:      $('#modalClose'),
  modalMeta:       $('#modalMeta'),
  btnConfirmBooking: $('#btnConfirmBooking'),
  // Unit selection modal
  unitModalOverlay:$('#unitModalOverlay'),
  unitModalClose:  $('#unitModalClose'),
  unitModalIcon:   $('#unitModalIcon'),
  unitModalTitle:  $('#unitModalTitle'),
  unitModalMeta:   $('#unitModalMeta'),
  unitSelector:    $('#unitSelector'),
  // Login modal
  loginModalOverlay:  $('#loginModalOverlay'),
  loginModalClose:    $('#loginModalClose'),
  loginForm:          $('#loginForm'),
  loginEmail:         $('#loginEmail'),
  loginPassword:      $('#loginPassword'),
  loginError:         $('#loginError'),
  // Register modal
  registerModalOverlay: $('#registerModalOverlay'),
  registerModalClose:   $('#registerModalClose'),
  registerForm:         $('#registerForm'),
  registerName:         $('#registerName'),
  registerFlatNo:       $('#registerFlatNo'),
  registerEmail:        $('#registerEmail'),
  registerPassword:     $('#registerPassword'),
  registerError:        $('#registerError'),
  // Dashboard
  dashboardSection: $('#dashboard'),
  dashboardGrid:    $('#dashboardGrid'),
  dashboardEmpty:   $('#dashboardEmpty'),
  // Toast
  toast:         $('#toast'),
  toastMsg:      $('#toastMsg'),
  toastError:    $('#toastError'),
  toastErrorMsg: $('#toastErrorMsg'),
  // QR Gate Pass modal
  qrModalOverlay:  $('#qrModalOverlay'),
  qrModalClose:    $('#qrModalClose'),
  qrImage:         $('#qrImage'),
  qrModalTitle:    $('#qrModalTitle'),
  qrModalMeta:     $('#qrModalMeta'),
  qrPassDetails:   $('#qrPassDetails'),
  // Live badge
  liveBadge:       $('#liveBadge'),
  // Find Players
  findPlayersSection: $('#findplayers'),
  fpTabDiscover:   $('#fpTabDiscover'),
  fpTabMyGames:    $('#fpTabMyGames'),
  fpDiscoverView:  $('#fpDiscoverView'),
  fpMyGamesView:   $('#fpMyGamesView'),
  fpGamesGrid:     $('#fpGamesGrid'),
  fpFilterSport:   $('#fpFilterSport'),
  fpFilterSkill:   $('#fpFilterSkill'),
  fpFilterDate:    $('#fpFilterDate'),
  fpClearFilters:  $('#fpClearFilters'),
  fpMgHosted:      $('#fpMgHosted'),
  fpMgJoined:      $('#fpMgJoined'),
  fpMyGamesGrid:   $('#fpMyGamesGrid'),
  // Create Player Request modal
  createPRModalOverlay: $('#createPRModalOverlay'),
  createPRModalClose:   $('#createPRModalClose'),
  createPRForm:         $('#createPRForm'),
  prBookingItems:       $('#prBookingItems'),
  prPlayersNeeded:      $('#prPlayersNeeded'),
  prSkillLevel:         $('#prSkillLevel'),
  prDescription:        $('#prDescription'),
  prCharCounter:        $('#prCharCounter'),
  prError:              $('#prError'),
  // Join Game modal
  joinGameModalOverlay: $('#joinGameModalOverlay'),
  joinGameModalClose:   $('#joinGameModalClose'),
  joinConfirmView:      $('#joinConfirmView'),
  joinSuccessView:      $('#joinSuccessView'),
  joinGameDetails:      $('#joinGameDetails'),
  joinGameMeta:         $('#joinGameMeta'),
  btnConfirmJoin:       $('#btnConfirmJoin'),
  btnCancelJoin:        $('#btnCancelJoin'),
  joinSuccessDetails:   $('#joinSuccessDetails'),
  btnViewGameAfterJoin: $('#btnViewGameAfterJoin'),
  btnViewBookingsAfterJoin: $('#btnViewBookingsAfterJoin'),
  // Game Detail modal
  gameDetailModalOverlay: $('#gameDetailModalOverlay'),
  gameDetailModalClose:   $('#gameDetailModalClose'),
  gameDetailContent:      $('#gameDetailContent'),
  // Edit PR modal
  editPRModalOverlay: $('#editPRModalOverlay'),
  editPRModalClose:   $('#editPRModalClose'),
  editPRForm:         $('#editPRForm'),
  editPRId:           $('#editPRId'),
  editPRPlayersNeeded:$('#editPRPlayersNeeded'),
  editPRSkillLevel:   $('#editPRSkillLevel'),
  editPRDescription:  $('#editPRDescription'),
  editPRCharCounter:  $('#editPRCharCounter'),
  editPRError:        $('#editPRError'),
};


// ─────────────────────────────────────────────
//  AUTH — Login / Register / Logout / Session
// ─────────────────────────────────────────────

async function checkAuth() {
  try {
    const data = await API.get('/api/auth/me');
    state.user = data.user;
    updateAuthUI();
  } catch {
    state.user = null;
    updateAuthUI();
  }
}

function updateAuthUI() {
  if (state.user) {
    dom.navAuthButtons.style.display = 'none';
    dom.navUserMenu.style.display = 'block';
    dom.navDashboardLink.style.display = 'list-item';
    dom.navFindPlayersLink.style.display = 'list-item';
    dom.userAvatarInitial.textContent = state.user.name.charAt(0).toUpperCase();
    const flatDisplay = state.user.flat_no ? ` (${state.user.flat_no})` : '';
    dom.userNameDisplay.textContent = state.user.name + flatDisplay;
  } else {
    dom.navAuthButtons.style.display = 'flex';
    dom.navUserMenu.style.display = 'none';
    dom.navDashboardLink.style.display = 'none';
    dom.navFindPlayersLink.style.display = 'none';
    dom.dashboardSection.style.display = 'none';
    dom.findPlayersSection.style.display = 'none';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  dom.loginError.style.display = 'none';

  const email = dom.loginEmail.value.trim();
  const password = dom.loginPassword.value;

  if (!email || !password) {
    showFormError(dom.loginError, 'Please fill in all fields.');
    return;
  }

  const data = await API.post('/api/auth/login', { email, password });

  if (data._status === 200) {
    state.user = data.user;
    updateAuthUI();
    closeAllModals();
    dom.loginForm.reset();

    // If admin, redirect to admin dashboard
    if (data.user.role === 'admin') {
      window.location.href = '/admin';
      return;
    }

    showToast(`Welcome back, ${data.user.name}!`);
  } else {
    showFormError(dom.loginError, data.error || 'Login failed.');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  dom.registerError.style.display = 'none';

  const name = dom.registerName.value.trim();
  const flat_no = dom.registerFlatNo ? dom.registerFlatNo.value.trim() : '';
  const email = dom.registerEmail.value.trim();
  const password = dom.registerPassword.value;

  if (!name || !flat_no || !email || !password) {
    showFormError(dom.registerError, 'Please fill in all fields.');
    return;
  }

  if (password.length < 6) {
    showFormError(dom.registerError, 'Password must be at least 6 characters.');
    return;
  }

  const data = await API.post('/api/auth/register', { name, email, password, flat_no });

  if (data._status === 201) {
    state.user = data.user;
    updateAuthUI();
    closeAllModals();
    showToast(`Welcome to FlexSpace, ${data.user.name}!`);
    dom.registerForm.reset();
  } else {
    showFormError(dom.registerError, data.error || 'Registration failed.');
  }
}

async function handleLogout() {
  await API.post('/api/auth/logout', {});
  state.user = null;
  updateAuthUI();
  closeUserDropdown();
  dom.dashboardSection.style.display = 'none';
  dom.findPlayersSection.style.display = 'none';
  showToast('Logged out successfully.');
}

function showFormError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

async function handleGoogleAuth() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebase.auth().signInWithPopup(provider);
    const idToken = await result.user.getIdToken();

    // Send the Firebase ID token to our backend for verification
    const data = await API.post('/api/auth/google', { id_token: idToken });

    if (data._status === 200 || data._status === 201) {
      state.user = data.user;
      updateAuthUI();
      closeAllModals();

      // If admin, redirect to admin dashboard
      if (data.user.role === 'admin') {
        window.location.href = '/admin';
        return;
      }

      if (data.new_user) {
        showToast(`Welcome to FlexSpace, ${data.user.name}!`);
      } else {
        showToast(`Welcome back, ${data.user.name}!`);
      }
    } else {
      showToastError(data.error || 'Google sign-in failed.');
    }

    // Sign out from Firebase client — we use server sessions, not Firebase sessions
    await firebase.auth().signOut();

  } catch (err) {
    // User cancelled the popup or other error
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      console.error('Google auth error:', err);
      showToastError('Google sign-in failed. Please try again.');
    }
  }
}


// ─────────────────────────────────────────────
//  FACILITIES — Fetch & Render Cards
// ─────────────────────────────────────────────

async function loadFacilities() {
  try {
    const data = await API.get('/api/facilities');
    state.facilities = data.facilities || [];
    renderFacilityCards();
  } catch (err) {
    console.error('Failed to load facilities:', err);
  }
}

function renderFacilityCards() {
  dom.facilitiesGrid.innerHTML = state.facilities.map((f) => {
    const unitsBadge = f.units.length > 0
      ? `<div class="facility-card__units-badge">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
           ${f.units.length} ${f.units.length === 1 ? 'unit' : 'units'} available
         </div>`
      : '';

    return `
    <article class="facility-card" data-facility-id="${f.id}" id="card-${f.id}">
      <div class="facility-card__image-wrap">
        <img src="${f.image}" alt="${f.name}" class="facility-card__image" loading="lazy" />
      </div>
      <div class="facility-card__body">
        <h3 class="facility-card__name">${f.emoji} ${f.name}</h3>
        <p class="facility-card__desc">${f.description}</p>
        ${unitsBadge}
        <button class="facility-card__cta" data-facility-id="${f.id}" aria-label="View schedule for ${f.name}">
          View Schedule
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
    </article>
  `}).join('');

  // Attach click handlers
  $$('.facility-card__cta').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fId = parseInt(btn.dataset.facilityId, 10);
      handleFacilityClick(fId);
    });
  });

  $$('.facility-card').forEach((card) => {
    card.addEventListener('click', () => {
      const fId = parseInt(card.dataset.facilityId, 10);
      handleFacilityClick(fId);
    });
  });

  // Attach spotlight mousemove listeners to dynamically rendered cards
  initSpotlightCards();
}


// ─────────────────────────────────────────────
//  FACILITY CLICK — Sub-unit selection flow
// ─────────────────────────────────────────────

function handleFacilityClick(facilityId) {
  const facility = state.facilities.find(f => f.id === facilityId);
  if (!facility) return;

  state.activeFacility = facility;

  if (facility.units.length > 0) {
    // Show sub-unit selection modal
    openUnitModal(facility);
  } else {
    // No sub-units — open schedule directly with parent facility
    state.activeUnit = facility;
    openSchedule();
  }
}

function openUnitModal(facility) {
  dom.unitModalIcon.textContent = facility.emoji;
  dom.unitModalTitle.textContent = `Select a ${getUnitLabel(facility.name)}`;
  dom.unitModalMeta.textContent = `Choose which ${getUnitLabel(facility.name).toLowerCase()} you'd like to book`;

  dom.unitSelector.innerHTML = facility.units.map(unit => {
    const shortName = unit.name.split(' — ').pop();
    return `
      <button class="unit-btn" data-unit-id="${unit.id}">
        <span class="unit-name">${shortName}</span>
        <span class="unit-sub">${facility.name}</span>
      </button>
    `;
  }).join('');

  // Attach handlers
  dom.unitSelector.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const unitId = parseInt(btn.dataset.unitId, 10);
      const unit = facility.units.find(u => u.id === unitId);
      if (unit) {
        state.activeUnit = unit;
        closeModal(dom.unitModalOverlay);
        openSchedule();
      }
    });
  });

  openModalOverlay(dom.unitModalOverlay);

  // Animate unit buttons
  requestAnimationFrame(() => {
    if (window.gsap) {
      gsap.fromTo('.unit-btn',
        { opacity: 0, y: 15, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, stagger: 0.06, duration: 0.4, ease: 'power3.out' }
      );
    }
  });
}

function getUnitLabel(facilityName) {
  if (facilityName.includes('Badminton')) return 'Court';
  if (facilityName.includes('Table Tennis')) return 'Board';
  if (facilityName.includes('Snooker')) return 'Board';
  return 'Unit';
}


// ─────────────────────────────────────────────
//  SCHEDULE — Open / Close
// ─────────────────────────────────────────────

function openSchedule() {
  state.activeDay = 'today';
  state.selectedSlot = null;

  const displayName = state.activeUnit.parent_id
    ? `${state.activeFacility.emoji} ${state.activeUnit.name}`
    : `${state.activeFacility.emoji} ${state.activeFacility.name}`;

  // Update header
  dom.scheduleEye.textContent = displayName;

  // Show schedule UI
  dom.scheduleHeader.style.display = 'flex';
  dom.dayTabs.style.display = 'flex';
  dom.slotsGrid.style.display = 'grid';
  dom.slotsLegend.style.display = 'flex';

  // Reset day tabs
  dom.tabToday.classList.add('active');
  dom.tabTomorrow.classList.remove('active');
  dom.tabToday.textContent = `Today · ${getDateDisplay('today')}`;
  dom.tabTomorrow.textContent = `Tomorrow · ${getDateDisplay('tomorrow')}`;

  if (!liveSlotsInitialized) {
    initLiveSlots();
    liveSlotsInitialized = true;
  }

  fetchAndRenderSlots();
  scrollToSection('schedule');
}

function closeSchedule() {
  state.activeFacility = null;
  state.activeUnit = null;
  state.selectedSlot = null;

  dom.scheduleHeader.style.display = 'none';
  dom.dayTabs.style.display = 'none';
  dom.slotsGrid.style.display = 'none';
  dom.slotsLegend.style.display = 'none';

  scrollToSection('facilities');
}


// ─────────────────────────────────────────────
//  TIME SLOTS — Fetch & Render
// ─────────────────────────────────────────────

async function fetchAndRenderSlots() {
  if (!state.activeUnit) return;

  const date = getDateKey(state.activeDay);

  // Show loading state
  dom.slotsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-muted);">Loading slots...</div>';

  try {
    const data = await API.get(`/api/facilities/${state.activeUnit.id}/slots?date=${date}`);
    state.slots = data.slots || [];
    renderSlots();
  } catch (err) {
    console.error('Failed to load slots:', err);
    dom.slotsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#ef4444;">Failed to load slots. Please try again.</div>';
  }
}

function renderSlots() {
  dom.slotsGrid.innerHTML = state.slots.map((slot) => {
    const isBooked = !slot.available;
    const isSelected = state.selectedSlot && state.selectedSlot.start === slot.start;

    let classes = 'slot';
    if (isBooked) classes += ' slot--booked';
    else if (isSelected) classes += ' slot--selected';

    let bookedByHTML = '';
    if (isBooked && slot.booked_by) {
      bookedByHTML = `<p class="slot__booked-by">by ${slot.booked_by}</p>`;
    }

    return `
      <div class="${classes}" data-start="${slot.start}" data-end="${slot.end}" data-label="${slot.label}" role="button" tabindex="0" aria-label="${slot.label} ${isBooked ? 'Booked' : 'Available'}">
        <p class="slot__time">${slot.label}</p>
        <p class="slot__status">${isBooked ? 'Booked' : (isSelected ? 'Selected' : 'Available')}</p>
        ${bookedByHTML}
      </div>
    `;
  }).join('');

  // Attach slot click handlers
  $$('.slot:not(.slot--booked)').forEach((el) => {
    el.addEventListener('click', () => selectSlot(el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSlot(el); }
    });
  });

  // Animate slots in
  requestAnimationFrame(() => {
    if (window.gsap) {
      gsap.fromTo('.slot',
        { opacity: 0, y: 20, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, stagger: 0.04, duration: 0.45, ease: 'power3.out' }
      );
    }
  });
}

function selectSlot(el) {
  // Check if user is logged in
  if (!state.user) {
    openModalOverlay(dom.loginModalOverlay);
    showToastError('Please log in to book a slot.');
    return;
  }

  const start = parseInt(el.dataset.start, 10);
  const end   = parseInt(el.dataset.end, 10);
  const label = el.dataset.label;

  state.selectedSlot = { start, end, label };

  // Update visual state
  $$('.slot').forEach(s => s.classList.remove('slot--selected'));
  el.classList.add('slot--selected');
  el.querySelector('.slot__status').textContent = 'Selected';

  // Subtle GSAP pop animation
  if (window.gsap) {
    gsap.fromTo(el, { scale: 0.95 }, { scale: 1, duration: 0.35, ease: 'elastic.out(1, 0.5)' });
  }

  // Open booking confirmation modal after brief pause
  setTimeout(() => openBookingModal(), 250);
}


// ─────────────────────────────────────────────
//  BOOKING CONFIRMATION MODAL
// ─────────────────────────────────────────────

function openBookingModal() {
  if (!state.activeUnit || !state.selectedSlot) return;

  const displayName = state.activeUnit.parent_id
    ? state.activeUnit.name
    : state.activeFacility.name;

  dom.modalMeta.textContent = `${displayName} · ${state.selectedSlot.label} · ${getDateDisplay(state.activeDay)}`;
  openModalOverlay(dom.modalOverlay);
}

async function handleBookingConfirm() {
  if (!state.activeUnit || !state.selectedSlot || !state.user) return;

  const date = getDateKey(state.activeDay);

  // Disable button during request
  dom.btnConfirmBooking.disabled = true;
  dom.btnConfirmBooking.querySelector('span').textContent = 'Booking...';

  const data = await API.post('/api/bookings', {
    facility_id: state.activeUnit.id,
    date: date,
    start_time: state.selectedSlot.start,
    end_time: state.selectedSlot.end
  });

  dom.btnConfirmBooking.disabled = false;
  dom.btnConfirmBooking.querySelector('span').textContent = 'Confirm Booking';

  if (data._status === 201) {
    state.selectedSlot = null;
    closeModal(dom.modalOverlay);
    fetchAndRenderSlots();
    showToast(data.message || 'Booking confirmed!');

    // If sport booking, offer Find Players
    if (data.booking && data.booking.is_sport) {
      setTimeout(() => {
        offerFindPlayers(data.booking);
      }, 1000);
    }
  } else {
    closeModal(dom.modalOverlay);
    showToastError(data.error || 'Booking failed. Please try again.');
    fetchAndRenderSlots(); // Refresh to show current state
  }
}

/** Show a toast offering Find Players for a sport booking */
function offerFindPlayers(booking) {
  showToast('Need more players? Open Find Players from My Bookings!');
}


// ─────────────────────────────────────────────
//  USER DASHBOARD
// ─────────────────────────────────────────────

async function loadDashboard() {
  if (!state.user) return;

  dom.dashboardSection.style.display = 'block';

  try {
    const data = await API.get('/api/bookings/me');
    const bookings = data.bookings || [];

    if (bookings.length === 0) {
      dom.dashboardGrid.style.display = 'none';
      dom.dashboardEmpty.style.display = 'block';
    } else {
      dom.dashboardGrid.style.display = 'grid';
      dom.dashboardEmpty.style.display = 'none';
      renderDashboardBookings(bookings);
    }
  } catch (err) {
    console.error('Failed to load bookings:', err);
  }

  scrollToSection('dashboard');
}

function renderDashboardBookings(bookings) {
  dom.dashboardGrid.innerHTML = bookings.map(b => {
    // Find Players button — only for sport facilities without existing player requests
    let findPlayersBtn = '';
    if (b.is_sport) {
      if (b.has_player_request) {
        findPlayersBtn = `
          <button class="btn-find-players btn-find-players--active" data-view-pr-id="${b.player_request_id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            View Game · ${b.player_request_status}
          </button>`;
      } else {
        findPlayersBtn = `
          <button class="btn-find-players" data-fp-booking-id="${b.id}" data-fp-facility="${b.facility_emoji} ${b.facility_name}" data-fp-date="${b.date}" data-fp-label="${b.label}" data-fp-start="${b.start_time}" data-fp-end="${b.end_time}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Find Players
          </button>`;
      }
    }

    return `
    <div class="booking-card" data-booking-id="${b.id}">
      <div class="booking-card__header">
        <div class="booking-card__facility">
          <span class="booking-card__emoji">${b.facility_emoji}</span>
          <span class="booking-card__name">${b.facility_name}</span>
        </div>
        <span class="booking-card__status booking-card__status--confirmed">Confirmed</span>
      </div>
      <div class="booking-card__details">
        <div class="booking-card__detail">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${formatDate(b.date)}
        </div>
        <div class="booking-card__detail">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${b.label}
        </div>
      </div>
      <div class="booking-card__actions">
        <button class="btn btn-outline btn-sm btn-qr" data-qr-id="${b.id}" data-qr-facility="${b.facility_emoji} ${b.facility_name}" data-qr-date="${b.date}" data-qr-label="${b.label}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="14.01"/><line x1="21" y1="21" x2="21" y2="21.01"/><line x1="14" y1="21" x2="14" y2="21.01"/></svg>
          Gate Pass
        </button>
        ${findPlayersBtn}
        <button class="btn btn-danger btn-sm" data-cancel-id="${b.id}">
          Cancel Booking
        </button>
      </div>
    </div>
  `}).join('');

  // Attach cancel handlers
  dom.dashboardGrid.querySelectorAll('[data-cancel-id]').forEach(btn => {
    btn.addEventListener('click', () => cancelMyBooking(parseInt(btn.dataset.cancelId, 10)));
  });

  // Attach QR gate pass handlers
  dom.dashboardGrid.querySelectorAll('.btn-qr').forEach(btn => {
    btn.addEventListener('click', () => {
      const bookingId = btn.dataset.qrId;
      const facility  = btn.dataset.qrFacility;
      const dateStr   = btn.dataset.qrDate;
      const label     = btn.dataset.qrLabel;
      openQRModal(bookingId, facility, dateStr, label);
    });
  });

  // Attach Find Players handlers
  dom.dashboardGrid.querySelectorAll('[data-fp-booking-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      openCreatePRModal({
        id: parseInt(btn.dataset.fpBookingId, 10),
        facility_name: btn.dataset.fpFacility,
        date: btn.dataset.fpDate,
        label: btn.dataset.fpLabel,
        start_time: parseInt(btn.dataset.fpStart, 10),
        end_time: parseInt(btn.dataset.fpEnd, 10)
      });
    });
  });

  // Attach View Player Request handlers
  dom.dashboardGrid.querySelectorAll('[data-view-pr-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      openGameDetailModal(parseInt(btn.dataset.viewPrId, 10));
    });
  });

  // Animate cards
  requestAnimationFrame(() => {
    if (window.gsap) {
      gsap.fromTo('.booking-card',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' }
      );
    }
  });
}

async function cancelMyBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;

  const data = await API.del(`/api/bookings/${bookingId}`);

  if (data._status === 200) {
    showToast('Booking cancelled.');
    loadDashboard();
  } else {
    showToastError(data.error || 'Failed to cancel booking.');
  }
}


// ─────────────────────────────────────────────
//  QR GATE PASS MODAL
// ─────────────────────────────────────────────
function openQRModal(bookingId, facilityName, dateStr, timeLabel) {
  dom.qrModalMeta.textContent = `${facilityName}`;
  dom.qrImage.src = `/api/bookings/${bookingId}/qr`;
  dom.qrImage.alt = `Gate Pass QR — ${facilityName}`;

  dom.qrPassDetails.innerHTML = `
    <div class="qr-detail-row">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span>${formatDate(dateStr)}</span>
    </div>
    <div class="qr-detail-row">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${timeLabel}</span>
    </div>
  `;

  openModalOverlay(dom.qrModalOverlay);

  // GSAP pulse animation on QR image border
  requestAnimationFrame(() => {
    if (window.gsap) {
      gsap.fromTo('.qr-image-wrap',
        { boxShadow: '0 0 0px rgba(168, 85, 247, 0.3)' },
        {
          boxShadow: '0 0 28px rgba(168, 85, 247, 0.5)',
          repeat: -1,
          yoyo: true,
          duration: 1.5,
          ease: 'sine.inOut'
        }
      );
    }
  });
}


// ─────────────────────────────────────────────
//  MODAL MANAGEMENT
// ─────────────────────────────────────────────

function openModalOverlay(overlay) {
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeModal(overlay) {
  overlay.classList.remove('visible');
  document.body.style.overflow = '';

  // If closing booking modal, deselect slot
  if (overlay === dom.modalOverlay && state.selectedSlot) {
    state.selectedSlot = null;
    if (state.activeUnit) renderSlots();
  }

  // Reset join modal views
  if (overlay === dom.joinGameModalOverlay) {
    dom.joinConfirmView.style.display = 'block';
    dom.joinSuccessView.style.display = 'none';
  }
}

function closeAllModals() {
  [dom.modalOverlay, dom.unitModalOverlay, dom.loginModalOverlay, dom.registerModalOverlay,
   dom.qrModalOverlay, dom.createPRModalOverlay, dom.joinGameModalOverlay,
   dom.gameDetailModalOverlay, dom.editPRModalOverlay].forEach(m => {
    if (m) m.classList.remove('visible');
  });
  document.body.style.overflow = '';
}

function closeUserDropdown() {
  dom.userDropdown.classList.remove('open');
}


// ─────────────────────────────────────────────
//  TOASTS
// ─────────────────────────────────────────────

function showToast(message) {
  dom.toastMsg.textContent = message;
  dom.toast.classList.add('show');
  setTimeout(() => dom.toast.classList.remove('show'), 3500);
}

function showToastError(message) {
  dom.toastErrorMsg.textContent = message;
  dom.toastError.classList.add('show');
  setTimeout(() => dom.toastError.classList.remove('show'), 4000);
}


// ─────────────────────────────────────────────
//  3D ORB — Canvas Animated Background
// ─────────────────────────────────────────────



// ─────────────────────────────────────────────
//  GSAP ANIMATIONS
// ─────────────────────────────────────────────
function initGSAPAnimations() {
  if (!window.gsap) return;

  gsap.registerPlugin(ScrollTrigger);

  // ── Hero entrance timeline ──
  const heroTL = gsap.timeline({ delay: 0.3 });

  heroTL
    .to('#heroTagline',  { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0)
    .fromTo('#heroTitle',
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0.15)
    .fromTo('#heroSubtitle',
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.35)
    .fromTo('#heroActions',
      { opacity: 0, y: 25 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.5)
    .fromTo('#heroStats',
      { opacity: 0, y: 25 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.65);

  // ── Counter animation ──
  $$('.stat-number').forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    gsap.to(el, {
      textContent: target,
      duration: 2,
      delay: 1,
      ease: 'power2.out',
      snap: { textContent: 1 },
      onUpdate() { el.textContent = Math.round(parseFloat(el.textContent)); }
    });
  });

  // ── Facility cards scroll-triggered entrance ──
  gsap.fromTo('.facility-card',
    { opacity: 0, y: 50, scale: 0.97 },
    {
      opacity: 1, y: 0, scale: 1,
      stagger: 0.15,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '#facilitiesGrid',
        start: 'top 80%',
        once: true
      }
    }
  );
}


// ─────────────────────────────────────────────
//  NAVIGATION HELPERS
// ─────────────────────────────────────────────

/** Smooth scroll to a section */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'), 10) || 72;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

/** Navbar scroll effect */
function initNavbarScroll() {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        dom.navbar.classList.toggle('scrolled', window.scrollY > 40);
        ticking = false;
      });
      ticking = true;
    }
  });
}

/** Active nav link based on scroll position */
function initActiveNavLink() {
  const sections = ['hero', 'facilities', 'schedule', 'dashboard', 'findplayers'];
  const links = $$('.nav-link');
  const offset = 200;

  window.addEventListener('scroll', () => {
    let current = 'hero';
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.offsetParent !== null && el.getBoundingClientRect().top <= offset) {
        current = id;
      }
    });
    links.forEach(link => {
      link.classList.toggle('active', link.dataset.section === current);
    });
  });
}

/** Mobile hamburger toggle */
function initHamburger() {
  dom.hamburger.addEventListener('click', () => {
    dom.hamburger.classList.toggle('open');
    dom.navLinks.classList.toggle('mobile-open');
  });

  // Close on link click
  $$('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      dom.hamburger.classList.remove('open');
      dom.navLinks.classList.remove('mobile-open');
    });
  });
}


// ═══════════════════════════════════════════════════════════
//  FIND PLAYERS — Discovery, Create, Join, My Games
// ═══════════════════════════════════════════════════════════

// ─── Open Find Players Page ───
async function openFindPlayers() {
  if (!state.user) {
    openModalOverlay(dom.loginModalOverlay);
    return;
  }
  dom.findPlayersSection.style.display = 'block';
  switchFPTab('discover');
  scrollToSection('findplayers');
}

// ─── Tab Switching ───
function switchFPTab(tab) {
  state.fpActiveTab = tab;
  dom.fpTabDiscover.classList.toggle('active', tab === 'discover');
  dom.fpTabMyGames.classList.toggle('active', tab === 'mygames');
  dom.fpDiscoverView.style.display = tab === 'discover' ? 'block' : 'none';
  dom.fpMyGamesView.style.display = tab === 'mygames' ? 'block' : 'none';

  if (tab === 'discover') {
    loadOpenGames();
  } else {
    loadMyGames();
  }
}

// ─── Load Open Games (Discovery) ───
async function loadOpenGames() {
  const sport = dom.fpFilterSport.value;
  const skill = dom.fpFilterSkill.value;
  const dateVal = dom.fpFilterDate.value;

  let url = '/api/player-requests?';
  if (sport) url += `sport=${encodeURIComponent(sport)}&`;
  if (skill) url += `skill=${encodeURIComponent(skill)}&`;
  if (dateVal) url += `date=${encodeURIComponent(dateVal)}&`;

  try {
    const data = await API.get(url);
    const requests = data.requests || [];
    const sports = data.sports || [];

    // Populate sport filter (preserve current value)
    const currentSport = dom.fpFilterSport.value;
    dom.fpFilterSport.innerHTML = '<option value="">All Sports</option>' +
      sports.map(s => `<option value="${s}" ${s === currentSport ? 'selected' : ''}>${s}</option>`).join('');

    // Populate date filter with upcoming dates
    const dates = [...new Set(requests.map(r => r.date))].sort();
    const currentDate = dom.fpFilterDate.value;
    dom.fpFilterDate.innerHTML = '<option value="">All Dates</option>' +
      dates.map(d => `<option value="${d}" ${d === currentDate ? 'selected' : ''}>${formatDateShort(d)}</option>`).join('');

    renderGameCards(requests);
  } catch (err) {
    console.error('Failed to load open games:', err);
    dom.fpGamesGrid.innerHTML = '<div class="fp-empty"><div class="fp-empty__icon">⚠️</div><h3>Failed to load games</h3><p>Please try again later.</p></div>';
  }
}

function renderGameCards(requests) {
  if (requests.length === 0) {
    dom.fpGamesGrid.innerHTML = `
      <div class="fp-empty">
        <div class="fp-empty__icon">🏸</div>
        <h3>No open games right now</h3>
        <p>No open games match these filters. Check back later or create your own!</p>
        <button class="fp-clear-filters" onclick="clearFPFilters()">Clear Filters</button>
      </div>`;
    return;
  }

  dom.fpGamesGrid.innerHTML = requests.map(r => {
    const spotsClass = r.spots_remaining > 0 ? 'spots-indicator--open' : 'spots-indicator--full';
    const spotsText = r.spots_remaining > 0 ? `${r.spots_remaining} spot${r.spots_remaining > 1 ? 's' : ''} left` : 'Game full';
    const descHTML = r.description ? `<div class="game-card__description">"${r.description}"</div>` : '';

    return `
    <div class="game-card" data-request-id="${r.id}">
      <div class="game-card__sport-badge">${r.facility_emoji} ${r.sport_name}</div>
      <div class="game-card__facility">${r.facility_name}</div>
      <div class="game-card__time-row">
        <div class="game-card__time-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${formatDateShort(r.date)}
        </div>
        <div class="game-card__time-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${r.start_label} – ${r.end_label}
        </div>
      </div>
      <div class="game-card__host">
        <div class="game-card__host-avatar">${r.creator_name.charAt(0)}</div>
        Hosted by <span class="game-card__host-name">${r.creator_name}</span>
      </div>
      <div class="game-card__meta-row">
        <span class="skill-badge skill-badge--${r.skill_level}">${getSkillLabel(r.skill_level)}</span>
        <span class="${spotsClass} spots-indicator">${spotsText}</span>
      </div>
      ${descHTML}
      <div class="game-card__actions">
        <button class="btn btn-primary btn-glow btn-sm" data-join-id="${r.id}" ${r.spots_remaining <= 0 ? 'disabled' : ''}>
          <span>${r.spots_remaining > 0 ? 'Join Game' : 'Game Full'}</span>
        </button>
        <button class="btn btn-outline btn-sm" data-detail-id="${r.id}">Details</button>
      </div>
    </div>`;
  }).join('');

  // Attach handlers
  dom.fpGamesGrid.querySelectorAll('[data-join-id]').forEach(btn => {
    btn.addEventListener('click', () => openJoinGameModal(parseInt(btn.dataset.joinId, 10)));
  });
  dom.fpGamesGrid.querySelectorAll('[data-detail-id]').forEach(btn => {
    btn.addEventListener('click', () => openGameDetailModal(parseInt(btn.dataset.detailId, 10)));
  });

  // Animate
  requestAnimationFrame(() => {
    if (window.gsap) {
      gsap.fromTo('.game-card',
        { opacity: 0, y: 20, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, stagger: 0.08, duration: 0.5, ease: 'power3.out' }
      );
    }
  });
}

function clearFPFilters() {
  dom.fpFilterSport.value = '';
  dom.fpFilterSkill.value = '';
  dom.fpFilterDate.value = '';
  loadOpenGames();
}

// ─── Create Player Request ───
function openCreatePRModal(bookingData) {
  state.fpCreateBookingId = bookingData.id;
  state.fpCreateBookingData = bookingData;

  dom.prBookingItems.innerHTML = `
    <div class="fp-booking-summary__item"><strong>Facility:</strong> ${bookingData.facility_name}</div>
    <div class="fp-booking-summary__item"><strong>Date:</strong> ${formatDate(bookingData.date)}</div>
    <div class="fp-booking-summary__item"><strong>Time:</strong> ${bookingData.label}</div>
  `;

  dom.prPlayersNeeded.value = 1;
  dom.prSkillLevel.value = 'any';
  dom.prDescription.value = '';
  dom.prCharCounter.textContent = '0 / 300';
  dom.prError.style.display = 'none';

  openModalOverlay(dom.createPRModalOverlay);
}

async function handleCreatePR(e) {
  e.preventDefault();
  dom.prError.style.display = 'none';

  const players_needed = parseInt(dom.prPlayersNeeded.value, 10);
  const skill_level = dom.prSkillLevel.value;
  const description = dom.prDescription.value.trim();

  if (!players_needed || players_needed < 1) {
    showFormError(dom.prError, 'Players needed must be at least 1.');
    return;
  }

  const data = await API.post('/api/player-requests', {
    booking_id: state.fpCreateBookingId,
    players_needed,
    skill_level,
    description
  });

  if (data._status === 201) {
    closeModal(dom.createPRModalOverlay);
    showToast('Player request published!');
    loadDashboard();
  } else {
    showFormError(dom.prError, data.error || 'Failed to create player request.');
  }
}

// ─── Join Game ───
async function openJoinGameModal(requestId) {
  if (!state.user) {
    openModalOverlay(dom.loginModalOverlay);
    return;
  }

  state.fpJoiningRequestId = requestId;

  // Fetch request details
  try {
    const data = await API.get(`/api/player-requests/${requestId}`);
    if (data.error) {
      showToastError(data.error);
      return;
    }
    state.fpJoiningData = data.request;

    dom.joinGameMeta.textContent = `${data.request.facility_emoji} ${data.request.facility_name}`;
    dom.joinGameDetails.innerHTML = `
      <div class="game-detail-info">
        <div class="game-detail-item">
          <div class="game-detail-item__label">Sport</div>
          <div class="game-detail-item__value">${data.request.sport_name}</div>
        </div>
        <div class="game-detail-item">
          <div class="game-detail-item__label">Date</div>
          <div class="game-detail-item__value">${formatDateShort(data.request.date)}</div>
        </div>
        <div class="game-detail-item">
          <div class="game-detail-item__label">Time</div>
          <div class="game-detail-item__value">${data.request.start_label} – ${data.request.end_label}</div>
        </div>
        <div class="game-detail-item">
          <div class="game-detail-item__label">Host</div>
          <div class="game-detail-item__value">${data.request.creator_name}</div>
        </div>
        <div class="game-detail-item">
          <div class="game-detail-item__label">Skill Level</div>
          <div class="game-detail-item__value">${getSkillLabel(data.request.skill_level)}</div>
        </div>
        <div class="game-detail-item">
          <div class="game-detail-item__label">Spots</div>
          <div class="game-detail-item__value">${data.request.spots_remaining} remaining</div>
        </div>
      </div>`;

    dom.joinConfirmView.style.display = 'block';
    dom.joinSuccessView.style.display = 'none';
    openModalOverlay(dom.joinGameModalOverlay);
  } catch (err) {
    showToastError('Failed to load game details.');
  }
}

async function handleJoinConfirm() {
  if (!state.fpJoiningRequestId) return;

  dom.btnConfirmJoin.disabled = true;
  dom.btnConfirmJoin.querySelector('span').textContent = 'Joining...';

  const data = await API.post(`/api/player-requests/${state.fpJoiningRequestId}/join`, {});

  dom.btnConfirmJoin.disabled = false;
  dom.btnConfirmJoin.querySelector('span').textContent = 'Confirm Join';

  if (data._status === 200) {
    // Show success view
    const r = state.fpJoiningData;
    dom.joinSuccessDetails.textContent = `${r.facility_name} · ${formatDateShort(r.date)} · ${r.start_label}`;
    dom.joinConfirmView.style.display = 'none';
    dom.joinSuccessView.style.display = 'block';

    // Refresh discovery
    if (state.fpActiveTab === 'discover') loadOpenGames();
  } else {
    closeModal(dom.joinGameModalOverlay);
    showToastError(data.error || 'Failed to join game.');
    loadOpenGames();
  }
}

// ─── Game Details Modal ───
async function openGameDetailModal(requestId) {
  try {
    const data = await API.get(`/api/player-requests/${requestId}`);
    if (data.error) {
      showToastError(data.error);
      return;
    }

    const r = data.request;
    const members = data.members || [];
    const isHost = data.is_host;
    const isMember = data.is_member;

    const membersHTML = members.length > 0
      ? `<div class="members-list">
          ${members.map(m => `
            <div class="member-row">
              <div class="member-row__avatar">${m.name.charAt(0)}</div>
              <span class="member-row__name">${m.name}</span>
              ${m.user_id === r.creator_user_id ? '<span class="member-row__badge">Host</span>' : ''}
            </div>
          `).join('')}
         </div>`
      : '<p style="color:var(--text-muted); font-size:0.85rem;">No players have joined yet.</p>';

    let actionsHTML = '';
    if (isHost) {
      actionsHTML = `
        <div style="display:flex; gap:10px; margin-top:20px;">
          ${r.status === 'OPEN' || r.status === 'FILLED' ? `<button class="btn btn-outline btn-sm" id="gdEditBtn" data-pr-id="${r.id}">Edit Request</button>` : ''}
          ${r.status === 'OPEN' || r.status === 'FILLED' ? `<button class="btn btn-danger btn-sm" id="gdCloseBtn" data-pr-id="${r.id}">Close Request</button>` : ''}
        </div>`;
    } else if (isMember) {
      actionsHTML = `
        <div style="margin-top:20px;">
          <button class="btn btn-danger btn-sm" id="gdLeaveBtn" data-pr-id="${r.id}">Leave Game</button>
        </div>`;
    } else if (r.status === 'OPEN' && r.spots_remaining > 0) {
      actionsHTML = `
        <div style="margin-top:20px;">
          <button class="btn btn-primary btn-glow btn-sm" id="gdJoinBtn" data-pr-id="${r.id}">Join Game</button>
        </div>`;
    }

    const statusClass = `status-badge--${r.status.toLowerCase()}`;
    const descHTML = r.description ? `
      <div class="game-detail-section">
        <div class="game-detail-section__title">Message from Host</div>
        <div class="game-card__description">"${r.description}"</div>
      </div>` : '';

    dom.gameDetailContent.innerHTML = `
      <div class="modal-header">
        <span class="modal-icon">${r.facility_emoji}</span>
        <h3 id="gameDetailTitle">${r.sport_name}</h3>
        <p class="modal-meta">${r.facility_name}</p>
      </div>

      <div style="display:flex; align-items:center; gap:8px; margin-bottom:20px;">
        <span class="status-badge ${statusClass}">${r.status}</span>
        <span class="skill-badge skill-badge--${r.skill_level}">${getSkillLabel(r.skill_level)}</span>
        <span class="spots-indicator ${r.spots_remaining > 0 ? 'spots-indicator--open' : 'spots-indicator--full'}">
          ${r.spots_remaining > 0 ? r.spots_remaining + ' spot' + (r.spots_remaining > 1 ? 's' : '') + ' left' : 'Game full'}
        </span>
      </div>

      <div class="game-detail-section">
        <div class="game-detail-section__title">Game Info</div>
        <div class="game-detail-info">
          <div class="game-detail-item">
            <div class="game-detail-item__label">Date</div>
            <div class="game-detail-item__value">${formatDateShort(r.date)}</div>
          </div>
          <div class="game-detail-item">
            <div class="game-detail-item__label">Time</div>
            <div class="game-detail-item__value">${r.start_label} – ${r.end_label}</div>
          </div>
          <div class="game-detail-item">
            <div class="game-detail-item__label">Host</div>
            <div class="game-detail-item__value">${r.creator_name}</div>
          </div>
          <div class="game-detail-item">
            <div class="game-detail-item__label">Players</div>
            <div class="game-detail-item__value">${r.joined_count} / ${r.players_needed}</div>
          </div>
        </div>
      </div>

      ${descHTML}

      <div class="game-detail-section">
        <div class="game-detail-section__title">Players (${r.joined_count})</div>
        ${membersHTML}
      </div>

      ${actionsHTML}
    `;

    openModalOverlay(dom.gameDetailModalOverlay);

    // Attach action handlers after rendering
    const editBtn = document.getElementById('gdEditBtn');
    const closeBtn = document.getElementById('gdCloseBtn');
    const leaveBtn = document.getElementById('gdLeaveBtn');
    const joinBtn = document.getElementById('gdJoinBtn');

    if (editBtn) editBtn.addEventListener('click', () => {
      closeModal(dom.gameDetailModalOverlay);
      openEditPRModal(r);
    });
    if (closeBtn) closeBtn.addEventListener('click', async () => {
      if (!confirm('Close this player request? It will no longer appear in discovery.')) return;
      const res = await API.post(`/api/player-requests/${r.id}/close`, {});
      if (res._status === 200) {
        closeModal(dom.gameDetailModalOverlay);
        showToast('Player request closed.');
        loadOpenGames();
        if (state.fpActiveTab === 'mygames') loadMyGames();
      } else {
        showToastError(res.error || 'Failed to close request.');
      }
    });
    if (leaveBtn) leaveBtn.addEventListener('click', async () => {
      if (!confirm('Leave this game? Your spot will become available to another resident.')) return;
      const res = await API.post(`/api/player-requests/${r.id}/leave`, {});
      if (res._status === 200) {
        closeModal(dom.gameDetailModalOverlay);
        showToast('You have left the game.');
        loadOpenGames();
        if (state.fpActiveTab === 'mygames') loadMyGames();
      } else {
        showToastError(res.error || 'Failed to leave game.');
      }
    });
    if (joinBtn) joinBtn.addEventListener('click', () => {
      closeModal(dom.gameDetailModalOverlay);
      openJoinGameModal(r.id);
    });

  } catch (err) {
    console.error('Failed to load game details:', err);
    showToastError('Failed to load game details.');
  }
}

// ─── Edit Player Request ───
function openEditPRModal(requestData) {
  dom.editPRId.value = requestData.id;
  dom.editPRPlayersNeeded.value = requestData.players_needed;
  dom.editPRSkillLevel.value = requestData.skill_level;
  dom.editPRDescription.value = requestData.description || '';
  dom.editPRCharCounter.textContent = `${(requestData.description || '').length} / 300`;
  dom.editPRError.style.display = 'none';
  openModalOverlay(dom.editPRModalOverlay);
}

async function handleEditPR(e) {
  e.preventDefault();
  dom.editPRError.style.display = 'none';

  const id = parseInt(dom.editPRId.value, 10);
  const players_needed = parseInt(dom.editPRPlayersNeeded.value, 10);
  const skill_level = dom.editPRSkillLevel.value;
  const description = dom.editPRDescription.value.trim();

  const data = await API.put(`/api/player-requests/${id}`, {
    players_needed,
    skill_level,
    description
  });

  if (data._status === 200) {
    closeModal(dom.editPRModalOverlay);
    showToast('Player request updated.');
    loadOpenGames();
    if (state.fpActiveTab === 'mygames') loadMyGames();
  } else {
    showFormError(dom.editPRError, data.error || 'Failed to update request.');
  }
}

// ─── My Games ───
async function loadMyGames() {
  try {
    const data = await API.get('/api/player-requests/my-games');
    const hosted = data.hosted || [];
    const joined = data.joined || [];

    renderMyGames(state.fpMyGamesTab === 'hosted' ? hosted : joined, state.fpMyGamesTab);
  } catch (err) {
    console.error('Failed to load my games:', err);
  }
}

function renderMyGames(games, type) {
  if (games.length === 0) {
    dom.fpMyGamesGrid.innerHTML = `
      <div class="fp-empty">
        <div class="fp-empty__icon">${type === 'hosted' ? '🏆' : '🎮'}</div>
        <h3>${type === 'hosted' ? 'No hosted games' : 'No joined games'}</h3>
        <p>${type === 'hosted' ? 'Create a player request from your sports bookings.' : 'Browse open games and join one!'}</p>
      </div>`;
    return;
  }

  dom.fpMyGamesGrid.innerHTML = games.map(g => {
    const statusClass = `status-badge--${g.status.toLowerCase()}`;
    const hostInfo = type === 'joined' ? `
      <div class="game-card__host">
        <div class="game-card__host-avatar">${g.creator_name.charAt(0)}</div>
        Hosted by <span class="game-card__host-name">${g.creator_name}</span>
      </div>` : '';

    return `
    <div class="game-card" data-request-id="${g.id}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div class="game-card__sport-badge">${g.facility_emoji} ${g.sport_name}</div>
        <span class="status-badge ${statusClass}">${g.status}</span>
      </div>
      <div class="game-card__facility">${g.facility_name}</div>
      <div class="game-card__time-row">
        <div class="game-card__time-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${formatDateShort(g.date)}
        </div>
        <div class="game-card__time-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${g.start_label} – ${g.end_label}
        </div>
      </div>
      ${hostInfo}
      <div class="game-card__meta-row">
        <span class="skill-badge skill-badge--${g.skill_level}">${getSkillLabel(g.skill_level)}</span>
        <span class="spots-indicator ${g.spots_remaining > 0 ? 'spots-indicator--open' : 'spots-indicator--full'}">
          ${g.joined_count} / ${g.players_needed} players
        </span>
      </div>
      <div class="game-card__actions">
        <button class="btn btn-outline btn-sm" data-detail-id="${g.id}">View Details</button>
      </div>
    </div>`;
  }).join('');

  // Attach handlers
  dom.fpMyGamesGrid.querySelectorAll('[data-detail-id]').forEach(btn => {
    btn.addEventListener('click', () => openGameDetailModal(parseInt(btn.dataset.detailId, 10)));
  });

  // Animate
  requestAnimationFrame(() => {
    if (window.gsap) {
      gsap.fromTo('.my-games-grid .game-card',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' }
      );
    }
  });
}


// ─────────────────────────────────────────────
//  EVENT BINDING
// ─────────────────────────────────────────────
function bindEvents() {
  // Day tab switching
  dom.tabToday.addEventListener('click', () => switchDay('today'));
  dom.tabTomorrow.addEventListener('click', () => switchDay('tomorrow'));

  // Back button
  dom.btnBack.addEventListener('click', closeSchedule);

  // Booking confirmation modal
  dom.modalClose.addEventListener('click', () => closeModal(dom.modalOverlay));
  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) closeModal(dom.modalOverlay);
  });
  dom.btnConfirmBooking.addEventListener('click', handleBookingConfirm);

  // Unit selection modal
  dom.unitModalClose.addEventListener('click', () => closeModal(dom.unitModalOverlay));
  dom.unitModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.unitModalOverlay) closeModal(dom.unitModalOverlay);
  });

  // Login modal
  dom.loginModalClose.addEventListener('click', () => closeModal(dom.loginModalOverlay));
  dom.loginModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.loginModalOverlay) closeModal(dom.loginModalOverlay);
  });
  dom.loginForm.addEventListener('submit', handleLogin);

  // Register modal
  dom.registerModalClose.addEventListener('click', () => closeModal(dom.registerModalOverlay));
  dom.registerModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.registerModalOverlay) closeModal(dom.registerModalOverlay);
  });
  dom.registerForm.addEventListener('submit', handleRegister);

  // Google Sign-In buttons (both modals use the same handler)
  document.getElementById('btnGoogleLogin').addEventListener('click', handleGoogleAuth);
  document.getElementById('btnGoogleRegister').addEventListener('click', handleGoogleAuth);

  // QR Gate Pass modal
  dom.qrModalClose.addEventListener('click', () => {
    closeModal(dom.qrModalOverlay);
    // Kill any running GSAP animation on the QR wrap
    if (window.gsap) gsap.killTweensOf('.qr-image-wrap');
  });
  dom.qrModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.qrModalOverlay) {
      closeModal(dom.qrModalOverlay);
      if (window.gsap) gsap.killTweensOf('.qr-image-wrap');
    }
  });

  // Auth navigation buttons
  $('#btnOpenLogin').addEventListener('click', () => {
    openModalOverlay(dom.loginModalOverlay);
  });
  $('#btnOpenRegister').addEventListener('click', () => {
    openModalOverlay(dom.registerModalOverlay);
  });

  // Switch between login/register modals
  $('#switchToRegister').addEventListener('click', () => {
    closeModal(dom.loginModalOverlay);
    setTimeout(() => openModalOverlay(dom.registerModalOverlay), 200);
  });
  $('#switchToLogin').addEventListener('click', () => {
    closeModal(dom.registerModalOverlay);
    setTimeout(() => openModalOverlay(dom.loginModalOverlay), 200);
  });

  // User avatar dropdown
  dom.userAvatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.userDropdown.classList.toggle('open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    closeUserDropdown();
  });

  // Logout
  $('#btnLogout').addEventListener('click', handleLogout);

  // Dashboard link
  $('#dropdownDashboard').addEventListener('click', (e) => {
    e.preventDefault();
    closeUserDropdown();
    loadDashboard();
  });

  dom.navDashboardLink.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    loadDashboard();
  });

  // Find Players nav link
  dom.navFindPlayersLink.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    dom.hamburger.classList.remove('open');
    dom.navLinks.classList.remove('mobile-open');
    openFindPlayers();
  });

  // ─── Find Players Events ───
  dom.fpTabDiscover.addEventListener('click', () => switchFPTab('discover'));
  dom.fpTabMyGames.addEventListener('click', () => switchFPTab('mygames'));

  // My Games sub-tabs
  dom.fpMgHosted.addEventListener('click', () => {
    state.fpMyGamesTab = 'hosted';
    dom.fpMgHosted.classList.add('active');
    dom.fpMgJoined.classList.remove('active');
    loadMyGames();
  });
  dom.fpMgJoined.addEventListener('click', () => {
    state.fpMyGamesTab = 'joined';
    dom.fpMgJoined.classList.add('active');
    dom.fpMgHosted.classList.remove('active');
    loadMyGames();
  });

  // Filters
  dom.fpFilterSport.addEventListener('change', loadOpenGames);
  dom.fpFilterSkill.addEventListener('change', loadOpenGames);
  dom.fpFilterDate.addEventListener('change', loadOpenGames);
  dom.fpClearFilters.addEventListener('click', clearFPFilters);

  // Create Player Request modal
  dom.createPRModalClose.addEventListener('click', () => closeModal(dom.createPRModalOverlay));
  dom.createPRModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.createPRModalOverlay) closeModal(dom.createPRModalOverlay);
  });
  dom.createPRForm.addEventListener('submit', handleCreatePR);
  dom.prDescription.addEventListener('input', () => {
    dom.prCharCounter.textContent = `${dom.prDescription.value.length} / 300`;
  });

  // Join Game modal
  dom.joinGameModalClose.addEventListener('click', () => closeModal(dom.joinGameModalOverlay));
  dom.joinGameModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.joinGameModalOverlay) closeModal(dom.joinGameModalOverlay);
  });
  dom.btnConfirmJoin.addEventListener('click', handleJoinConfirm);
  dom.btnCancelJoin.addEventListener('click', () => closeModal(dom.joinGameModalOverlay));
  dom.btnViewGameAfterJoin.addEventListener('click', () => {
    closeModal(dom.joinGameModalOverlay);
    if (state.fpJoiningRequestId) openGameDetailModal(state.fpJoiningRequestId);
  });
  dom.btnViewBookingsAfterJoin.addEventListener('click', () => {
    closeModal(dom.joinGameModalOverlay);
    loadDashboard();
  });

  // Game Detail modal
  dom.gameDetailModalClose.addEventListener('click', () => closeModal(dom.gameDetailModalOverlay));
  dom.gameDetailModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.gameDetailModalOverlay) closeModal(dom.gameDetailModalOverlay);
  });

  // Edit PR modal
  dom.editPRModalClose.addEventListener('click', () => closeModal(dom.editPRModalOverlay));
  dom.editPRModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.editPRModalOverlay) closeModal(dom.editPRModalOverlay);
  });
  dom.editPRForm.addEventListener('submit', handleEditPR);
  dom.editPRDescription.addEventListener('input', () => {
    dom.editPRCharCounter.textContent = `${dom.editPRDescription.value.length} / 300`;
  });

  // Global Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });
}

function switchDay(day) {
  state.activeDay = day;
  state.selectedSlot = null;

  dom.tabToday.classList.toggle('active', day === 'today');
  dom.tabTomorrow.classList.toggle('active', day === 'tomorrow');

  fetchAndRenderSlots();
}


// ─────────────────────────────────────────────
//  SPOTLIGHT CARD — Mouse-tracking reveal effect
// ─────────────────────────────────────────────
function initSpotlightCards() {
  const cards = $$('.facility-card');
  cards.forEach((card) => {
    // Prevent duplicate listeners by marking
    if (card._spotlightBound) return;
    card._spotlightBound = true;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });

    card.addEventListener('mouseleave', () => {
      // Reset to center so the pseudo-element fades gracefully
      card.style.setProperty('--mouse-x', '50%');
      card.style.setProperty('--mouse-y', '50%');
    });
  });
}



// ─────────────────────────────────────────────
//  REAL-TIME SLOTS — SSE (Server-Sent Events)
// ─────────────────────────────────────────────
function initLiveSlots() {
  // Graceful check — SSE not supported in all environments
  if (typeof EventSource === 'undefined') return;

  let evtSource = null;

  function connect() {
    evtSource = new EventSource('/api/stream/slots');

    evtSource.onopen = () => {
      // Show the live badge when connected
      if (dom.liveBadge) dom.liveBadge.style.display = 'inline-flex';
    };

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.updated) {
          // Re-fetch slots if schedule view is visible
          if (dom.scheduleHeader && dom.scheduleHeader.style.display !== 'none' && state.activeUnit) {
            fetchAndRenderSlots();
          }

          // Handle player request SSE events
          if (data.type === 'player_request') {
            // Refresh find players page if visible
            if (dom.findPlayersSection && dom.findPlayersSection.style.display !== 'none') {
              if (state.fpActiveTab === 'discover') {
                loadOpenGames();
              } else {
                loadMyGames();
              }
            }
          }

          // If a booking was cancelled, refresh dashboard if visible
          if (data.type === 'booking_cancelled') {
            if (dom.dashboardSection && dom.dashboardSection.style.display !== 'none') {
              loadDashboard();
            }
          }
        }
      } catch (err) {
        console.warn('[SSE] Failed to parse message:', err);
      }
    };

    evtSource.onerror = () => {
      // Hide live badge on error
      if (dom.liveBadge) dom.liveBadge.style.display = 'none';
      // EventSource auto-reconnects, but close if readyState is CLOSED
      if (evtSource.readyState === EventSource.CLOSED) {
        evtSource.close();
        // Retry connection after 5 seconds
        setTimeout(connect, 5000);
      }
    };
  }

  connect();
}


// ─────────────────────────────────────────────
//  INITIALISATION
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  bindEvents();
  initNavbarScroll();
  initActiveNavLink();
  initHamburger();
  // Check auth session
  await checkAuth();

  // Load facilities from API (also initialises spotlight cards)
  await loadFacilities();

  // Wait for GSAP to load (deferred script)
  const gsapReady = setInterval(() => {
    if (window.gsap && window.ScrollTrigger) {
      clearInterval(gsapReady);
      initGSAPAnimations();
    }
  }, 50);
});

// Expose scroll function globally for inline onclick handlers
window.scrollToSection = scrollToSection;
window.clearFPFilters = clearFPFilters;
