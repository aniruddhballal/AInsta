"""Read only Instagram cookies from the user's existing Firefox profile.

This helper writes JSON to stdout for the parent process only. Do not run it
directly in a terminal or redirect its output to a file.
"""
import json
import os
from pathlib import Path
import sqlite3
import sys
import time


def profiles_root():
    if sys.platform == "win32":
        return Path(os.environ["APPDATA"]) / "Mozilla" / "Firefox" / "Profiles"
    return Path.home() / ".mozilla" / "firefox"


root = profiles_root()
if len(sys.argv) > 1:
    profile = Path(sys.argv[1]).expanduser().resolve()
    if root.resolve() not in profile.parents:
        raise SystemExit("Firefox profile must be inside the Firefox profiles directory")
else:
    candidates = [p for p in root.glob("*.default-release") if (p / "cookies.sqlite").exists()]
    if len(candidates) != 1:
        raise SystemExit("Specify a Firefox profile path; could not choose a unique default-release profile")
    profile = candidates[0]

database = profile / "cookies.sqlite"
connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
rows = connection.execute(
    "SELECT name,value,host,path,expiry,isSecure,isHttpOnly,sameSite "
    "FROM moz_cookies WHERE host = 'instagram.com' OR host LIKE '%.instagram.com'"
).fetchall()
cookies = []
for row in rows:
    expiry = row["expiry"] or 0
    if expiry > 10**11:  # Recent Firefox stores cookie expiry in milliseconds.
        expiry /= 1000
    if expiry and expiry < time.time():
        continue
    cookies.append({
        "name": row["name"], "value": row["value"], "domain": row["host"],
        "path": row["path"], "expires": expiry or -1,
        "secure": bool(row["isSecure"]), "httpOnly": bool(row["isHttpOnly"]),
        "sameSite": {0: "None", 1: "Lax", 2: "Strict"}.get(row["sameSite"], "Lax"),
    })
print(json.dumps(cookies))
