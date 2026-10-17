"""Use the existing Firefox window to collect Instagram profile details.

This is a desktop macro, not a browser-driver script. It uses the currently
open Firefox window, keyboard shortcuts, the clipboard, and two calibrated
mouse positions to click Instagram's profile options and About this account.
"""

from __future__ import annotations

import argparse
import html
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

import pyautogui
import pyperclip


REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = REPO_ROOT / "bots.md"
DEFAULT_OUTPUT = REPO_ROOT / "bot-account-info.html"
NOT_SHOWN = "Not shown"

pyautogui.PAUSE = 0.15
pyautogui.FAILSAFE = True


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def normalized(value: str) -> str:
    return clean_text(value).casefold().rstrip(":")


def load_instagram_urls(path: Path) -> list[str]:
    urls: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.search(r"https?://(?:www\.)?instagram\.com/[^\s]+", line)
        if not match:
            continue

        parsed = urlsplit(match.group(0).rstrip(".,);]"))
        parts = [part for part in parsed.path.split("/") if part]
        if parts:
            urls.append(f"https://www.instagram.com/{parts[0]}/")
    return urls


def username_from_url(url: str) -> str:
    parts = [part for part in urlsplit(url).path.split("/") if part]
    return parts[0] if parts else ""


def focus_firefox() -> None:
    """Bring an existing Firefox window forward when PyAutoGUI can enumerate it."""
    try:
        windows = pyautogui.getAllWindows()
        firefox_windows = [window for window in windows if "Mozilla Firefox" in window.title]
        if firefox_windows:
            firefox_windows[0].activate()
            time.sleep(0.5)
            return
    except (AttributeError, OSError):
        pass

    print("Could not automatically focus Firefox; make sure the Firefox window is active.")


def open_profile_tab(url: str, page_wait: float) -> None:
    pyautogui.hotkey("ctrl", "t")
    time.sleep(0.3)
    pyperclip.copy(url)
    pyautogui.hotkey("ctrl", "l")
    pyautogui.hotkey("ctrl", "v")
    pyautogui.press("enter")
    time.sleep(page_wait)


def copy_visible_page_text() -> str:
    """Copy all visible browser text without changing its Unicode characters."""
    pyautogui.press("escape")
    pyautogui.hotkey("ctrl", "a")
    pyautogui.hotkey("ctrl", "c")
    time.sleep(0.25)
    try:
        return pyperclip.paste()
    except pyperclip.PyperclipException:
        return ""


def extract_label_value(text: str, label: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    wanted = normalized(label)
    for index, line in enumerate(lines):
        if normalized(line) != wanted:
            continue
        for candidate in lines[index + 1 : index + 4]:
            if normalized(candidate) not in {"date joined", "account based in", "former usernames"}:
                return candidate
    return NOT_SHOWN


def extract_bio(profile_text: str, username: str) -> str:
    """Best-effort bio extraction from copied profile text.

    Clipboard capture preserves Unicode, emoji, and special characters. The
    profile page layout can change, so the raw copied text is also saved in the
    HTML report for verification when this heuristic cannot isolate the bio.
    """
    lines = [line.strip() for line in profile_text.splitlines() if line.strip()]
    if not lines:
        return NOT_SHOWN

    stat_pattern = re.compile(r"\b(followers?|following|posts?)\b", re.IGNORECASE)
    stat_indexes = [index for index, line in enumerate(lines) if stat_pattern.search(line)]
    # Use the first profile-stat line; later post captions may also contain
    # words such as "followers" and should not move the bio start position.
    start = stat_indexes[0] + 1 if stat_indexes else 0

    stop_words = {
        "follow", "following", "message", "edit profile", "share profile",
        "posts", "reels", "tagged", "more", "see translation",
    }
    candidates: list[str] = []
    for line in lines[start:]:
        if normalized(line) in stop_words:
            break
        if normalized(line) == normalized(username):
            continue
        if stat_pattern.search(line):
            continue
        candidates.append(line)

    bio = "\n".join(candidates).strip()
    return bio if bio else NOT_SHOWN


def calibrate_positions(
    options_position: tuple[int, int] | None,
    about_position: tuple[int, int] | None,
) -> tuple[tuple[int, int], tuple[int, int]]:
    if options_position is None:
        input(
            "Move the mouse over Instagram's three-dots profile options button, "
            "then press Enter here: "
        )
        options_position = pyautogui.position()

    pyautogui.click(*options_position)
    time.sleep(0.8)

    if about_position is None:
        input(
            "With the options menu open, move the mouse over 'About this account', "
            "then press Enter here: "
        )
        about_position = pyautogui.position()

    pyautogui.press("escape")
    return options_position, about_position


def collect_one(
    url: str,
    options_position: tuple[int, int],
    about_position: tuple[int, int],
    page_wait: float,
    menu_wait: float,
) -> dict[str, str]:
    username = username_from_url(url)
    result = {
        "url": url,
        "username": username,
        "bio": NOT_SHOWN,
        "country": NOT_SHOWN,
        "date_joined": NOT_SHOWN,
        "status": "Not checked",
        "profile_text": "",
        "about_text": "",
    }

    try:
        open_profile_tab(url, page_wait)
        profile_text = copy_visible_page_text()
        result["profile_text"] = profile_text
        result["bio"] = extract_bio(profile_text, username)

        pyautogui.click(*options_position)
        time.sleep(menu_wait)
        pyautogui.click(*about_position)
        time.sleep(menu_wait)

        about_text = copy_visible_page_text()
        result["about_text"] = about_text
        result["country"] = extract_label_value(about_text, "Account based in")
        result["date_joined"] = extract_label_value(about_text, "Date joined")
        result["status"] = "Collected"
    except Exception as exc:  # Continue to the next profile if one page fails.
        result["status"] = f"Could not collect: {type(exc).__name__}: {exc}"
    finally:
        pyautogui.hotkey("ctrl", "w")
        time.sleep(0.5)

    return result


def render_html(results: list[dict[str, str]], output_path: Path) -> None:
    generated_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    rows: list[str] = []
    for index, result in enumerate(results, start=1):
        bio = html.escape(result["bio"]).replace("\n", "<br>")
        profile_text = html.escape(result["profile_text"] or "No profile text captured.")
        about_text = html.escape(result["about_text"] or "No About this account text captured.")
        rows.append(
            "<tr>"
            f"<td>{index}</td>"
            f"<td><a href=\"{html.escape(result['url'], quote=True)}\" target=\"_blank\" rel=\"noreferrer\">{html.escape(result['url'])}</a></td>"
            f"<td>{html.escape(result['username'])}</td>"
            f"<td class=\"bio\">{bio}</td>"
            f"<td>{html.escape(result['country'])}</td>"
            f"<td>{html.escape(result['date_joined'])}</td>"
            f"<td>{html.escape(result['status'])}</td>"
            f"<td><details><summary>Profile text</summary><pre>{profile_text}</pre></details><details><summary>About text</summary><pre>{about_text}</pre></details></td>"
            "</tr>"
        )

    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Instagram Bot Account Information</title>
  <style>
    :root {{ font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #172033; background: #f5f7fb; }}
    body {{ margin: 0; padding: 2rem; }}
    main {{ max-width: 1500px; margin: 0 auto; }}
    h1 {{ margin: 0 0 .35rem; }}
    .meta {{ color: #536079; margin: 0 0 1.25rem; }}
    .table-wrap {{ overflow-x: auto; background: #fff; border: 1px solid #dce2ee; border-radius: 12px; box-shadow: 0 4px 18px #1c2b4a12; }}
    table {{ width: 100%; min-width: 1300px; border-collapse: collapse; }}
    th, td {{ padding: .75rem .9rem; text-align: left; vertical-align: top; border-bottom: 1px solid #e8ecf3; }}
    th {{ background: #eef2f8; color: #33415d; font-size: .9rem; }}
    tr:last-child td {{ border-bottom: 0; }}
    a {{ color: #2457c5; word-break: break-all; }}
    .bio {{ white-space: pre-wrap; max-width: 28rem; overflow-wrap: anywhere; }}
    pre {{ white-space: pre-wrap; max-width: 32rem; }}
    details {{ min-width: 8rem; margin-bottom: .35rem; }}
  </style>
</head>
<body>
  <main>
    <h1>Instagram bot account information</h1>
    <p class="meta">Generated: {html.escape(generated_at)} | Rows: {len(results)} | Fields use Instagram's standard names: Bio, Account based in, and Date joined.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Account URL</th><th>Username</th><th>Bio</th><th>Account based in</th><th>Date joined</th><th>Status</th><th>Captured text</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </div>
  </main>
</body>
</html>
"""
    output_path.write_text(document, encoding="utf-8")


def parse_position(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    try:
        x, y = (int(part.strip()) for part in value.split(",", maxsplit=1))
        return x, y
    except (ValueError, TypeError):
        raise SystemExit(f"Invalid coordinate '{value}'. Use the format x,y, for example 900,220.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="File containing Instagram URLs (default: bots.md)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="HTML report path (default: bot-account-info.html)")
    parser.add_argument("--page-wait", type=float, default=5.0, help="Seconds to wait after navigation (default: 5)")
    parser.add_argument("--menu-wait", type=float, default=1.0, help="Seconds to wait after each menu click (default: 1)")
    parser.add_argument("--options-position", help="Skip calibration with x,y coordinates for the three-dots button")
    parser.add_argument("--about-position", help="Skip calibration with x,y coordinates for About this account")
    args = parser.parse_args()

    urls = load_instagram_urls(args.input)
    if not urls:
        raise SystemExit(f"No Instagram URLs found in {args.input}")

    focus_firefox()
    original_clipboard = None
    try:
        original_clipboard = pyperclip.paste()
    except pyperclip.PyperclipException:
        pass

    open_profile_tab(urls[0], args.page_wait)
    input("If needed, log in to Instagram in the Firefox tab, then press Enter here: ")

    options_position = parse_position(args.options_position)
    about_position = parse_position(args.about_position)
    options_position, about_position = calibrate_positions(options_position, about_position)
    pyautogui.hotkey("ctrl", "w")
    time.sleep(0.5)

    results: list[dict[str, str]] = []
    try:
        for index, url in enumerate(urls, start=1):
            print(f"[{index}/{len(urls)}] Checking @{username_from_url(url)}")
            result = collect_one(url, options_position, about_position, args.page_wait, args.menu_wait)
            results.append(result)
            render_html(results, args.output)
            print(f"       {result['status']} | bio={result['bio'][:60]} | country={result['country']} | date={result['date_joined']}")
    finally:
        if original_clipboard is not None:
            try:
                pyperclip.copy(original_clipboard)
            except pyperclip.PyperclipException:
                pass

    print(f"Saved report to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
