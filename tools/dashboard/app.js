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
let notesProject = '';
let projectsLoaded = false;
let notesOffset = 0;
let notesHasMore = false;
const NOTES_PAGE_SIZE = 30;
let libraryTab = 'books';
let lastSyncTime = null;
let undoTimer = null;
let captureExpanded = false;

// --- DOM Refs ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initRouter();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupInfiniteScroll();
  loadCaptureProjects();
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

    updateSyncTime();
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
        <div class="task-actions">
          <button class="task-action-btn" data-task-id="${task.id}" data-action="tomorrow" title="Tomorrow">→</button>
          <button class="task-action-btn" data-task-id="${task.id}" data-action="next-week" title="Next week">⟫</button>
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

function formatNoteDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

async function loadProjectsDropdown() {
  if (projectsLoaded) return;
  try {
    const res = await fetch(`${API}/api/projects`);
    if (!res.ok) return;
    const data = await res.json();
    const select = $('#notesProjectFilter');
    if (!select || !data.projects?.length) return;

    data.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title;
      select.appendChild(opt);
    });
    projectsLoaded = true;
  } catch {}
}

async function loadNotes(append = false) {
  const container = $('#notesList');
  if (!container) return;

  loadProjectsDropdown();

  if (!append) notesOffset = 0;

  const params = new URLSearchParams();
  params.set('limit', NOTES_PAGE_SIZE);
  params.set('offset', notesOffset);

  if (notesQuery) {
    params.set('q', notesQuery);
  } else {
    if (notesFilter !== 'all') params.set('filter', notesFilter);
    if (notesProject) params.set('project', notesProject);
  }

  try {
    const res = await fetch(`${API}/api/notes?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Update total count
    const totalEl = $('#notesTotal');
    if (totalEl && data.total != null) {
      totalEl.textContent = `${data.total} note${data.total === 1 ? '' : 's'}`;
    }

    // Track pagination
    notesHasMore = data.has_more || false;
    const loadMoreWrap = $('#notesLoadMore');
    if (loadMoreWrap) loadMoreWrap.classList.toggle('hidden', !notesHasMore);

    if (append && notesData) {
      notesData.notes = [...notesData.notes, ...data.notes];
    } else {
      notesData = data;
    }

    renderNotes(notesData.notes, data.favorites);
  } catch (err) {
    console.error('Notes load failed:', err);
    if (!append) {
      container.innerHTML = '<div class="empty-state">Failed to load notes</div>';
    }
  }
}

function loadMoreNotes() {
  notesOffset += NOTES_PAGE_SIZE;
  loadNotes(true);
}

const NOTE_ICONS = {
  'Journal': '✎', 'Meeting': '◉', 'Reference': '◆',
  'Web Clip': '🔗', 'Lecture': '▸', 'Book': '📖',
};

function getDateGroup(dateStr) {
  if (!dateStr) return 'Undated';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff >= -7 && diff < -1) return 'This Week';
  if (diff >= -30 && diff < -7) return 'This Month';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function renderNoteCard(note, i) {
  const typeSlug = note.type ? note.type.toLowerCase().replace(/\s+/g, '-') : '';
  const typeClass = typeSlug ? `note-type--${typeSlug}` : '';
  const icon = NOTE_ICONS[note.type] || '●';
  const dateLabel = note.note_date ? formatNoteDate(note.note_date) : '';
  const sourceDomain = note.source_url ? (() => {
    try { return new URL(note.source_url).hostname.replace('www.', ''); } catch { return ''; }
  })() : '';

  return `
    <a class="note-item" data-type="${typeSlug}" href="${note.url || '#'}" target="_blank" rel="noopener" style="animation-delay: ${Math.min(i, 15) * 0.03}s">
      <span class="note-icon">${icon}</span>
      <div class="note-body">
        <div class="note-title">${escapeHtml(note.title)}</div>
        <div class="note-meta">
          ${note.type ? `<span class="note-type ${typeClass}">${escapeHtml(note.type)}</span>` : ''}
          ${dateLabel ? `<span class="note-date">${dateLabel}</span>` : ''}
          ${sourceDomain ? `<span class="note-source">${escapeHtml(sourceDomain)}</span>` : ''}
        </div>
      </div>
      ${note.favorite ? '<span class="note-fav">★</span>' : ''}
    </a>`;
}

function renderPinnedFavorites(favorites) {
  if (!favorites || favorites.length === 0) return '';

  return `
    <div class="notes-pinned">
      <div class="notes-pinned-header">
        <span>★</span> Pinned Favorites
      </div>
      <div class="notes-pinned-grid">
        ${favorites.map((note, i) => {
          const dateLabel = note.note_date ? formatNoteDate(note.note_date) : '';
          const typeSlug = note.type ? note.type.toLowerCase().replace(/\s+/g, '-') : '';
          return `
            <a class="note-pin-card" href="${note.url || '#'}" target="_blank" rel="noopener" style="animation-delay: ${i * 0.04}s">
              <div class="note-pin-title">${escapeHtml(note.title)}</div>
              <div class="note-pin-meta">
                ${note.type ? `<span class="note-type note-type--${typeSlug}">${escapeHtml(note.type)}</span>` : ''}
                ${dateLabel ? ` · ${dateLabel}` : ''}
              </div>
            </a>`;
        }).join('')}
      </div>
    </div>`;
}

function renderNotes(notes, favorites) {
  const container = $('#notesList');
  if (!container) return;

  if (!notes || notes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        ${notesQuery ? `No notes matching "${escapeHtml(notesQuery)}"` : 'No notes found'}
      </div>`;
    return;
  }

  // Show pinned favorites at top when on "All" view with no search
  const pinnedHtml = (notesFilter === 'all' && !notesQuery && !notesProject && favorites?.length)
    ? renderPinnedFavorites(favorites)
    : '';

  // Show active filter indicator when filtering
  const filterLabel = notesFilter !== 'all' && !notesQuery
    ? `<div class="notes-active-filter">Showing: <strong>${escapeHtml(notesFilter === 'favorites' ? 'Favorites' : notesFilter)}</strong>${notesProject ? ' in project' : ''} <button onclick="clearNotesFilters()">clear</button></div>`
    : '';

  // Group notes by date
  const groups = [];
  const groupMap = {};
  let idx = 0;
  for (const note of notes) {
    const label = getDateGroup(note.note_date);
    if (!groupMap[label]) {
      groupMap[label] = [];
      groups.push(label);
    }
    groupMap[label].push({ note, idx: idx++ });
  }

  container.innerHTML = pinnedHtml + filterLabel + groups.map(label => `
    <div class="notes-date-group">
      <div class="notes-group-header">${escapeHtml(label)}</div>
      ${groupMap[label].map(({ note, idx: i }) => renderNoteCard(note, i)).join('')}
    </div>
  `).join('');
}

function clearNotesFilters() {
  notesFilter = 'all';
  notesProject = '';
  notesQuery = '';

  const search = $('#notesSearch');
  if (search) search.value = '';
  const projectSelect = $('#notesProjectFilter');
  if (projectSelect) projectSelect.value = '';

  const filterRow = $('#notesFilterRow');
  if (filterRow) {
    filterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    const allChip = filterRow.querySelector('[data-filter="all"]');
    if (allChip) allChip.classList.add('active');
  }

  loadNotes();
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
//  TASK COMPLETION (with undo)
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
      showUndoToast('Task completed', taskId);

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

function showUndoToast(message, taskId) {
  const container = $('#toastContainer');
  if (!container) return;

  // Clear any existing undo timer
  if (undoTimer) clearTimeout(undoTimer);

  const toast = document.createElement('div');
  toast.className = 'toast toast--undo';
  toast.innerHTML = `<span class="toast-icon">✓</span> ${escapeHtml(message)} <button class="undo-btn" data-undo-task="${taskId}">Undo</button>`;
  container.appendChild(toast);

  undoTimer = setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

async function handleUndo(taskId) {
  if (undoTimer) clearTimeout(undoTimer);
  // Remove undo toast
  $$('.toast--undo').forEach(t => t.remove());

  try {
    const res = await fetch(`${API}/api/tasks/${taskId}?action=uncomplete`, { method: 'PATCH' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('Task restored', '↩');
    loadDashboard();
  } catch (err) {
    showToast('Failed to undo', '⚠');
  }
}

// =====================================================================
//  TASK RESCHEDULING
// =====================================================================

async function handleReschedule(taskId, action) {
  const today = new Date();
  let newDate;

  if (action === 'tomorrow') {
    newDate = new Date(today);
    newDate.setDate(today.getDate() + 1);
  } else if (action === 'next-week') {
    newDate = new Date(today);
    newDate.setDate(today.getDate() + (8 - today.getDay())); // next Monday
  }

  if (!newDate) return;

  const dateStr = newDate.toISOString().split('T')[0];
  const taskItem = document.querySelector(`[data-id="${taskId}"]`);

  try {
    const res = await fetch(`${API}/api/tasks/${taskId}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: dateStr }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (taskItem) {
      taskItem.classList.add('completed-anim');
      setTimeout(() => taskItem.remove(), 400);
    }
    showToast(`Moved to ${action === 'tomorrow' ? 'tomorrow' : 'next week'}`, '📅');
    setTimeout(() => loadDashboard(), 500);
  } catch (err) {
    showToast('Failed to reschedule', '⚠');
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

  const body = { title: title.trim() };

  // Pull metadata from capture bar fields
  const dateEl = $('#captureDate');
  const priorityEl = $('#capturePriority');
  const projectEl = $('#captureProject');

  if (dateEl?.value) body.due_date = dateEl.value;
  if (priorityEl?.value) body.priority = priorityEl.value;
  if (projectEl?.value) body.project_id = projectEl.value;

  try {
    const res = await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    showToast('Task added', '✓');
    // Reset metadata fields
    if (dateEl) dateEl.value = '';
    if (priorityEl) priorityEl.value = '';
    if (projectEl) projectEl.value = '';
    captureExpanded = false;
    const meta = $('#captureMeta');
    if (meta) meta.classList.remove('expanded');

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

  // Reschedule buttons (delegated)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.task-action-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const action = btn.dataset.action;
      if (taskId && action) handleReschedule(taskId, action);
    }
  });

  // Undo button (delegated)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.undo-btn');
    if (btn) {
      e.preventDefault();
      const taskId = btn.dataset.undoTask;
      if (taskId) handleUndo(taskId);
    }
  });

  // Capture expand button
  const expandBtn = $('#expandBtn');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      captureExpanded = !captureExpanded;
      const meta = $('#captureMeta');
      if (meta) meta.classList.toggle('expanded', captureExpanded);
      expandBtn.classList.toggle('active', captureExpanded);
    });
  }

  // Shortcuts overlay close
  const shortcutsClose = $('#shortcutsClose');
  if (shortcutsClose) {
    shortcutsClose.addEventListener('click', () => {
      const overlay = $('#shortcutsOverlay');
      if (overlay) overlay.classList.add('hidden');
    });
  }

  // Error dismiss
  const errorDismiss = $('#errorDismiss');
  if (errorDismiss) errorDismiss.addEventListener('click', hideError);

  // Visibility change — refresh when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadPageData(currentPage);
  });

  // --- Load more notes ---
  const loadMoreBtn = $('#loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadMoreNotes);
  }

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

  // --- Notes project dropdown ---
  const notesProjectFilter = $('#notesProjectFilter');
  if (notesProjectFilter) {
    notesProjectFilter.addEventListener('change', (e) => {
      notesProject = e.target.value;
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
//  SYNC INDICATOR
// =====================================================================

function updateSyncTime() {
  lastSyncTime = new Date();
  renderSyncIndicator();
}

function renderSyncIndicator() {
  const el = $('#syncIndicator');
  if (!el || !lastSyncTime) return;

  const diff = Math.round((new Date() - lastSyncTime) / 1000);
  if (diff < 10) el.textContent = 'Synced just now';
  else if (diff < 60) el.textContent = `Synced ${diff}s ago`;
  else el.textContent = `Synced ${Math.round(diff / 60)}m ago`;
}

// Update sync indicator every 15s
setInterval(renderSyncIndicator, 15000);

// =====================================================================
//  KEYBOARD SHORTCUTS
// =====================================================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't fire when typing in inputs
    if (e.target.matches('input, select, textarea')) return;

    switch (e.key) {
      case '1': window.location.hash = '#home'; break;
      case '2': window.location.hash = '#notes'; break;
      case '3': window.location.hash = '#library'; break;
      case '4': window.location.hash = '#review'; break;
      case '/':
        e.preventDefault();
        const search = $('#notesSearch');
        if (search) { window.location.hash = '#notes'; setTimeout(() => search.focus(), 100); }
        break;
      case 'c':
        e.preventDefault();
        const capture = $('#captureInput');
        if (capture) capture.focus();
        break;
      case '?':
        e.preventDefault();
        const overlay = $('#shortcutsOverlay');
        if (overlay) overlay.classList.toggle('hidden');
        break;
    }
  });
}

// =====================================================================
//  INFINITE SCROLL (Notes)
// =====================================================================

function setupInfiniteScroll() {
  const pageContainer = $('#pageContainer');
  if (!pageContainer) return;

  pageContainer.addEventListener('scroll', () => {
    if (currentPage !== 'notes' || !notesHasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = pageContainer;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      notesOffset += NOTES_PAGE_SIZE;
      loadNotes(true);
    }
  });
}

// =====================================================================
//  CAPTURE BAR PROJECTS
// =====================================================================

async function loadCaptureProjects() {
  try {
    const res = await fetch(`${API}/api/projects`);
    if (!res.ok) return;
    const data = await res.json();
    const select = $('#captureProject');
    if (!select || !data.projects?.length) return;

    data.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title;
      select.appendChild(opt);
    });
  } catch {}
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
