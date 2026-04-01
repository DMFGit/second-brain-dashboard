"""
Notes operations for the Second Brain dashboard.
Queries and filters notes from the Notion Notes database.
Uses the data sources API via notion_client_wrapper.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.notion_client_wrapper import (
    query_database, get_page_title, get_property_value,
)

# Property names from the Notes database
PROP_NAME = "Name"           # title
PROP_TYPE = "Type"           # select: Journal, Meeting, Web Clip, Lecture, Reference, Book
PROP_NOTE_DATE = "Note Date" # date
PROP_PROJECT = "Project"     # relation
PROP_FAVORITE = "Favorite"   # checkbox
PROP_TAG = "Tag"             # relation
PROP_URL = "URL"             # url


def _serialize_note(page: dict) -> dict:
    """Convert a Notion page to a clean note dict."""
    note_date = get_property_value(page, PROP_NOTE_DATE)
    explicit_date = note_date.get("start") if note_date else None

    # Fall back to Notion's created_time when Note Date is empty
    fallback_date = None
    if not explicit_date:
        created = page.get("created_time", "")
        if created:
            fallback_date = created[:10]  # "2026-03-15T..." → "2026-03-15"

    return {
        "id": page["id"],
        "title": get_page_title(page),
        "type": get_property_value(page, PROP_TYPE),
        "note_date": explicit_date or fallback_date,
        "project_ids": get_property_value(page, PROP_PROJECT) or [],
        "favorite": get_property_value(page, PROP_FAVORITE),
        "tag_ids": get_property_value(page, PROP_TAG) or [],
        "url": page.get("url"),
        "source_url": get_property_value(page, PROP_URL),
    }


def get_recent_notes(limit: int = 20) -> list:
    """Get the most recent notes sorted by date descending.

    Uses Note Date when available, falls back to created_time.
    Fetches extra pages to account for undated notes that Notion
    pushes to the end of a Note Date sort.
    """
    # Sort by created_time so we get a consistent chronological order
    # even for notes without a Note Date
    sorts = [{"timestamp": "created_time", "direction": "descending"}]
    pages = query_database("NOTES", sorts=sorts, page_size=limit)
    notes = [_serialize_note(p) for p in pages]

    # Re-sort by the effective date (note_date with fallback already applied)
    notes.sort(key=lambda n: n["note_date"] or "", reverse=True)
    return notes[:limit]


def get_notes_by_type(note_type: str) -> list:
    """Filter notes by Type select (e.g. Journal, Meeting, Web Clip)."""
    filter_obj = {
        "property": PROP_TYPE,
        "select": {"equals": note_type},
    }
    sorts = [{"property": PROP_NOTE_DATE, "direction": "descending"}]
    pages = query_database("NOTES", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_note(p) for p in pages]


def get_favorite_notes() -> list:
    """Get all notes marked as Favorite."""
    filter_obj = {
        "property": PROP_FAVORITE,
        "checkbox": {"equals": True},
    }
    sorts = [{"property": PROP_NOTE_DATE, "direction": "descending"}]
    pages = query_database("NOTES", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_note(p) for p in pages]


def get_notes_by_project(project_id: str) -> list:
    """Filter notes by Project relation ID."""
    filter_obj = {
        "property": PROP_PROJECT,
        "relation": {"contains": project_id},
    }
    sorts = [{"property": PROP_NOTE_DATE, "direction": "descending"}]
    pages = query_database("NOTES", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_note(p) for p in pages]


def get_notes_by_project_and_type(project_id: str, note_type: str) -> list:
    """Filter notes by both Project relation ID and Type select."""
    filter_obj = {
        "and": [
            {"property": PROP_PROJECT, "relation": {"contains": project_id}},
            {"property": PROP_TYPE, "select": {"equals": note_type}},
        ]
    }
    sorts = [{"property": PROP_NOTE_DATE, "direction": "descending"}]
    pages = query_database("NOTES", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_note(p) for p in pages]


def search_notes(query: str) -> list:
    """Search notes by title (client-side filter on recent notes).

    The Notion API doesn't support full-text title search on database queries,
    so we fetch recent notes and filter client-side by checking if the query
    string appears in the title (case-insensitive).
    """
    sorts = [{"property": PROP_NOTE_DATE, "direction": "descending"}]
    pages = query_database("NOTES", sorts=sorts)

    query_lower = query.lower()
    results = []
    for page in pages:
        title = get_page_title(page)
        if query_lower in title.lower():
            results.append(_serialize_note(page))

    return results


def run(input_data: dict = None) -> dict:
    """Entry point for WAT framework."""
    action = (input_data or {}).get("action", "get_recent")

    try:
        if action == "get_recent":
            limit = (input_data or {}).get("limit", 20)
            return {"status": "success", "notes": get_recent_notes(limit)}
        elif action == "get_by_type":
            note_type = input_data.get("note_type")
            if not note_type:
                return {"status": "error", "message": "note_type is required"}
            return {"status": "success", "notes": get_notes_by_type(note_type)}
        elif action == "get_favorites":
            return {"status": "success", "notes": get_favorite_notes()}
        elif action == "search":
            query = input_data.get("query")
            if not query:
                return {"status": "error", "message": "query is required"}
            return {"status": "success", "notes": search_notes(query)}
        else:
            return {"status": "error", "message": f"Unknown action: {action}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    print("Recent notes:")
    result = run({"action": "get_recent", "limit": 5})
    for note in result.get("notes", []):
        print(f"  [{note['type']}] {note['title']} ({note['note_date']})")

    print("\nFavorite notes:")
    result = run({"action": "get_favorites"})
    for note in result.get("notes", []):
        print(f"  {note['title']}")
