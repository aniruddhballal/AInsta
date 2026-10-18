# AInsta Firefox collector

This temporary Firefox extension maintains a persistent, deduplicated Instagram profile catalog and can collect profile details from the current logged-in Instagram session. It is separate from the Android app: the extension catalog is stored in Firefox `localStorage`, while the Android catalog is stored in `Documents/AInsta/profiles.json`.

## Current features

- Works on Instagram profile pages in the current logged-in Firefox session.
- Normalizes profile URLs and deduplicates profiles by username.
- Seeds a new catalog from the repository's initial profile URL list and migrates the previous collector catalog when present.
- Shows the current profile and whether it is already saved.
- Adds the current profile without creating duplicates.
- Marks a saved profile for refresh by clearing its successful-fetch state.
- Tracks saved count and pending count in the panel.
- Runs only profiles that have never been successfully collected or were explicitly marked for refresh.
- Navigates the active tab through the pending queue and reports progress.
- Expands the profile bio when Instagram provides a bio expansion control.
- Opens **About this account** through the profile options menu and captures:
  - bio
  - Account based in
  - Date joined
  - raw visible profile text
  - raw About this account text
  - status, error, added time, and last-fetched time
- Downloads `bot-account-info.html` automatically when a pending run finishes.
- Exports the current deduplicated profile URLs as `bots.md`.
- Downloads the full HTML report on demand.
- Stops a collection run without deleting profiles or already-collected data.
- Shows clear status messages for missing profiles, missing menus, failed dialogs, and completed runs.
- The collector panel can be minimized and restored.
- The panel can be dragged anywhere within the browser viewport, and its position and minimized state persist across page loads.

## Run it

1. Keep Firefox open and logged in to Instagram.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** or **Reload** for AInsta.
4. Select `firefox-extension/manifest.json` when Firefox asks for a file.
5. Open an Instagram profile. The **AInsta collector** panel appears in the page.

The extension is a Manifest V2 temporary add-on and has no background server. Its content script runs on Instagram pages and uses the active page DOM.

## Use the collector

### Add a profile

Open an individual profile and click **ADD CURRENT PROFILE**. If the profile is already in the catalog, the panel changes to **ALREADY SAVED** and does not create another entry.

### Collect pending details

1. Click **RUN PENDING PROFILES**.
2. The extension navigates the current tab to each pending profile.
3. It reads the profile, opens the options menu, and opens **About this account**.
4. It saves the result and continues through the queue.
5. When the queue finishes, it downloads `bot-account-info.html` automatically.

Use **MARK CURRENT FOR REFRESH** to make an existing profile pending again. Use **STOP COLLECTION** to stop the queue; saved profiles and completed results remain intact.

### Export files

- **EXPORT BOTS.MD** downloads the current profile URLs as `bots.md`.
- **DOWNLOAD REPORT** downloads `bot-account-info.html` with links, usernames, bios, account location, join date, statuses, timestamps, and expandable captured text.

Firefox downloads are not written directly into the repository. Move the downloaded file into the appropriate repository folder when you want to replace a checked-in catalog or report.

## Catalog and failure handling

The extension keeps its catalog under the `ainsta-profile-catalog-v2` local-storage key. Pending means a profile has not been successfully fetched or has been marked for refresh. Failed runs retain the profile and error status so they can be reviewed or retried.

If Instagram displays a login prompt, checkpoint, rate limit, consent page, changed menu, or changed profile layout, stop the run, handle the page manually, return to a normal profile page, and start the pending run again. The extension does not use Selenium, screen coordinates, or Tab/Enter counts, and it cannot bypass Instagram access controls.
