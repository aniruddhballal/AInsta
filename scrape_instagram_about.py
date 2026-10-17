"""Collect Instagram's visible "About this account" fields with Firefox.

The script intentionally does not automate login or handle credentials. Firefox
opens visibly so the account owner can log in manually, then the script uses the
existing session for the profile checks.
"""

from __future__ import annotations

import argparse
import configparser
import html
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from selenium import webdriver
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    StaleElementReferenceException,
    TimeoutException,
    WebDriverException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = REPO_ROOT / "bots.md"
DEFAULT_OUTPUT = REPO_ROOT / "bot-account-info.html"
NOT_SHOWN = "Not shown"


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def normalized(value: str) -> str:
    return clean_text(value).casefold()


def load_instagram_urls(path: Path) -> list[str]:
    urls: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.search(r"https?://(?:www\.)?instagram\.com/[^\s]+", line)
        if not match:
            continue

        parsed = urlsplit(match.group(0).rstrip(".,);]"))
        parts = [part for part in parsed.path.split("/") if part]
        if not parts:
            continue

        username = parts[0]
        urls.append(f"https://www.instagram.com/{username}/")

    return urls


def username_from_url(url: str) -> str:
    parts = [part for part in urlsplit(url).path.split("/") if part]
    return parts[0] if parts else ""


def find_default_firefox_profile() -> Path | None:
    """Find the default Windows Firefox profile containing the user's login."""
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None

    profiles_ini = Path(appdata) / "Mozilla" / "Firefox" / "profiles.ini"
    if not profiles_ini.exists():
        return None

    config = configparser.ConfigParser()
    config.read(profiles_ini, encoding="utf-8")
    candidates: list[tuple[bool, Path]] = []

    for section in config.sections():
        if not section.lower().startswith("profile"):
            continue
        profile_path = config.get(section, "Path", fallback="")
        if not profile_path:
            continue
        is_relative = config.getint(section, "IsRelative", fallback=1) == 1
        resolved = (profiles_ini.parent / profile_path) if is_relative else Path(profile_path)
        if resolved.exists():
            is_default = config.getboolean(section, "Default", fallback=False)
            candidates.append((is_default, resolved))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def extract_bio(driver: webdriver.Firefox) -> str:
    """Read the profile bio from Instagram's UTF-8 page metadata."""
    selectors = [
        "meta[name='description']",
        "meta[property='og:description']",
    ]
    for selector in selectors:
        for element in driver.find_elements(By.CSS_SELECTOR, selector):
            content = element.get_attribute("content") or ""
            marker = " on Instagram:"
            marker_index = content.casefold().find(marker.casefold())
            if marker_index >= 0:
                bio = content[marker_index + len(marker) :].strip()
                if len(bio) >= 2 and bio[0] == bio[-1] and bio[0] in {'"', "'"}:
                    bio = bio[1:-1]
                if bio:
                    return bio
    return NOT_SHOWN


def first_visible(driver: webdriver.Firefox, locators: list[tuple[str, str]]):
    for by, selector in locators:
        try:
            elements = driver.find_elements(by, selector)
        except WebDriverException:
            continue

        for element in elements:
            try:
                if element.is_displayed() and element.is_enabled():
                    return element
            except StaleElementReferenceException:
                continue
    return None


def click_element(driver: webdriver.Firefox, element) -> None:
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center', inline: 'center'});",
        element,
    )
    try:
        element.click()
    except (ElementClickInterceptedException, WebDriverException):
        driver.execute_script("arguments[0].click();", element)


def click_profile_options(driver: webdriver.Firefox) -> None:
    # Instagram has used both "Options" and "More options" for this button.
    locators = [
        (By.CSS_SELECTOR, "button[aria-label*='Options']"),
        (By.CSS_SELECTOR, "button[aria-label*='options']"),
        (By.XPATH, "//*[@role='button' and contains(translate(@aria-label, 'OPTIONS', 'options'), 'options')]") ,
        (By.XPATH, "//button[contains(translate(@aria-label, 'MORE', 'more'), 'more')]") ,
    ]
    button = first_visible(driver, locators)
    if button is None:
        raise TimeoutException("Could not find the profile options button.")
    click_element(driver, button)


def click_about_this_account(driver: webdriver.Firefox, wait: WebDriverWait) -> None:
    label = "about this account"
    xpath = (
        "//*[self::button or @role='button' or @role='menuitem' or self::a]"
        "[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', "
        "'abcdefghijklmnopqrstuvwxyz'), 'about this account')]"
    )

    def find_about_button(current_driver):
        candidates = current_driver.find_elements(By.XPATH, xpath)
        visible = []
        for candidate in candidates:
            try:
                if candidate.is_displayed() and normalized(candidate.text) == label:
                    visible.append(candidate)
            except StaleElementReferenceException:
                continue
        return min(visible, key=lambda item: len(item.text)) if visible else False

    item = wait.until(find_about_button)
    click_element(driver, item)


def visible_dialog(driver: webdriver.Firefox):
    dialogs = []
    for dialog in driver.find_elements(By.CSS_SELECTOR, "[role='dialog']"):
        try:
            if dialog.is_displayed() and dialog.text.strip():
                dialogs.append(dialog)
        except StaleElementReferenceException:
            continue
    return max(dialogs, key=lambda item: len(item.text)) if dialogs else None


def extract_value(lines: list[str], label: str) -> str:
    wanted = normalized(label)
    labels = {
        normalized("Date joined"),
        normalized("Account based in"),
        normalized("Former usernames"),
        normalized("Accounts with shared followers"),
        normalized("Active ads"),
        normalized("Verified"),
    }

    for index, line in enumerate(lines):
        if normalized(line) != wanted:
            continue
        for candidate in lines[index + 1 : index + 4]:
            if normalized(candidate) not in labels:
                return candidate
    return NOT_SHOWN


def extract_about_details(dialog) -> tuple[str, str, str]:
    raw_text = dialog.text.strip()
    lines = [clean_text(line) for line in raw_text.splitlines() if clean_text(line)]
    country = extract_value(lines, "Account based in")
    date_joined = extract_value(lines, "Date joined")
    return country, date_joined, raw_text


def close_dialog(driver: webdriver.Firefox) -> None:
    close_button = first_visible(
        driver,
        [
            (By.CSS_SELECTOR, "[role='dialog'] button[aria-label*='Close']"),
            (By.CSS_SELECTOR, "[role='dialog'] button[aria-label*='close']"),
        ],
    )
    if close_button is not None:
        try:
            click_element(driver, close_button)
            return
        except WebDriverException:
            pass

    try:
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
    except WebDriverException:
        pass


def collect_one(driver: webdriver.Firefox, url: str, timeout: int) -> dict[str, str]:
    username = username_from_url(url)
    result = {
        "url": url,
        "username": username,
        "bio": NOT_SHOWN,
        "country": NOT_SHOWN,
        "date_joined": NOT_SHOWN,
        "status": "Not checked",
        "raw_text": "",
    }

    try:
        driver.get(url)
        wait = WebDriverWait(driver, timeout)
        wait.until(lambda current_driver: current_driver.execute_script("return document.readyState") == "complete")
        time.sleep(1)
        result["bio"] = extract_bio(driver)

        click_profile_options(driver)
        click_about_this_account(driver, wait)
        dialog = wait.until(visible_dialog)
        country, date_joined, raw_text = extract_about_details(dialog)
        result.update(
            {
                "country": country,
                "date_joined": date_joined,
                "status": "Collected",
                "raw_text": raw_text,
            }
        )
        close_dialog(driver)
    except Exception as exc:  # Keep going so one unavailable account does not stop the run.
        result["status"] = f"Could not collect: {type(exc).__name__}: {exc}"
        close_dialog(driver)

    return result


def render_html(results: list[dict[str, str]], output_path: Path) -> None:
    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    rows = []
    for index, result in enumerate(results, start=1):
        raw_details = html.escape(result["raw_text"] or "No dialog text captured.")
        bio = html.escape(result["bio"]).replace("\n", "<br>")
        rows.append(
            "<tr>"
            f"<td>{index}</td>"
            f"<td><a href=\"{html.escape(result['url'], quote=True)}\" target=\"_blank\" rel=\"noreferrer\">{html.escape(result['url'])}</a></td>"
            f"<td>{html.escape(result['username'])}</td>"
            f"<td class=\"bio\">{bio}</td>"
            f"<td>{html.escape(result['country'])}</td>"
            f"<td>{html.escape(result['date_joined'])}</td>"
            f"<td>{html.escape(result['status'])}</td>"
            f"<td><details><summary>View captured text</summary><pre>{raw_details}</pre></details></td>"
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
    table {{ width: 100%; min-width: 1100px; border-collapse: collapse; }}
    th, td {{ padding: .75rem .9rem; text-align: left; vertical-align: top; border-bottom: 1px solid #e8ecf3; }}
    th {{ background: #eef2f8; color: #33415d; font-size: .9rem; }}
    tr:last-child td {{ border-bottom: 0; }}
    a {{ color: #2457c5; word-break: break-all; }}
    .bio {{ white-space: pre-wrap; max-width: 28rem; overflow-wrap: anywhere; }}
    pre {{ white-space: pre-wrap; max-width: 28rem; }}
    details {{ min-width: 8rem; }}
  </style>
</head>
<body>
  <main>
    <h1>Instagram bot account information</h1>
    <p class="meta">Generated: {html.escape(generated_at)} · Rows: {len(results)} · Values are copied from the visible Instagram “About this account” dialog.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Account URL</th><th>Username</th><th>Bio</th><th>Account based in</th><th>Date joined</th><th>Status</th><th>Captured dialog text</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </div>
  </main>
</body>
</html>
"""
    output_path.write_text(document, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="File containing Instagram URLs (default: bots.md)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="HTML report path (default: bot-account-info.html)")
    parser.add_argument("--timeout", type=int, default=25, help="Seconds to wait for page elements (default: 25)")
    parser.add_argument("--pause", type=float, default=1.5, help="Seconds between profile checks (default: 1.5)")
    parser.add_argument(
        "--firefox-profile",
        type=Path,
        default=None,
        help="Firefox profile directory to reuse; defaults to the Windows default profile",
    )
    args = parser.parse_args()

    urls = load_instagram_urls(args.input)
    if not urls:
        raise SystemExit(f"No Instagram URLs found in {args.input}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, str]] = []

    options = Options()
    options.headless = False
    profile = args.firefox_profile or find_default_firefox_profile()
    if profile is not None:
        if not profile.exists():
            raise SystemExit(f"Firefox profile does not exist: {profile}")
        options.profile = str(profile)
        print(f"Using Firefox profile: {profile}")
        print("Close normal Firefox before continuing so the logged-in profile can be copied cleanly.")
    else:
        print("No Firefox profile was found; Selenium will start a fresh profile.")

    try:
        driver = webdriver.Firefox(options=options)
    except WebDriverException as exc:
        raise SystemExit(
            "Could not start Firefox. Make sure Firefox is installed and run "
            "'python -m pip install selenium' first. Selenium Manager normally "
            "downloads geckodriver automatically.\n"
            f"Details: {exc}"
        ) from exc

    try:
        driver.get(urls[0])
        print("Firefox is open on the first Instagram account.")
        input("Log in to Instagram in Firefox if needed, then press Enter here to begin: ")

        for index, url in enumerate(urls, start=1):
            print(f"[{index}/{len(urls)}] Checking @{username_from_url(url)}")
            result = collect_one(driver, url, args.timeout)
            results.append(result)
            render_html(results, args.output)
            print(f"       {result['status']} — country={result['country']}, date={result['date_joined']}")
            time.sleep(args.pause)
    finally:
        driver.quit()

    print(f"Saved report to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
