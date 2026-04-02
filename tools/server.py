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

diff --git a/tools/server.py b/tools/server.py
index 0907790..d4ec89b 100644
--- a/tools/server.py
+++ b/tools/server.py
@@ -24,9 +24,12 @@ from tools.notion_tasks import (
     get_completed_this_week, get_carry_over_tasks, get_next_week_tasks,
 )
 from tools.notion_capture import quick_capture
-from tools.notion_projects import get_active_projects
+from tools.notion_projects import get_active_projects, get_all_projects
 from tools.voice_parser import parse as parse_voice
-from tools.notion_notes import get_recent_notes, get_notes_by_type, get_favorite_notes, search_notes
+from tools.notion_notes import (
+    get_recent_notes, get_notes_by_type, get_favorite_notes, search_notes,
+    get_notes_by_project, get_notes_by_project_and_type,
+)
 from tools.notion_library import (
     get_currently_reading, get_book_list,
     get_movie_watchlist, get_movie_list,
@@ -224,9 +227,9 @@ def capture(note: CaptureCreate):
 
 @app.get("/api/projects")
 def list_projects():
-    """Get active projects."""
+    """Get all projects for filtering."""
     try:
-        return {"projects": get_active_projects()}
+        return {"projects": get_all_projects()}
     except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))
 
@@ -244,24 +247,58 @@ def voice_parse(voice: VoiceInput):
 # --- Notes endpoints ---
 
 @app.get("/api/notes")
-def list_notes(filter: str = "all", q: str = None, limit: int = 30):
-    """Get notes with optional type filter or search query."""
-    cache_key = f"notes:{filter}:{q}:{limit}"
+def list_notes(
+    filter: str = "all",
+    q: str = None,
+    project: str = None,
+    limit: int = 30,
+    offset: int = 0,
+):
+    """Get notes with optional type filter, project filter, or search query."""
+    cache_key = f"notes:{filter}:{q}:{project}:{limit}:{offset}"
     cached = _get_cached(cache_key)
     if cached:
         return cached
 
     try:
+        # Fetch a larger set so we can paginate client-side
+        fetch_limit = limit + offset + 1  # +1 to detect has_more
+
         if q:
-            notes = search_notes(q)
+            all_notes = search_notes(q)
+        elif project and filter != "all" and filter != "favorites":
+            all_notes = get_notes_by_project_and_type(project, filter)
+        elif project:
+            all_notes = get_notes_by_project(project)
         elif filter == "all":
-            notes = get_recent_notes(limit)
+            all_notes = get_recent_notes(fetch_limit)
         elif filter == "favorites":
-            notes = get_favorite_notes()
+            all_notes = get_favorite_notes()
         else:
-            notes = get_notes_by_type(filter)
+            all_notes = get_notes_by_type(filter)
+
+        total = len(all_notes)
+        page = all_notes[offset:offset + limit]
+        has_more = (offset + limit) < total
+
+        # Include pinned favorites on the "All" view (first page only)
+        favorites = None
+        if filter == "all" and not q and not project and offset == 0:
+            try:
+                favs = get_favorite_notes()
+                if favs:
+                    favorites = favs[:6]  # Cap at 6 for the pinned grid
+            except Exception:
+                pass
+
+        data = {
+            "notes": page,
+            "total": total,
+            "has_more": has_more,
+        }
+        if favorites is not None:
+            data["favorites"] = favorites
 
-        data = {"notes": notes}
         _set_cache(cache_key, data)
         return data
     except Exception as e:
