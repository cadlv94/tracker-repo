# Injectable Production Tracker

A single-page dashboard for PerfectionRx sterile injectable fill/finish — production
metrics, cost model, SKU pipeline, QA release pipeline, weekly report, and forecasting.
It reads the **Sterile Production Log** live from Google Sheets, in the viewer's browser,
so leadership sees the same numbers you see, refreshed automatically.

No build step and no server: it's plain HTML + JavaScript, meant to be hosted on
**GitHub Pages**.

---

## 1. Put it on GitHub Pages

1. Create a new repository and add these files (or push this folder to it).
2. In the repo: **Settings → Pages → Build and deployment → Source = "Deploy from a branch"**,
   branch `main`, folder `/ (root)`. Save.
3. After a minute your site is live at `https://<your-user>.github.io/<repo>/`.

> **GitHub Pages sites are public.** Anyone with the link can open the page and see the
> data. If that isn't acceptable for this data, host it somewhere access-controlled
> instead (see *Privacy* below).

## 2. Turn on the live feed

The page needs a URL it can read the log from. Publish the log as CSV:

1. Open the Sterile Production Log in Google Sheets.
2. **File → Share → Publish to web.**
3. Under **Link**, choose the log tab (e.g. *COMPOUNDING RECORD LOG*) and format
   **Comma-separated values (.csv)**. Click **Publish**.
4. Copy the URL (looks like
   `https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv`).
5. Paste it into **`js/config.js`** as `csvUrl`, commit, and push.

That's it — the page fetches that CSV on load, every couple of minutes, and when a
viewer clicks **↻ Refresh**. Leave `csvUrl` blank to run in **offline-snapshot mode**
using the data bundled in `js/snapshot.js`.

```js
// js/config.js
window.TRACKER_CONFIG = {
  csvUrl: "https://docs.google.com/spreadsheets/d/e/XXXX/pub?single=true&output=csv",
  refreshSeconds: 120,
};
```

## 3. Edit / preview locally (Node + VS Code)

Because everything is static, any static server works:

```bash
npm start        # runs: npx serve .   (or use the VS Code "Live Server" extension)
```

Then open the printed `http://localhost:...` URL. Edit files under `js/` in VS Code and
refresh the browser. No compile step.

---

## What each file does

| File | Purpose |
|------|---------|
| `index.html` | Page shell: header, tabs, styles. Loads the scripts below in order. |
| `js/config.js` | **The one file you normally edit** — the published-CSV URL and refresh cadence. |
| `js/data.js` | Data model: cost assumptions, aggregations (weekly/daily/SKU), yield, forecasting, persistence. |
| `js/snapshot.js` | Bundled offline snapshot of the log (`LOG_DATA`) used when the live feed is off/unreachable. |
| `js/live.js` | Fetches & parses the published CSV, drives the sync-status pill, handles downloads. |
| `js/charts.js` | Hand-rolled SVG charts (columns, lines, stacked, overlay, heatmap, sparkline). |
| `js/views1.js` | Dashboard + Batch Log tabs. |
| `js/views2.js` | Costs, SKU Pipeline, Targets & Forecast, Weekly Report tabs; app init. |
| `data/production-log-snapshot.csv` | A CSV copy of the log at bundle time, for reference. |

To refresh the **offline snapshot** so it isn't stale, replace `data/production-log-snapshot.csv`
with a fresh export and regenerate `js/snapshot.js` from it (the `LOG_DATA` array is just
the parsed rows).

---

## Privacy

- The live feed requires **Publish to web**, which makes that sheet tab readable by anyone
  who has the CSV URL.
- **GitHub Pages is public hosting.** The page, the bundled snapshot, and the live feed are
  all reachable by anyone with the site link.
- If the data must stay internal: keep `csvUrl` blank (snapshot-only) and/or host the page
  behind your own auth (e.g. an internal server, Netlify/Vercel password protection, or a
  private intranet) instead of public GitHub Pages.
- The page only **reads** the sheet — it never writes back to Google.

## Notes

- Google caches the published CSV for a few minutes, so the live view can lag the sheet by
  up to ~5 min even after a manual refresh.
- If a viewer's browser can't reach the CSV, the page shows the bundled snapshot and says so.
- Per-viewer conveniences (last tab, cost-assumption edits) are stored in that viewer's
  browser only; they don't change the sheet or what other viewers see.
# tracker-repo
