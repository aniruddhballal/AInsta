# dedgram local dashboard

## Start

Requirements: Node.js 22.12 or newer.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Each dashboard view has its own path (for example, `/surface-analysis` and `/reel-counts`), and searches and filters are stored in the URL query string, so the current view can be bookmarked or reloaded. Click a username to open its local profile page at `/username`; it displays the saved profile fields and collected post dates. Browser back/forward switches views and profiles. The command starts the React/Vite UI and a Node API at `http://127.0.0.1:4317`. Both bind to loopback only. Load `../firefox-extension/manifest.json` as a temporary add-on in Firefox and sign in to Instagram before starting a collection job; see the [Firefox add-on README](../firefox-extension/README.md) for the exact steps.

The Android app saves captures on the phone to `Documents/dedgram/profiles.json`. There is no automatic phone-to-dashboard sync. To analyze new phone captures, copy and merge their `profiles` entries into `../bot-info/dedgram-catalog.json` by `normalized_username`. On startup, the dashboard imports catalog entries into `../bot-info/database/` without replacing existing profile results.

## Workflow

- **Master list** merges the phone catalog in `../bot-info/dedgram-catalog.json` into the profile records in `../bot-info/database/profiles/` and lets you search/select profiles for surface analysis.
- **Surface analysis** shows collected profile fields and lets you select successfully fetched profiles for deep analysis.
- **Post counts** filters profiles with missing post totals and runs a targeted refresh that updates only `posts_count`; failed attempts are recorded under Issues.
- **Reel counts** scans each selected account’s Reels tab, counts unique reel links, and saves `reels_count` only after the scan reaches a stable end. Incomplete scans leave any previous count intact and create an Issue.
- **Insights** summarizes country, status, post-count, join-year, and repeated-bio patterns across fetched profiles.
- **Deep analysis** shows saved post dates.
- **Profile pages** (`/username`) show separate post and reel detail scans. Their buttons collect each item’s date, likes, comments, views, and latest fetch time without changing surface or deep analysis. Unavailable fields and incomplete scans create retryable Issues.
- **Issues** lists unavailable fields, posts, or profiles that should be reviewed; profiles can be ignored and restored from this tab or the master list.

The dashboard API is the only writer for dashboard data. Its JSON store is split by entity:

- `../bot-info/database/profiles/` contains one core profile file per username plus an ordered profile index.
- `../bot-info/database/deep-analysis/` contains each profile's saved post dates.
- `../bot-info/database/content/posts/` and `content/reels/` contain separate per-profile item records and collection status.
- `../bot-info/database/issues/profiles/` contains the current profile issue summaries; `issues/history/` stores issue events separately by ID.
- `../bot-info/database/workflow.json` stores the active and recent collection jobs; `meta.json` stores the format version and update time.

The API combines these files into the state object used by the UI and writes changed files atomically. Text is stored as JSON strings, so captions, bios, and raw page text do not get interpolated into HTML. Existing `bot-account-info.json` files are imported automatically on first startup when the new store does not exist.

## Browse all collected data

Use the dashboard at `http://127.0.0.1:5173` for the full catalog and analysis results. The Master list, Surface analysis, Insights, Post counts, Reel counts, Deep analysis, and Issues tabs together show profile data, summaries, post dates, statuses, and collection problems stored under `../bot-info/database/`.

## Repair an older text export

Some profile text in the checked-in JSON was repeatedly decoded as Windows-1252 instead of UTF-8. The repair script reverses the four verified encoding layers in affected `bio`, `profile_text`, and `about_text` fields. It defaults to preview mode and now reads the split profile files; run it with `--apply` to update affected JSON files atomically:

```powershell
node scripts/repair-profile-text-encoding.mjs
node scripts/repair-profile-text-encoding.mjs --apply
```

Optional: set `dedgram_data_dir` to point the API at another split data directory, or `dedgram_api_port` to change its port. `dedgram_data_file` is only used as a legacy single-file import when the split store does not exist. If the API port changes, update the Vite proxy and extension manifest host permission to match.

## Build

```powershell
npm run build
```
