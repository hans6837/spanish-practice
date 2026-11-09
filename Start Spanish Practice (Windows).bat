@echo off
REM Double-click this file to start Spanish Pronunciation Practice on Windows.
title Spanish Pronunciation Practice
cd /d "%~dp0"
py -3 --version >nul 2>&1
if %errorlevel%==0 (
  py -3 server.py
  goto end
)
python --version >nul 2>&1
if %errorlevel%==0 (
  python server.py
  goto end
)
echo Python is not installed yet.
echo Your browser will open the Python download page. Install it (tick "Add python.exe to PATH"),
echo then double-click this file again.
start "" "https://www.python.org/downloads/"
:end
echo.
pause
