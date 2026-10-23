# dedgram

dedgram is a small toolkit for building and maintaining an Instagram profile catalog. It includes a native Android collector, a local web dashboard, and a Firefox extension that collects only jobs started from that dashboard.

## Project layout

| Folder/file | Purpose |
| --- | --- |
| [`android-app/`](android-app/README.md) | Native Android app and accessibility service. It shows a draggable capture bubble over Instagram, extracts validated usernames, stores them in a searchable catalog, and provides save-state feedback. |
| [`firefox-extension/`](firefox-extension/README.md) | Temporary Firefox add-on that collects profile and post details only for jobs started in the dashboard. |
| [`web-dashboard/`](web-dashboard/README.md) | Local React dashboard and loopback API for searching the phone catalog, selecting accounts, and running surface or deep analysis into the shared JSON file. |
| `bot-info/` | The phone-catalog import file and collected profile data. |
| [`dedgram.apk`](dedgram.apk) | APK snapshot kept at the repository root for convenient transfer or installation. For a freshly built APK, use the Android build instructions. |

The Android app and desktop dashboard use separate files. Android writes its phone catalog to `Documents/dedgram/profiles.json`; the dashboard imports usernames from the repository's `bot-info/dedgram-catalog.json` file into `bot-info/bot-account-info.json`. There is no automatic phone-to-computer sync: copy or merge the phone catalog into the repository catalog when you want to bring new captures into the dashboard. Both catalog files are JSON and use the same format. The Firefox add-on performs DOM collection only for jobs explicitly started in the dashboard and sends results to its local API.

## Typical workflow

### 1. Capture profiles on Android

Build or install the Android app, grant overlay permission, enable the dedgram accessibility service, open an Instagram profile, and tap the dedgram bubble. The app validates the visible profile identity, ignores duplicates and false metric labels, and saves the username to:

```text
Documents/dedgram/profiles.json
```

The app catalog can search by username, `@username`, or Instagram profile URL. The capture bubble is visible only over Instagram, can be dragged, and provides distinct feedback for a successful save, an already-saved profile, and a failed capture.

See the [Android README](android-app/README.md) for permissions, storage details, build commands, and platform limitations.

### 2. Bring phone captures into the repository

The Android catalog and dashboard catalog are separate. To analyze new phone captures on your computer, copy `Documents/dedgram/profiles.json` from the phone and merge its `profiles` entries into `bot-info/dedgram-catalog.json`, matching profiles by `normalized_username` so existing catalog entries are not duplicated. If you do not have new phone captures, you can use the catalog already included in the repository.

### 3. Start the local dashboard

Start the dashboard from the repository root:

```powershell
cd web-dashboard
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The dashboard imports usernames from `bot-info/dedgram-catalog.json` into `bot-info/bot-account-info.json` without replacing existing profile results. The local API binds only to `127.0.0.1`.

### 4. Load the Firefox add-on and collect

In Firefox, sign in to Instagram, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…**, and select `firefox-extension/manifest.json`. Keep the dashboard and Firefox open while collecting. In the dashboard, run **Surface analysis** first; after it succeeds, select those profiles in **Deep analysis** to collect post dates. For engagement metrics, open any local profile page and run its separate post or reel details scan; these save independent records with dates, likes, comments, views, fetch times, and retryable issues. The add-on waits for dashboard jobs and does not scan profiles on its own. Profile data, post/reel records, job progress, and issues are stored in `bot-info/bot-account-info.json`.

### 5. Review analysis

Use the dashboard at `http://127.0.0.1:5173` for all profile data: Master list, Surface analysis, Deep analysis, and Issues. These views read the shared `bot-info/bot-account-info.json` file through the local API.

## Data and privacy boundaries

- The Android service reads Instagram's active accessibility tree only after the user taps the capture bubble. It stores validated usernames, not screenshots, captions, bios, follower counts, post counts, direct messages, or surrounding UI text.
- The Android catalog is user-visible and can be managed as `Documents/dedgram/profiles.json`.
- The Firefox add-on reads Instagram's logged-in page DOM only for jobs queued by the dashboard. The local API stores its results in `bot-info/bot-account-info.json`.
- The Firefox collector does not use Selenium, screen coordinates, or keyboard-count macros, and it cannot bypass Instagram login, checkpoints, rate limits, or consent screens.
- Instagram can change its UI and accessibility labels. When identity or collection controls cannot be identified safely, the tools report a failure instead of guessing.

## Development quick start

For the Android app, use JDK 17, Android SDK platform 36, and Build Tools 36:

```powershell
cd android-app
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:assembleDebug
```

The debug APK is generated at `android-app/app/build/outputs/apk/debug/app-debug.apk`. Detailed Android and Firefox instructions live in their respective folder README files.
