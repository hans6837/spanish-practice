"""
Spanish Pronunciation Practice - small local server.

Runs only on your own computer (http://localhost:8765). It:
  * serves the web page,
  * reads your Azure key from settings.txt (the key is never stored in the code),
  * exchanges the key for a short-lived token so the browser can talk to Azure,
  * saves your practice results in the "data" folder.

Uses only Python's built-in libraries: nothing extra to install.
"""

import json
import os
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(APP_DIR, "web")
CONTENT_FILE = os.path.join(APP_DIR, "content", "decks.json")
SETTINGS_FILE = os.path.join(APP_DIR, "settings.txt")
DATA_DIR = os.environ.get("SPANISH_PRACTICE_DATA") or os.path.join(APP_DIR, "data")
MY_ITEMS_FILE = os.path.join(DATA_DIR, "my_items.json")
STATE_FILE = os.path.join(DATA_DIR, "review_state.json")
ATTEMPTS_FILE = os.path.join(DATA_DIR, "attempts.jsonl")

HOST = "127.0.0.1"
PORT = int(os.environ.get("SPANISH_PRACTICE_PORT", "8765"))

# Review intervals (seconds) by level. Level 0 = "needs work": comes back
# after a few other items. Higher levels come back less and less often.
MINUTE, DAY = 60, 86400
INTERVALS = [3 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]

_lock = threading.Lock()
_token_cache = {"token": None, "region": None, "expires": 0}

DEFAULT_SETTINGS = {
    "AZURE_SPEECH_KEY": "",
    "AZURE_SPEECH_REGION": "",
    "VOICE": "es-ES-ElviraNeural",
    "SPEED": "-15%",
}


# ---------------------------------------------------------------- settings
def read_settings():
    settings = dict(DEFAULT_SETTINGS)
    if not os.path.exists(SETTINGS_FILE) and os.path.exists(SETTINGS_FILE + ".txt"):
        os.replace(SETTINGS_FILE + ".txt", SETTINGS_FILE)  # Windows "settings.txt.txt" mix-up
    found = os.path.exists(SETTINGS_FILE)
    if found:
        with open(SETTINGS_FILE, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, value = line.split("=", 1)
                value = value.strip().strip('"').strip("'")
                if value:
                    settings[name.strip().upper()] = value
    settings["AZURE_SPEECH_REGION"] = settings["AZURE_SPEECH_REGION"].lower().replace(" ", "")
    return found, settings


def key_looks_valid(key):
    key = key.strip()
    if not key or "paste" in key.lower():
        return False
    return len(key) >= 32 and key.isalnum()


SETTINGS_TEMPLATE = """# Spanish Pronunciation Practice - your private settings.
# This file stays on your computer. Never share it: it contains your Azure key.
#
# Paste KEY 1 from the Azure portal (your Speech resource > Keys and Endpoint):
AZURE_SPEECH_KEY={key}
# The 'Location/Region' shown on the same page, written like: westeurope
AZURE_SPEECH_REGION={region}
#
# Optional: the voice and speaking speed for the Listen button.
# Other Spain voices: es-ES-AlvaroNeural, es-ES-XimenaNeural
VOICE={voice}
# Speed: -15% is slightly slower than normal; 0% is normal speed.
SPEED={speed}
"""


def write_settings(key, region, voice=None, speed=None):
    _, current = read_settings()
    text = SETTINGS_TEMPLATE.format(key=key.strip(), region=region.strip().lower().replace(" ", ""),
                                    voice=voice or current["VOICE"], speed=speed or current["SPEED"])
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        f.write(text)
    _token_cache.update(token=None, expires=0)


# ---------------------------------------------------------------- azure token
def fetch_token(settings):
    """Swap the secret key for a 10-minute token (the key never leaves this program)."""
    key, region = settings["AZURE_SPEECH_KEY"], settings["AZURE_SPEECH_REGION"]
    now = time.time()
    if _token_cache["token"] and _token_cache["region"] == region and now < _token_cache["expires"]:
        return {"ok": True, "mode": "token", "token": _token_cache["token"], "region": region}

    url = f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    req = urllib.request.Request(url, data=b"", method="POST",
                                 headers={"Ocp-Apim-Subscription-Key": key,
                                          "Content-Length": "0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            token = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return {"ok": False, "error": "Azure refused the key (error %d)." % e.code,
                    "help": "Check that AZURE_SPEECH_KEY in settings.txt is copied exactly "
                            "(KEY 1 from the Azure portal) and that AZURE_SPEECH_REGION matches "
                            "the 'Location/Region' shown next to it."}
        return {"ok": False, "error": "Azure answered with error %d." % e.code,
                "help": "Wait a minute and try again. If it keeps happening, check the region name."}
    except urllib.error.URLError as e:
        reason = e.reason
        if isinstance(reason, ssl.SSLError) or "CERTIFICATE" in str(reason).upper():
            # Common on Macs where Python's certificate step was skipped.
            # Fall back to letting the browser (on this computer only) use the key directly.
            return {"ok": True, "mode": "key", "key": key, "region": region,
                    "note": "Python could not check Azure's security certificate, so the browser "
                            "talks to Azure directly. This is fine. To fix it permanently on a Mac, "
                            "double-click 'Install Certificates.command' in Applications > Python 3.x."}
        if isinstance(reason, socket.gaierror) or "Name or service" in str(reason) or "getaddrinfo" in str(reason):
            return {"ok": False, "error": "Could not find Azure region '%s'." % region,
                    "help": "Check AZURE_SPEECH_REGION in settings.txt (for example: westeurope, "
                            "francecentral, eastus) and that you are connected to the internet."}
        return {"ok": False, "error": "Could not reach Azure: %s" % reason,
                "help": "Check your internet connection."}
    except Exception as e:  # pragma: no cover - unexpected
        return {"ok": False, "error": "Unexpected problem: %s" % e, "help": ""}

    _token_cache.update(token=token, region=region, expires=now + 8 * MINUTE)
    return {"ok": True, "mode": "token", "token": token, "region": region}


# ---------------------------------------------------------------- storage helpers
def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def load_attempts():
    attempts = []
    if os.path.exists(ATTEMPTS_FILE):
        with open(ATTEMPTS_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        attempts.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return attempts


def all_items():
    content = load_json(CONTENT_FILE, {"decks": [], "items": []})
    mine = load_json(MY_ITEMS_FILE, [])
    decks = list(content["decks"])
    for it in mine:
        it["custom"] = True
        if it["deck"] not in decks:
            decks.append(it["deck"])
    return decks, content["items"] + mine


# ---------------------------------------------------------------- review scheduling
def update_review(state, item_id, score, now):
    entry = state.get(item_id, {"level": 0, "seen": 0})
    level = entry.get("level", 0)
    if score >= 85:
        level = min(level + 1, len(INTERVALS) - 1)
    elif score >= 65:
        level = max(1, level - 1) if level > 1 else 1
    else:
        level = 0
    entry.update(level=level, seen=entry.get("seen", 0) + 1, last=now,
                 last_score=round(score), due=now + INTERVALS[level])
    state[item_id] = entry
    return entry


def choose_next(items, state, deck, exclude, now, shown=()):
    pool = [it for it in items if (deck in (None, "", "All") or it["deck"] == deck)]
    candidates = [it for it in pool if it["id"] not in exclude] or pool
    if not candidates:
        return None, "empty"
    due = [it for it in candidates if it["id"] in state and state[it["id"]]["due"] <= now]
    if due:
        due.sort(key=lambda it: (state[it["id"]]["level"], state[it["id"]]["due"]))
        return due[0], "review"
    new = [it for it in candidates if it["id"] not in state]
    unshown = [it for it in new if it["id"] not in shown]  # skip ones already shown this session
    if unshown:
        return unshown[0], "new"
    if new:
        return new[0], "new"
    candidates.sort(key=lambda it: state[it["id"]]["due"])
    return candidates[0], "extra"


# ---------------------------------------------------------------- progress summary
def progress_summary(items, attempts, state):
    by_id = {it["id"]: it for it in items}
    first = [a for a in attempts if a.get("first")]
    days = {}
    for a in first:
        day = time.strftime("%Y-%m-%d", time.localtime(a["time"]))
        d = days.setdefault(day, {"day": day, "sum": 0, "n": 0})
        d["sum"] += a.get("overall", 0)
        d["n"] += 1
    daily = [{"day": d["day"], "avg": round(d["sum"] / d["n"], 1), "count": d["n"]}
             for d in sorted(days.values(), key=lambda x: x["day"])]

    sounds = {}
    for a in attempts[-600:]:  # recent attempts only, so improvement shows
        for s in a.get("sounds", []):
            k = s.get("key")
            if not k:
                continue
            e = sounds.setdefault(k, {"key": k, "label": s.get("label", k), "sum": 0, "n": 0})
            e["sum"] += s.get("score", 0)
            e["n"] += 1
    sound_list = [{"key": e["key"], "label": e["label"], "avg": round(e["sum"] / e["n"], 1), "count": e["n"]}
                  for e in sounds.values() if e["n"] >= 2]
    sound_list.sort(key=lambda e: e["avg"])

    weak_items = []
    for item_id, st in state.items():
        if item_id in by_id:
            weak_items.append({"id": item_id, "es": by_id[item_id]["es"], "deck": by_id[item_id]["deck"],
                               "last_score": st.get("last_score"), "level": st.get("level", 0),
                               "seen": st.get("seen", 0)})
    weak_items.sort(key=lambda e: (e["last_score"] if e["last_score"] is not None else 999))

    now = time.time()
    return {
        "total_attempts": len(attempts),
        "items_practised": len(state),
        "items_total": len(items),
        "due_now": sum(1 for st in state.values() if st["due"] <= now),
        "mastered": sum(1 for st in state.values() if st.get("level", 0) >= 3),
        "daily": daily[-60:],
        "sounds": sound_list,
        "weak_items": weak_items[:15],
    }


# ---------------------------------------------------------------- HTTP handler
MIME = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
        ".txt": "text/plain; charset=utf-8"}


class Handler(BaseHTTPRequestHandler):
    server_version = "SpanishPractice/1.0"

    def log_message(self, fmt, *args):  # keep the window quiet
        pass

    # -- helpers
    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def local_only(self):
        # Refuse requests coming from other web sites (only our own page may call the API).
        origin = self.headers.get("Origin")
        if origin and not origin.startswith(("http://localhost:", "http://127.0.0.1:")):
            self.send_json({"error": "forbidden"}, 403)
            return False
        return True

    # -- routes
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        path = url.path

        if path == "/api/status":
            found, s = read_settings()
            return self.send_json({
                "settings_found": found,
                "key_ok": key_looks_valid(s["AZURE_SPEECH_KEY"]),
                "region": s["AZURE_SPEECH_REGION"],
                "voice": s["VOICE"], "speed": s["SPEED"],
                "settings_path": SETTINGS_FILE,
            })
        if path == "/api/token":
            if not self.local_only():
                return
            found, s = read_settings()
            if not found:
                return self.send_json({"ok": False, "error": "settings.txt not found.",
                                       "help": "Make a copy of settings.example.txt, name it settings.txt, "
                                               "and paste your key and region into it."})
            if not key_looks_valid(s["AZURE_SPEECH_KEY"]) or not s["AZURE_SPEECH_REGION"]:
                return self.send_json({"ok": False, "error": "The key or region in settings.txt is missing.",
                                       "help": "Open settings.txt and paste KEY 1 and the region from the "
                                               "Azure portal (Keys and Endpoint page)."})
            res = fetch_token(s)
            res.update(voice=s["VOICE"], speed=s["SPEED"])
            return self.send_json(res)
        if path == "/api/items":
            decks, items = all_items()
            state = load_json(STATE_FILE, {})
            for it in items:
                st = state.get(it["id"])
                it["last_score"] = st.get("last_score") if st else None
            return self.send_json({"decks": decks, "items": items})
        if path == "/api/next":
            decks, items = all_items()
            state = load_json(STATE_FILE, {})
            exclude = [x for x in q.get("exclude", [""])[0].split(",") if x]
            deck = q.get("deck", ["All"])[0]
            shown = set(x for x in q.get("shown", [""])[0].split(",") if x)
            item, why = choose_next(items, state, deck, exclude, time.time(), shown)
            return self.send_json({"item": item, "why": why, "state": state.get(item["id"]) if item else None})
        if path == "/api/progress":
            decks, items = all_items()
            return self.send_json(progress_summary(items, load_attempts(), load_json(STATE_FILE, {})))
        return self.serve_static(path)

    def do_POST(self):
        if not self.local_only():
            return
        path = urllib.parse.urlparse(self.path).path
        try:
            data = self.read_body()
        except (ValueError, json.JSONDecodeError):
            return self.send_json({"error": "bad request"}, 400)

        if path == "/api/attempt":
            now = time.time()
            record = {
                "time": now,
                "item_id": str(data.get("item_id", "")),
                "first": bool(data.get("first")),
                "overall": float(data.get("overall", 0)),
                "accuracy": float(data.get("accuracy", 0)),
                "fluency": float(data.get("fluency", 0)),
                "completeness": float(data.get("completeness", 0)),
                "words": data.get("words", [])[:60],
                "sounds": data.get("sounds", [])[:200],
            }
            with _lock:
                os.makedirs(DATA_DIR, exist_ok=True)
                with open(ATTEMPTS_FILE, "a", encoding="utf-8") as f:
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")
                entry = None
                if record["first"] and record["item_id"]:
                    state = load_json(STATE_FILE, {})
                    entry = update_review(state, record["item_id"], record["overall"], now)
                    save_json(STATE_FILE, state)
            return self.send_json({"ok": True, "review": entry})

        if path == "/api/items":
            es = str(data.get("es", "")).strip()
            if not es:
                return self.send_json({"error": "Please type the Spanish text."}, 400)
            item = {"id": "my-" + uuid.uuid4().hex[:8], "deck": str(data.get("deck") or "My words").strip(),
                    "es": es, "en": str(data.get("en", "")).strip(), "fr": str(data.get("fr", "")).strip()}
            with _lock:
                mine = load_json(MY_ITEMS_FILE, [])
                mine.append(item)
                save_json(MY_ITEMS_FILE, mine)
            return self.send_json({"ok": True, "item": item})

        if path == "/api/settings":
            key = str(data.get("key", "")).strip()
            region = str(data.get("region", "")).strip().lower().replace(" ", "")
            if not key_looks_valid(key):
                return self.send_json({"ok": False, "error": "That doesn't look like an Azure key. It should be a long "
                                       "code of letters and numbers (KEY 1 on the 'Keys and Endpoint' page)."})
            if not region.replace("-", "").isalnum():
                return self.send_json({"ok": False, "error": "Please enter the region, for example westeurope."})
            with _lock:
                write_settings(key, region)
            return self.send_json({"ok": True})

        if path == "/api/items/delete":
            item_id = str(data.get("id", ""))
            with _lock:
                mine = load_json(MY_ITEMS_FILE, [])
                kept = [it for it in mine if it["id"] != item_id]
                save_json(MY_ITEMS_FILE, kept)
            return self.send_json({"ok": True, "deleted": len(mine) - len(kept)})

        return self.send_json({"error": "not found"}, 404)

    def serve_static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(WEB_DIR, path.lstrip("/")))
        if not full.startswith(WEB_DIR) or not os.path.isfile(full):
            self.send_response(404)
            self.end_headers()
            return
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(os.path.splitext(full)[1], "application/octet-stream"))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    url = "http://localhost:%d/" % PORT
    if not os.path.exists(SETTINGS_FILE) and not os.path.exists(SETTINGS_FILE + ".txt"):
        write_settings("", "")  # empty settings file, filled in from the Setup check page
    no_browser = "--no-browser" in sys.argv
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        # Probably already running (e.g. double-clicked twice): just open the page.
        print("The program already seems to be running. Opening it in your browser...")
        if not no_browser:
            webbrowser.open(url)
        return
    print("=" * 60)
    print(" Spanish Pronunciation Practice is running.")
    print(" Your browser should open automatically. If not, go to:")
    print("   " + url)
    print()
    print(" Keep this window open while you practise.")
    print(" To stop the program, close this window.")
    print("=" * 60)
    if not no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
