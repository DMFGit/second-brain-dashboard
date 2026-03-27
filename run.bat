@echo off
echo Starting Second Brain Dashboard...
echo.
echo Dashboard will be available at:
echo   Local:   http://localhost:3000
echo   Network: http://%COMPUTERNAME%:3000
echo.
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0"
python -m uvicorn tools.server:app --host 0.0.0.0 --port 3000
