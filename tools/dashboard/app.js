/* ===================================================================
   SECOND BRAIN INTRANET — app.js
   Multi-page SPA with hash routing, data fetching, voice input
   =================================================================== */

const API = '';
const REFRESH_INTERVAL = 60_000;

// --- State ---
let dashboardData = null;
let notesData = null;
let booksData = null;
let moviesData = null;
let recipesData = null;
let reviewData = null;
let refreshTimer = null;
let isListening = false;
let currentPage = 'home';
let notesFilter = 'all';
let notesQuery = '';
let libraryTab = 'books';

// --- DOM Refs ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initRouter();
  setupEventListeners();
  startAutoRefresh();
});

// =====================================================================
//  ROUTER
// =====================================================================

function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const hash = (window.location.hash || '#home').slice(1);
  navigateTo(hash);
}

function navigateTo(page) {
  currentPage = page;

  // Update page visibility
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) target.classList.add('active');

  // Update nav items
  $$('.nav-item, .tab-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Load data for the page
  loadPageData(page);
}

function loadPageData(page) {
  switch (page) {
    case 'home':
      setDateDisplay();
      loadDashboard();
      break;
    case 'notes':
      loadNotes();
      break;
    case 'library':
      loadLibraryTab(libraryTab);
      break;
    case 'review':
      loadReview();
      break;
  }
}

// =====================================================================
//  THEME
// =====================================================================

function initTheme() {
  const saved = localStorage.getItem('sb-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sb-theme', next);
}

// =====================================================================
//  HOME PAGE
// =====================================================================

function setDateDisplay() {
  const el = $('#dateDisplay');
  const greet = $('#greeting');
  if (!el) return;

  const now = new Date();
  el.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const hour = now.getHours();
  if (greet) {
    if (hour < 12) greet.textContent = 'Good morning';
    else if (hour < 17) greet.textContent = 'Good afternoon';
    else greet.textContent = 'Good evening';
  }
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/dashboard`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dashboardData = await res.json();
    renderDashboard(dashboardData);
    hideError();
  } catch (err) {
    console.error('Dashboard load failed:', err);
    showError();
  }
}

function renderDashboard(data) {
  const statToday = $('#statToday');
  const statOverdue = $('#statOverdue');
  const statUpcoming = $('#statUpcoming');
  const statInbox = $('#statInbox');

  if (statToday) statToday.textContent = data.counts.today;
  if (statOverdue) statOverdue.textContent = data.counts.overdue;
  if (statUpcoming) statUpcoming.textContent = data.counts.upcoming;
  if (statInbox) statInbox.textContent = data.counts.inbox;

  // Animate stats
  [statToday, statOverdue, statUpcoming, statInbox].filter(Boolean).forEach(el => {
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = '';
  });

  renderTaskList($('#todayTasks'), data.today_tasks, 'today', data.date);
  const todayCount = $('#todayCount');
  if (todayCount) todayCount.textContent = data.counts.today;

  renderTaskList($('#upcomingTasks'), data.upcoming_tasks, 'upcoming', data.date);
  const upcomingCount = $('#upcomingCount');
  if (upcomingCount) upcomingCount.textContent = data.counts.upcoming;

  renderProjects(data.active_projects);
  const projectsCount = $('#projectsCount');
  if (projectsCount) projectsCount.textContent = data.counts.projects;
}

function renderTaskList(container, tasks, scope, todayDate) {
  if (!container) return;

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${scope === 'today' ? '☀️' : '📅'}</div>
        ${scope === 'today' ? 'Nothing due today — enjoy the calm' : 'Clear skies ahead this week'}
      </div>`;
    return;
  }

  container.innerHTML = tasks.map((task, i) => {
    const urgency = getUrgency(task, todayDate, scope);
    const dateLabel = formatDate(task.due_date);

    return `
      <div class="task-item task-item--${urgency}" data-id="${task.id}" style="animation-delay: ${i * 0.04}s">
        <div class="task-check" data-task-id="${task.id}" role="checkbox" aria-label="Complete task" tabindex="0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
        </div>
        <div class="task-body">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${dateLabel ? `<span class="task-date">${dateLabel}</span>` : ''}
            ${task.priority ? `<span class="task-priority">${escapeHtml(task.priority)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function getUrgency(task, todayDate, scope) {
  if (scope === 'upcoming') return 'upcoming';
  if (!task.due_date) return 'today';
  if (task.due_date < todayDate) return 'overdue';
  return 'today';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = Math.round((date - today) / 86400000);

  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  if (diff < -1) return `${Math.abs(diff)} days overdue`;

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderProjects(projects) {
  const container = $('#projectsList');
  if (!container) return;

  if (!projects || projects.length === 0) {
    container.innerHTML = '<div class="empty-state">No active projects</div>';
    return;
  }

  container.innerHTML = projects.map(p => `
    <a class="project-chip" href="${p.url || '#'}" target="_blank" rel="noopener">
      <span class="project-dot"></span>
      ${escapeHtml(p.title)}
    </a>
  `).join('');
}

// =====================================================================
//  NOTES PAGE
// =====================================================================

async function loadNotes() {
  const container = $('#notesList');
  if (!container) return;

  const params = new URLSearchParams();
  if (notesQuery) {
    params.set('q', notesQuery);
  } else if (notesFilter !== 'all') {
    params.set('filter', notesFilter === 'favorites' ? 'favorites' : notesFilter);
  }

  try {
    const res = await fetch(`${API}/api/notes?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    notesData = await res.json();
    renderNotes(notesData.notes);
  } catch (err) {
    console.error('Notes load failed:', err);
    container.innerHTML = '<div class="empty-state">Failed to load notes</div>';
  }
}

function renderNotes(notes) {
  const container = $('#notesList');
  if (!container) return;

  if (!notes || notes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        No notes found
      </div>`;
    return;
  }

  container.innerHTML = notes.map((note, i) => {
    const typeClass = note.type ? `note-type--${note.type.toLowerCase().replace(/\s+/g, '-')}` : '';
    const dateLabel = note.note_date ? formatDate(note.note_date) : '';

    return `
      <a class="note-item" href="${note.url || '#'}" target="_blank" rel="noopener" style="animation-delay: ${i * 0.03}s">
        <div class="note-header">
          ${note.type ? `<span class="note-type ${typeClass}">${escapeHtml(note.type)}</span>` : ''}
          ${note.favorite ? '<span class="note-fav">★</span>' : ''}
        </div>
        <div class="note-title">${escapeHtml(note.title)}</div>
        ${dateLabel ? `<div class="note-date">${dateLabel}</div>` : ''}
      </a>`;
  }).join('');
}

// =====================================================================
//  LIBRARY PAGE
// =====================================================================

function loadLibraryTab(tab) {
  libraryTab = tab;

  // Toggle panel visibility
  $$('.library-panel').forEach(p => p.classList.remove('active'));
  const panel = $(`#lib-${tab}`);
  if (panel) panel.classList.add('active');

  // Toggle tab buttons
  $$('.lib-tab').forEach(t => t.classList.toggle('active', t.dataset.lib === tab));

  switch (tab) {
    case 'books': loadBooks(); break;
    case 'movies': loadMovies(); break;
    case 'recipes': loadRecipes(); break;
  }
}

async function loadBooks() {
  try {
    const res = await fetch(`${API}/api/books`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    booksData = await res.json();
    renderBooks(booksData);
  } catch (err) {
    console.error('Books load failed:', err);
    $('#currentlyReading').innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

function renderBooks(data) {
  const reading = $('#currentlyReading');
  const all = $('#allBooks');

  if (reading) {
    if (data.currently_reading.length === 0) {
      reading.innerHTML = '<div class="empty-state">Nothing in progress</div>';
    } else {
      reading.innerHTML = data.currently_reading.map(b => renderBookCard(b)).join('');
    }
  }

  if (all) {
    if (data.all_books.length === 0) {
      all.innerHTML = '<div class="empty-state">No books yet</div>';
    } else {
      all.innerHTML = data.all_books.map(b => renderBookRow(b)).join('');
    }
  }
}

function renderBookCard(book) {
  return `
    <a class="lib-card" href="${book.url || '#'}" target="_blank" rel="noopener">
      <div class="lib-card-title">${escapeHtml(book.title)}</div>
      <div class="lib-card-meta">${escapeHtml(book.author || '')}</div>
      ${book.rating ? `<div class="lib-card-rating">${escapeHtml(book.rating)}</div>` : ''}
    </a>`;
}

function renderBookRow(book) {
  const statusClass = book.status ? `status--${book.status.toLowerCase().replace(/\s+/g, '-')}` : '';
  return `
    <a class="lib-row" href="${book.url || '#'}" target="_blank" rel="noopener">
      <div class="lib-row-main">
        <span class="lib-row-title">${escapeHtml(book.title)}</span>
        <span class="lib-row-sub">${escapeHtml(book.author || '')}</span>
      </div>
      <span class="lib-row-status ${statusClass}">${escapeHtml(book.status || '')}</span>
    </a>`;
}

async function loadMovies() {
  try {
    const res = await fetch(`${API}/api/movies`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    moviesData = await res.json();
    renderMovies(moviesData);
  } catch (err) {
    console.error('Movies load failed:', err);
    $('#movieWatchlist').innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

function renderMovies(data) {
  const watchlist = $('#movieWatchlist');
  const all = $('#allMovies');

  if (watchlist) {
    if (data.watchlist.length === 0) {
      watchlist.innerHTML = '<div class="empty-state">Watchlist empty</div>';
    } else {
      watchlist.innerHTML = data.watchlist.map(m => `
        <a class="lib-card" href="${m.url || '#'}" target="_blank" rel="noopener">
          <div class="lib-card-title">${escapeHtml(m.title)}</div>
          <div class="lib-card-meta">${escapeHtml(m.director || '')}</div>
          ${m.type ? `<div class="lib-card-type">${escapeHtml(m.type)}</div>` : ''}
        </a>`).join('');
    }
  }

  if (all) {
    if (data.all_movies.length === 0) {
      all.innerHTML = '<div class="empty-state">No movies yet</div>';
    } else {
      all.innerHTML = data.all_movies.map(m => {
        const statusClass = m.status ? `status--${m.status.toLowerCase().replace(/\s+/g, '-')}` : '';
        return `
          <a class="lib-row" href="${m.url || '#'}" target="_blank" rel="noopener">
            <div class="lib-row-main">
              <span class="lib-row-title">${escapeHtml(m.title)}</span>
              <span class="lib-row-sub">${escapeHtml(m.director || '')}</span>
            </div>
            <span class="lib-row-status ${statusClass}">${escapeHtml(m.status || '')}</span>
          </a>`;
      }).join('');
    }
  }
}

async function loadRecipes() {
  try {
    const res = await fetch(`${API}/api/recipes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    recipesData = await res.json();
    renderRecipes(recipesData.recipes);
  } catch (err) {
    console.error('Recipes load failed:', err);
    $('#allRecipes').innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

function renderRecipes(recipes) {
  const container = $('#allRecipes');
  if (!container) return;

  if (!recipes || recipes.length === 0) {
    container.innerHTML = '<div class="empty-state">No recipes yet</div>';
    return;
  }

  container.innerHTML = recipes.map(r => `
    <a class="lib-card" href="${r.source_url || r.url || '#'}" target="_blank" rel="noopener">
      <div class="lib-card-title">${escapeHtml(r.title)}</div>
      ${r.chef ? `<div class="lib-card-meta">${escapeHtml(r.chef)}</div>` : ''}
      ${r.favorite ? '<div class="lib-card-rating">★ Favorite</div>' : ''}
    </a>`).join('');
}

// =====================================================================
//  REVIEW PAGE
// =====================================================================

async function loadReview() {
  setReviewDateRange();

  try {
    const res = await fetch(`${API}/api/review`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    reviewData = await res.json();
    renderReview(reviewData);
  } catch (err) {
    console.error('Review load failed:', err);
    $('#completedTasks').innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

function setReviewDateRange() {
  const el = $('#reviewDateRange');
  if (!el) return;

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  el.textContent = `${fmt(monday)} — ${fmt(sunday)}`;
}

function renderReview(data) {
  renderReviewList($('#completedTasks'), data.completed, 'completed');
  renderReviewList($('#carryOverTasks'), data.carry_over, 'carry-over');
  renderReviewList($('#nextWeekTasks'), data.next_week, 'next-week');

  const cc = $('#completedCount');
  const co = $('#carryOverCount');
  const nw = $('#nextWeekCount');
  if (cc) cc.textContent = data.counts.completed;
  if (co) co.textContent = data.counts.carry_over;
  if (nw) nw.textContent = data.counts.next_week;
}

function renderReviewList(container, tasks, type) {
  if (!container) return;

  if (!tasks || tasks.length === 0) {
    const msgs = {
      'completed': 'No tasks completed yet this week',
      'carry-over': 'Nothing carrying over — clean slate',
      'next-week': 'Nothing scheduled for next week',
    };
    container.innerHTML = `<div class="empty-state">${msgs[type] || 'None'}</div>`;
    return;
  }

  container.innerHTML = tasks.map((task, i) => {
    const dateLabel = formatDate(task.due_date);
    const isDone = type === 'completed';

    return `
      <div class="review-item ${isDone ? 'review-item--done' : ''}" style="animation-delay: ${i * 0.03}s">
        <div class="review-item-icon">${isDone ? '✓' : '○'}</div>
        <div class="review-item-body">
          <div class="review-item-title">${escapeHtml(task.title)}</div>
          ${dateLabel ? `<div class="review-item-date">${dateLabel}</div>` : ''}
        </div>
        ${task.priority ? `<span class="review-item-priority">${escapeHtml(task.priority)}</span>` : ''}
      </div>`;
  }).join('');
}

// =====================================================================
//  TASK COMPLETION
// =====================================================================

async function handleTaskComplete(taskId, element) {
  const checkbox = element.querySelector('.task-check') || element;
  const taskItem = checkbox.closest('.task-item');
  if (!taskItem) return;

  checkbox.classList.add('checked');
  taskItem.classList.add('completing');

  try {
    const res = await fetch(`${API}/api/tasks/${taskId}?action=complete`, { method: 'PATCH' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    setTimeout(() => {
      taskItem.classList.add('completed-anim');
      showToast('Task completed', '✓');

      setTimeout(() => {
        taskItem.remove();
        loadDashboard();
      }, 500);
    }, 300);

  } catch (err) {
    checkbox.classList.remove('checked');
    taskItem.classList.remove('completing');
    showToast('Failed to complete task', '⚠');
  }
}

// =====================================================================
//  CAPTURE
// =====================================================================

async function handleCapture(text) {
  if (!text.trim()) return;

  const input = $('#captureInput');
  input.value = '';
  input.focus();

  try {
    const res = await fetch(`${API}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    showToast('Captured', '📥');
    _invalidateAndRefresh();
  } catch (err) {
    showToast('Failed to capture', '⚠');
  }
}

async function handleCreateTask(title) {
  if (!title.trim()) return;

  try {
    const res = await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    showToast('Task added', '✓');
    _invalidateAndRefresh();
  } catch (err) {
    showToast('Failed to add task', '⚠');
  }
}

function _invalidateAndRefresh() {
  setTimeout(() => loadPageData(currentPage), 500);
}

// =====================================================================
//  VOICE INPUT
// =====================================================================

let recognition = null;

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const mic = $('#micBtn');
    if (mic) mic.style.display = 'none';
    return null;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    stopListening();

    const input = $('#captureInput');
    if (input) input.value = transcript;

    try {
      const res = await fetch(`${API}/api/voice/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const parsed = await res.json();
      await executeVoiceAction(parsed);
    } catch (err) {
      showToast('Could not parse — kept as text', '🎤');
    }
  };

  rec.onerror = () => {
    stopListening();
    showToast('Voice not recognized — try again', '🎤');
  };

  rec.onend = () => stopListening();

  return rec;
}

async function executeVoiceAction(parsed) {
  const { action, params } = parsed;
  const input = $('#captureInput');

  switch (action) {
    case 'create_task':
      if (input) input.value = '';
      await handleCreateTask(params.title);
      break;
    case 'capture':
      if (input) input.value = '';
      await handleCapture(params.text);
      break;
    case 'query_today':
      if (input) input.value = '';
      showToast(`${dashboardData?.counts?.today || 0} tasks today`, '📋');
      break;
    case 'query_upcoming':
      if (input) input.value = '';
      showToast(`${dashboardData?.counts?.upcoming || 0} upcoming this week`, '📅');
      break;
    case 'query_projects':
      if (input) input.value = '';
      showToast(`${dashboardData?.counts?.projects || 0} active projects`, '🎯');
      const pl = $('#projectsList');
      const pt = $('#projectsToggle');
      if (pl) pl.classList.remove('collapsed');
      if (pt) pt.classList.remove('is-collapsed');
      break;
    case 'complete_task': {
      if (input) input.value = '';
      const search = params.search?.toLowerCase();
      const match = dashboardData?.today_tasks?.find(t =>
        t.title.toLowerCase().includes(search)
      );
      if (match) {
        const el = document.querySelector(`[data-id="${match.id}"]`);
        if (el) await handleTaskComplete(match.id, el);
      } else {
        showToast(`Couldn't find task matching "${params.search}"`, '⚠');
      }
      break;
    }
    default:
      showToast('Couldn\'t understand — edit and send', '🎤');
      if (input) input.focus();
  }
}

function startListening() {
  if (!recognition) recognition = initVoice();
  if (!recognition) return;

  try {
    recognition.start();
    isListening = true;
    const mic = $('#micBtn');
    if (mic) mic.classList.add('listening');
  } catch (err) {}
}

function stopListening() {
  isListening = false;
  const mic = $('#micBtn');
  if (mic) mic.classList.remove('listening');
  try { recognition?.stop(); } catch {}
}

// =====================================================================
//  TOAST & ERROR
// =====================================================================

function showToast(message, icon = '✓') {
  const container = $('#toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon">${icon}</span> ${escapeHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function showError() {
  const el = $('#errorBanner');
  if (el) el.classList.remove('hidden');
}

function hideError() {
  const el = $('#errorBanner');
  if (el) el.classList.add('hidden');
}

// =====================================================================
//  AUTO REFRESH
// =====================================================================

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadPageData(currentPage);
    if (currentPage === 'home') setDateDisplay();
  }, REFRESH_INTERVAL);
}

// =====================================================================
//  EVENT LISTENERS
// =====================================================================

function setupEventListeners() {
  // Theme toggle
  const themeToggle = $('#themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Projects collapse toggle
  const projectsToggle = $('#projectsToggle');
  if (projectsToggle) {
    projectsToggle.addEventListener('click', () => {
      const pl = $('#projectsList');
      if (pl) pl.classList.toggle('collapsed');
      projectsToggle.classList.toggle('is-collapsed');
    });
  }

  // Task checkboxes (delegated)
  document.addEventListener('click', (e) => {
    const check = e.target.closest('.task-check');
    if (check) {
      e.preventDefault();
      const taskId = check.dataset.taskId;
      if (taskId) handleTaskComplete(taskId, check);
    }
  });

  // Keyboard on checkboxes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const check = e.target.closest('.task-check');
      if (check) {
        e.preventDefault();
        const taskId = check.dataset.taskId;
        if (taskId) handleTaskComplete(taskId, check);
      }
    }
  });

  // Capture send
  const sendBtn = $('#sendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const input = $('#captureInput');
      const text = input?.value.trim();
      if (text) handleCapture(text);
    });
  }

  // Capture on Enter
  const captureInput = $('#captureInput');
  if (captureInput) {
    captureInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = captureInput.value.trim();
        if (text) handleCapture(text);
      }
    });
  }

  // Voice
  const micBtn = $('#micBtn');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (isListening) stopListening();
      else startListening();
    });
  }

  // Error dismiss
  const errorDismiss = $('#errorDismiss');
  if (errorDismiss) errorDismiss.addEventListener('click', hideError);

  // Visibility change — refresh when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadPageData(currentPage);
  });

  // --- Notes filter chips ---
  const notesFilterRow = $('#notesFilterRow');
  if (notesFilterRow) {
    notesFilterRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;

      notesFilterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      notesFilter = chip.dataset.filter;
      notesQuery = '';
      const search = $('#notesSearch');
      if (search) search.value = '';
      loadNotes();
    });
  }

  // --- Notes search ---
  let searchDebounce = null;
  const notesSearch = $('#notesSearch');
  if (notesSearch) {
    notesSearch.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        notesQuery = e.target.value.trim();
        if (notesQuery) {
          // Deactivate filter chips when searching
          notesFilterRow?.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        } else {
          // Re-activate "All" chip
          const allChip = notesFilterRow?.querySelector('[data-filter="all"]');
          if (allChip) allChip.classList.add('active');
          notesFilter = 'all';
        }
        loadNotes();
      }, 300);
    });
  }

  // --- Library tabs ---
  const libraryTabs = $('#libraryTabs');
  if (libraryTabs) {
    libraryTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.lib-tab');
      if (!tab) return;
      loadLibraryTab(tab.dataset.lib);
    });
  }
}

// =====================================================================
//  UTILITIES
// =====================================================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
