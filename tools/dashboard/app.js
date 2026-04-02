commit 928e13fbafb5a89fceed96b3a1785b5a674ee1ff
Author: Dina Ferraiuolo <dina@dmfengineering.com>
Date:   Wed Apr 1 14:24:00 2026 -0400

    Redesign notes page and switch to cool/minimal color scheme
    
    - Reworked notes page: pinned favorites grid, date group dividers,
      note count, load more pagination, better filter chips with color dots
    - Switched entire dashboard from warm editorial to cool slate/blue palette
    - Fixed undated notes by falling back to Notion created_time
    - Server now supports offset pagination and returns total/has_more
    - Cache-bust CSS/JS includes
    
    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

diff --git a/tools/dashboard/app.js b/tools/dashboard/app.js
index 4482ed2..a0a1ae6 100644
--- a/tools/dashboard/app.js
+++ b/tools/dashboard/app.js
@@ -18,6 +18,11 @@ let isListening = false;
 let currentPage = 'home';
 let notesFilter = 'all';
 let notesQuery = '';
+let notesProject = '';
+let projectsLoaded = false;
+let notesOffset = 0;
+let notesHasMore = false;
+const NOTES_PAGE_SIZE = 30;
 let libraryTab = 'books';
 
 // --- DOM Refs ---
@@ -237,29 +242,147 @@ function renderProjects(projects) {
 //  NOTES PAGE
 // =====================================================================
 
-async function loadNotes() {
+async function loadProjectsDropdown() {
+  if (projectsLoaded) return;
+  try {
+    const res = await fetch(`${API}/api/projects`);
+    if (!res.ok) return;
+    const data = await res.json();
+    const select = $('#notesProjectFilter');
+    if (!select || !data.projects?.length) return;
+
+    data.projects.forEach(p => {
+      const opt = document.createElement('option');
+      opt.value = p.id;
+      opt.textContent = p.title;
+      select.appendChild(opt);
+    });
+    projectsLoaded = true;
+  } catch {}
+}
+
+async function loadNotes(append = false) {
   const container = $('#notesList');
   if (!container) return;
 
+  loadProjectsDropdown();
+
+  if (!append) notesOffset = 0;
+
   const params = new URLSearchParams();
+  params.set('limit', NOTES_PAGE_SIZE);
+  params.set('offset', notesOffset);
+
   if (notesQuery) {
     params.set('q', notesQuery);
-  } else if (notesFilter !== 'all') {
-    params.set('filter', notesFilter === 'favorites' ? 'favorites' : notesFilter);
+  } else {
+    if (notesFilter !== 'all') params.set('filter', notesFilter);
+    if (notesProject) params.set('project', notesProject);
   }
 
   try {
     const res = await fetch(`${API}/api/notes?${params}`);
     if (!res.ok) throw new Error(`HTTP ${res.status}`);
-    notesData = await res.json();
-    renderNotes(notesData.notes);
+    const data = await res.json();
+
+    // Update total count
+    const totalEl = $('#notesTotal');
+    if (totalEl && data.total != null) {
+      totalEl.textContent = `${data.total} note${data.total === 1 ? '' : 's'}`;
+    }
+
+    // Track pagination
+    notesHasMore = data.has_more || false;
+    const loadMoreWrap = $('#notesLoadMore');
+    if (loadMoreWrap) loadMoreWrap.classList.toggle('hidden', !notesHasMore);
+
+    if (append && notesData) {
+      notesData.notes = [...notesData.notes, ...data.notes];
+    } else {
+      notesData = data;
+    }
+
+    renderNotes(notesData.notes, data.favorites);
   } catch (err) {
     console.error('Notes load failed:', err);
-    container.innerHTML = '<div class="empty-state">Failed to load notes</div>';
+    if (!append) {
+      container.innerHTML = '<div class="empty-state">Failed to load notes</div>';
+    }
   }
 }
 
-function renderNotes(notes) {
+function loadMoreNotes() {
+  notesOffset += NOTES_PAGE_SIZE;
+  loadNotes(true);
+}
+
+const NOTE_ICONS = {
+  'Journal': '✎', 'Meeting': '◉', 'Reference': '◆',
+  'Web Clip': '🔗', 'Lecture': '▸', 'Book': '📖',
+};
+
+function getDateGroup(dateStr) {
+  if (!dateStr) return 'Undated';
+  const date = new Date(dateStr + 'T00:00:00');
+  const today = new Date(); today.setHours(0, 0, 0, 0);
+  const diff = Math.round((date - today) / 86400000);
+  if (diff === 0) return 'Today';
+  if (diff === -1) return 'Yesterday';
+  if (diff >= -7 && diff < -1) return 'This Week';
+  if (diff >= -30 && diff < -7) return 'This Month';
+  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
+}
+
+function renderNoteCard(note, i) {
+  const typeSlug = note.type ? note.type.toLowerCase().replace(/\s+/g, '-') : '';
+  const typeClass = typeSlug ? `note-type--${typeSlug}` : '';
+  const icon = NOTE_ICONS[note.type] || '●';
+  const dateLabel = note.note_date ? formatDate(note.note_date) : '';
+  const sourceDomain = note.source_url ? (() => {
+    try { return new URL(note.source_url).hostname.replace('www.', ''); } catch { return ''; }
+  })() : '';
+
+  return `
+    <a class="note-item" data-type="${typeSlug}" href="${note.url || '#'}" target="_blank" rel="noopener" style="animation-delay: ${Math.min(i, 15) * 0.03}s">
+      <span class="note-icon">${icon}</span>
+      <div class="note-body">
+        <div class="note-title">${escapeHtml(note.title)}</div>
+        <div class="note-meta">
+          ${note.type ? `<span class="note-type ${typeClass}">${escapeHtml(note.type)}</span>` : ''}
+          ${dateLabel ? `<span class="note-date">${dateLabel}</span>` : ''}
+          ${sourceDomain ? `<span class="note-source">${escapeHtml(sourceDomain)}</span>` : ''}
+        </div>
+      </div>
+      ${note.favorite ? '<span class="note-fav">★</span>' : ''}
+    </a>`;
+}
+
+function renderPinnedFavorites(favorites) {
+  if (!favorites || favorites.length === 0) return '';
+
+  return `
+    <div class="notes-pinned">
+      <div class="notes-pinned-header">
+        <span>★</span> Pinned Favorites
+      </div>
+      <div class="notes-pinned-grid">
+        ${favorites.map((note, i) => {
+          const dateLabel = note.note_date ? formatDate(note.note_date) : '';
+          const typeSlug = note.type ? note.type.toLowerCase().replace(/\s+/g, '-') : '';
+          return `
+            <a class="note-pin-card" href="${note.url || '#'}" target="_blank" rel="noopener" style="animation-delay: ${i * 0.04}s">
+              <div class="note-pin-title">${escapeHtml(note.title)}</div>
+              <div class="note-pin-meta">
+                ${note.type ? `<span class="note-type note-type--${typeSlug}">${escapeHtml(note.type)}</span>` : ''}
+                ${dateLabel ? ` · ${dateLabel}` : ''}
+              </div>
+            </a>`;
+        }).join('')}
+      </div>
+    </div>`;
+}
+
+function renderNotes(notes, favorites) {
   const container = $('#notesList');
   if (!container) return;
 
@@ -267,25 +390,60 @@ function renderNotes(notes) {
     container.innerHTML = `
       <div class="empty-state">
         <div class="empty-state-icon">📝</div>
-        No notes found
+        ${notesQuery ? `No notes matching "${escapeHtml(notesQuery)}"` : 'No notes found'}
       </div>`;
     return;
   }
 
-  container.innerHTML = notes.map((note, i) => {
-    const typeClass = note.type ? `note-type--${note.type.toLowerCase().replace(/\s+/g, '-')}` : '';
-    const dateLabel = note.note_date ? formatDate(note.note_date) : '';
+  // Show pinned favorites at top when on "All" view with no search
+  const pinnedHtml = (notesFilter === 'all' && !notesQuery && !notesProject && favorites?.length)
+    ? renderPinnedFavorites(favorites)
+    : '';
+
+  // Show active filter indicator when filtering
+  const filterLabel = notesFilter !== 'all' && !notesQuery
+    ? `<div class="notes-active-filter">Showing: <strong>${escapeHtml(notesFilter === 'favorites' ? 'Favorites' : notesFilter)}</strong>${notesProject ? ' in project' : ''} <button onclick="clearNotesFilters()">clear</button></div>`
+    : '';
+
+  // Group notes by date
+  const groups = [];
+  const groupMap = {};
+  let idx = 0;
+  for (const note of notes) {
+    const label = getDateGroup(note.note_date);
+    if (!groupMap[label]) {
+      groupMap[label] = [];
+      groups.push(label);
+    }
+    groupMap[label].push({ note, idx: idx++ });
+  }
 
-    return `
-      <a class="note-item" href="${note.url || '#'}" target="_blank" rel="noopener" style="animation-delay: ${i * 0.03}s">
-        <div class="note-header">
-          ${note.type ? `<span class="note-type ${typeClass}">${escapeHtml(note.type)}</span>` : ''}
-          ${note.favorite ? '<span class="note-fav">★</span>' : ''}
-        </div>
-        <div class="note-title">${escapeHtml(note.title)}</div>
-        ${dateLabel ? `<div class="note-date">${dateLabel}</div>` : ''}
-      </a>`;
-  }).join('');
+  container.innerHTML = pinnedHtml + filterLabel + groups.map(label => `
+    <div class="notes-date-group">
+      <div class="notes-group-header">${escapeHtml(label)}</div>
+      ${groupMap[label].map(({ note, idx: i }) => renderNoteCard(note, i)).join('')}
+    </div>
+  `).join('');
+}
+
+function clearNotesFilters() {
+  notesFilter = 'all';
+  notesProject = '';
+  notesQuery = '';
+
+  const search = $('#notesSearch');
+  if (search) search.value = '';
+  const projectSelect = $('#notesProjectFilter');
+  if (projectSelect) projectSelect.value = '';
+
+  const filterRow = $('#notesFilterRow');
+  if (filterRow) {
+    filterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
+    const allChip = filterRow.querySelector('[data-filter="all"]');
+    if (allChip) allChip.classList.add('active');
+  }
+
+  loadNotes();
 }
 
 // =====================================================================
@@ -835,6 +993,12 @@ function setupEventListeners() {
     if (!document.hidden) loadPageData(currentPage);
   });
 
+  // --- Load more notes ---
+  const loadMoreBtn = $('#loadMoreBtn');
+  if (loadMoreBtn) {
+    loadMoreBtn.addEventListener('click', loadMoreNotes);
+  }
+
   // --- Notes filter chips ---
   const notesFilterRow = $('#notesFilterRow');
   if (notesFilterRow) {
@@ -853,6 +1017,15 @@ function setupEventListeners() {
     });
   }
 
+  // --- Notes project dropdown ---
+  const notesProjectFilter = $('#notesProjectFilter');
+  if (notesProjectFilter) {
+    notesProjectFilter.addEventListener('change', (e) => {
+      notesProject = e.target.value;
+      loadNotes();
+    });
+  }
+
   // --- Notes search ---
   let searchDebounce = null;
   const notesSearch = $('#notesSearch');
