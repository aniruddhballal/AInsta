# AInsta local dashboard

## Start

Requirements: Node.js 22.12 or newer.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The command starts the React/Vite UI and a Node API at `http://127.0.0.1:4317`. Both bind to loopback only. Load `../firefox-extension/manifest.json` as a temporary add-on in Firefox and sign in to Instagram before starting a collection job; see the [Firefox add-on README](../firefox-extension/README.md) for the exact steps.

The Android app saves captures on the phone to `Documents/AInsta/profiles.json`. There is no automatic phone-to-dashboard sync. To analyze new phone captures, copy and merge their `profiles` entries into `../bot-analysis/botsainsta.md` by `normalized_username`. That file is JSON despite its `.md` extension. On startup, the dashboard imports catalog entries into `../bot-analysis/bot-account-info.json` without replacing existing profile results.

## Workflow

- **Master list** merges the phone catalog in `../bot-analysis/botsainsta.md` into `../bot-analysis/bot-account-info.json` and lets you search/select profiles for surface analysis.
- **Surface analysis** shows collected profile fields and lets you select successfully fetched profiles for deep analysis.
- **Deep analysis** shows saved post dates.
- **Issues** lists unavailable fields, posts, or profiles that should be reviewed; profiles can be ignored and restored from this tab or the master list.

The dashboard API is the only writer for dashboard data. It stores profile records, post dates, job progress, and issues in `bot-account-info.json`. It writes the file atomically and preserves existing profile fields. Text is stored as JSON strings, so captions, bios, and raw page text do not get interpolated into HTML.

## Open the standalone report

With the dashboard server running, open `http://127.0.0.1:4317/report`. The report automatically reads the latest `bot-account-info.json` through the local API. Opening `../bot-analysis/bot-account-info.html` directly as a `file:///` URL cannot automatically read the neighboring JSON file because browsers restrict local-file access; use the JSON picker in that case.

## Repair an older text export

The original checked-in report contains some text that was repeatedly decoded as Windows-1252 instead of UTF-8. The one-time repair script reverses the four verified encoding layers in affected `bio`, `profile_text`, and `about_text` fields. It defaults to preview mode; run it with `--apply` to update the JSON atomically:

```powershell
node scripts/repair-profile-text-encoding.mjs
node scripts/repair-profile-text-encoding.mjs --apply
```

Optional: set `AINSTA_DATA_FILE` to point the API at another JSON file, or `AINSTA_API_PORT` to change its port. If the API port changes, update the Vite proxy and extension manifest host permission to match.

## Build

```powershell
npm run build
```
