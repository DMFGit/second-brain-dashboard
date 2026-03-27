"""
Project operations for the Second Brain dashboard.
Queries active projects from the Notion Projects database.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.notion_client_wrapper import (
    query_database, get_page_title, get_property_value,
)

# Property names from Thomas Frank's Ultimate Brain Projects database
PROP_NAME = "Name"       # title
PROP_STATUS = "Status"   # status: Planned, On Hold, Doing, Ongoing, Done


def _serialize_project(page: dict) -> dict:
    """Convert a Notion page to a clean project dict."""
    return {
        "id": page["id"],
        "title": get_page_title(page),
        "status": get_property_value(page, PROP_STATUS),
        "url": page.get("url"),
    }


def get_active_projects() -> list:
    """Get all projects with Doing or Ongoing status."""
    filter_obj = {
        "or": [
            {"property": PROP_STATUS, "status": {"equals": "Doing"}},
            {"property": PROP_STATUS, "status": {"equals": "Ongoing"}},
        ]
    }

    pages = query_database("PROJECTS", filter_obj=filter_obj)
    return [_serialize_project(p) for p in pages]


def get_all_projects() -> list:
    """Get all projects regardless of status."""
    pages = query_database("PROJECTS")
    return [_serialize_project(p) for p in pages]


def run(input_data: dict = None) -> dict:
    """Entry point for WAT framework."""
    action = (input_data or {}).get("action", "get_active")

    if action == "get_active":
        return {"status": "success", "projects": get_active_projects()}
    elif action == "get_all":
        return {"status": "success", "projects": get_all_projects()}
    else:
        return {"status": "error", "message": f"Unknown action: {action}"}


if __name__ == "__main__":
    print("Active projects:")
    result = run({"action": "get_active"})
    for proj in result.get("projects", []):
        print(f"  [{proj['status']}] {proj['title']}")
