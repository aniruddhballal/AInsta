# Instagram collector and local workspace

This is an independent collector. `targets.json` supplies `edlt.shox` as the default candidate. Pass `--username=NAME` to collect another account from `../bot-info/database/profiles/index.json`. It never writes to the existing dashboard database or Firefox extension.

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

To use the new local workspace, start it from this folder:

```powershell
npm run ui
```

Open `http://127.0.0.1:5174/`. The Collection page lists every account in the existing profile index. Select accounts and choose a strategy:

| Strategy | Order |
| --- | --- |
| Profile details only | Save account fields and Instagram's exact header post count, then count the reel grid; no individual item pages. |
| Profile + reels, depth first | Profile then reels for account A, then account B, and so on. This also handles a single account. |
| Profile + reels, breadth first | Profile stage for every selected account, then reel stage for every account. |
| Reels only | Reel stage for accounts with saved profile details; no profile refresh. |

Each profile card also has **Run profile + reels** for an immediate single-account depth-first run. Use the **Profile details ready** filter with **Select visible** to assemble a reels-only set. A profile is ready when its header fields include an exact post count and its reel grid scan finishes; incomplete captures are flagged for review. The queue shows completed profile and reel stages, the current account's post and reel counts, review counts, and recent activity. **Stop after current stage** lets the current stage finish before the queue stops. A later run reuses saved grids and items, retrying incomplete items. Keep this terminal open while a batch is running.

Open `http://127.0.0.1:5174/profiles/edlt.shox` for a profile report with its fields, grid counts, reel inventory, missing-field reasons, and a link to the original standalone HTML report. Open `http://127.0.0.1:5174/summary` for totals and rankings across collected accounts. Aggregate totals based on Instagram's `K` and `M` labels are estimates; per-reel values keep the displayed labels. Individual post details remain a later stage. Collected data in `collector-v2/data/` is tracked by Git; browser credentials in `.auth/` and temporary UI screenshots remain ignored. The older web dashboard is unchanged.

The command-line collector is also available:

```powershell
npm run collect
npm run status
npm run report
```

`collect` opens a visible browser. Use `node src/cli.mjs collect --headless` to run in the background. Add `--username=NAME` for another catalog account. `--profile-only` saves account fields and Instagram's exact post count, then counts the reel grid without opening items; `--reels-only --skip-profile` uses saved profile fields and the reel grid to scan reels only. `--reels-only` alone refreshes the profile as well. A normal rerun skips grids marked complete and items with complete details, while retrying partial or failed items. Use `--refresh` to rescan grids and refresh items. `--limit=N` limits item detail attempts for a small test; discovery still runs.

Outputs are under tracked `data/edlt.shox/`:

| File | Contents |
| --- | --- |
| `profile.json` | Profile header counts, bio, About this account fields when visible, raw evidence, issues. |
| `discovery.json` | Separate post and reel URL lists, grid view labels, completeness and errors. |
| `items.json` | Item details, field sources, missing fields, retry state and raw evidence. |
| `run.json` | Current or last run status and stage. |
| `items.csv` | Analysis friendly flat export. |
| `profile.csv` | One row of account fields, the exact Instagram post count, reel grid count, and count errors for analysis. |
| `report.html` | Standalone local review page. Open it directly in a browser. |

Counts shown in Instagram as `K` or `M` are marked `approximate` and retain the original label. The HTML report shows the supplied view and like labels, including `K` or `M` when Instagram used them. `items.csv` keeps numeric estimates in `views` and `likes` and the supplied labels in `views_displayed` and `likes_displayed`. A grid refresh updates view labels in existing reel records and records when they were observed. A missing field is `null` and listed in `missing`; it is not turned into zero. A preview limited by a login wall is marked incomplete. Existing values survive a retry that temporarily cannot read the same field.

Instagram's header post count is used only when it is exact. A rounded label such as `2.9K` produces an error and a blank numeric count in `profile.csv`. The reel count is the number of unique `/reel/` links found after the grid scan reaches its end. If it stops early, the UI and HTML report show an error, `profile.csv` leaves the reel count blank and records the reason, and the partial links remain in `discovery.json` for a retry. The `/p/` link inventory remains a separate, optional post-level scan. Overview post and reel totals remain unavailable until every catalog profile has a verified source count.

When Instagram masks a reel's grid tile with a Sensitive Content overlay, the collector records that as `grid_views_issue`. Missing dates, likes, comments, or views get field-level reasons in `missing_reasons`; if the page gives no more specific clue, the reason names the sources checked. The report puts incomplete items and failed retries in a highlighted manual-review section with direct reel links, and `items.csv` includes the reasons in `manual_review_reason`. A blocked collection run is shown separately in the report.

For follower counts, the collector uses an exact number from the profile header's `title` attribute when Instagram provides one. It also records the displayed header and page metadata counts as evidence. When following counts disagree, it uses the current visible profile header and retains the metadata value in `count_evidence` for review.

## Verification

```powershell
npm test
```

The tests exercise count and metadata parsing plus the browser adapter against local HTML fixtures. Live Instagram content changes, so `run.json`, `discovery.json`, and `items.json` are the source of truth for what a real scan actually completed.
