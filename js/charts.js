/* ============================================================
   Chart helpers — hand-rolled SVG
   ============================================================ */
const SVGNS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const tooltip = () => document.getElementById("tooltip");
function showTip(x, y, titleText, rows) {
  const t = tooltip();
  t.replaceChildren();
  if (titleText) {
    const ti = document.createElement("div"); ti.className = "tt-title";
    ti.textContent = titleText; t.appendChild(ti);
  }
  for (const r of rows) {
    const row = document.createElement("div"); row.className = "tt-row";
    if (r.color) { const k = document.createElement("span"); k.className = "tt-key"; k.style.background = r.color; row.appendChild(k); }
    const v = document.createElement("span"); v.className = "tt-val"; v.textContent = r.value; row.appendChild(v);
    if (r.name) { const n = document.createElement("span"); n.className = "tt-name"; n.textContent = r.name; row.appendChild(n); }
    t.appendChild(row);
  }
  t.style.display = "block";
  const w = t.offsetWidth, h = t.offsetHeight;
  let left = x + 14, top = y - h - 10;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 14;
  t.style.left = left + "px"; t.style.top = top + "px";
}
function hideTip() { tooltip().style.display = "none"; }

function niceMax(v) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function yTicks(max, n) {
  const step = max / n, out = [];
  for (let i = 0; i <= n; i++) out.push(Math.round(step * i));
  return out;
}

function chartFrame(container, height, padL, padR, padT, padB) {
  container.replaceChildren();
  const width = Math.max(320, container.clientWidth || 600);
  const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}` });
  container.appendChild(svg);
  return { svg, width, height, x0: padL, x1: width - padR, y0: padT, y1: height - padB };
}
function drawGrid(f, ticks, max, fmt) {
  for (const t of ticks) {
    const y = f.y1 - (t / max) * (f.y1 - f.y0);
    el("line", { x1: f.x0, x2: f.x1, y1: y, y2: y, stroke: cssVar(t === 0 ? "baseline" : "grid"), "stroke-width": 1 }, f.svg);
    el("text", { x: f.x0 - 8, y: y + 4, "text-anchor": "end", "font-size": 11, fill: cssVar("text-muted") }, f.svg)
      .textContent = fmt ? fmt(t) : fmtInt(t);
  }
}
function roundedTopBar(f, x, y, w, h, fill, opts) {
  const r = Math.min(4, w / 2, h);
  const path = h <= 0 ? "" :
    `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  const p = el("path", { d: path, fill }, f.svg);
  if (opts && opts.dashedOutline) {
    p.setAttribute("fill", opts.fillOverride || fill);
    el("path", { d: path, fill: "none", stroke: opts.stroke, "stroke-width": 1.5, "stroke-dasharray": "4 3" }, f.svg);
  }
  return p;
}

/* Column chart */
function columnChart(container, data, opts) {
  const height = opts.height || 240;
  const f = chartFrame(container, height, 52, 10, 12, 30);
  const maxV = niceMax(Math.max(...data.map(d => Math.max(d.value, d.target || 0)), 1));
  drawGrid(f, yTicks(maxV, 4), maxV, opts.fmt);
  const n = data.length;
  const band = (f.x1 - f.x0) / n;
  const bw = Math.min(24, band * 0.55);
  const labelEvery = Math.ceil(n / Math.max(4, Math.floor((f.x1 - f.x0) / 64)));
  data.forEach((d, i) => {
    const cx = f.x0 + band * i + band / 2;
    const h = (d.value / maxV) * (f.y1 - f.y0);
    const y = f.y1 - h;
    const isFc = opts.forecastFrom != null && i >= opts.forecastFrom;
    const color = isFc ? cssVar("seq-250") : (opts.color ? opts.color(d, i) : cssVar("series-1"));
    if (isFc) roundedTopBar(f, cx - bw / 2, y, bw, h, color, { dashedOutline: true, stroke: cssVar("series-1"), fillOverride: color });
    else roundedTopBar(f, cx - bw / 2, y, bw, h, color);
    if (d.target != null) {
      el("line", { x1: cx - bw / 2 - 6, x2: cx + bw / 2 + 6, y1: f.y1 - (d.target / maxV) * (f.y1 - f.y0), y2: f.y1 - (d.target / maxV) * (f.y1 - f.y0), stroke: cssVar("text-primary"), "stroke-width": 1.5 }, f.svg);
    }
    if (i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.6))
      el("text", { x: cx, y: f.y1 + 16, "text-anchor": "middle", "font-size": 11, fill: cssVar("text-muted") }, f.svg)
        .textContent = d.label;
    if (opts.directLabel && (i === n - 1 || opts.directLabel === "all")) {
      el("text", { x: cx, y: y - 6, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: cssVar("text-secondary") }, f.svg)
        .textContent = (opts.fmt || fmtInt)(d.value);
    }
    const hit = el("rect", { x: f.x0 + band * i, y: f.y0, width: band, height: f.y1 - f.y0, fill: "transparent" }, f.svg);
    hit.addEventListener("pointermove", ev => {
      const rows = [{ color, value: (opts.fmt || fmtInt)(d.value), name: isFc ? "forecast" : (opts.valueName || "actual") }];
      if (d.target != null) rows.push({ color: cssVar("text-primary"), value: (opts.fmt || fmtInt)(d.target), name: opts.targetLabel || "target" });
      if (d.sub) rows.push({ value: d.sub, name: "" });
      showTip(ev.clientX, ev.clientY, d.tipTitle || d.label, rows);
    });
    hit.addEventListener("pointerleave", hideTip);
  });
}

/* Overlay columns: light "produced" back bar with narrower "filled" front bar */
function overlayColumns(container, data, opts) {
  const height = (opts && opts.height) || 240;
  const f = chartFrame(container, height, 52, 10, 12, 30);
  const maxV = niceMax(Math.max(...data.map(d => Math.max(d.back || 0, d.front || 0)), 1));
  drawGrid(f, yTicks(maxV, 4), maxV, opts && opts.fmt);
  const n = data.length;
  const band = (f.x1 - f.x0) / n;
  const backW = Math.min(24, band * 0.6);
  const frontW = Math.max(6, backW * 0.5);
  const labelEvery = Math.ceil(n / Math.max(4, Math.floor((f.x1 - f.x0) / 64)));
  const backColor = cssVar("seq-150");
  const frontColor = cssVar("series-1");
  data.forEach((d, i) => {
    const cx = f.x0 + band * i + band / 2;
    if (d.back > 0) {
      const h = (d.back / maxV) * (f.y1 - f.y0);
      roundedTopBar(f, cx - backW / 2, f.y1 - h, backW, h, backColor);
    }
    if (d.front > 0) {
      const h = (d.front / maxV) * (f.y1 - f.y0);
      roundedTopBar(f, cx - frontW / 2, f.y1 - h, frontW, h, frontColor);
    }
    if (i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.6))
      el("text", { x: cx, y: f.y1 + 16, "text-anchor": "middle", "font-size": 11, fill: cssVar("text-muted") }, f.svg)
        .textContent = d.label;
    const hit = el("rect", { x: f.x0 + band * i, y: f.y0, width: band, height: f.y1 - f.y0, fill: "transparent" }, f.svg);
    hit.addEventListener("pointermove", ev => {
      const fmt = (opts && opts.fmt) || fmtInt;
      const rows = [
        { color: frontColor, value: fmt(d.front || 0), name: (opts && opts.frontName) || "filled" },
        { color: backColor, value: fmt(d.back || 0), name: (opts && opts.backName) || "produced" },
      ];
      if (d.back > 0) rows.push({ value: fmtPct((d.front || 0) / d.back), name: "fill efficiency" });
      if (d.sub) rows.push({ value: d.sub, name: "" });
      showTip(ev.clientX, ev.clientY, d.tipTitle || d.label, rows);
    });
    hit.addEventListener("pointerleave", hideTip);
  });
}

/* Vertical stacked columns */
function stackedColumns(container, data, opts) {
  const height = (opts && opts.height) || 240;
  const f = chartFrame(container, height, 52, 10, 12, 30);
  const maxV = niceMax(Math.max(...data.map(d => d.parts.reduce((a, p) => a + p.value, 0)), 1));
  drawGrid(f, yTicks(maxV, 4), maxV);
  const n = data.length;
  const band = (f.x1 - f.x0) / n;
  const bw = Math.min(24, band * 0.55);
  const gap = 2;
  data.forEach((d, i) => {
    const cx = f.x0 + band * i + band / 2;
    let acc = 0;
    const total = d.parts.reduce((a, p) => a + p.value, 0);
    d.parts.forEach((p, pi) => {
      if (p.value <= 0) { return; }
      const h0 = (acc / maxV) * (f.y1 - f.y0);
      const h1 = ((acc + p.value) / maxV) * (f.y1 - f.y0);
      const isTop = pi === d.parts.length - 1 || d.parts.slice(pi + 1).every(q => q.value <= 0);
      const yTop = f.y1 - h1, hSeg = Math.max(0, h1 - h0 - (isTop ? 0 : gap));
      if (isTop) roundedTopBar(f, cx - bw / 2, yTop, bw, hSeg, p.color);
      else el("rect", { x: cx - bw / 2, y: yTop, width: bw, height: hSeg, fill: p.color }, f.svg);
      acc += p.value;
    });
    el("text", { x: cx, y: f.y1 + 16, "text-anchor": "middle", "font-size": 11, fill: cssVar("text-muted") }, f.svg)
      .textContent = d.label;
    const hit = el("rect", { x: f.x0 + band * i, y: f.y0, width: band, height: f.y1 - f.y0, fill: "transparent" }, f.svg);
    hit.addEventListener("pointermove", ev => {
      const rows = d.parts.map(p => ({ color: p.color, value: fmtInt(p.value), name: p.name }));
      rows.push({ value: fmtInt(total), name: "total" });
      showTip(ev.clientX, ev.clientY, d.tipTitle || d.label, rows);
    });
    hit.addEventListener("pointerleave", hideTip);
  });
}

/* Line chart w/ crosshair */
function lineChart(container, categories, series, opts) {
  const height = (opts && opts.height) || 240;
  const f = chartFrame(container, height, 52, 30, 12, 30);
  const allY = series.flatMap(s => s.values).filter(v => v != null && v.y != null).map(v => v.y);
  let maxV = niceMax(Math.max(...allY, 1));
  let minV = 0;
  if (opts && opts.yMin != null) minV = opts.yMin;
  if (opts && opts.yMax != null) maxV = opts.yMax;
  const ticks = (opts && opts.yTicks) || yTicks(maxV, 4).filter(t => t >= minV);
  for (const t of ticks) {
    const y = f.y1 - ((t - minV) / (maxV - minV)) * (f.y1 - f.y0);
    el("line", { x1: f.x0, x2: f.x1, y1: y, y2: y, stroke: cssVar(t === minV ? "baseline" : "grid"), "stroke-width": 1 }, f.svg);
    el("text", { x: f.x0 - 8, y: y + 4, "text-anchor": "end", "font-size": 11, fill: cssVar("text-muted") }, f.svg)
      .textContent = (opts && opts.fmt) ? opts.fmt(t) : fmtInt(t);
  }
  const n = categories.length;
  const xAt = i => n === 1 ? (f.x0 + f.x1) / 2 : f.x0 + (i / (n - 1)) * (f.x1 - f.x0);
  const yAt = v => Math.max(f.y0, Math.min(f.y1, f.y1 - ((v - minV) / (maxV - minV)) * (f.y1 - f.y0)));
  const labelEvery = Math.ceil(n / Math.max(3, Math.floor((f.x1 - f.x0) / 70)));
  categories.forEach((c, i) => {
    if (i % labelEvery === 0 || i === n - 1)
      el("text", { x: xAt(i), y: f.y1 + 16, "text-anchor": "middle", "font-size": 11, fill: cssVar("text-muted") }, f.svg)
        .textContent = c;
  });
  if (opts && opts.refLine != null) {
    const y = yAt(opts.refLine);
    el("line", { x1: f.x0, x2: f.x1, y1: y, y2: y, stroke: cssVar("text-muted"), "stroke-width": 1, "stroke-dasharray": "2 4" }, f.svg);
    el("text", { x: f.x1 - 12, y: y - 5, "text-anchor": "end", "font-size": 10.5, fill: cssVar("text-muted") }, f.svg)
      .textContent = opts.refLabel || "";
  }
  for (const s of series) {
    let dParts = [];
    s.values.forEach((v, i) => {
      if (v == null || v.y == null) { return; }
      dParts.push((dParts.length ? "L" : "M") + xAt(i) + "," + yAt(v.y));
    });
    if (dParts.length > 1) {
      const attrs = { d: dParts.join(" "), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" };
      if (s.dash) attrs["stroke-dasharray"] = "5 4";
      el("path", attrs, f.svg);
    }
    for (let i = s.values.length - 1; i >= 0; i--) {
      const v = s.values[i];
      if (v && v.y != null) {
        el("circle", { cx: xAt(i), cy: yAt(v.y), r: 6, fill: cssVar("surface-1") }, f.svg);
        el("circle", { cx: xAt(i), cy: yAt(v.y), r: 4, fill: s.color }, f.svg);
        break;
      }
    }
  }
  const cross = el("line", { x1: 0, x2: 0, y1: f.y0, y2: f.y1, stroke: cssVar("baseline"), "stroke-width": 1, visibility: "hidden" }, f.svg);
  const hit = el("rect", { x: f.x0, y: f.y0, width: f.x1 - f.x0, height: f.y1 - f.y0, fill: "transparent" }, f.svg);
  hit.addEventListener("pointermove", ev => {
    const rect = f.svg.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(xAt(i) - px); if (d < bd) { bd = d; best = i; } }
    cross.setAttribute("x1", xAt(best)); cross.setAttribute("x2", xAt(best));
    cross.setAttribute("visibility", "visible");
    const rows = [];
    for (const s of series) {
      const v = s.values[best];
      if (v && v.y != null) rows.push({ color: s.color, value: (opts && opts.fmt) ? opts.fmt(v.y) : fmtInt(v.y), name: s.name });
    }
    if (rows.length) showTip(ev.clientX, ev.clientY, (opts && opts.tipTitle ? opts.tipTitle(best) : categories[best]), rows);
  });
  hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
}

/* Horizontal stacked bars */
function hStackedBars(container, data, opts) {
  const rowH = 34, padT = 6;
  const height = padT + data.length * rowH + 26;
  const f = chartFrame(container, height, 150, 60, padT, 20);
  const maxV = niceMax(Math.max(...data.map(d => d.parts.reduce((a, p) => a + p.value, 0)), 1));
  const ticks = yTicks(maxV, 4);
  for (const t of ticks) {
    const x = f.x0 + (t / maxV) * (f.x1 - f.x0);
    el("line", { x1: x, x2: x, y1: f.y0, y2: height - 20, stroke: cssVar(t === 0 ? "baseline" : "grid"), "stroke-width": 1 }, f.svg);
    el("text", { x, y: height - 6, "text-anchor": "middle", "font-size": 10.5, fill: cssVar("text-muted") }, f.svg)
      .textContent = "$" + t;
  }
  data.forEach((d, i) => {
    const yc = padT + i * rowH + rowH / 2;
    const bh = 18;
    el("text", { x: f.x0 - 10, y: yc + 4, "text-anchor": "end", "font-size": 12, fill: cssVar("text-secondary") }, f.svg)
      .textContent = d.label;
    let acc = 0;
    const total = d.parts.reduce((a, p) => a + p.value, 0);
    d.parts.forEach((p, pi) => {
      const x0 = f.x0 + (acc / maxV) * (f.x1 - f.x0);
      const x1 = f.x0 + ((acc + p.value) / maxV) * (f.x1 - f.x0);
      const isLast = pi === d.parts.length - 1;
      const w = Math.max(0, x1 - x0 - (isLast ? 0 : 2));
      if (w > 0) {
        if (isLast) {
          const r = Math.min(4, w / 2, bh / 2);
          el("path", { d: `M${x0},${yc - bh / 2} L${x1 - r},${yc - bh / 2} Q${x1},${yc - bh / 2} ${x1},${yc - bh / 2 + r} L${x1},${yc + bh / 2 - r} Q${x1},${yc + bh / 2} ${x1 - r},${yc + bh / 2} L${x0},${yc + bh / 2} Z`, fill: p.color }, f.svg);
        } else {
          el("rect", { x: x0, y: yc - bh / 2, width: w, height: bh, fill: p.color }, f.svg);
        }
      }
      acc += p.value;
    });
    el("text", { x: f.x0 + (total / maxV) * (f.x1 - f.x0) + 8, y: yc + 4, "font-size": 11.5, "font-weight": 600, fill: cssVar("text-secondary") }, f.svg)
      .textContent = fmtMoney(total);
    const hit = el("rect", { x: 0, y: padT + i * rowH, width: f.width, height: rowH, fill: "transparent" }, f.svg);
    hit.addEventListener("pointermove", ev => {
      const rows = d.parts.map(p => ({ color: p.color, value: fmtMoney(p.value), name: p.name }));
      rows.push({ value: fmtMoney(total), name: "total / unit" });
      showTip(ev.clientX, ev.clientY, d.tipTitle || d.label, rows);
    });
    hit.addEventListener("pointerleave", hideTip);
  });
}

/* Heatmap (SKU × period) — sequential ramp, per dataviz for many categories.
   rows: [{key,label}]  cols: [{key,label}]  getVal(rKey,cKey)->number */
function _relLum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 1;
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function heatmap(container, rows, cols, getVal, opts) {
  opts = opts || {};
  const fmt = opts.fmt || fmtInt;
  const rowTotals = opts.rowTotals !== false, colTotals = opts.colTotals !== false;
  const dark = _relLum(cssVar("surface-1")) < 0.5;
  const RAMPS = {
    seq: dark ? ["#12345f", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"]
              : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
    warn: dark ? ["#4a3a10", "#6b5410", "#8a6b00", "#b58a00", "#d9a520", "#f0c04a", "#f7d98a"]
               : ["#fde7bf", "#f9d47a", "#f2bd3f", "#eda100", "#c98500", "#9a6600", "#6b4700"],
  };
  const cellOf = (rk, ck) => { const c = getVal(rk, ck); return typeof c === "number" ? { value: c || 0, kind: "seq" } : (c || { value: 0, kind: "seq" }); };
  let maxV = 0;
  for (const r of rows) for (const c of cols) maxV = Math.max(maxV, cellOf(r.key, c.key).value);
  maxV = maxV || 1;
  const colorFor = (v, kind) => v > 0 ? (RAMPS[kind] || RAMPS.seq)[Math.min(6, Math.round((v / maxV) * 6))] : cssVar("page");
  const inkFor = hex => _relLum(hex) < 0.5 ? "#fff" : cssVar("text-primary");
  const kindName = opts.kindLabel || { seq: "", warn: " · expected" };
  const leftPad = opts.leftPad || 132, topPad = 34, rightPad = rowTotals ? 58 : 12, botPad = colTotals ? 28 : 8;
  const rowH = 22, gap = 2, minColW = opts.minColW || 48;
  const avail = Math.max(480, container.clientWidth || 700);
  const nc = cols.length || 1;
  const gridW = Math.max(avail - leftPad - rightPad, nc * minColW);   // enforce min col width → scroll if cramped
  const colW = gridW / nc;
  const width = leftPad + gridW + rightPad;
  const height = topPad + rows.length * rowH + botPad;
  container.replaceChildren();
  const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}` });
  container.appendChild(svg);
  const xOf = ci => leftPad + ci * colW, yOf = ri => topPad + ri * rowH;
  const hdrFs = colW < 40 ? 9 : 10.5;
  cols.forEach((c, ci) => {
    el("text", { x: xOf(ci) + colW / 2, y: topPad - 9, "text-anchor": "middle", "font-size": hdrFs, fill: cssVar("text-secondary") }, svg).textContent = c.label;
  });
  rows.forEach((r, ri) => {
    el("text", { x: leftPad - 8, y: yOf(ri) + rowH / 2 + 4, "text-anchor": "end", "font-size": 11, fill: cssVar("text-secondary") }, svg).textContent = r.label;
    let rowSum = 0;
    cols.forEach((c, ci) => {
      const cell = cellOf(r.key, c.key); const v = cell.value; rowSum += v;
      const x = xOf(ci) + gap / 2, y = yOf(ri) + gap / 2, w = colW - gap, h = rowH - gap;
      const fill = colorFor(v, cell.kind);
      const rectAttrs = { x, y, width: w, height: h, rx: 3, fill, stroke: v > 0 ? "none" : cssVar("grid"), "stroke-width": v > 0 ? 0 : 1 };
      if (v > 0 && cell.kind === "warn") { rectAttrs.stroke = cssVar("status-warn"); rectAttrs["stroke-width"] = 1; rectAttrs["stroke-dasharray"] = "3 2"; }
      el("rect", rectAttrs, svg);
      if (v > 0 && colW >= 30)
        el("text", { x: x + w / 2, y: y + h / 2 + 3.5, "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: inkFor(fill) }, svg).textContent = fmt(v);
      const hit = el("rect", { x: xOf(ci), y: yOf(ri), width: colW, height: rowH, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", ev => showTip(ev.clientX, ev.clientY, (opts.colTip ? opts.colTip(c) : c.label),
        [{ color: v > 0 ? fill : cssVar("text-muted"), value: fmt(v), name: r.label + (v > 0 ? (kindName[cell.kind] || "") : "") }]));
      hit.addEventListener("pointerleave", hideTip);
    });
    if (rowTotals) el("text", { x: width - 8, y: yOf(ri) + rowH / 2 + 4, "text-anchor": "end", "font-size": 11, "font-weight": 700, fill: cssVar("text-primary") }, svg).textContent = fmt(rowSum);
  });
  if (rowTotals) el("text", { x: width - 8, y: topPad - 8, "text-anchor": "end", "font-size": 10, fill: cssVar("text-muted") }, svg).textContent = "Total";
  if (colTotals) {
    const y = topPad + rows.length * rowH + 15;
    cols.forEach((c, ci) => {
      let s = 0; for (const r of rows) s += cellOf(r.key, c.key).value;
      el("text", { x: xOf(ci) + colW / 2, y, "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: cssVar("text-muted") }, svg).textContent = s ? fmt(s) : "";
    });
    el("text", { x: leftPad - 8, y, "text-anchor": "end", "font-size": 10, fill: cssVar("text-muted") }, svg).textContent = "Total";
  }
}

/* Sparkline */
function sparkline(container, values, color) {
  container.replaceChildren();
  if (!values.length) return;
  const w = 120, h = 28;
  const svg = el("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  container.appendChild(svg);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const xAt = i => values.length === 1 ? w / 2 : 2 + (i / (values.length - 1)) * (w - 8);
  const yAt = v => h - 3 - ((v - min) / span) * (h - 8);
  let d = "";
  values.forEach((v, i) => { d += (i ? "L" : "M") + xAt(i) + "," + yAt(v); });
  el("path", { d, fill: "none", stroke: cssVar("seq-250"), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  const li = values.length - 1;
  el("circle", { cx: xAt(li), cy: yAt(values[li]), r: 4.5, fill: cssVar("surface-1") }, svg);
  el("circle", { cx: xAt(li), cy: yAt(values[li]), r: 3, fill: color || cssVar("series-1") }, svg);
}

function legendHTML(items) {
  const wrap = document.createElement("div"); wrap.className = "legend";
  for (const it of items) {
    const li = document.createElement("span"); li.className = "li";
    const sw = document.createElement("span");
    sw.className = it.line ? "ln" + (it.dash ? " dashed" : "") : "sw";
    if (it.dash && it.line) sw.style.color = it.color; else sw.style.background = it.color;
    li.appendChild(sw);
    const tx = document.createElement("span"); tx.textContent = it.name; li.appendChild(tx);
    wrap.appendChild(li);
  }
  return wrap;
}
