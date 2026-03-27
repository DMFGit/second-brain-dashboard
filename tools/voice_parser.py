"""
Voice command parser.
Regex-based NLP that routes spoken commands to the appropriate action.
No LLM needed — handles predictable command patterns instantly.
"""

import re


# Command patterns — ordered by specificity (most specific first)
PATTERNS = [
    # Task creation
    (r"(?:add|create|new)\s+(?:a\s+)?(?:task\s+)?['\"]?(.+?)['\"]?\s+(?:to\s+)?(?:my\s+)?tasks?",
     "create_task"),
    (r"(?:remind\s+me\s+to|remember\s+to)\s+(.+)",
     "create_task"),
    (r"(?:add|create|new)\s+(?:a\s+)?task\s*[:\-]?\s*(.+)",
     "create_task"),

    # Quick capture
    (r"(?:capture|note|jot\s+down|write\s+down)\s+(.+)",
     "capture"),
    (r"(?:save|log)\s+(?:a\s+)?(?:note|thought)\s*[:\-]?\s*(.+)",
     "capture"),

    # Query today
    (r"(?:what(?:'s| is)\s+)?(?:on\s+)?(?:my\s+)?(?:plate|agenda|schedule)\s*(?:today)?",
     "query_today"),
    (r"(?:what(?:'s| is)\s+)?(?:due|happening)\s+today",
     "query_today"),
    (r"(?:show|list|get)\s+(?:my\s+)?(?:today(?:'s)?|daily)\s+(?:tasks?|to\s*-?\s*do)",
     "query_today"),
    (r"(?:today(?:'s)?)\s+(?:tasks?|to\s*-?\s*do)",
     "query_today"),

    # Query upcoming
    (r"(?:what(?:'s| is)\s+)?(?:due|coming\s+up)\s+(?:this\s+)?week",
     "query_upcoming"),
    (r"(?:show|list|get)\s+(?:my\s+)?(?:upcoming|next|week(?:'s)?)\s+(?:tasks?|deadlines?)",
     "query_upcoming"),

    # Complete task
    (r"(?:mark|set)\s+['\"]?(.+?)['\"]?\s+(?:as\s+)?(?:done|complete|finished)",
     "complete_task"),
    (r"(?:complete|finish|done\s+with)\s+['\"]?(.+?)['\"]?$",
     "complete_task"),

    # Show projects
    (r"(?:show|list|get)\s+(?:my\s+)?(?:active\s+)?projects?",
     "query_projects"),
]


def parse(transcript: str) -> dict:
    """Parse a voice transcript into an action and parameters.

    Args:
        transcript: The spoken text to parse

    Returns:
        Dict with 'action' and 'params', or 'action': 'unknown'
    """
    text = transcript.strip().lower()

    for pattern, action in PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # Extract captured group if present
            param = match.group(1).strip() if match.lastindex else None

            if action == "create_task":
                return {"action": "create_task", "params": {"title": param}}
            elif action == "capture":
                return {"action": "capture", "params": {"text": param}}
            elif action == "complete_task":
                return {"action": "complete_task", "params": {"search": param}}
            elif action in ("query_today", "query_upcoming", "query_projects"):
                return {"action": action, "params": {}}

    # Unknown — return the raw text for manual editing
    return {"action": "unknown", "params": {"text": text}}


def run(input_data: dict = None) -> dict:
    """Entry point for WAT framework."""
    transcript = (input_data or {}).get("transcript", "")
    if not transcript:
        return {"status": "error", "message": "No transcript provided"}

    result = parse(transcript)
    return {"status": "success", **result}


if __name__ == "__main__":
    test_phrases = [
        "What's on my plate today?",
        "Add buy groceries to my tasks",
        "Remind me to call the dentist",
        "What's due this week?",
        "Capture meeting notes from standup",
        "Mark laundry as done",
        "Show my projects",
        "Something random that doesn't match",
    ]

    for phrase in test_phrases:
        result = parse(phrase)
        print(f"  \"{phrase}\"")
        print(f"    -> {result['action']}: {result.get('params', {})}")
        print()
