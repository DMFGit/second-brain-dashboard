# Workflow: Set Up Notion Integration

## Objective
Connect the Second Brain dashboard to your Notion workspace via the API.

## Steps

### 1. Create a Notion Integration
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Name it **Second Brain Dashboard**
4. Select your workspace
5. Under **Capabilities**, ensure these are checked:
   - Read content
   - Update content
   - Insert content
6. Click **Submit**
7. Copy the **Internal Integration Secret** (starts with `secret_`)

### 2. Add the API Key to .env
Open `.env` in the project root and paste your secret:
```
NOTION_API_KEY=secret_your_key_here
```

### 3. Share Databases with the Integration
For **each** database in your Second Brain:
1. Open the database in Notion
2. Click the **...** menu (top right)
3. Click **Connections** → **Connect to** → search for **Second Brain Dashboard**
4. Click **Confirm**

You need to share these databases:
- Tasks
- Projects
- Work Sessions
- Notes
- Tags
- Goals
- Milestones
- People
- Books, Reading Log, Book Genres
- Recipes, Recipe Tags, Meal Planner, Kitchen Inventory, Pantry Inventory Processor
- Movies, Movie Log, Movie Genres

### 4. Verify Database IDs
The database IDs are already configured in `.env`. If any are wrong, you can find the correct ID by:
1. Opening the database in Notion (full page view)
2. Looking at the URL: `notion.so/your-workspace/<DATABASE_ID>?v=...`
3. The database ID is the 32-character hex string before the `?`

### 5. Run Schema Discovery
```bash
pip install -r requirements.txt
python tools/discover_schema.py
```

This queries every database and writes the property mapping to `workflows/notion_database_map.md`.

### 6. Verify Property Names
Open `workflows/notion_database_map.md` and check that the property names match what's used in the tools:
- `tools/notion_tasks.py` expects: Name, Status, Due, Project, Priority
- `tools/notion_capture.py` expects: Name
- `tools/notion_projects.py` expects: Name, Status, Area

If your Notion properties have different names, update the `PROP_*` constants at the top of each tool file.

### 7. Test the Connection
```bash
python tools/notion_tasks.py
```

You should see your tasks listed. If you get errors:
- **401 Unauthorized**: Check your API key in `.env`
- **404 Not Found**: The database isn't shared with the integration (redo Step 3)
- **Property errors**: Property names don't match (redo Step 6)

## Expected Output
- `.env` has a valid `NOTION_API_KEY`
- All databases are shared with the integration
- `workflows/notion_database_map.md` shows all property schemas
- `python tools/notion_tasks.py` returns real task data

## Lessons Learned
- (Updated as issues are discovered)
