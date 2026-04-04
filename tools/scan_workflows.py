"""
scan_workflows.py
-----------------
Scans all Agentic Workflow projects and generates a status snapshot.
Used by the Second Brain dashboard to show project status and
help decide where to jump back in.

Runs daily at 3am via launchd, or on-demand.

Usage:
    python tools/scan_workflows.py
"""

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

WORKFLOWS_ROOT = Path(os.path.expanduser("~/Agentic Workflows"))
OUTPUT_PATH = Path(__file__).parent.parent / ".tmp" / "workflow_status.json"
SUMMARIES_PATH = Path(__file__).parent / "project_summaries.json"

# Projects to skip (not real projects)
SKIP_DIRS = {"00_Resources", ".git", "__pycache__", "node_modules"}


def load_summaries():
    """Load human-written project summaries."""
    if SUMMARIES_PATH.exists():
        try:
            entries = json.loads(SUMMARIES_PATH.read_text())
            lookup = {}
            for e in entries:
                key = f"{e.get('parent', '') or ''}/{e['name']}".strip("/")
                lookup[key] = e
            return lookup
        except (json.JSONDecodeError, KeyError):
            pass
    return {}


def get_git_info(project_path, count=3):
    """Get last N commits if it's a git repo."""
    try:
        result = subprocess.run(
            ["git", "log", f"-{count}", "--format=%H|%s|%ai"],
            cwd=str(project_path), capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            commits = []
            for line in result.stdout.strip().splitlines():
                parts = line.split("|", 2)
                if len(parts) == 3:
                    commits.append({
                        "hash": parts[0][:8],
                        "message": parts[1],
                        "date": parts[2].strip(),
                    })
            if commits:
                return {
                    "hash": commits[0]["hash"],
                    "message": commits[0]["message"],
                    "date": commits[0]["date"],
                    "recent_commits": commits,
                }
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def get_dirty_status(project_path):
    """Check for uncommitted changes (signals mid-work)."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(project_path), capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            lines = result.stdout.strip().splitlines()
            modified = [l[3:] for l in lines if l.startswith(" M") or l.startswith("M ")]
            added = [l[3:] for l in lines if l.startswith("??") or l.startswith("A ")]
            return {
                "dirty": True,
                "modified": modified[:5],
                "added": added[:5],
                "total_changes": len(lines),
            }
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return {"dirty": False}


def get_next_steps(project_path):
    """Look for TODO.md, open TODOs in code, or CLAUDE.md hints about current work."""
    steps = []

    # Check for TODO.md
    todo_file = project_path / "TODO.md"
    if todo_file.exists():
        try:
            content = todo_file.read_text()
            # Extract unchecked items
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("- [ ]"):
                    steps.append(line[5:].strip())
                if len(steps) >= 5:
                    break
        except OSError:
            pass

    # Check for TODO/FIXME in recently modified Python files
    if len(steps) < 3:
        try:
            result = subprocess.run(
                ["grep", "-rn", "--include=*.py", "-E", r"(TODO|FIXME|HACK|XXX):", str(project_path)],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                for line in result.stdout.strip().splitlines():
                    # Extract just the TODO text
                    for marker in ("TODO:", "FIXME:", "HACK:", "XXX:"):
                        if marker in line:
                            todo_text = line.split(marker, 1)[1].strip()
                            if todo_text and todo_text not in steps:
                                steps.append(todo_text)
                            break
                    if len(steps) >= 5:
                        break
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    return steps


def get_recent_files(project_path, days=7):
    """Get files modified in the last N days."""
    recent = []
    cutoff = datetime.now().timestamp() - (days * 86400)
    for root, dirs, files in os.walk(project_path):
        # Skip hidden dirs, node_modules, .tmp
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__", ".tmp")]
        for f in files:
            if f.startswith("."):
                continue
            fp = Path(root) / f
            try:
                mtime = fp.stat().st_mtime
                if mtime > cutoff:
                    rel = fp.relative_to(project_path)
                    recent.append({
                        "path": str(rel),
                        "modified": datetime.fromtimestamp(mtime).isoformat(),
                    })
            except OSError:
                continue
    recent.sort(key=lambda x: x["modified"], reverse=True)
    return recent[:10]


def get_most_recent_modification(project_path):
    """Get the timestamp of the most recently modified file."""
    latest = 0
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__", ".tmp")]
        for f in files:
            if f.startswith("."):
                continue
            try:
                mtime = (Path(root) / f).stat().st_mtime
                if mtime > latest:
                    latest = mtime
            except OSError:
                continue
    return datetime.fromtimestamp(latest).isoformat() if latest > 0 else None


def count_items(path, pattern="*.py"):
    """Count files matching a pattern."""
    return len(list(path.glob(pattern))) if path.exists() else 0


def read_memory_status(project_path):
    """Check .claude memory files for project status notes."""
    # Check for project-specific memory
    memory_dir = Path(os.path.expanduser("~/.claude/projects"))
    # The memory dir uses a mangled path name
    mangled = str(project_path).replace("/", "-")
    mem_path = memory_dir / mangled / "memory"

    status_notes = []
    if mem_path.exists():
        for f in mem_path.glob("*.md"):
            if f.name == "MEMORY.md":
                continue
            try:
                content = f.read_text()
                # Look for status/project type memories
                if "type: project" in content:
                    # Extract the content after the frontmatter
                    parts = content.split("---")
                    if len(parts) >= 3:
                        body = parts[2].strip()
                        status_notes.append(body[:200])
            except OSError:
                continue
    return status_notes


def scan_project(project_path):
    """Scan a single project and return its status."""
    name = project_path.name

    # Check what exists
    has_tools = (project_path / "tools").exists()
    has_workflows = (project_path / "workflows").exists()
    has_claude_md = (project_path / "CLAUDE.md").exists()
    has_env = (project_path / ".env").exists()

    tools_count = count_items(project_path / "tools", "*.py")
    workflows_count = count_items(project_path / "workflows", "*.md")

    last_modified = get_most_recent_modification(project_path)
    recent_files = get_recent_files(project_path, days=7)
    git_info = get_git_info(project_path)
    dirty = get_dirty_status(project_path)
    memory_notes = read_memory_status(project_path)
    next_steps = get_next_steps(project_path)

    # Determine activity level
    if recent_files:
        activity = "active"
    elif last_modified:
        from datetime import datetime as dt
        days_ago = (datetime.now() - datetime.fromisoformat(last_modified)).days
        if days_ago <= 7:
            activity = "active"
        elif days_ago <= 30:
            activity = "recent"
        else:
            activity = "dormant"
    else:
        activity = "dormant"

    return {
        "name": name,
        "path": str(project_path),
        "activity": activity,
        "last_modified": last_modified,
        "tools_count": tools_count,
        "workflows_count": workflows_count,
        "has_claude_md": has_claude_md,
        "recent_files": recent_files,
        "recent_file_count": len(recent_files),
        "git": git_info,
        "dirty": dirty,
        "memory_notes": memory_notes,
        "next_steps": next_steps,
    }


def scan_all():
    """Scan all projects under Agentic Workflows."""
    projects = []

    for item in sorted(WORKFLOWS_ROOT.iterdir()):
        if not item.is_dir():
            continue
        if item.name in SKIP_DIRS:
            continue
        if item.name.startswith("."):
            continue

        # Check if it's a project with sub-projects (like DMF/)
        has_claude = (item / "CLAUDE.md").exists()
        has_tools = (item / "tools").exists()

        if has_claude or has_tools:
            # It's a standalone project
            projects.append(scan_project(item))
        else:
            # Check for sub-projects
            has_subprojects = False
            for sub in sorted(item.iterdir()):
                if not sub.is_dir() or sub.name in SKIP_DIRS or sub.name.startswith("."):
                    continue
                # Recognize a sub-project if it has meaningful structure
                # (not bare utility folders like "scripts/")
                subdirs = {d.name for d in sub.iterdir() if d.is_dir() and not d.name.startswith(".")}
                has_structure = len(subdirs) >= 2  # Multiple subdirs = real project
                is_project = (
                    (sub / "CLAUDE.md").exists()
                    or (sub / "tools").exists()
                    or (sub / "workflows").exists()
                    or ((sub / "scripts").exists() and has_structure)
                    or (any(sub.glob("*.py")) and has_structure)
                    or any(sub.glob("**/*.lsp"))
                )
                if is_project:
                    project = scan_project(sub)
                    project["parent"] = item.name
                    projects.append(project)
                    has_subprojects = True

            if not has_subprojects:
                # Still add it as a placeholder
                projects.append(scan_project(item))

    # Merge in human-written summaries
    summaries = load_summaries()
    for p in projects:
        key = f"{p.get('parent', '') or ''}/{p['name']}".strip("/")
        s = summaries.get(key, {})
        if s:
            p["status_label"] = s.get("status", "")
            p["summary"] = s.get("summary", "")

    # Sort by status priority, then by last_modified desc
    status_order = {"In progress": 0, "Scaffolded": 1, "Active": 2, "Running": 3, "Built": 4, "Stalled": 5}
    projects.sort(key=lambda p: (
        status_order.get(p.get("status_label", ""), 9),
        -(datetime.fromisoformat(p["last_modified"]).timestamp() if p.get("last_modified") else 0),
    ))

    return projects


def main():
    print(f"Scanning Agentic Workflows in {WORKFLOWS_ROOT}...")
    projects = scan_all()

    result = {
        "scanned_at": datetime.now().isoformat(),
        "projects_count": len(projects),
        "projects": projects,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2, default=str))

    print(f"\nFound {len(projects)} projects:")
    for p in projects:
        parent = f"  ({p['parent']})" if p.get("parent") else ""
        icon = {"active": "*", "recent": "~", "dormant": " "}.get(p["activity"], " ")
        files = f"  [{p['recent_file_count']} recent files]" if p["recent_file_count"] else ""
        print(f"  [{icon}] {p['name']}{parent}{files}")

    print(f"\nOutput: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
