# AInsta Android

The native Android companion for AInsta keeps a small capture square above other apps and saves Instagram usernames to a durable, user-visible catalog.

## How capture works

1. Install the debug or release APK.
2. Open AInsta and grant **Overlay permission**.
3. Open **Accessibility settings** and enable **AInsta profile capture**.
4. Open an Instagram profile.
5. Tap the small white AInsta square.

The service reads the active Instagram accessibility tree only after the tap. It accepts a strict username-shaped candidate from a profile-like screen, stores no screenshot or surrounding text, and ignores duplicate usernames case-insensitively.

The catalog is written to the shared public path `Documents/AInsta/profiles.json`. This is intentionally outside private app storage, so it survives normal app uninstall and remains deletable by the user through a file manager.

## Build

Requirements: JDK 17, Android SDK platform 36, and Build Tools 36.

```powershell
cd android-app
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:assembleRelease
```

The local release build uses the generated debug signing key and is for device testing. The APK outputs are under `app/build/outputs/apk/`.

## Important platform limitation

Android does not expose Instagram’s page text to an ordinary overlay. A user-enabled AccessibilityService is therefore required for the requested tap-to-capture workflow. The app includes a prominent disclosure and restricts the service declaration to Instagram’s package.

Instagram’s UI and accessibility labels can change. When the profile header is ambiguous or inaccessible, AInsta refuses to save rather than guessing.
