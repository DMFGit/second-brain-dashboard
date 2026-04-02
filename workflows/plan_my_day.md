# Plan My Day

Triggered when the user says **"plan my day"** (or similar: "what's my day look like," "help me plan today").

## Objective

Pull together tasks, calendar, and carry-overs into a realistic daily plan through conversation — then lock it in by adding time blocks to the calendar and creating a daily note in Notion.

## Step 1: Gather the Lay of the Land

Run these in parallel:

1. **Notion tasks** — `tools/notion_tasks.py`
   - `get_my_day_tasks()` — tasks the user flagged for today
   - `get_todays_tasks()` — tasks due today or overdue
   - `get_carry_over_tasks()` — overdue tasks still open
2. **Outlook calendar** — use the Outlook MCP tools
   - `list_events` for today — see what's already locked in (meetings, appointments)
3. **Yesterday's daily note** (if it exists) — check Notion Notes for a "Plan" type note from yesterday to see what rolled over

## Step 2: Present the Overview

Show a clear summary:

```
Here's your day:

CALENDAR (fixed)
- 9:00–9:30  Standup
- 1:00–2:00  Client call

TASKS (due today or flagged)
- [High] Finish proposal draft
- [Medium] Review PR from Alex
- [Low] Update expense report

CARRY-OVERS (from previous days)
- Send follow-up email to vendor (was due Mar 28)

REMINDERS (captured since last sync)
- Call dentist
- Pick up dry cleaning
```

Adjust the format based on what's actually there. If there are no carry-overs, skip that section. Keep it scannable.

## Step 3: Ask What Else

Ask: *"What else is on your mind for today? Anything you want to add or anything here you want to drop?"*

Let the user add tasks, reprioritize, or remove things. This is a conversation — don't rush to build the schedule.

## Step 4: Build the Schedule Together

Propose a time-blocked schedule around the fixed calendar commitments. Follow these principles:

- **Fixed events are immovable** — schedule around them
- **High-energy work goes in the morning** (unless the user has told you otherwise)
- **Buffer after meetings** — don't schedule deep work immediately after a long meeting
- **Be realistic** — if there are 6 hours of meetings, don't try to fit 4 hours of deep work
- **Limit to 3 big things** — if the user is packing too much in, push back: *"Based on your schedule, you realistically have time for about 3 focused tasks. Which 3 matter most?"*
- **Include breaks** — lunch, short breaks between blocks

Present the proposed schedule as a timeline:

```
Here's what I'd suggest:

8:00–9:00   Deep work: Finish proposal draft
9:00–9:30   Standup
9:30–10:00  Buffer / quick tasks (review PR, emails)
10:00–11:30 Deep work: [task]
11:30–12:30 Lunch
12:30–1:00  Call dentist + admin tasks
1:00–2:00   Client call
2:00–2:30   Post-meeting notes + break
2:30–4:00   [task or wrap-up]
4:00–4:30   End-of-day review
```

Then ask: *"How does this feel? Want to move anything around?"*

Go back and forth until the user is happy. Common adjustments:
- "Move that earlier / later"
- "I won't have energy for that after the meeting"
- "That'll take longer than you think"
- "Drop X, it can wait"

## Step 5: Lock It In

Once the user agrees:

1. **Add time blocks to Outlook** — use Outlook MCP `create_event` for each scheduled block (not the ones that already exist as calendar events). Mark them as "free" or use a category so they're distinguishable from real meetings.
2. **Create a daily note in Notion** — use `tools/notion_notes.py` or the Notion MCP to create a note with:
   - **Type**: Plan
   - **Note Date**: today
   - **Title**: "Daily Plan — [date]"
   - **Body content**: the agreed schedule as a table, plus an empty "Log" section and an "End of Day" reflection section

## When the Day Falls Apart

If the user comes back and says something like "my day blew up" or "help me replan":

1. Check what was planned (today's daily note)
2. Check what's been done (any completed tasks since the plan was made)
3. Check remaining calendar commitments
4. Help them pick the 1–2 things that still matter and let go of the rest
5. Update the calendar and daily note accordingly

## Edge Cases

- **No calendar connected**: Skip the calendar steps. Plan based on tasks only and present times as suggestions rather than blocks.
- **No tasks flagged**: Ask the user what they want to focus on. Use the upcoming deadlines to suggest priorities.
- **User says "just give me the top 3"**: Skip the full schedule. Pick the 3 highest-priority items, suggest an order, and offer to block time for them.
- **Weekend**: Lighter touch. Ask if they want to plan at all or just pick one thing.

## Tools Used

| Tool | Purpose |
|------|---------|
| `tools/notion_tasks.py` | Get today's tasks, My Day tasks, carry-overs |
| `tools/notion_notes.py` | Create daily plan note |
| Outlook MCP `list_events` | Get today's calendar |
| Outlook MCP `create_event` | Add time blocks |
| Notion MCP `notion-create-pages` | Create daily note (alternative to script) |

## Learns

_This section is updated as the workflow improves. Add notes about the user's preferences, timing patterns, and what works._
