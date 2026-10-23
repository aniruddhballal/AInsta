# Isolated Instagram collector prototype

This is an independent prototype for **only `edlt.shox`**. `targets.json` contains the sole candidate, which is checked against `../bot-info/database/profiles/index.json`. It never writes to the existing dashboard database or Firefox extension.

The collector uses free, local Playwright Chromium automation. It reads visible Instagram pages, finds post and reel links from the profile grids, then opens each item by its canonical URL. It saves after each discovery update and each item, so interrupted runs can resume. It does not use undocumented Instagram endpoints or bypass login, checkpoints, or rate limits.

## Setup

From this folder:

```powershell
npm install
npx playwright install chromium
```

To reuse an Instagram session already open in Firefox on this computer:

```powershell
npm run import-firefox
```

This reads **only Instagram cookies** from the single Firefox `default-release` profile and imports them into the ignored `.auth/browser/` directory. The command prints the number of cookies, never their values. If there are multiple Firefox profiles, run `node src/cli.mjs import-firefox --profile="C:\path\to\Firefox\Profiles\your.default-release"`. Python 3 is needed for this optional import; the collector checks `DEDGRAM_PYTHON`, the repository `.venv`, `python3`, and `python` in that order.

Alternatively, use `npm run login`, sign in in the opened Chromium window, and close it. Session files in `.auth/` contain credentials and are gitignored.

## Collect and review

```powershell
npm run collect
npm run status
npm run report
```

`collect` opens a visible browser. Use `node src/cli.mjs collect --headless` to run in the background. A normal rerun skips grids marked complete and items with complete details, while retrying partial or failed items. Use `--refresh` to rescan grids and refresh items. `--limit=N` limits item detail attempts for a small test; discovery still runs.

Outputs are under ignored `data/edlt.shox/`:

| File | Contents |
| --- | --- |
| `profile.json` | Profile header counts, bio, About this account fields when visible, raw evidence, issues. |
| `discovery.json` | Separate post and reel URL lists, grid view labels, completeness and errors. |
| `items.json` | Item details, field sources, missing fields, retry state and raw evidence. |
| `run.json` | Current or last run status and stage. |
| `items.csv` | Analysis friendly flat export. |
| `profile.csv` | One row of account level fields for analysis. |
| `report.html` | Standalone local review page. Open it directly in a browser. |

Counts shown in Instagram as `K` or `M` are marked `approximate` and retain the original label. A missing field is `null` and listed in `missing`; it is not turned into zero. A preview limited by a login wall is marked incomplete. Existing values survive a retry that temporarily cannot read the same field.

## Verification

```powershell
npm test
```

The tests exercise count and metadata parsing plus the browser adapter against local HTML fixtures. Live Instagram content changes, so `run.json`, `discovery.json`, and `items.json` are the source of truth for what a real scan actually completed.
