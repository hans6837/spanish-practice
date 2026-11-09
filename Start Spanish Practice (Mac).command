#!/bin/bash
# Double-click this file to start Spanish Pronunciation Practice on a Mac.
cd "$(dirname "$0")"
PY=""
for p in /Library/Frameworks/Python.framework/Versions/3.*/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  [ -x "$p" ] && PY="$p"
done
if [ -z "$PY" ] && xcode-select -p >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then PY="$(command -v python3)"; fi
if [ -z "$PY" ]; then
  echo "Python is not installed yet."
  echo "Your browser will open the Python download page. Install it, then double-click this file again."
  open "https://www.python.org/downloads/"
  read -n 1 -s -r -p "Press any key to close this window."
  exit 1
fi
"$PY" server.py
echo
read -n 1 -s -r -p "The program has stopped. Press any key to close this window."
