/* ============================================================
   CONFIG — edit this file, commit, and GitHub Pages updates.
   ============================================================

   HOW THE LIVE FEED WORKS
   The page reads your Sterile Production Log directly from Google
   Sheets, in the viewer's browser. To turn that on, publish the log
   tab as CSV and paste its URL below.

   In Google Sheets:
     File → Share → Publish to web
       • Under "Link", pick the log tab (e.g. "COMPOUNDING RECORD LOG")
       • Choose "Comma-separated values (.csv)"
       • Publish, then copy the URL it gives you.
   It looks like:
     https://docs.google.com/spreadsheets/d/e/XXXXXXXX/pub?gid=0&single=true&output=csv

   Paste that into csvUrl below. Leave it "" to run in OFFLINE
   SNAPSHOT mode (uses the data bundled in js/snapshot.js).

   NOTE: publishing to web makes that sheet tab readable by anyone
   with the URL, and a GitHub Pages site is public. Only turn the
   live feed on if that exposure is acceptable for this data.
   ============================================================ */
window.TRACKER_CONFIG = {
  // Paste your published-to-web CSV URL here (or leave "" for offline snapshot):
  csvUrl: "",

  // How often the live view re-checks the sheet, in seconds (min 30):
  refreshSeconds: 120,
};
