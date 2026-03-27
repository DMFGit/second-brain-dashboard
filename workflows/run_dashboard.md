# Workflow: Run the Dashboard

## Objective
Start the Second Brain dashboard and access it from desktop or phone.

## Prerequisites
- Notion integration set up (see `workflows/setup_notion_integration.md`)
- Python dependencies installed: `pip install -r requirements.txt`
- `NOTION_API_KEY` set in `.env`

## Start the Server

### Option A: Double-click
Double-click `run.bat` in the project root.

### Option B: Command line
```bash
cd "c:\Users\DinaFerraiuolo\Agentic Workflows\Second Brain"
python -m uvicorn tools.server:app --host 0.0.0.0 --port 3000
```

## Access the Dashboard

### Desktop
Open http://localhost:3000

### iPhone / iPad (same WiFi)
1. Find your PC's local IP: run `ipconfig` and look for the IPv4 address (e.g., `192.168.1.100`)
2. Open `http://192.168.1.100:3000` in Safari
3. Tap **Share** → **Add to Home Screen** → name it **Brain**
4. It now launches as a standalone app from your home screen

### Windows Firewall
If iPhone can't connect, you may need to allow port 3000:
1. Open **Windows Defender Firewall** → **Advanced Settings**
2. **Inbound Rules** → **New Rule**
3. Port → TCP → 3000 → Allow → Name it "Second Brain Dashboard"

## Stop the Server
Press `Ctrl+C` in the terminal window.

## Auto-Start on Login (Optional)
1. Press `Win+R` → type `shell:startup` → Enter
2. Copy a shortcut to `run.bat` into this folder
3. The dashboard will start automatically when you log in

## Troubleshooting
- **"NOTION_API_KEY not set"**: Add your key to `.env`
- **Blank dashboard**: Check browser console for errors; ensure databases are shared with the integration
- **iPhone can't connect**: Check firewall rules and that both devices are on the same WiFi network
- **Slow loading**: First load queries Notion directly; subsequent loads use the 2-minute cache

## Lessons Learned
- (Updated as issues are discovered)
