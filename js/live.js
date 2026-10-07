/* ============================================================
   Live sync — GitHub Pages / standalone build.
   Fetches the published-to-web CSV of the Sterile Production Log
   directly in the browser, parses it, and re-renders. Auto-refreshes
   on an interval. Falls back to the bundled snapshot (js/snapshot.js)
   when no csvUrl is configured or the fetch fails.
   ============================================================ */
const CFG = window.TRACKER_CONFIG || {};
const LIVE_ENABLED = !!(CFG.csvUrl && String(CFG.csvUrl).trim());
const POLL_MS = Math.max(30, CFG.refreshSeconds || 120) * 1000;

let syncState = { mode: "snapshot", at: null, msg: "" };
let LIVE_SYNCED_AT = null;
let _pollTimer = null;

/* ---- CSV parsing (RFC-4180-ish: quotes, embedded commas/newlines) ---- */
function parseCSV(text) {
  const rows = []; let row = [], field = "", i = 0, q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function csvDateToISO(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || "");
  if (!m) return null;
  return `${(+m[3]).toString().padStart(4, "0")}-${(+m[1]).toString().padStart(2, "0")}-${(+m[2]).toString().padStart(2, "0")}`;
}
function csvNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
}

/* Parse the COMPOUNDING RECORD LOG CSV into batch objects. */
function parseLogCSV(csvText) {
  const rows = parseCSV(csvText);
  let hdr = -1;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].some(c => (c || "").trim() === "Date Compounded")) { hdr = r; break; }
  }
  if (hdr < 0) throw new Error("Log header row not found");
  const out = [];
  for (let r = hdr + 1; r < rows.length; r++) {
    const c = rows[r];
    const date = csvDateToISO(c[0]);
    const lot = (c[1] || "").trim();
    if (!date || !lot) continue;
    const name = (c[3] || "").trim();
    const strengthS = (c[4] || "").trim();
    const unitVol = csvNum(c[5]);
    const fillVol = csvNum(c[6]);
    const theo = csvNum(c[7]);
    const filled = csvNum(c[8]);
    const tested = csvNum(c[9]);
    const expRel = csvDateToISO(c[14]);
    const testing = (c[15] || "").trim();
    const approved = (c[17] || "").trim();
    const released = csvNum(c[18]);
    const capa = (c[20] || "").trim();
    const comment = (c[21] || "").trim();

    const isB35 = /Niacinamide/i.test(name) || /De[xp]*panthenol/i.test(name);
    let line;
    if (isB35) line = /Semaglutide/i.test(name) ? "SB35" : "TB35";
    else if (/Semaglutide/i.test(name)) line = "SEM";
    else if (/Cyanocobalamin/i.test(name)) line = "B12";
    else line = "GLY";
    const nums = (strengthS.match(/([\d.]+)\s*mg/g) || []).map(x => parseFloat(x));
    const strength = nums.length ? nums[0] : null;
    const addConc = nums.length > 1 ? nums[1] : 0.5;
    const niac = isB35 ? (nums[1] ?? null) : null;   // B3 (niacinamide) mg/mL
    const dexp = isB35 ? (nums[2] ?? null) : null;   // B5 (dexpanthenol) mg/mL

    let note = comment;
    if (capa && capa !== "N/A") note = (note ? note + " · " : "") + "CAPA: " + capa;
    const aprIsDate = /^\d{1,2}\/\d{1,2}\/\d{4}/.test(approved);
    const tl = testing.toLowerCase();
    const relCol = released != null ? Math.round(released) : 0;
    let status;
    if (tl === "rejected") status = "rejected";
    else if (approved.startsWith("N/A (")) status = "validation";
    else if (filled == null) status = "scheduled";
    else if (relCol > 0 || aprIsDate) status = "released";
    else status = "pending";

    out.push({
      id: lot, date, formulaId: (c[2] || "").trim(), line,
      strength, addConc, niac, dexp, unitVol, fillVol,
      theo: theo != null ? Math.round(theo) : null,
      filled: filled != null ? Math.round(filled) : null,
      tested: tested != null ? Math.round(tested) : 0,
      released: Math.round(relCol || 0),
      status, note, expRelease: expRel,
      releaseDate: csvDateToISO(c[17]),
    });
  }
  out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
  return out;
}

/* ---- Sync status indicator ---- */
function fmtClock(ts) {
  try { return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
  catch (e) { return ""; }
}
function setSync(mode, opts) {
  syncState = { mode, at: (opts && opts.at) || syncState.at, msg: (opts && opts.msg) || "" };
  renderSyncStatus();
}
function renderSyncStatus() {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.className = "sync-status " + syncState.mode;
  el.replaceChildren();
  const dot = document.createElement("span"); dot.className = "dot"; el.appendChild(dot);
  const txt = document.createElement("span");
  if (syncState.mode === "live") txt.textContent = "Live · synced " + (syncState.at ? fmtClock(syncState.at) : "just now");
  else if (syncState.mode === "syncing") txt.textContent = "Syncing…";
  else if (syncState.mode === "error") txt.textContent = syncState.msg || "Sync error";
  else txt.textContent = "Offline snapshot · " + fmtDate(LOG_SNAPSHOT_DATE);
  el.appendChild(txt);
  const btn = document.getElementById("btn-refresh");
  if (btn) btn.disabled = !LIVE_ENABLED || syncState.mode === "syncing";
}

/* ---- Live fetch ---- */
function applyLiveData(csvText, at) {
  const parsed = parseLogCSV(csvText);
  if (!parsed.length) throw new Error("No batch rows parsed");
  batches = parsed;
  LIVE_SYNCED_AT = at || Date.now();
  setSync("live", { at: LIVE_SYNCED_AT });
  renderAll();
}
async function doSync() {
  if (!LIVE_ENABLED) { setSync("snapshot"); return; }
  setSync("syncing");
  try {
    const url = CFG.csvUrl + (CFG.csvUrl.indexOf("?") >= 0 ? "&" : "?") + "_ts=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    applyLiveData(await res.text(), Date.now());
  } catch (e) {
    if (LIVE_SYNCED_AT) setSync("live", { at: LIVE_SYNCED_AT, msg: "" });
    else { setSync("error", { msg: "Couldn't reach the sheet — showing offline snapshot" }); setTimeout(() => { if (!LIVE_SYNCED_AT) setSync("snapshot"); }, 4000); }
  }
}
function startLiveSync() {
  if (!LIVE_ENABLED) { setSync("snapshot"); return; }
  doSync();
  _pollTimer = setInterval(doSync, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && LIVE_ENABLED) doSync(); });
}
function manualRefresh() { if (LIVE_ENABLED) doSync(); }

/* ---- Downloads (plain browser) ---- */
function offerDownload(filename, data, mime) {
  const blob = new Blob([data], { type: mime || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
