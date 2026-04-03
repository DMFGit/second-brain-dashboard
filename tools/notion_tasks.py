"""
Task operations for the Second Brain dashboard.
Queries, creates, and updates tasks in the Notion Tasks database.
Uses the data sources API via notion_client_wrapper.
"""

import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.notion_client_wrapper import (
    query_database, create_page, update_page,
    get_page_title, get_property_value,
)

# Property names from Thomas Frank's Ultimate Brain Tasks database
PROP_NAME = "Name"           # title
PROP_STATUS = "Status"       # status: To Do, Doing, Done
PROP_DUE = "Due"             # date
PROP_PRIORITY = "Priority"   # status: Low, Medium, High
PROP_PROJECT = "Project"     # relation
PROP_MY_DAY = "My Day"       # checkbox
PROP_ENERGY = "Energy"       # select: High, Low
PROP_SMART_LIST = "Smart List"  # select: Do Next, Delegated, Someday


def _serialize_task(page: dict) -> dict:
    """Convert a Notion page to a clean task dict."""
    due = get_property_value(page, PROP_DUE)
    return {
        "id": page["id"],
        "title": get_page_title(page),
        "status": get_property_value(page, PROP_STATUS),
        "due_date": due.get("start") if due else None,
        "priority": get_property_value(page, PROP_PRIORITY),
        "project_ids": get_property_value(page, PROP_PROJECT) or [],
        "my_day": get_property_value(page, PROP_MY_DAY),
        "energy": get_property_value(page, PROP_ENERGY),
        "url": page.get("url"),
    }


def get_todays_tasks() -> list:
    """Get tasks due today or overdue that aren't done."""
    today = datetime.now().strftime("%Y-%m-%d")

    filter_obj = {
        "and": [
            {"property": PROP_DUE, "date": {"on_or_before": today}},
            {"property": PROP_STATUS, "status": {"does_not_equal": "Done"}},
        ]
    }

    sorts = [{"property": PROP_DUE, "direction": "ascending"}]
    pages = query_database("TASKS", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_task(p) for p in pages]


def get_upcoming_deadlines(days: int = 7) -> list:
    """Get tasks with deadlines in the next N days (excluding today and overdue)."""
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    filter_obj = {
        "and": [
            {"property": PROP_DUE, "date": {"on_or_after": tomorrow}},
            {"property": PROP_DUE, "date": {"on_or_before": end_date}},
            {"property": PROP_STATUS, "status": {"does_not_equal": "Done"}},
        ]
    }

    sorts = [{"property": PROP_DUE, "direction": "ascending"}]
    pages = query_database("TASKS", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_task(p) for p in pages]


def get_inbox_count() -> int:
    """Count tasks with no project assignment (inbox items)."""
    filter_obj = {
        "and": [
            {"property": PROP_PROJECT, "relation": {"is_empty": True}},
            {"property": PROP_STATUS, "status": {"does_not_equal": "Done"}},
        ]
    }

    pages = query_database("TASKS", filter_obj=filter_obj)
    return len(pages)


def create_task(title: str, due_date: str = None, project_id: str = None,
                priority: str = None) -> dict:
    """Create a new task."""
    properties = {
        PROP_NAME: {"title": [{"text": {"content": title}}]},
    }

    if due_date:
        properties[PROP_DUE] = {"date": {"start": due_date}}

    if project_id:
        properties[PROP_PROJECT] = {"relation": [{"id": project_id}]}

    if priority and priority in ("Low", "Medium", "High"):
        properties[PROP_PRIORITY] = {"status": {"name": priority}}

    page = create_page("TASKS", properties)
    return _serialize_task(page)


def complete_task(page_id: str) -> dict:
    """Mark a task as done."""
    properties = {
        PROP_STATUS: {"status": {"name": "Done"}},
    }
    page = update_page(page_id, properties)
    return _serialize_task(page)


def uncomplete_task(page_id: str) -> dict:
    """Revert a task back to To Do."""
    properties = {
        PROP_STATUS: {"status": {"name": "To Do"}},
    }
    page = update_page(page_id, properties)
    return _serialize_task(page)


def reschedule_task(page_id: str, new_due_date: str) -> dict:
    """Change a task's due date."""
    properties = {
        PROP_DUE: {"date": {"start": new_due_date}},
    }
    page = update_page(page_id, properties)
    return _serialize_task(page)


def get_completed_this_week() -> list:
    """Get tasks completed this week (Status = Done, last edited this week)."""
    today = datetime.now()
    start_of_week = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")

    filter_obj = {
        "and": [
            {"property": PROP_STATUS, "status": {"equals": "Done"}},
            {"timestamp": "last_edited_time", "last_edited_time": {"on_or_after": start_of_week}},
        ]
    }

    sorts = [{"timestamp": "last_edited_time", "direction": "descending"}]
    pages = query_database("TASKS", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_task(p) for p in pages]


def get_my_day_tasks() -> list:
    """Get tasks flagged for My Day that aren't done."""
    filter_obj = {
        "and": [
            {"property": PROP_MY_DAY, "checkbox": {"equals": True}},
            {"property": PROP_STATUS, "status": {"does_not_equal": "Done"}},
        ]
    }

    sorts = [{"property": PROP_PRIORITY, "direction": "ascending"}]
    pages = query_database("TASKS", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_task(p) for p in pages]


def get_carry_over_tasks() -> list:
    """Get incomplete tasks that are overdue (carrying over from previous weeks)."""
    today = datetime.now().strftime("%Y-%m-%d")

    filter_obj = {
        "and": [
            {"property": PROP_DUE, "date": {"before": today}},
            {"property": PROP_STATUS, "status": {"does_not_equal": "Done"}},
        ]
    }

    sorts = [{"property": PROP_DUE, "direction": "ascending"}]
    pages = query_database("TASKS", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_task(p) for p in pages]


def get_next_week_tasks() -> list:
    """Get tasks due next week."""
    today = datetime.now()
    days_until_monday = 7 - today.weekday()
    next_monday = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
    next_sunday = (today + timedelta(days=days_until_monday + 6)).strftime("%Y-%m-%d")

    filter_obj = {
        "and": [
            {"property": PROP_DUE, "date": {"on_or_after": next_monday}},
            {"property": PROP_DUE, "date": {"on_or_before": next_sunday}},
            {"property": PROP_STATUS, "status": {"does_not_equal": "Done"}},
        ]
    }

    sorts = [{"property": PROP_DUE, "direction": "ascending"}]
    pages = query_database("TASKS", filter_obj=filter_obj, sorts=sorts)
    return [_serialize_task(p) for p in pages]


def run(input_data: dict = None) -> dict:
    """Entry point for WAT framework."""
    action = (input_data or {}).get("action", "get_today")

    if action == "get_today":
        return {"status": "success", "tasks": get_todays_tasks()}
    elif action == "get_my_day":
        return {"status": "success", "tasks": get_my_day_tasks()}
    elif action == "get_upcoming":
        days = (input_data or {}).get("days", 7)
        return {"status": "success", "tasks": get_upcoming_deadlines(days)}
    elif action == "get_inbox_count":
        return {"status": "success", "count": get_inbox_count()}
    elif action == "create":
        return {"status": "success", "task": create_task(
            title=input_data["title"],
            due_date=input_data.get("due_date"),
            project_id=input_data.get("project_id"),
        )}
    elif action == "complete":
        return {"status": "success", "task": complete_task(input_data["page_id"])}
    else:
        return {"status": "error", "message": f"Unknown action: {action}"}


if __name__ == "__main__":
    print("Fetching today's tasks...")
    result = run({"action": "get_today"})
    for task in result.get("tasks", []):
        print(f"  [{task['status']}] {task['title']} (due: {task['due_date']})")

    print(f"\nInbox count: {run({'action': 'get_inbox_count'})['count']}")

    print("\nUpcoming deadlines:")
    result = run({"action": "get_upcoming", "days": 7})
    for task in result.get("tasks", []):
        print(f"  {task['due_date']}: {task['title']}")
