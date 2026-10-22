# AInsta

AInsta is a small toolkit for building and maintaining an Instagram profile catalog. It includes a native Android collector, a local web dashboard, and a Firefox extension that collects only jobs started from that dashboard.

## Project layout

| Folder/file | Purpose |
| --- | --- |
| [`android-app/`](android-app/README.md) | Native Android app and accessibility service. It shows a draggable capture bubble over Instagram, extracts validated usernames, stores them in a searchable catalog, and provides save-state feedback. |
| [`firefox-extension/`](firefox-extension/README.md) | Temporary Firefox extension that maintains a browser-side catalog, visits pending Instagram profiles, collects profile/About this account details, and exports Markdown or HTML reports. |
| [`web-dashboard/`](web-dashboard/README.md) | Local React dashboard and loopback API for searching the phone catalog, selecting accounts, and running surface or deep analysis into the shared JSON file. |
| `bot-analysis/` | Saved profile URL lists and generated HTML account-information reports. |
| [`AInsta.apk`](AInsta.apk) | APK snapshot kept at the repository root for convenient transfer or installation. For a freshly built APK, use the Android build instructions. |

The Android app and desktop dashboard still use separate files: Android writes `Documents/AInsta/profiles.json`, while the dashboard uses `bot-analysis/bot-account-info.json`. The Firefox extension performs DOM collection only for dashboard jobs and sends results back to the local API.

## Typical workflow

### 1. Capture profiles on Android

Build or install the Android app, grant overlay permission, enable the AInsta accessibility service, open an Instagram profile, and tap the AInsta bubble. The app validates the visible profile identity, ignores duplicates and false metric labels, and saves the username to:

```text
Documents/AInsta/profiles.json
```

The app catalog can search by username, `@username`, or Instagram profile URL. The capture bubble is visible only over Instagram, can be dragged, and provides distinct feedback for a successful save, an already-saved profile, and a failed capture.

See the [Android README](android-app/README.md) for permissions, storage details, build commands, and platform limitations.

### 2. Analyze profiles from the local dashboard

Start the dashboard from the repository root:

```powershell
cd web-dashboard
npm install
npm run dev
```

Open `http://127.0.0.1:5173`, load the temporary add-on using the [Firefox extension instructions](firefox-extension/README.md), then select profiles in the dashboard and start surface or deep analysis. The dashboard imports phone-catalog usernames from `bot-analysis/botsainsta.md` into `bot-account-info.json` without replacing existing profile results. All app data, job progress, and issues are stored in that JSON file. The local API binds only to `127.0.0.1`.

### 3. Review reports

The dashboard has Master list, Surface analysis, Deep analysis, and Issues tabs. It reads and writes the same data file used by the reusable report viewer:

- `bot-account-info.json` - profile records, post dates, workflow state, and collection issues
- `bot-account-info.html` - standalone read-only viewer for a JSON file

## Data and privacy boundaries

- The Android service reads Instagram's active accessibility tree only after the user taps the capture bubble. It stores validated usernames, not screenshots, captions, bios, follower counts, post counts, direct messages, or surrounding UI text.
- The Android catalog is user-visible and can be managed as `Documents/AInsta/profiles.json`.
- The Firefox extension reads the logged-in page DOM in the active browser session and stores its catalog in Firefox `localStorage`.
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
