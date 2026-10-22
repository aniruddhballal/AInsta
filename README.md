# AInsta

AInsta is a small toolkit for building and maintaining a clean Instagram profile catalog. It includes a native Android collector for saving usernames while browsing Instagram and a temporary Firefox extension for collecting profile details and generating analysis reports.

## Project layout

| Folder/file | Purpose |
| --- | --- |
| [`android-app/`](android-app/README.md) | Native Android app and accessibility service. It shows a draggable capture bubble over Instagram, extracts validated usernames, stores them in a searchable catalog, and provides save-state feedback. |
| [`firefox-extension/`](firefox-extension/README.md) | Temporary Firefox extension that maintains a browser-side catalog, visits pending Instagram profiles, collects profile/About this account details, and exports Markdown or HTML reports. |
| `bot-analysis/` | Saved profile URL lists and generated HTML account-information reports. |
| [`AInsta.apk`](AInsta.apk) | APK snapshot kept at the repository root for convenient transfer or installation. For a freshly built APK, use the Android build instructions. |

The Android app and Firefox extension are separate collectors. They do not share live storage: Android uses a public JSON file on the device, while Firefox uses browser `localStorage`.

## Typical workflow

### 1. Capture profiles on Android

Build or install the Android app, grant overlay permission, enable the AInsta accessibility service, open an Instagram profile, and tap the AInsta bubble. The app validates the visible profile identity, ignores duplicates and false metric labels, and saves the username to:

```text
Documents/AInsta/profiles.json
```

The app catalog can search by username, `@username`, or Instagram profile URL. The capture bubble is visible only over Instagram, can be dragged, and provides distinct feedback for a successful save, an already-saved profile, and a failed capture.

See the [Android README](android-app/README.md) for permissions, storage details, build commands, and platform limitations.

### 2. Collect profile details in Firefox

Load the temporary add-on from `about:debugging#/runtime/this-firefox` while logged in to Instagram. The collector panel can add the current profile, mark profiles for refresh, run the pending queue, stop a run, and export:

- `bots.md` - deduplicated Instagram profile URLs
- `bot-account-info.json` - collected profile data, including bios, post counts, and post dates
- `bot-account-info.html` - reusable viewer that loads the JSON data file separately

See the [Firefox extension README](firefox-extension/README.md) for the full workflow and failure handling.

### 3. Review reports

The `bot-analysis/` folder contains the exported profile lists and generated HTML report. The Firefox extension is the supported workflow for collecting profile details; it reads the active Instagram page DOM and exports the report directly.

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
