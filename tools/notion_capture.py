"""
Quick capture tool for the Second Brain.
Creates new notes in the Notion Notes database for quick inbox capture.
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.notion_client_wrapper import create_page, get_page_title

# Property names from Thomas Frank's Ultimate Brain Notes database
PROP_NAME = "Name"           # title
PROP_TYPE = "Type"           # select: Journal, Meeting, Web Clip, Lecture, Reference, Book
PROP_NOTE_DATE = "Note Date"  # date


def quick_capture(text: str) -> dict:
    """Capture a quick note to the Notes inbox."""
    properties = {
        PROP_NAME: {"title": [{"text": {"content": text}}]},
        PROP_NOTE_DATE: {"date": {"start": datetime.now().strftime("%Y-%m-%d")}},
    }

    # Add the text as a paragraph block in the page body
    children = [
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": text}}]
            }
        }
    ]

    page = create_page("NOTES", properties, children=children)

    return {
        "id": page["id"],
        "title": get_page_title(page),
        "url": page.get("url"),
        "created": datetime.now().isoformat(),
    }


def run(input_data: dict = None) -> dict:
    """Entry point for WAT framework."""
    text = (input_data or {}).get("text")
    if not text:
        return {"status": "error", "message": "No text provided"}

    note = quick_capture(text)
    return {"status": "success", "note": note}


if __name__ == "__main__":
    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:])
        result = run({"text": text})
        print(f"Captured: {result['note']['title']}")
        print(f"URL: {result['note']['url']}")
    else:
        print("Usage: python tools/notion_capture.py <text to capture>")
