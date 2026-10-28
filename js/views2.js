/* ---------------- Costs ---------------- */
const COST_PARTS = [
  { key: "api", name: "API", colorVar: "series-1" },
  { key: "materials", name: "Materials & components", colorVar: "series-2" },
  { key: "laborQc", name: "Labor, QC & lab testing", colorVar: "series-3" },
  { key: "overhead", name: "Overhead", colorVar: "series-4" },
];

function activeSkus() {
  const m = new Map();
  for (const b of batches) {
    if (b.strength == null) continue;
    const k = skuKey(b);
    if (!m.has(k)) m.set(k, { line: b.line, strength: b.strength, addConc: b.addConc, unitVol: b.unitVol, fillVol: b.fillVol, theo: b.theo || DEFAULT_THEO, n: 0 });
    m.get(k).n++;
  }
  return [...m.values()].sort((a, b) => a.line < b.line ? -1 : a.line > b.line ? 1 : a.strength - b.strength);
}

function renderCosts() {
  const root = document.getElementById("tab-costs");
  root.replaceChildren();

  const ac = card("Cost assumptions", "Editable — every metric recalculates from these; changes are saved");
  const grid = hEl("div", "assump");
  const fields = [
    ["tirzPerG", "Tirzepatide API", "$/g"],
    ["semaPerG", "Semaglutide API", "$/g"],
    ["glyPerKg", "Glycine", "$/kg"],
    ["b12PerG", "Vitamin B12", "$/g"],
    ["wfiPerL", "Bacteriostatic WFI", "$/L"],
    ["vial", "Vial", "$/unit"],
    ["stopper", "Stopper", "$/unit"],
    ["cap", "Flip-off cap", "$/unit"],
    ["label", "Label", "$/unit"],
    ["laborBatch", "Labor", "$/batch"],
    ["qcBatch", "In-house QC", "$/batch"],
    ["labBatch", "External lab testing", "$/batch"],
    ["ohBatch", "Facility overhead", "$/batch"],
  ];
  for (const [key, label, unit] of fields) {
    const d = hEl("div", "fld");
    const l = hEl("label");
    l.textContent = label;
    l.appendChild(hEl("span", "unit", unit));
    d.appendChild(l);
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "any"; inp.min = 0; inp.value = A[key];
    inp.addEventListener("change", () => { A[key] = +inp.value || 0; saveNow(); renderCosts(); });
    d.appendChild(inp);
    grid.appendChild(d);
  }
  ac.appendChild(grid);
  const reset = hEl("button", "btn small", "Reset to defaults");
  reset.style.marginTop = "12px";
  reset.addEventListener("click", () => { A = { ...defaultAssumptions }; saveNow(); renderCosts(); });
  ac.appendChild(reset);
  ac.appendChild(hEl("div", "note mt8", "Placeholder assumptions — replace with your actual supplier and operating costs. Fill volume already includes overage, so API cost is computed on the filled volume per vial."));
  root.appendChild(ac);

  const skus = activeSkus();
  const cc = card("Cost per unit by SKU", "SKUs observed in the production log · cost at theoretical batch yield");
  cc.appendChild(legendHTML(COST_PARTS.map(p => ({ name: p.name, color: cssVar(p.colorVar) }))));
  const ch = hEl("div", "chart-wrap"); cc.appendChild(ch);
  const chData = skus.map(s => {
    const bc = batchCost(s);
    const units = s.theo;
    return {
      label: LINES[s.line].short.replace("Tirzepatide", "TZ") + " " + s.strength + "/" + s.addConc,
      tipTitle: LINES[s.line].name + " " + s.strength + "/" + s.addConc + " mg/mL · " + s.unitVol + " mL vial",
      parts: COST_PARTS.map(p => ({ name: p.name, value: bc[p.key] / units, color: cssVar(p.colorVar) })),
    };
  });
  requestAnimationFrame(() => hStackedBars(ch, chData, {}));
  root.appendChild(cc);

  const tc = card("Unit economics", "Per-vial content and cost at theoretical yield");
  const wrap = hEl("div", "scroll-x mt8");
  const table = hEl("table", "data");
  const thead = document.createElement("thead"); const hr = document.createElement("tr");
  for (const [h, cls] of [["Product", ""], ["Vial", "num"], ["API / vial", "num"], ["API $", "num"], ["Materials $", "num"], ["Labor+QC+Lab $", "num"], ["OH $", "num"], ["Cost / unit", "num"], ["Cost / batch", "num"], ["Batches", "num"]]) {
    const th = document.createElement("th"); th.textContent = h; if (cls) th.className = cls; hr.appendChild(th);
  }
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const s of skus) {
    const bc = batchCost(s); const units = s.theo;
    const apiMg = s.strength * (s.fillVol || DEFAULT_FILL_VOL);
    const tr = document.createElement("tr");
    const vals = [
      LINES[s.line].name + " " + s.strength + "/" + s.addConc + " mg/mL",
      s.unitVol + " mL (fill " + s.fillVol + ")",
      apiMg.toFixed(1) + " mg",
      fmtMoney(bc.api / units), fmtMoney(bc.materials / units),
      fmtMoney(bc.laborQc / units), fmtMoney(bc.overhead / units),
      fmtMoney(bc.total / units), fmtMoney0(bc.total), fmtInt(s.n),
    ];
    vals.forEach((v, i) => { const td = document.createElement("td"); td.textContent = v; if (i >= 1) td.className = "num"; tr.appendChild(td); });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody); wrap.appendChild(table); tc.appendChild(wrap);
  tc.appendChild(hEl("div", "note mt8", "A rejected batch still incurs full cost, and testing units are consumed — so cost per released unit on the dashboard runs above these sticker figures."));
  root.appendChild(tc);

  const sc = card("Weekly production spend", "Batch costs incurred per week (produced batches)");
  const ch2 = hEl("div", "chart-wrap"); sc.appendChild(ch2);
  const wks = byWeek(batches).slice(-8);
  requestAnimationFrame(() => columnChart(ch2, wks.map(w => ({
    label: fmtDate(w.week), tipTitle: fmtWeek(w.week), value: Math.round(w.cost),
    sub: w.batches + " batches",
  })), { fmt: fmtCompact, valueName: "spend" }));
  root.appendChild(sc);
}

/* ---------------- Targets & Forecast ---------------- */
function renderTargets() {
  const root = document.getElementById("tab-targets");
  root.replaceChildren();
  const fc = forecast();

  const cc = card("Output forecast", "Trend on last " + fc.fullWeeks.length + " production weeks · current week projected from run rate");
  cc.appendChild(legendHTML([
    { name: "Actual", color: cssVar("series-1"), line: true },
    { name: "Forecast", color: cssVar("series-1"), line: true, dash: true },
  ]));
  const ch = hEl("div", "chart-wrap"); cc.appendChild(ch);
  const catWeeks = [...fc.fullWeeks.map(w => w.week), fc.curWeek, ...fc.next.map(x => x.week)];
  const nAct = fc.fullWeeks.length;
  const actualVals = catWeeks.map((w, i) => i < nAct ? { y: fc.fullWeeks[i].filled } : null);
  const fcVals = catWeeks.map((w, i) => {
    if (i === nAct - 1) return { y: fc.fullWeeks[i].filled };
    if (i === nAct) return { y: fc.curProjected };
    if (i > nAct) return { y: fc.next[i - nAct - 1].projected };
    return null;
  });
  requestAnimationFrame(() => lineChart(ch, catWeeks.map(fmtDate),
    [
      { name: "actual filled", color: cssVar("series-1"), values: actualVals },
      { name: "forecast", color: cssVar("series-1"), dash: true, values: fcVals },
    ],
    { fmt: fmtInt, refLine: DEFAULT_TARGET, refLabel: "target 13,000", yMax: 15000, yTicks: [0, 2500, 5000, 7500, 10000, 12500, 15000], tipTitle: i => fmtWeek(catWeeks[i]) }));
  cc.appendChild(hEl("div", "note mt8",
    "Trend: " + (fc.slope >= 0 ? "+" : "") + fmtInt(Math.round(fc.slope)) + " units/week · run rate " + fmtInt(Math.round(fc.runRate)) + " units/production day · trailing release yield " + fmtPct(fc.releaseYield) +
    (fc.scheduledNext ? " · " + fc.scheduledNext + " batches already scheduled next week" : "")));
  root.appendChild(cc);

  const ft = card("Four-week outlook", "Projected filled units and expected released units at trailing yield");
  const wrapF = hEl("div", "scroll-x mt8");
  const tblF = hEl("table", "data");
  const thF = document.createElement("thead"); const hrF = document.createElement("tr");
  for (const [h, cls] of [["Week", ""], ["Projected filled", "num"], ["Expected released", "num"], ["Target", "num"], ["Attainment", "num"], ["Est. spend", "num"]]) {
    const th = document.createElement("th"); th.textContent = h; if (cls) th.className = cls; hrF.appendChild(th);
  }
  thF.appendChild(hrF); tblF.appendChild(thF);
  const tbF = document.createElement("tbody");
  const rows = [{ week: fc.curWeek, projected: fc.curProjected, label: fmtWeek(fc.curWeek) + " (in progress)" }, ...fc.next.map(x => ({ ...x, label: fmtWeek(x.week) }))];
  const prod = batches.filter(isProduced);
  const perBatchCost = prod.length ? prod.reduce((a, b) => a + batchCostTotal(b), 0) / prod.reduce((a, b) => a + b.filled, 0) : 0;
  for (const r of rows) {
    const tgt = targetFor(r.week);
    const tr = document.createElement("tr");
    const vals = [r.label, fmtInt(r.projected), fmtInt(Math.round(r.projected * fc.releaseYield)), fmtInt(tgt), fmtPct(r.projected / tgt), fmtCompact(r.projected * perBatchCost)];
    vals.forEach((v, i) => { const td = document.createElement("td"); td.textContent = v; if (i >= 1) td.className = "num"; tr.appendChild(td); });
    tbF.appendChild(tr);
  }
  tblF.appendChild(tbF); wrapF.appendChild(tblF); ft.appendChild(wrapF);
  ft.appendChild(hEl("div", "note mt8", "Expected released ≈ projected filled × trailing release yield (released ÷ produced). Est. spend at trailing cost per filled unit."));
  root.appendChild(ft);

  const tc = card("Weekly targets", "Filled-unit targets. Default 13,000/week — edit any week below; edits are saved.");
  const wrap = hEl("div", "scroll-x mt8");
  const table = hEl("table", "data");
  const thead = document.createElement("thead"); const hr = document.createElement("tr");
  for (const [h, cls] of [["Week", ""], ["Target", "num"], ["Filled", "num"], ["Attainment", "num"], ["Batches", "num"], ["Released", "num"], ["Release yield", "num"], [""]]) {
    const th = document.createElement("th"); th.textContent = h; if (cls) th.className = cls; hr.appendChild(th);
  }
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const weeks = byWeek(batches);
  const allWeeks = [...new Set([...weeks.map(w => w.week), addDays(THIS_MONDAY, 7), addDays(THIS_MONDAY, 14)])].sort();
  for (const wk of allWeeks) {
    const w = weeks.find(x => x.week === wk);
    const tr = document.createElement("tr");
    tr.appendChild(hEl("td", null, fmtWeek(wk) + (wk === THIS_MONDAY ? " (current)" : wk > THIS_MONDAY ? " (upcoming)" : "")));
    const tdT = document.createElement("td"); tdT.className = "num";
    const inp = document.createElement("input");
    inp.type = "number"; inp.className = "tgt-input"; inp.min = 0; inp.step = 100;
    inp.style.width = "90px"; inp.style.textAlign = "right";
    inp.value = targetFor(wk);
    inp.addEventListener("change", () => { weeklyTargets[wk] = +inp.value || 0; saveNow(); renderTargets(); });
    tdT.appendChild(inp); tr.appendChild(tdT);
    const att = w ? w.filled / targetFor(wk) : null;
    const ry = w && w.filled > 0 ? w.released / w.filled : null;
    const vals = [w ? fmtInt(w.filled) : "—", att != null ? fmtPct(att) : "—", w ? w.batches : "—", w && w.released ? fmtInt(w.released) : "—", ry != null ? fmtPct(ry) : "—"];
    vals.forEach(v => { const td = document.createElement("td"); td.className = "num"; td.textContent = v; tr.appendChild(td); });
    const tdM = document.createElement("td");
    if (att != null && wk < THIS_MONDAY) {
      tdM.appendChild(hEl("span", "pill " + (att >= 1 ? "released" : att >= 0.9 ? "pending" : "rejected"), att >= 1 ? "met" : att >= 0.9 ? "near" : "missed"));
    }
    tr.appendChild(tdM);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody); wrap.appendChild(table); tc.appendChild(wrap);
  root.appendChild(tc);
}

/* ---------------- Weekly Report (printable) ---------------- */
function weeksWithData() { return byWeek(batches).map(w => w.week); }
function renderReportTab() {
  const root = document.getElementById("tab-report");
  root.replaceChildren();
  const wks = weeksWithData();
  if (!state.reportWeek || !wks.includes(state.reportWeek)) state.reportWeek = wks[wks.length - 1] || THIS_MONDAY;

  const bar = hEl("div", "filters");
  bar.appendChild(hEl("span", "flabel", "Week"));
  const sel = document.createElement("select"); sel.className = "tgt-input"; sel.style.width = "auto";
  for (const w of wks) {
    const o = document.createElement("option"); o.value = w;
    o.textContent = fmtWeek(w) + " – " + fmtDate(addDays(w, 4));
    sel.appendChild(o);
  }
  sel.value = state.reportWeek;
  sel.addEventListener("change", () => { state.reportWeek = sel.value; renderReportTab(); });
  bar.appendChild(sel);
  const printBtn = hEl("button", "btn primary", "Print / Save as PDF");
  printBtn.addEventListener("click", () => window.print());
  bar.appendChild(printBtn);
  bar.appendChild(hEl("span", "note", "Printing captures just the report below — choose “Save as PDF” in the print dialog."));
  root.appendChild(bar);

  const rep = hEl("div", null); rep.id = "report";
  rep.appendChild(buildWeeklyReport(state.reportWeek));
  root.appendChild(rep);
}

function buildWeeklyReport(week) {
  const wEnd = addDays(week, 6);
  const list = batches.filter(b => b.date >= week && b.date <= wEnd && isProduced(b));
  const w = byWeek(list)[0] || { filled: 0, theo: 0, tested: 0, released: 0, relFilled: 0, relTested: 0, batches: 0, rejected: 0, byLine: { GLY: 0, B12: 0, SEM: 0 }, cost: 0 };
  const box = hEl("div", "report-body");

  const hd = hEl("div", "rep-head");
  const left = hEl("div");
  left.appendChild(hEl("div", "rep-title", "Weekly Production Summary"));
  left.appendChild(hEl("div", "rep-sub", "PerfectionRx · Sterile Injectable Fill–Finish · Week of " + fmtDateLong(week) + " – " + fmtDateLong(addDays(week, 4))));
  hd.appendChild(left);
  const right = hEl("div", "rep-meta");
  right.appendChild(hEl("div", null, "Generated " + fmtDateLong(TODAY)));
  right.appendChild(hEl("div", null, "Source: sterile production log (snapshot " + fmtDate(LOG_SNAPSHOT_DATE) + ")"));
  hd.appendChild(right);
  box.appendChild(hd);

  const ry = releaseYield(list);
  const eff = fillEfficiency(list);
  const kp = hEl("div", "rep-kpis");
  const kpi = (label, val, sub) => {
    const t = hEl("div", "rep-kpi");
    t.appendChild(hEl("div", "rep-kpi-label", label));
    t.appendChild(hEl("div", "rep-kpi-value", val));
    if (sub) t.appendChild(hEl("div", "rep-kpi-sub", sub));
    return t;
  };
  kp.appendChild(kpi("Batches compounded", fmtInt(w.batches), w.rejected ? w.rejected + " rejected" : "no rejections"));
  kp.appendChild(kpi("Units filled", fmtInt(w.filled), "of " + fmtInt(w.theo) + " theoretical"));
  kp.appendChild(kpi("Fill efficiency", eff != null ? fmtPct(eff) : "—", "actual ÷ theoretical"));
  kp.appendChild(kpi("Units released", w.released ? fmtInt(w.released) : "0", list.filter(b => b.status === "pending").length + " lots still in testing"));
  kp.appendChild(kpi("Release yield", ry != null ? fmtPct(ry) : "pending", "released ÷ units produced"));
  kp.appendChild(kpi("Units rejected", fmtInt(w.rejUnits || 0), (w.rejected || 0) + (w.rejected === 1 ? " lot" : " lots") + " rejected"));
  kp.appendChild(kpi("Target attainment", fmtPct(w.filled / targetFor(week)), "target " + fmtInt(targetFor(week)) + " filled"));
  kp.appendChild(kpi("Production spend", fmtCompact(w.cost), "incl. rejected batches"));
  box.appendChild(kp);

  const mkTable = (title, headers, rows) => {
    const sec = hEl("div", "rep-sec");
    sec.appendChild(hEl("div", "rep-sec-title", title));
    const t = hEl("table", "data rep-table");
    const th = document.createElement("thead"); const hr = document.createElement("tr");
    headers.forEach(([h, cls]) => { const c = document.createElement("th"); c.textContent = h; if (cls) c.className = cls; hr.appendChild(c); });
    th.appendChild(hr); t.appendChild(th);
    const tb = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      r.forEach((v, i) => { const td = document.createElement("td"); td.textContent = v; if (headers[i][1]) td.className = headers[i][1]; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); sec.appendChild(t);
    return sec;
  };

  const prodMap = new Map();
  for (const b of list) {
    const k = productLabel(b);
    if (!prodMap.has(k)) prodMap.set(k, { batches: 0, theo: 0, filled: 0, tested: 0, released: 0, cost: 0 });
    const p = prodMap.get(k);
    p.batches++; p.theo += b.theo || 0; p.filled += b.filled; p.tested += b.tested || 0; p.cost += batchCostTotal(b);
    if (b.status === "released") p.released += b.released;
  }
  box.appendChild(mkTable("Production by product",
    [["Product", ""], ["Batches", "num"], ["Theoretical", "num"], ["Filled", "num"], ["Tested", "num"], ["Released", "num"], ["Spend", "num"]],
    [...prodMap.entries()].map(([k, p]) => [k, fmtInt(p.batches), fmtInt(p.theo), fmtInt(p.filled), fmtInt(p.tested), p.released ? fmtInt(p.released) : "—", fmtMoney0(p.cost)])));

  const dys = byDay(list);
  box.appendChild(mkTable("Daily production",
    [["Day", ""], ["Batches", "num"], ["Theoretical", "num"], ["Filled", "num"], ["Fill efficiency", "num"]],
    dys.map(d => [fmtDateLong(d.date), fmtInt(d.batches), fmtInt(d.theo), fmtInt(d.filled), d.theo ? fmtPct(d.filled / d.theo) : "—"])));

  box.appendChild(mkTable("Batch detail",
    [["Lot", ""], ["Date", ""], ["Product", ""], ["Theo", "num"], ["Filled", "num"], ["Tested", "num"], ["Released", "num"], ["Status", ""], ["Comment", ""]],
    list.map(b => [b.id, fmtDate(b.date), productLabel(b), b.theo != null ? fmtInt(b.theo) : "—", fmtInt(b.filled), fmtInt(b.tested || 0), b.status === "released" ? fmtInt(b.released) : "—", STATUS_LABELS[b.status] || b.status, b.note || ""])));

  const exceptions = list.filter(b => b.status === "rejected" || (b.note && b.note.length > 3));
  if (exceptions.length) {
    box.appendChild(mkTable("Exceptions & notes",
      [["Lot", ""], ["Status", ""], ["Note", ""]],
      exceptions.map(b => [b.id, STATUS_LABELS[b.status] || b.status, b.note || ""])));
  }
  box.appendChild(hEl("div", "rep-foot", "Costs are modeled from the app's editable assumptions, not invoiced amounts. Release counts per QA disposition in the sterile production log."));
  return box;
}

/* ============================================================
   CSV export / import
   ============================================================ */
function exportCSV() {
  const header = "lot_id,date,formula_id,line,strength_mg_ml,additive_mg_ml,unit_vol_ml,fill_vol_ml,theoretical,filled,tested,released,status,expected_release,note";
  const lines = batches.map(b =>
    [b.id, b.date, b.formulaId || "", b.line, b.strength ?? "", b.addConc ?? "", b.unitVol ?? "", b.fillVol ?? "", b.theo ?? "", b.filled ?? "", b.tested ?? 0, b.released ?? 0, b.status, b.expRelease || "", '"' + (b.note || "").replace(/"/g, '""') + '"'].join(","));
  offerDownload("batch_log_" + TODAY + ".csv", header + "\n" + lines.join("\n"), "text/csv");
}
function importCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    const rows = text.split(/\r?\n/).filter(r => r.trim());
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const m = rows[i].match(/^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),"?(.*?)"?$/);
      if (!m) continue;
      const [, id, date, fid, line, strength, addConc, unitVol, fillVol, theo, filled, tested, released, status, exp, note] = m;
      if (!LINES[line] || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      out.push({
        id, date, formulaId: fid, line,
        strength: strength === "" ? null : +strength, addConc: addConc === "" ? DEFAULT_ADD_CONC : +addConc,
        unitVol: unitVol === "" ? DEFAULT_UNIT_VOL : +unitVol, fillVol: fillVol === "" ? DEFAULT_FILL_VOL : +fillVol,
        theo: theo === "" ? null : +theo, filled: filled === "" ? null : +filled,
        tested: +tested || 0, released: +released || 0,
        status: STATUS_LABELS[status] ? status : "pending",
        expRelease: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : null,
        note: note.replace(/""/g, '"'),
      });
    }
    if (out.length) {
      batches = out.sort((a, b) => a.date < b.date ? -1 : 1);
      saveNow();
      renderAll();
    }
  };
  reader.readAsText(file);
}

/* ---- Save / Load data file ---- */
function saveToFile() {
  offerDownload("production_tracker_data_" + TODAY + ".json", JSON.stringify(snapshot(), null, 1), "application/json");
  persist();
  flashSaved("Data file downloaded");
}
function loadFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let s;
    try { s = JSON.parse(String(reader.result)); }
    catch (e) { alert("Couldn't read that file — expected a tracker data (.json) file. To load batch records only, use Import CSV."); return; }
    if (!s || !Array.isArray(s.batches)) { alert("That file doesn't look like a tracker data file (no batch records found)."); return; }
    if (!applyState(s)) { alert("That data file is from an older version of the tracker and can't be loaded."); return; }
    persist(); updateSaveStatus(); renderAll();
    flashSaved("Data loaded" + (s.savedAt ? " (saved " + new Date(s.savedAt).toLocaleString() + ")" : ""));
  };
  reader.readAsText(file);
}

/* ---- Save-status indicator ---- */
let _flashTimer;
function updateSaveStatus() {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.className = "save-status" + (storageAvailable() ? "" : " session");
  el.replaceChildren();
  const dot = document.createElement("span"); dot.className = "dot"; el.appendChild(dot);
  const txt = document.createElement("span");
  txt.textContent = storageAvailable()
    ? (lastSavedAt ? "Auto-saved in this browser" : "Auto-saving in this browser")
    : "Session only — use Save data";
  el.appendChild(txt);
}
function flashSaved(msg) {
  const el = document.getElementById("save-status");
  if (!el) return;
  clearTimeout(_flashTimer);
  el.className = "save-status flash";
  el.replaceChildren();
  const dot = document.createElement("span"); dot.className = "dot"; el.appendChild(dot);
  el.appendChild(hEl("span", null, msg));
  _flashTimer = setTimeout(updateSaveStatus, 2600);
}
function saveNow() { persist(); updateSaveStatus(); }

/* ============================================================
   Init
   ============================================================ */
/* ---------------- SKU Pipeline ---------------- */
function renderSkuPipeline() {
  const root = document.getElementById("tab-skupipe");
  root.replaceChildren();
  const skus = pipeSkus();

  // Weekly production by SKU
  const c1 = card("Production per week by SKU", "Units filled (actual yield) by compounding week · darker = more units");
  const ch1 = hEl("div", "chart-wrap scroll-x"); c1.appendChild(ch1); root.appendChild(c1);
  const prod = productionBySkuWeek(8);
  const prodRows = skus.filter(s => prod.cols.some(w => prod.get(s.key, w) > 0));
  const prodCols = prod.cols.map(w => ({ key: w, label: fmtDateShort(w) }));
  requestAnimationFrame(() => {
    if (!prodRows.length || !prodCols.length) { ch1.appendChild(hEl("div", "note", "No production in range.")); return; }
    heatmap(ch1, prodRows, prodCols, (k, w) => prod.get(k, w), { fmt: fmtInt, colTip: c => fmtWeek(c.key) });
  });

  // Daily releases by SKU — actual (blue) + expected/scheduled (yellow), windowed
  const rel = releasesBySkuDay(null);
  const exp = expectedReleasesBySkuDay();
  const allDays = [...new Set([...rel.cols, ...exp.days])].sort();
  const WIN = 14, STEP = 7;
  const maxOff = Math.max(0, Math.ceil((allDays.length - WIN) / STEP));
  state.relOffset = Math.max(0, Math.min(state.relOffset || 0, maxOff));
  const end = allDays.length - state.relOffset * STEP;
  const windowDays = allDays.slice(Math.max(0, end - WIN), end);
  const cellVal = (k, d) => {
    const a = rel.get(k, d); if (a > 0) return { value: a, kind: "seq" };
    const e = exp.get(k, d); if (e > 0) return { value: e, kind: "warn" };
    return { value: 0, kind: "seq" };
  };

  const c2 = card("Daily releases by SKU", "Blue = released (QA-approved). Yellow = scheduled / expected release, not yet produced or still in testing.");
  // navigator
  const nav = hEl("div", "filters");
  const seg = hEl("div", "seg");
  const older = hEl("button", "", "◀ Older"); older.disabled = state.relOffset >= maxOff; if (older.disabled) older.style.opacity = 0.4;
  older.addEventListener("click", () => { state.relOffset = Math.min(maxOff, state.relOffset + 1); renderSkuPipeline(); });
  const newer = hEl("button", "", "Newer ▶"); newer.disabled = state.relOffset <= 0; if (newer.disabled) newer.style.opacity = 0.4;
  newer.addEventListener("click", () => { state.relOffset = Math.max(0, state.relOffset - 1); renderSkuPipeline(); });
  seg.appendChild(older); seg.appendChild(newer); nav.appendChild(seg);
  if (state.relOffset > 0) { const b = hEl("button", "btn small", "Latest"); b.addEventListener("click", () => { state.relOffset = 0; renderSkuPipeline(); }); nav.appendChild(b); }
  if (windowDays.length) nav.appendChild(hEl("span", "note", fmtDateLong(windowDays[0]) + " – " + fmtDateLong(windowDays[windowDays.length - 1])));
  c2.appendChild(nav);
  // legend
  const leg = hEl("div", "legend");
  const mk = (color, txt) => { const li = hEl("span", "li"); const sw = hEl("span", "sw"); sw.style.background = color; li.appendChild(sw); li.appendChild(hEl("span", null, txt)); return li; };
  leg.appendChild(mk(cssVar("series-1"), "Released (actual)"));
  leg.appendChild(mk(cssVar("status-warn"), "Scheduled / expected"));
  c2.appendChild(leg);
  const ch2 = hEl("div", "chart-wrap scroll-x"); c2.appendChild(ch2); root.appendChild(c2);
  const relRows = skus.filter(s => windowDays.some(d => rel.get(s.key, d) > 0 || exp.get(s.key, d) > 0));
  const relCols = windowDays.map(d => ({ key: d, label: fmtDateShort(d) }));
  requestAnimationFrame(() => {
    if (!relRows.length || !relCols.length) { ch2.appendChild(hEl("div", "note", "No releases or scheduled lots in range.")); return; }
    heatmap(ch2, relRows, relCols, cellVal, { fmt: fmtInt, colTip: c => fmtDateLong(c.key) });
  });

  root.appendChild(hEl("div", "note mt12", "Production is keyed on the compounding date (Actual Yield); actual releases on the Date Approved for Release (Total Count Released). Yellow projects releasable units for scheduled/in-testing lots on their Expected Release Date — or, when the log has none, on the compound date plus the typical testing lead (~" + exp.lead + " days). Scheduled lots use theoretical yield (260) less the testing draw, so treat yellow as planning estimates, not commitments. Page with ◀ Older / Newer ▶ to move across history and the upcoming schedule."));
}

function renderAll() {
  renderDashboard(); renderBatches(); renderCosts(); renderSkuPipeline(); renderTargets(); renderReportTab();
}
document.getElementById("tabs").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-tab]");
  if (!b) return;
  state.tab = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  for (const t of ["dashboard", "batches", "costs", "skupipe", "targets", "report"])
    document.getElementById("tab-" + t).classList.toggle("hidden", t !== state.tab);
  renderAll();
});
document.getElementById("btn-theme").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = cur === "dark" ? "light" : "dark";
  renderAll();
});
document.getElementById("btn-export").addEventListener("click", exportCSV);
document.getElementById("btn-import").addEventListener("click", () => document.getElementById("file-import").click());
document.getElementById("file-import").addEventListener("change", ev => {
  if (ev.target.files[0]) importCSV(ev.target.files[0]);
  ev.target.value = "";
});
document.getElementById("btn-save").addEventListener("click", saveToFile);
document.getElementById("btn-load").addEventListener("click", () => document.getElementById("file-load").click());
document.getElementById("file-load").addEventListener("change", ev => {
  if (ev.target.files[0]) loadFromFile(ev.target.files[0]);
  ev.target.value = "";
});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderAll, 150); });

document.getElementById("btn-refresh").addEventListener("click", manualRefresh);

const _persisted = loadPersisted();
if (!(_persisted && applyState(_persisted))) loadLogSnapshot();
updateSaveStatus();
renderSyncStatus();
renderAll();
startLiveSync();   // upgrades to live data when the Google Drive connector is available
