# Firefox collector

This temporary Firefox extension maintains a persistent, deduplicated Instagram profile catalog. It uses the currently logged-in Instagram session and reads the page DOM; it does not use Selenium, screen coordinates, or Tab/Enter counts.

## Run it

1. Keep Firefox open and logged in to Instagram.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on…** or **Reload** for the Finsta extension.
4. Select `firefox-extension/manifest.json` when Firefox asks for a file.
5. Open any Instagram profile. The **Finsta collector** panel appears in the lower-right corner.

## Maintain the catalog

- **＋ Add current profile** saves the open profile.
- Adding the same profile again does nothing; URLs are normalized and deduplicated by username.
- **↻ Mark current for refresh** makes a saved profile pending again.
- **▶ Run pending profiles** visits only profiles that have never been successfully fetched or were marked for refresh.
- **⇩ Export bots.md** downloads the current deduplicated URL list.
- **⇩ Download report** downloads the current catalog and captured fields as `bot-account-info.html`.
- **■ Stop collection** stops the queue without deleting saved profiles.

The catalog tracks `added_at`, `last_fetched_at`, status, errors, bio, Account based in, Date joined, and captured text. The browser cannot silently write into the repository, so move the downloaded `bots.md` or HTML report into the repo when you want to replace those files.

If Instagram displays a login, checkpoint, rate-limit, or consent page, stop the run, handle that page manually, return to Instagram, and start the pending run again.
