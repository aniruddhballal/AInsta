# AInsta local dashboard

## Start

Requirements: Node.js 22.12 or newer.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The command starts the React/Vite UI and a Node API at `http://127.0.0.1:4317`. Both bind to loopback only. Load `../firefox-extension/manifest.json` as a temporary add-on in Firefox and sign in to Instagram before starting a collection job.

## Workflow

- **Master list** merges the phone catalog in `../bot-analysis/botsainsta.md` into `../bot-analysis/bot-account-info.json` and lets you search/select profiles for surface analysis.
- **Surface analysis** shows collected profile fields and lets you select successfully fetched profiles for deep analysis.
- **Deep analysis** shows saved post dates.
- **Issues** lists unavailable fields, posts, or profiles that should be reviewed; profiles can be ignored and restored from this tab or the master list.

The dashboard API is the only writer for dashboard data. It stores profile records, post dates, job progress, and issues in `bot-account-info.json`. It writes the file atomically and preserves existing profile fields. Text is stored as JSON strings, so captions, bios, and raw page text do not get interpolated into HTML.

Optional: set `AINSTA_DATA_FILE` to point the API at another JSON file, or `AINSTA_API_PORT` to change its port. If the API port changes, update the Vite proxy and extension manifest host permission to match.

## Build

```powershell
npm run build
```
