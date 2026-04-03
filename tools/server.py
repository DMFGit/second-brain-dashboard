"""
FastAPI server for the Second Brain dashboard.
Serves the frontend and provides API endpoints for Notion data.
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.notion_tasks import (
    get_todays_tasks, get_upcoming_deadlines, get_inbox_count,
    create_task, complete_task, uncomplete_task, reschedule_task,
    get_completed_this_week, get_carry_over_tasks, get_next_week_tasks,
    get_my_day_tasks,
)
from tools.notion_capture import quick_capture
from tools.notion_projects import get_active_projects, get_all_projects
from tools.voice_parser import parse as parse_voice
from tools.notion_notes import (
    get_recent_notes, get_notes_by_type, get_favorite_notes, search_notes,
    get_notes_by_project, get_notes_by_project_and_type,
)
from tools.notion_library import (
    get_currently_reading, get_book_list,
    get_movie_watchlist, get_movie_list,
    get_recipes,
)

app = FastAPI(title="Second Brain Dashboard", version="1.0.0")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-memory cache ---
_cache = {}
CACHE_TTL = 120  # seconds


def _get_cached(key: str):
    """Get cached value if still fresh."""
    entry = _cache.get(key)
    if entry and (time.time() - entry["time"]) < CACHE_TTL:
        return entry["data"]
    return None


def _set_cache(key: str, data):
    """Cache a value."""
    _cache[key] = {"data": data, "time": time.time()}


def _invalidate_cache():
    """Clear all cache entries."""
    _cache.clear()


# --- Completion log (tracks recurring task completions) ---
_completions_file = Path(__file__).parent.parent / ".tmp" / "completions.json"


def _load_completions() -> list:
    """Load completion log from disk."""
    if _completions_file.exists():
        try:
            return json.loads(_completions_file.read_text())
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_completion(task_id: str, title: str):
    """Log a task completion with timestamp."""
    _completions_file.parent.mkdir(parents=True, exist_ok=True)
    log = _load_completions()
    log.append({
        "id": task_id,
        "title": title,
        "completed_at": datetime.now().isoformat(),
    })
    _completions_file.write_text(json.dumps(log, indent=2))


def _get_completions_this_week() -> list:
    """Get completions logged this week."""
    now = datetime.now()
    start_of_week = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    log = _load_completions()
    results = []
    for entry in log:
        completed_at = datetime.fromisoformat(entry["completed_at"])
        if completed_at >= start_of_week:
            results.append(entry)
    return results


# --- Request models ---

class TaskCreate(BaseModel):
    title: str
    due_date: str | None = None
    project_id: str | None = None
    priority: str | None = None


class TaskReschedule(BaseModel):
    due_date: str


class CaptureCreate(BaseModel):
    text: str


class VoiceInput(BaseModel):
    transcript: str


# --- API Routes ---

@app.get("/api/dashboard")
def dashboard():
    """Aggregated dashboard data — single call for the frontend."""
    cached = _get_cached("dashboard")
    if cached:
        return cached

    try:
        today_tasks = get_todays_tasks()
        upcoming = get_upcoming_deadlines(7)
        inbox = get_inbox_count()
        projects = get_active_projects()

        today = datetime.now().strftime("%Y-%m-%d")
        overdue = [t for t in today_tasks if t["due_date"] and t["due_date"] < today]

        data = {
            "date": today,
            "today_tasks": today_tasks,
            "upcoming_tasks": upcoming,
            "inbox_count": inbox,
            "active_projects": projects,
            "counts": {
                "today": len(today_tasks),
                "overdue": len(overdue),
                "upcoming": len(upcoming),
                "inbox": inbox,
                "projects": len(projects),
            }
        }

        _set_cache("dashboard", data)
        return data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tasks")
def list_tasks(scope: str = "today", days: int = 7):
    """Get tasks by scope: 'today' or 'upcoming'."""
    try:
        if scope == "today":
            return {"tasks": get_todays_tasks()}
        elif scope == "upcoming":
            return {"tasks": get_upcoming_deadlines(days)}
        else:
            raise HTTPException(status_code=400, detail=f"Unknown scope: {scope}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks")
def add_task(task: TaskCreate):
    """Create a new task."""
    try:
        result = create_task(
            title=task.title,
            due_date=task.due_date,
            project_id=task.project_id,
            priority=task.priority,
        )
        _invalidate_cache()
        return {"task": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/tasks/{page_id}")
def update_task(page_id: str, action: str = "complete"):
    """Update a task: complete, uncomplete, or reschedule."""
    try:
        if action == "complete":
            result = complete_task(page_id)
            _save_completion(page_id, result.get("title", ""))
            _invalidate_cache()
            return {"task": result}
        elif action == "uncomplete":
            result = uncomplete_task(page_id)
            _invalidate_cache()
            return {"task": result}
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/tasks/{page_id}/reschedule")
def reschedule(page_id: str, body: TaskReschedule):
    """Reschedule a task to a new date."""
    try:
        result = reschedule_task(page_id, body.due_date)
        _invalidate_cache()
        return {"task": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tasks/my-day")
def my_day_tasks():
    """Get tasks flagged for My Day."""
    cached = _get_cached("my_day")
    if cached:
        return cached
    try:
        tasks = get_my_day_tasks()
        data = {"tasks": tasks, "count": len(tasks)}
        _set_cache("my_day", data)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/capture")
def capture(note: CaptureCreate):
    """Quick capture a note to the inbox."""
    try:
        result = quick_capture(note.text)
        _invalidate_cache()
        return {"note": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects")
def list_projects():
    """Get all projects for filtering."""
    try:
        return {"projects": get_all_projects()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/voice/parse")
def voice_parse(voice: VoiceInput):
    """Parse a voice transcript into an action."""
    try:
        result = parse_voice(voice.transcript)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Notes endpoints ---

@app.get("/api/notes")
def list_notes(
    filter: str = "all",
    q: str = None,
    project: str = None,
    limit: int = 30,
    offset: int = 0,
):
    """Get notes with optional type filter, project filter, or search query."""
    cache_key = f"notes:{filter}:{q}:{project}:{limit}:{offset}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    try:
        # Fetch a larger set so we can paginate client-side
        fetch_limit = limit + offset + 1  # +1 to detect has_more

        if q:
            all_notes = search_notes(q)
        elif project and filter != "all" and filter != "favorites":
            all_notes = get_notes_by_project_and_type(project, filter)
        elif project:
            all_notes = get_notes_by_project(project)
        elif filter == "all":
            all_notes = get_recent_notes(fetch_limit)
        elif filter == "favorites":
            all_notes = get_favorite_notes()
        else:
            all_notes = get_notes_by_type(filter)

        total = len(all_notes)
        page = all_notes[offset:offset + limit]
        has_more = (offset + limit) < total

        # Include pinned favorites on the "All" view (first page only)
        favorites = None
        if filter == "all" and not q and not project and offset == 0:
            try:
                favs = get_favorite_notes()
                if favs:
                    favorites = favs[:6]  # Cap at 6 for the pinned grid
            except Exception:
                pass

        data = {
            "notes": page,
            "total": total,
            "has_more": has_more,
        }
        if favorites is not None:
            data["favorites"] = favorites

        _set_cache(cache_key, data)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Library endpoints ---

@app.get("/api/books")
def list_books():
    """Get books grouped by status."""
    cached = _get_cached("books")
    if cached:
        return cached

    try:
        data = {
            "currently_reading": get_currently_reading(),
            "all_books": get_book_list(),
        }
        _set_cache("books", data)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/movies")
def list_movies():
    """Get movies with watchlist."""
    cached = _get_cached("movies")
    if cached:
        return cached

    try:
        data = {
            "watchlist": get_movie_watchlist(),
            "all_movies": get_movie_list(),
        }
        _set_cache("movies", data)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/recipes")
def list_recipes():
    """Get recipes."""
    cached = _get_cached("recipes")
    if cached:
        return cached

    try:
        data = {"recipes": get_recipes(50)}
        _set_cache("recipes", data)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Review endpoint ---

@app.get("/api/review")
def weekly_review():
    """Get weekly review data."""
    cached = _get_cached("review")
    if cached:
        return cached

    try:
        # Notion query: tasks currently marked Done and edited this week
        notion_completed = get_completed_this_week()

        # Local log: captures recurring tasks that reset after completion
        local_completed = _get_completions_this_week()

        # Merge — deduplicate by task ID (Notion data takes priority)
        seen_ids = {t["id"] for t in notion_completed}
        merged_completed = list(notion_completed)
        for entry in local_completed:
            if entry["id"] not in seen_ids:
                merged_completed.append({
                    "id": entry["id"],
                    "title": entry["title"],
                    "status": "Done",
                    "due_date": None,
                    "priority": None,
                    "project_ids": [],
                    "my_day": False,
                    "energy": None,
                    "url": None,
                    "completed_at": entry["completed_at"],
                })
                seen_ids.add(entry["id"])

        carry_over = get_carry_over_tasks()
        next_week = get_next_week_tasks()

        data = {
            "completed": merged_completed,
            "carry_over": carry_over,
            "next_week": next_week,
            "counts": {
                "completed": len(merged_completed),
                "carry_over": len(carry_over),
                "next_week": len(next_week),
            }
        }
        _set_cache("review", data)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Static files (dashboard frontend) ---
dashboard_dir = os.path.join(os.path.dirname(__file__), "dashboard")

if os.path.isdir(dashboard_dir):
    app.mount("/", StaticFiles(directory=dashboard_dir, html=True), name="dashboard")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
