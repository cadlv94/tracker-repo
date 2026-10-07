"use strict";
/* ============================================================
   Data model — aligned to the PerfectionRx Sterile Production Log
   ============================================================ */
const BATCHES_PER_DAY = 8;
const PROD_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_THEO = 260;
const DEFAULT_UNIT_VOL = 2;
const DEFAULT_FILL_VOL = 2.3;
const DEFAULT_ADD_CONC = 0.5;

const LINES = {
  GLY:  { name: "Tirzepatide + Glycine", short: "TZ + Glycine", color: "series-1" },
  B12:  { name: "Tirzepatide + B12",     short: "TZ + B12",     color: "series-2" },
  SEM:  { name: "Semaglutide + Glycine", short: "Sema + Glycine", color: "series-3" },
  TB35: { name: "Tirzepatide + B3/B5 (Niacinamide + Dexpanthenol)", short: "TZ + B3/B5", color: "series-5" },
  SB35: { name: "Semaglutide + B3/B5 (Niacinamide + Dexpanthenol)", short: "Sema + B3/B5", color: "series-6" },
};
const B35_LINES = ["TB35", "SB35"];
function isB35(b) { return b.line === "TB35" || b.line === "SB35"; }

/* ---- Product-name nomenclature: lab vs fulfillment ----
   Fulfillment SKU encodes per-container totals (per-mL strength × vial volume).
   e.g. Tirz B3/B5 10/5/10 mg/mL @ 2 mL → TZT/B(3)/B(5)20/10/20U. */
let NAME_MODE = "lab";
const NAME_MODE_KEY = "iptracker_namemode";
function loadNameMode() {
  try { const v = localStorage.getItem(NAME_MODE_KEY); if (v === "lab" || v === "fulfillment") NAME_MODE = v; } catch (e) {}
}
function setNameMode(m) { NAME_MODE = (m === "fulfillment") ? "fulfillment" : "lab"; try { localStorage.setItem(NAME_MODE_KEY, NAME_MODE); } catch (e) {} }
function fmtVol(v) { return (v == null ? "" : (Number.isInteger(v) ? v : v) + " mL"); }
function numTrim(n) { const x = Math.round(n * 100) / 100; return Number.isInteger(x) ? String(x) : String(x); }
/* Fulfillment SKU code from a batch/SKU-like object (line, strength, niac, dexp, unitVol). */
function fulfillmentName(o) {
  const vol = o.unitVol || DEFAULT_UNIT_VOL;
  const g = perML => numTrim((perML || 0) * vol);          // per-container total
  switch (o.line) {
    case "GLY":  return "TZT/GLCN" + g(o.strength) + "/1U";
    case "B12":  return "TZT/B(12)" + g(o.strength) + "/1U";
    case "SEM":  return "SG/GLCN" + g(o.strength) + "/1U";
    case "TB35": return "TZT/B(3)/B(5)" + g(o.strength) + "/" + g(o.niac) + "/" + g(o.dexp) + "U";
    case "SB35": return "SG/B(3)/B(5)" + g(o.strength) + "/" + g(o.niac) + "/" + g(o.dexp) + "U";
    default:     return LINES[o.line] ? LINES[o.line].short : String(o.line);
  }
}
/* Lab-nomenclature name for a batch/SKU-like object. */
function labName(o) {
  const base = LINES[o.line] ? LINES[o.line].short : String(o.line);
  if (o.line === "TB35" || o.line === "SB35") {
    const str = [o.strength, o.niac, o.dexp].map(x => x == null ? "?" : x).join("/");
    return base + " " + str + (o.unitVol ? " · " + fmtVol(o.unitVol) : "");
  }
  return base + (o.strength != null ? " " + o.strength + "/" + o.addConc : "");
}
/* Mode-aware display name — used everywhere a product/SKU is named. */
function displayName(o) { return NAME_MODE === "fulfillment" ? fulfillmentName(o) : labName(o); }
const STATUS_LABELS = {
  released: "released", pending: "in testing", rejected: "rejected",
  validation: "validation", scheduled: "scheduled",
};

function productLabel(b) { return displayName(b); }
function skuKey(b) { return b.line + "-" + b.strength + "-" + (b.niac ?? "") + "-" + (b.dexp ?? "") + "-" + b.unitVol; }

const defaultAssumptions = {
  tirzPerG:   850, semaPerG: 500, glyPerKg: 18, b12PerG: 24, niacPerG: 2, dexpPerG: 3, wfiPerL: 0.40,
  vial: 0.42, stopper: 0.09, cap: 0.06, label: 0.04,
  laborBatch: 480, qcBatch: 350, labBatch: 450, ohBatch: 600,
};
let A = { ...defaultAssumptions };

function vialCost(b) {
  const strength = b.strength ?? 0, fillVol = b.fillVol ?? DEFAULT_FILL_VOL, addConc = b.addConc ?? DEFAULT_ADD_CONC;
  const apiRate = (b.line === "SEM" || b.line === "SB35") ? A.semaPerG : A.tirzPerG;
  const api = (strength * fillVol / 1000) * apiRate;
  let add;
  if (b.line === "TB35" || b.line === "SB35") {
    // two actives: niacinamide (B3) + dexpanthenol (B5), each mg/mL × fill volume
    add = ((b.niac || 0) * fillVol / 1000) * A.niacPerG + ((b.dexp || 0) * fillVol / 1000) * A.dexpPerG;
  } else if (b.line === "B12") {
    add = ((addConc * fillVol) / 1000) * A.b12PerG;
  } else {
    add = ((addConc * fillVol) / 1e6) * A.glyPerKg;
  }
  const wfi = (fillVol / 1000) * A.wfiPerL;
  const components = A.vial + A.stopper + A.cap + A.label;
  return { api, materials: add + wfi + components };
}
function batchCost(b) {
  const v = vialCost(b);
  const units = b.theo ?? DEFAULT_THEO;
  return {
    api: v.api * units, materials: v.materials * units,
    laborQc: A.laborBatch + A.qcBatch + A.labBatch, overhead: A.ohBatch,
    total: (v.api + v.materials) * units + A.laborBatch + A.qcBatch + A.labBatch + A.ohBatch,
  };
}
function batchCostTotal(b) { return batchCost(b).total; }

/* Date helpers */
function d2s(d) { return d.toISOString().slice(0, 10); }
function s2d(s) { const [y, m, dd] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
function addDays(s, n) { const d = s2d(s); d.setUTCDate(d.getUTCDate() + n); return d2s(d); }
function dayOfWeek(s) { return s2d(s).getUTCDay(); }
function mondayOf(s) { const dw = dayOfWeek(s); return addDays(s, dw === 0 ? -6 : 1 - dw); }
function fmtDate(s) { return s2d(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }
function fmtDateLong(s) { return s2d(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }); }
function fmtWeek(s) { return "Wk of " + fmtDate(s); }
function fmtDateShort(s) { const d = s2d(s); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); }
const TODAY = d2s(new Date());
const THIS_MONDAY = mondayOf(TODAY);

let batches = [];

function newLotId(date) {
  const base = date.slice(5, 7) + date.slice(8, 10) + date.slice(0, 4);
  let n = 1;
  while (batches.some(b => b.id === base + "-" + String(n).padStart(2, "0"))) n++;
  return base + "-" + String(n).padStart(2, "0");
}
function loadLogSnapshot() { batches = LOG_DATA.map(b => ({ ...b })); }

/* Aggregation */
function isProduced(b) { return b.status !== "scheduled" && b.filled != null; }

function filteredBatches(lineFilter, fromDate, toDate) {
  return batches.filter(b =>
    (lineFilter === "ALL" || b.line === lineFilter) &&
    (!fromDate || b.date >= fromDate) &&
    (!toDate || b.date <= toDate));
}

function byWeek(list) {
  const m = new Map();
  for (const b of list) {
    if (!isProduced(b)) continue;
    const wk = mondayOf(b.date);
    if (!m.has(wk)) m.set(wk, { week: wk, filled: 0, theo: 0, tested: 0, released: 0, batches: 0, rejected: 0, rejUnits: 0, byLine: { GLY: 0, B12: 0, SEM: 0, TB35: 0, SB35: 0 }, cost: 0 });
    const w = m.get(wk);
    w.filled += b.filled; w.theo += b.theo || 0; w.tested += b.tested || 0; w.batches++;
    w.byLine[b.line] += b.filled;
    w.cost += batchCostTotal(b);
    w.released += b.released || 0;                      // literal Total Count Released, all produced lots
    if (b.status === "rejected") { w.rejected++; w.rejUnits += b.filled || 0; }
  }
  return [...m.values()].sort((a, b) => a.week < b.week ? -1 : 1);
}

function byDay(list) {
  const m = new Map();
  for (const b of list) {
    if (!isProduced(b)) continue;
    if (!m.has(b.date)) m.set(b.date, { date: b.date, filled: 0, theo: 0, batches: 0, released: 0, relFilled: 0, relTested: 0 });
    const d = m.get(b.date);
    d.filled += b.filled; d.theo += b.theo || 0; d.batches++;
    if (b.status === "released") { d.released += b.released; d.relFilled += b.filled; d.relTested += b.tested || 0; }
  }
  return [...m.values()].sort((a, b) => a.date < b.date ? -1 : 1);
}

/* Release yield = total count released ÷ actual yield (units filled),
   over all produced batches in the period. Numerator is the literal
   released count; batches still in testing simply haven't added to it yet. */
function releaseYield(list) {
  const p = list.filter(isProduced);
  const den = p.reduce((a, b) => a + (b.filled || 0), 0);
  const num = p.reduce((a, b) => a + (b.released || 0), 0);
  return den > 0 ? num / den : null;
}
/* Units rejected in a set = filled units on rejected lots */
function rejectedUnits(list) {
  return list.filter(b => b.status === "rejected").reduce((a, b) => a + (b.filled || 0), 0);
}

/* ---- SKU pipeline (fulfillment-granular: line + strength + additives + vial volume) ---- */
const LINE_ORDER = { GLY: 0, B12: 1, SEM: 2, TB35: 3, SB35: 4 };
function pipeSkuKey(b) { return [b.line, b.strength, b.addConc ?? "", b.niac ?? "", b.dexp ?? "", b.unitVol ?? ""].join("|"); }
function pipeSkus() {
  const m = new Map();
  for (const b of batches) {
    if (b.strength == null) continue;
    const k = pipeSkuKey(b);
    if (!m.has(k)) m.set(k, { key: k, line: b.line, strength: b.strength, addConc: b.addConc, niac: b.niac, dexp: b.dexp, unitVol: b.unitVol });
  }
  const out = [...m.values()];
  for (const s of out) s.label = displayName(s);   // mode-aware; recomputed each render
  return out.sort((a, b) =>
    (LINE_ORDER[a.line] - LINE_ORDER[b.line]) || (a.strength - b.strength) ||
    ((a.addConc || 0) - (b.addConc || 0)) || ((a.unitVol || 0) - (b.unitVol || 0)));
}
/* Weekly units filled by SKU (keyed on compound date) */
function productionBySkuWeek(nWeeks) {
  const weeks = new Set(); const val = new Map();
  for (const b of batches) {
    if (!isProduced(b) || b.strength == null) continue;
    const wk = mondayOf(b.date); weeks.add(wk);
    const k = pipeSkuKey(b); if (!val.has(k)) val.set(k, {});
    val.get(k)[wk] = (val.get(k)[wk] || 0) + (b.filled || 0);
  }
  let cols = [...weeks].sort(); if (nWeeks) cols = cols.slice(-nWeeks);
  return { cols, get: (k, wk) => (val.get(k) || {})[wk] || 0 };
}
/* Daily units filled by SKU (keyed on compound date) */
function productionBySkuDay(nDays) {
  const days = new Set(); const val = new Map();
  for (const b of batches) {
    if (!isProduced(b) || b.strength == null) continue;
    days.add(b.date);
    const k = pipeSkuKey(b); if (!val.has(k)) val.set(k, {});
    val.get(k)[b.date] = (val.get(k)[b.date] || 0) + (b.filled || 0);
  }
  let cols = [...days].sort(); if (nDays) cols = cols.slice(-nDays);
  return { cols, get: (k, d) => (val.get(k) || {})[d] || 0 };
}
/* Daily released units by SKU (keyed on Date Approved for Release) */
function releasesBySkuDay(nDays) {
  const days = new Set(); const val = new Map();
  for (const b of batches) {
    if (!b.releaseDate || !b.released || b.strength == null) continue;
    days.add(b.releaseDate);
    const k = pipeSkuKey(b); if (!val.has(k)) val.set(k, {});
    val.get(k)[b.releaseDate] = (val.get(k)[b.releaseDate] || 0) + b.released;
  }
  let cols = [...days].sort(); if (nDays) cols = cols.slice(-nDays);
  return { cols, get: (k, d) => (val.get(k) || {})[d] || 0 };
}
/* Projected releasable units by SKU, keyed on the Expected Release Date,
   for lots not yet released (scheduled or in testing) — the fulfillment
   forecast. Scheduled lots use theoretical yield; in-testing lots use
   actual filled. Both net out the testing draw. */
function expectedReleasableUnits(b) {
  const base = b.filled != null ? b.filled : (b.theo || DEFAULT_THEO);
  const draw = b.filled != null ? (b.tested || 0) : 15;
  return Math.max(0, base - draw);
}
/* Median compound→release lead (days), data-driven, for projecting dates */
function medianReleaseLeadDays() {
  const ds = batches
    .filter(b => b.status === "released" && b.releaseDate && b.date)
    .map(b => Math.round((s2d(b.releaseDate) - s2d(b.date)) / 86400000))
    .filter(d => d > 0 && d < 40)
    .sort((a, b) => a - b);
  return ds.length ? ds[Math.floor(ds.length / 2)] : 6;
}
function expectedReleasesBySkuDay() {
  const days = new Set(); const val = new Map();
  const lead = medianReleaseLeadDays();
  for (const b of batches) {
    if (b.strength == null) continue;
    if (b.status === "released" || b.status === "rejected" || b.status === "validation") continue;
    const u = expectedReleasableUnits(b);
    if (!u) continue;
    const day = b.expRelease || addDays(b.date, lead);   // log's date if present, else projected
    days.add(day);
    const k = pipeSkuKey(b); if (!val.has(k)) val.set(k, {});
    val.get(k)[day] = (val.get(k)[day] || 0) + u;
  }
  return { days, get: (k, d) => (val.get(k) || {})[d] || 0, lead };
}
function fillEfficiency(list) {
  const pr = list.filter(isProduced);
  const num = pr.reduce((a, b) => a + b.filled, 0);
  const den = pr.reduce((a, b) => a + (b.theo || 0), 0);
  return den > 0 ? num / den : null;
}

const DEFAULT_TARGET = 13000;
let weeklyTargets = {};
function targetFor(week) { return weeklyTargets[week] ?? DEFAULT_TARGET; }

function forecast() {
  const weeks = byWeek(batches).filter(w => w.week < THIS_MONDAY && w.batches >= 4);
  const recent = weeks.slice(-6);
  const n = recent.length;
  let slope = 0, intercept = n ? recent[n - 1].filled : DEFAULT_TARGET;
  if (n >= 2) {
    const xs = recent.map((_, i) => i), ys = recent.map(w => w.filled);
    const xm = xs.reduce((a, b) => a + b, 0) / n, ym = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - xm) * (ys[i] - ym); den += (xs[i] - xm) ** 2; }
    slope = den ? num / den : 0;
    intercept = ym + slope * (n - 1 - xm);
  }
  const cw = byWeek(batches.filter(b => b.date >= THIS_MONDAY && b.date < addDays(THIS_MONDAY, 7)));
  const curFilled = cw.length ? cw[0].filled : 0;
  const days = byDay(batches).slice(-8);
  const runRate = days.length ? days.reduce((a, d) => a + d.filled, 0) / days.length : 0;
  const dw = dayOfWeek(TODAY);
  const remaining = PROD_DAYS.filter(d => d > dw).length;
  const cap = DEFAULT_THEO * BATCHES_PER_DAY * PROD_DAYS.length;
  const weekEnd = addDays(THIS_MONDAY, 6);
  const schedThisWeek = batches.filter(b => b.status === "scheduled" && b.date >= TODAY && b.date <= weekEnd).length;
  const prodBatches = batches.filter(isProduced);
  const avgFillPerBatch = prodBatches.length ? prodBatches.reduce((a, b) => a + b.filled, 0) / prodBatches.length : 240;
  const restOfWeek = Math.max(schedThisWeek * avgFillPerBatch, remaining * runRate);
  const curProjected = Math.round(Math.min(cap, curFilled + restOfWeek));
  const scheduledNext = batches.filter(b => b.status === "scheduled" && b.date >= addDays(THIS_MONDAY, 7)).length;
  const ry = releaseYield(batches) ?? 0.9;
  const out = [];
  for (let k = 1; k <= 4; k++) {
    const v = Math.round(Math.min(cap, Math.max(0, intercept + slope * k)));
    out.push({ week: addDays(THIS_MONDAY, 7 * k), projected: v });
  }
  return { fullWeeks: recent, slope, curWeek: THIS_MONDAY, curFilled, curProjected, next: out, runRate, releaseYield: ry, scheduledNext };
}

/* QA release pipeline */
function qaPipeline(lineFilter) {
  const lots = batches
    .filter(b => b.status === "pending" && (lineFilter === "ALL" || b.line === lineFilter))
    .map(b => ({ ...b, releasable: Math.max(0, (b.filled || 0) - (b.tested || 0)),
                 overdue: b.expRelease && b.expRelease < TODAY }))
    .sort((a, b) => {
      if (!a.expRelease && !b.expRelease) return a.date < b.date ? -1 : 1;
      if (!a.expRelease) return 1;
      if (!b.expRelease) return -1;
      return a.expRelease < b.expRelease ? -1 : 1;
    });
  const units = lots.reduce((a, b) => a + b.releasable, 0);
  const ry = releaseYield(batches) ?? 0.9;
  return { lots, units, expected: Math.round(units * ry), ry, overdue: lots.filter(b => b.overdue).length };
}

function costPerReleasedUnit(list) {
  const rel = list.filter(b => b.status === "released" || b.status === "rejected");
  const cost = rel.reduce((a, b) => a + batchCostTotal(b), 0);
  const good = rel.reduce((a, b) => a + (b.status === "released" ? b.released : 0), 0);
  return good ? cost / good : 0;
}

/* Formatting */
const fmtInt = n => n.toLocaleString("en-US");
const fmtMoney = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney0 = n => "$" + Math.round(n).toLocaleString("en-US");
const fmtCompact = n => {
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return fmtMoney(n);
};
const fmtPct = n => (n * 100).toFixed(1) + "%";
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim(); }

/* Persistence */
const STORAGE_KEY = "iptracker_v2";
let _storageOK = null;
let lastSavedAt = null;
function storageAvailable() {
  if (_storageOK !== null) return _storageOK;
  try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); _storageOK = true; }
  catch (e) { _storageOK = false; }
  return _storageOK;
}
function snapshot() {
  return { v: 2, savedAt: new Date().toISOString(), logDate: LOG_SNAPSHOT_DATE, batches, assumptions: A, weeklyTargets };
}
function applyState(s) {
  if (!s || typeof s !== "object" || s.v !== 2) return false;
  if (Array.isArray(s.batches)) batches = s.batches;
  if (s.assumptions) A = { ...defaultAssumptions, ...s.assumptions };
  if (s.weeklyTargets && typeof s.weeklyTargets === "object") weeklyTargets = s.weeklyTargets;
  if (s.savedAt) lastSavedAt = s.savedAt;
  return true;
}
function persist() {
  if (!storageAvailable()) return false;
  try { const s = snapshot(); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); lastSavedAt = s.savedAt; return true; }
  catch (e) { return false; }
}
function loadPersisted() {
  if (!storageAvailable()) return null;
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function clearPersisted() { if (storageAvailable()) { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} } }
