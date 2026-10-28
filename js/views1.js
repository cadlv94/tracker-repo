/* ============================================================
   Views
   ============================================================ */
const state = { tab: "dashboard", range: 28, lineFilter: "ALL", editingId: null, reportWeek: null, selWeek: null, relOffset: 0 };

function hEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function card(title, sub) {
  const c = hEl("div", "card");
  if (title) c.appendChild(hEl("h3", null, title));
  if (sub) c.appendChild(hEl("div", "csub", sub));
  return c;
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const root = document.getElementById("tab-dashboard");
  root.replaceChildren();

  const allWeeks = byWeek(filteredBatches("ALL", null)).map(w => w.week);
  if (!state.selWeek || !allWeeks.includes(state.selWeek)) state.selWeek = allWeeks[allWeeks.length - 1] || THIS_MONDAY;

  const filters = hEl("div", "filters");
  filters.appendChild(hEl("span", "flabel", "Range"));
  const rangeSeg = hEl("div", "seg");
  for (const [label, days] of [["This week", 0], ["Last 14 days", 14], ["Last 30 days", 28], ["All", 9999], ["By week", "week"]]) {
    const b = hEl("button", state.range === days ? "active" : "", label);
    b.addEventListener("click", () => { state.range = days; renderDashboard(); });
    rangeSeg.appendChild(b);
  }
  filters.appendChild(rangeSeg);
  if (state.range === "week") {
    const wkSeg = hEl("div", "seg");
    const prev = hEl("button", "", "◀"); prev.title = "Previous week";
    const idx = allWeeks.indexOf(state.selWeek);
    prev.disabled = idx <= 0; if (prev.disabled) prev.style.opacity = 0.4;
    prev.addEventListener("click", () => { if (idx > 0) { state.selWeek = allWeeks[idx - 1]; renderDashboard(); } });
    wkSeg.appendChild(prev);
    const selWrap = hEl("button", "active");
    const sel = document.createElement("select");
    sel.style.cssText = "background:transparent;border:none;color:inherit;font:inherit;font-weight:600;cursor:pointer;outline:none;";
    for (const w of allWeeks) {
      const o = document.createElement("option"); o.value = w;
      o.textContent = fmtWeek(w) + " – " + fmtDate(addDays(w, 4)) + (w === THIS_MONDAY ? " (current)" : "");
      o.style.color = "initial";
      sel.appendChild(o);
    }
    sel.value = state.selWeek;
    sel.addEventListener("change", () => { state.selWeek = sel.value; renderDashboard(); });
    selWrap.appendChild(sel);
    wkSeg.appendChild(selWrap);
    const next = hEl("button", "", "▶"); next.title = "Next week";
    next.disabled = idx >= allWeeks.length - 1; if (next.disabled) next.style.opacity = 0.4;
    next.addEventListener("click", () => { if (idx < allWeeks.length - 1) { state.selWeek = allWeeks[idx + 1]; renderDashboard(); } });
    wkSeg.appendChild(next);
    filters.appendChild(wkSeg);
  }
  filters.appendChild(hEl("span", "flabel", "Product line"));
  const lineSeg = hEl("div", "seg");
  for (const [label, v] of [["All", "ALL"], ["TZ + Glycine", "GLY"], ["TZ + B12", "B12"], ["Sema + Gly", "SEM"], ["TZ B3/B5", "TB35"], ["Sema B3/B5", "SB35"]]) {
    const b = hEl("button", state.lineFilter === v ? "active" : "", label);
    b.addEventListener("click", () => { state.lineFilter = v; renderDashboard(); });
    lineSeg.appendChild(b);
  }
  filters.appendChild(lineSeg);
  root.appendChild(filters);

  const weekMode = state.range === "week";
  const heroWeek = weekMode ? state.selWeek : THIS_MONDAY;
  const fromDate = weekMode ? state.selWeek : state.range === 0 ? THIS_MONDAY : state.range === 9999 ? null : addDays(TODAY, -state.range);
  const toDate = weekMode ? addDays(state.selWeek, 6) : null;
  const list = filteredBatches(state.lineFilter, fromDate, toDate);
  const weeksAll = byWeek(filteredBatches(state.lineFilter, null));
  const heroWeekData = weeksAll.find(w => w.week === heroWeek);
  const fc = forecast();

  // KPI row
  const kpis = hEl("div", "grid kpis");
  const wkFilled = heroWeekData ? heroWeekData.filled : 0;
  const tgt = targetFor(heroWeek);
  const attain = tgt ? wkFilled / tgt : 0;

  const t1 = hEl("div", "card tile");
  t1.appendChild(hEl("div", "tlabel", weekMode ? "Units filled · " + fmtWeek(heroWeek) : "Units filled this week"));
  t1.appendChild(hEl("div", "tvalue hero", fmtInt(wkFilled)));
  const d1 = hEl("div", "tdelta");
  d1.appendChild(hEl("span", null, "vs target " + fmtInt(tgt) +
    (heroWeek === THIS_MONDAY ? " · projected " + fmtInt(fc.curProjected) : " · " + fmtPct(attain) + " attainment")));
  t1.appendChild(d1);
  const meter = hEl("div", "meter"); const fill = hEl("div");
  fill.style.width = Math.min(100, attain * 100) + "%";
  if (attain < 0.5 && (heroWeek < THIS_MONDAY || dayOfWeek(TODAY) >= 4)) fill.style.background = cssVar("status-warn");
  meter.appendChild(fill); t1.appendChild(meter);
  kpis.appendChild(t1);

  const ry = releaseYield(list);
  const t2 = hEl("div", "card tile");
  t2.appendChild(hEl("div", "tlabel", weekMode ? "Release yield · " + fmtWeek(heroWeek) : "Release yield (period)"));
  t2.appendChild(hEl("div", "tvalue", ry != null ? fmtPct(ry) : "—"));
  const producedList = list.filter(isProduced);
  const relUnits = producedList.reduce((a, b) => a + (b.released || 0), 0);
  const filledUnits = producedList.reduce((a, b) => a + (b.filled || 0), 0);
  t2.appendChild(hEl("div", "tdelta", fmtInt(relUnits) + " released ÷ " + fmtInt(filledUnits) + " produced"));
  const dys0 = byDay(producedList);
  const sp2 = hEl("div", "spark"); t2.appendChild(sp2); kpis.appendChild(t2);
  requestAnimationFrame(() => sparkline(sp2, dys0.map(d => d.filled > 0 ? d.released / d.filled * 100 : 0), cssVar("series-1")));

  const cpu = costPerReleasedUnit(list);
  const t3 = hEl("div", "card tile");
  t3.appendChild(hEl("div", "tlabel", "Avg cost per released unit"));
  t3.appendChild(hEl("div", "tvalue", cpu ? fmtMoney(cpu) : "—"));
  const spend = list.filter(isProduced).reduce((a, b) => a + batchCostTotal(b), 0);
  t3.appendChild(hEl("div", "tdelta", "period spend " + fmtCompact(spend)));
  kpis.appendChild(t3);

  const t4 = hEl("div", "card tile");
  const produced = list.filter(isProduced);
  t4.appendChild(hEl("div", "tlabel", "Batches (period)"));
  t4.appendChild(hEl("div", "tvalue", fmtInt(produced.length)));
  const nRej = list.filter(b => b.status === "rejected").length;
  const nPend = list.filter(b => b.status === "pending").length;
  const nSched = list.filter(b => b.status === "scheduled").length;
  t4.appendChild(hEl("div", "tdelta", nRej + " rejected · " + nPend + " in testing" + (nSched ? " · " + nSched + " scheduled" : "")));
  kpis.appendChild(t4);

  // Units rejected this period/week
  const rejU = rejectedUnits(list);
  const t6 = hEl("div", "card tile");
  t6.appendChild(hEl("div", "tlabel", weekMode ? "Units rejected · " + fmtWeek(heroWeek) : "Units rejected (period)"));
  const v6 = hEl("div", "tvalue", fmtInt(rejU));
  if (rejU > 0) v6.style.color = cssVar("status-crit");
  t6.appendChild(v6);
  const rejRate = filledUnits > 0 ? rejU / filledUnits : 0;
  t6.appendChild(hEl("div", "tdelta", nRej + (nRej === 1 ? " lot" : " lots") + " rejected" + (rejU > 0 ? " · " + fmtPct(rejRate) + " of units produced" : "")));
  kpis.appendChild(t6);

  const pipe = qaPipeline(state.lineFilter);
  const t5 = hEl("div", "card tile");
  t5.appendChild(hEl("div", "tlabel", "Awaiting QA release (current)"));
  t5.appendChild(hEl("div", "tvalue", fmtInt(pipe.units)));
  const d5 = hEl("div", "tdelta");
  d5.appendChild(hEl("span", null, pipe.lots.length + " lots in testing · ≈" + fmtInt(pipe.expected) + " expected to pass"));
  if (pipe.overdue) {
    d5.appendChild(hEl("span", null, " · "));
    d5.appendChild(hEl("span", "down", pipe.overdue + " overdue"));
  }
  t5.appendChild(d5);
  kpis.appendChild(t5);
  root.appendChild(kpis);

  const grid = hEl("div", "grid two-col");

  const c1 = card("Weekly units filled vs target", "Actual yield per week · tick = weekly target");
  const ch1 = hEl("div", "chart-wrap"); c1.appendChild(ch1); grid.appendChild(c1);
  const wkData = weeksAll.slice(-8).map(w => ({
    label: fmtDate(w.week), tipTitle: fmtWeek(w.week), week: w.week,
    value: w.filled, target: targetFor(w.week),
    sub: w.batches + " batches" + (w.week === THIS_MONDAY ? " · in progress" : ""),
  }));
  requestAnimationFrame(() => columnChart(ch1, wkData, {
    fmt: fmtInt, valueName: "filled",
    color: weekMode ? (d) => d.week === state.selWeek ? cssVar("series-1") : cssVar("baseline") : undefined,
  }));

  const c2 = card("Output by product line", "Units filled per week, stacked");
  const LINE_SERIES = [
    { line: "GLY", name: "TZ + Glycine", color: cssVar("series-1") },
    { line: "B12", name: "TZ + B12", color: cssVar("series-2") },
    { line: "SEM", name: "Sema + Glycine", color: cssVar("series-3") },
    { line: "TB35", name: "TZ + B3/B5", color: cssVar("series-5") },
    { line: "SB35", name: "Sema + B3/B5", color: cssVar("series-6") },
  ];
  c2.appendChild(legendHTML(LINE_SERIES.map(s => ({ name: s.name, color: s.color }))));
  const ch2 = hEl("div", "chart-wrap"); c2.appendChild(ch2); grid.appendChild(c2);
  const mixData = byWeek(filteredBatches("ALL", null)).slice(-8).map(w => ({
    label: fmtDate(w.week), tipTitle: fmtWeek(w.week),
    parts: LINE_SERIES.map(s => ({ name: s.name, value: w.byLine[s.line] || 0, color: s.color })),
  }));
  requestAnimationFrame(() => stackedColumns(ch2, mixData, {}));

  const c3 = card("Daily fill efficiency", weekMode ? "Actual ÷ theoretical yield · " + fmtWeek(state.selWeek) : "Actual yield ÷ theoretical yield (incl. overage)");
  const ch3 = hEl("div", "chart-wrap"); c3.appendChild(ch3); grid.appendChild(c3);
  const dys = byDay(weekMode ? list : filteredBatches(state.lineFilter, addDays(TODAY, -28)));
  const effVals = dys.map(d => d.theo ? d.filled / d.theo * 100 : null).filter(v => v != null);
  const yMinAxis = Math.min(80, Math.floor((Math.min(...effVals, 95) - 2) / 5) * 5);
  const yTickList = []; for (let t = yMinAxis; t <= 100; t += 5) yTickList.push(t);
  requestAnimationFrame(() => lineChart(ch3, dys.map(d => fmtDate(d.date)),
    [{ name: "fill efficiency", color: cssVar("series-1"), values: dys.map(d => ({ y: d.theo ? d.filled / d.theo * 100 : null })) }],
    { yMin: yMinAxis, yMax: 100, yTicks: yTickList, fmt: v => v.toFixed(0) + "%", refLine: 250 / 260 * 100, refLabel: "250-unit goal" }));

  const c4 = card("Daily production vs filled", "Filled units (blue) over units produced for (light) · per production day");
  c4.appendChild(legendHTML([
    { name: "Units filled", color: cssVar("series-1") },
    { name: "Units produced (theoretical)", color: cssVar("seq-150") },
  ]));
  const ch4 = hEl("div", "chart-wrap"); c4.appendChild(ch4); grid.appendChild(c4);
  const dys2 = byDay(list).slice(-14);
  requestAnimationFrame(() => overlayColumns(ch4, dys2.map(d => ({
    label: fmtDate(d.date), tipTitle: fmtDateLong(d.date),
    back: d.theo, front: d.filled,
    sub: d.batches + " batches",
  })), { fmt: fmtInt, frontName: "filled", backName: "produced (theoretical)" }));

  root.appendChild(grid);

  if (pipe.lots.length) {
    const pc = card("QA release pipeline", "Lots filled and in testing — units become releasable when results pass · trailing release yield " + fmtPct(pipe.ry));
    pc.style.marginTop = "14px";
    const wrap = hEl("div", "scroll-x mt8");
    const table = hEl("table", "data");
    const thead = document.createElement("thead"); const hr = document.createElement("tr");
    for (const [h, cls] of [["Lot", ""], ["Compounded", ""], ["Product", ""], ["Filled", "num"], ["Tested", "num"], ["Releasable if passed", "num"], ["Expected release", ""], ["", ""], ["Note", ""]]) {
      const th = document.createElement("th"); th.textContent = h; if (cls) th.className = cls; hr.appendChild(th);
    }
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const b of pipe.lots) {
      const tr = document.createElement("tr");
      const vals = [b.id, fmtDate(b.date), productLabel(b), fmtInt(b.filled || 0), fmtInt(b.tested || 0), fmtInt(b.releasable)];
      vals.forEach((v, i) => { const td = document.createElement("td"); td.textContent = v; if (i >= 3) td.className = "num"; tr.appendChild(td); });
      tr.appendChild(hEl("td", null, b.expRelease ? fmtDate(b.expRelease) : "—"));
      const tdF = document.createElement("td");
      if (b.overdue) tdF.appendChild(hEl("span", "pill rejected", "overdue"));
      else if (b.expRelease && b.expRelease <= addDays(TODAY, 2)) tdF.appendChild(hEl("span", "pill pending", "due soon"));
      tr.appendChild(tdF);
      const tdN = document.createElement("td"); tdN.textContent = b.note || ""; tdN.style.maxWidth = "220px"; tdN.style.overflow = "hidden"; tdN.style.textOverflow = "ellipsis"; tdN.title = b.note || ""; tr.appendChild(tdN);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody); wrap.appendChild(table); pc.appendChild(wrap);
    pc.appendChild(hEl("div", "note mt8", fmtInt(pipe.units) + " units awaiting disposition · ≈" + fmtInt(pipe.expected) + " expected to pass at trailing yield. Overdue = past the log's expected release date without a QA disposition."));
    root.appendChild(pc);
  }

  const src = hEl("div", "note mt12", "Data source: " + LOG_SOURCE + ". Live view refreshes from the published Google Sheet; the ↻ Refresh button pulls the latest immediately.");
  root.appendChild(src);
}

/* ---------------- Batch Log ---------------- */
function renderBatches() {
  const root = document.getElementById("tab-batches");
  root.replaceChildren();

  const fcard = card(state.editingId ? "Edit lot " + state.editingId : "Log a batch", "Record a fill run (mirrors the sterile production log)");
  const form = hEl("form", "entry");
  const mkFld = (label, input) => { const d = hEl("div", "fld"); d.appendChild(hEl("label", null, label)); d.appendChild(input); return d; };
  const mkNum = (val, step, min) => { const i = document.createElement("input"); i.type = "number"; i.value = val; i.step = step || 1; i.min = min ?? 0; return i; };
  const inDate = document.createElement("input"); inDate.type = "date"; inDate.value = TODAY; inDate.required = true;
  const inLot = document.createElement("input"); inLot.type = "text"; inLot.placeholder = "auto";
  const selLine = document.createElement("select");
  for (const [v, l] of Object.entries(LINES)) { const o = document.createElement("option"); o.value = v; o.textContent = l.name; selLine.appendChild(o); }
  const inStrength = mkNum(30, "any"); const inAdd = mkNum(DEFAULT_ADD_CONC, "any");
  const inUnitVol = mkNum(DEFAULT_UNIT_VOL, "any"); const inFillVol = mkNum(DEFAULT_FILL_VOL, "any");
  const inTheo = mkNum(DEFAULT_THEO); const inFilled = mkNum(245); const inTested = mkNum(15); const inReleased = mkNum(0);
  const selStatus = document.createElement("select");
  for (const [v, l] of Object.entries(STATUS_LABELS)) { const o = document.createElement("option"); o.value = v; o.textContent = l; selStatus.appendChild(o); }
  selStatus.value = "pending";
  const inNote = document.createElement("input"); inNote.type = "text"; inNote.placeholder = "Comment / CAPA ref";
  const inExp = document.createElement("input"); inExp.type = "date";
  form.appendChild(mkFld("Date compounded", inDate));
  form.appendChild(mkFld("Lot ID", inLot));
  form.appendChild(mkFld("Product line", selLine));
  form.appendChild(mkFld("Strength (mg/mL)", inStrength));
  form.appendChild(mkFld("Additive (mg/mL)", inAdd));
  form.appendChild(mkFld("Unit vol (mL)", inUnitVol));
  form.appendChild(mkFld("Fill vol (mL)", inFillVol));
  form.appendChild(mkFld("Theoretical yield", inTheo));
  form.appendChild(mkFld("Actual yield", inFilled));
  form.appendChild(mkFld("Sent for testing", inTested));
  form.appendChild(mkFld("Released", inReleased));
  form.appendChild(mkFld("Status", selStatus));
  form.appendChild(mkFld("Expected release", inExp));
  form.appendChild(mkFld("Note", inNote));
  const btnWrap = hEl("div", "fld");
  const submit = hEl("button", "btn primary", state.editingId ? "Save changes" : "Add batch");
  submit.type = "submit"; btnWrap.appendChild(submit);
  if (state.editingId) {
    const cancel = hEl("button", "btn", "Cancel"); cancel.type = "button";
    cancel.style.marginLeft = "6px";
    cancel.addEventListener("click", () => { state.editingId = null; renderBatches(); });
    btnWrap.appendChild(cancel);
  }
  form.appendChild(btnWrap);
  if (state.editingId) {
    const b = batches.find(x => x.id === state.editingId);
    if (b) {
      inDate.value = b.date; inLot.value = b.id; selLine.value = b.line;
      inStrength.value = b.strength ?? ""; inAdd.value = b.addConc ?? DEFAULT_ADD_CONC;
      inUnitVol.value = b.unitVol ?? DEFAULT_UNIT_VOL; inFillVol.value = b.fillVol ?? DEFAULT_FILL_VOL;
      inTheo.value = b.theo ?? DEFAULT_THEO; inFilled.value = b.filled ?? "";
      inTested.value = b.tested ?? 0; inReleased.value = b.released ?? 0;
      selStatus.value = b.status; inNote.value = b.note || "";
      inExp.value = b.expRelease || "";
    }
  }
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const rec = {
      id: inLot.value.trim() || newLotId(inDate.value),
      date: inDate.value, formulaId: "",
      line: selLine.value, strength: +inStrength.value || null, addConc: +inAdd.value || DEFAULT_ADD_CONC,
      unitVol: +inUnitVol.value || DEFAULT_UNIT_VOL, fillVol: +inFillVol.value || DEFAULT_FILL_VOL,
      theo: +inTheo.value || DEFAULT_THEO,
      filled: inFilled.value === "" ? null : +inFilled.value,
      tested: +inTested.value || 0, released: +inReleased.value || 0,
      status: selStatus.value, note: inNote.value.trim(),
      expRelease: inExp.value || null,
    };
    if (state.editingId) {
      const b = batches.find(x => x.id === state.editingId);
      const fid = b.formulaId; Object.assign(b, rec); b.formulaId = fid;
      state.editingId = null;
    } else {
      batches.push(rec);
    }
    batches.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
    saveNow();
    renderBatches();
  });
  fcard.appendChild(form);
  fcard.appendChild(hEl("div", "form-note", "This view reads live from the published production log. Local edits here are kept in your browser only (leadership viewers see the live sheet); use Save data / Load data to move a snapshot between machines."));
  root.appendChild(fcard);

  const tc = card(null, null);
  const head = hEl("div", "row-between");
  head.appendChild(hEl("h3", null, "Batch records"));
  const rightWrap = hEl("div"); rightWrap.style.display = "flex"; rightWrap.style.alignItems = "center"; rightWrap.style.gap = "10px";
  rightWrap.appendChild(hEl("span", "note", fmtInt(batches.length) + " lots · log snapshot " + fmtDate(LOG_SNAPSHOT_DATE)));
  const resetBtn = hEl("button", "btn small danger-ghost", "Reset to log snapshot");
  resetBtn.addEventListener("click", () => {
    if (confirm("Replace all current data with the Drive log snapshot from " + fmtDate(LOG_SNAPSHOT_DATE) + "? This clears saved changes in this browser.")) {
      loadLogSnapshot(); weeklyTargets = {}; A = { ...defaultAssumptions };
      clearPersisted(); persist(); updateSaveStatus(); renderAll();
    }
  });
  rightWrap.appendChild(resetBtn);
  head.appendChild(rightWrap); tc.appendChild(head);
  const wrap = hEl("div", "scroll-x mt8");
  const table = hEl("table", "data");
  const thead = document.createElement("thead");
  const hrow = document.createElement("tr");
  for (const [h, cls] of [["Lot", ""], ["Date", ""], ["Product", ""], ["Str.", "num"], ["Vol", "num"], ["Theo", "num"], ["Filled", "num"], ["Tested", "num"], ["Released", "num"], ["Fill eff.", "num"], ["Batch cost", "num"], ["Status", ""], ["Note", ""], ["", ""]]) {
    const th = document.createElement("th"); th.textContent = h; if (cls) th.className = cls; hrow.appendChild(th);
  }
  thead.appendChild(hrow); table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const recent = [...batches].sort((a, b) => a.date > b.date ? -1 : a.date < b.date ? 1 : a.id > b.id ? -1 : 1).slice(0, 140);
  for (const b of recent) {
    const tr = document.createElement("tr");
    const cells = [
      b.id, fmtDate(b.date), NAME_MODE === "fulfillment" ? fulfillmentName(b) : LINES[b.line].short,
      b.strength == null ? "—" : (isB35(b) ? b.strength + "/" + b.niac + "/" + b.dexp : b.strength + "/" + b.addConc),
      b.unitVol != null ? b.unitVol + " mL" : "—",
      b.theo != null ? fmtInt(b.theo) : "—",
      b.filled != null ? fmtInt(b.filled) : "—",
      b.tested ? fmtInt(b.tested) : "0",
      b.status === "released" ? fmtInt(b.released) : "—",
      b.theo && b.filled != null ? fmtPct(b.filled / b.theo) : "—",
      b.status === "scheduled" ? "—" : fmtMoney0(batchCostTotal(b)),
    ];
    cells.forEach((c, i) => {
      const td = document.createElement("td");
      td.textContent = c;
      if (i >= 3 && i <= 10) td.className = "num";
      tr.appendChild(td);
    });
    const tdS = document.createElement("td");
    tdS.appendChild(hEl("span", "pill " + b.status, STATUS_LABELS[b.status] || b.status));
    tr.appendChild(tdS);
    const tdN = document.createElement("td"); tdN.textContent = b.note || ""; tdN.style.maxWidth = "200px"; tdN.style.overflow = "hidden"; tdN.style.textOverflow = "ellipsis"; tdN.title = b.note || ""; tr.appendChild(tdN);
    const tdA = document.createElement("td");
    const be = hEl("button", "btn small", "Edit");
    be.addEventListener("click", () => { state.editingId = b.id; renderBatches(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    const bd = hEl("button", "btn small danger-ghost", "Delete");
    bd.style.marginLeft = "4px";
    bd.addEventListener("click", () => { batches = batches.filter(x => x.id !== b.id); saveNow(); renderBatches(); });
    tdA.appendChild(be); tdA.appendChild(bd); tr.appendChild(tdA);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody); wrap.appendChild(table); tc.appendChild(wrap);
  if (batches.length > 140) tc.appendChild(hEl("div", "note mt8", "Showing the 140 most recent lots — export CSV for the full log."));
  root.appendChild(tc);
}
