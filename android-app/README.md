# AInsta Android

AInsta is a native Android companion for collecting Instagram profile usernames. It places a small capture bubble over Instagram, reads the visible accessibility tree only after the user taps it, and maintains a searchable saved-profile catalog.

## Current features

- The capture bubble appears only while Instagram is the active app.
- The bubble uses the AInsta pixel-alien branding in a black rounded-square/squircle.
- Drag the bubble to any position on the screen. Its position is remembered for later sessions.
- A tap and a drag are distinguished, so repositioning the bubble does not accidentally save a profile.
- The bubble uses an accessibility overlay when available and falls back to an accessibility-service overlay when needed.
- Profile capture retries briefly when Instagram has not finished rendering the profile header.
- Username extraction accepts profile-shaped accessibility labels, profile descriptions, and Instagram profile URLs.
- Candidate validation rejects common UI labels and metric values such as `posts`, `followers`, and `1.2K followers` instead of treating them as usernames.
- Usernames are normalized case-insensitively and duplicate profiles are not added.
- Successful saves show a toast and a left-to-right shimmer across the bubble.
- Already-saved profiles show a separate toast, pulse animation, and short vibration.
- While an Instagram profile is open, the capture bubble gets a persistent mint highlight when that username is already saved; the check is debounced and event-driven, without continuous polling.
- Capture or save failures show a separate toast, jitter animation, and warning vibration.
- The main app shows permission status for overlay access and accessibility access.
- The saved-profile catalog displays the username and its derived Instagram profile URL.
- Search matches usernames, `@username`, and Instagram profile URLs. It shows match counts and a no-match state.
- The search field has keyboard-aware insets: results stay above the keyboard, the catalog remains scrollable while the keyboard is open, and the previous scroll position is restored when it closes.
- The catalog has a fixed-height search field with spacing from the section heading and no decorative empty-state bar.

## Capture setup

1. Install the APK.
2. Open AInsta and grant **Overlay permission**.
3. Open Android **Accessibility settings** and enable **AInsta profile capture**.
4. Open an individual Instagram profile.
5. Tap the AInsta bubble once.

The service only attempts capture when the active accessibility window belongs to Instagram. It stores the username after successful validation; it does not save screenshots, captions, bios, follower counts, post counts, direct messages, or surrounding UI text.

## Catalog storage

The Android catalog is stored at the user-visible shared path:

```text
Documents/AInsta/profiles.json
```

Each saved entry contains the captured username, its normalized username, and the first-seen timestamp. The app derives the displayed `instagram.com/<username>/` URL from the normalized username. The file is outside private app storage, so it remains user-visible and normally survives an app uninstall. The app also de-duplicates and validates entries when reading the file.

## Build and test

Requirements: JDK 17, Android SDK platform 36, and Build Tools 36.

```powershell
cd android-app
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:assembleRelease
```

Debug and local release APKs are written under:

```text
app/build/outputs/apk/
```

The local release build uses the generated debug signing key and is intended for device testing. To install the debug build on a connected device:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Reinstalling an APK can cause Android to reset the accessibility-service toggle. If the capture bubble disappears after reinstalling, check AInsta in Accessibility settings again.

## Platform limitation

An ordinary Android overlay cannot inspect Instagram's page text. A user-enabled `AccessibilityService` is therefore required for the tap-to-capture workflow. The service is restricted to Instagram's package and reads the active UI only after the bubble is tapped.

Instagram can change its UI structure and accessibility labels. If the profile header is ambiguous, inaccessible, or not yet rendered, AInsta refuses to guess and reports a capture failure instead.
