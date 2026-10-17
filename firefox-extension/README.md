# Firefox collector

This is a temporary Firefox extension for collecting the 25 Instagram profiles in the repository's `bots.md` file. It uses the currently logged-in Instagram session and reads the page DOM; it does not use Selenium, screen coordinates, or Tab/Enter counts.

## Run it

1. Keep Firefox open and logged in to Instagram.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on…**.
4. Select `firefox-extension/manifest.json` from this repository.
5. Open any Instagram profile page. A **Finsta collector** panel appears in the lower-right corner.
6. Click **Start / restart** once. Leave the tab alone while it visits each profile.
7. Firefox downloads `bot-account-info.html` when all profiles are finished. Move that downloaded file into the repository root if you want it tracked there.

The extension saves progress in Instagram's local storage, so a page refresh does not lose already collected rows. Use **Stop** to pause before manually navigating away. Clicking **Start / restart** clears the previous run and begins again from the first URL.

If Instagram displays a login, checkpoint, rate-limit, or consent page, stop the run, handle that page manually, return to a profile, and start again.
