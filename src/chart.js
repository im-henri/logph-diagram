// SVG chart renderer + coordinate transforms.

function el(name, attrs = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

export function createChart(svg) {
  const clipId = `plotClip_${Math.random().toString(36).slice(2, 10)}`;
  const state = {
    width: 0,
    height: 0,
    // Padding around the plot area (px)
    pad: { l: 52, r: 44, t: 18, b: 46 },
    domain: { hMin: 0, hMax: 1, logPMin: 0, logPMax: 1 },
    bg: null,
    fg: null,
    clipId,
    clipRect: null,
    tooltipFilterId: null,
  };

  svg.innerHTML = "";
  const defs = el("defs");
  const clipPath = el("clipPath", { id: clipId });
  state.clipRect = el("rect", { x: 0, y: 0, width: 0, height: 0 });
  clipPath.appendChild(state.clipRect);
  defs.appendChild(clipPath);

  // Slight blur for tooltip background boxes (rect only; text stays crisp).
  state.tooltipFilterId = `tooltipBlur_${clipId}`;
  const tipFilter = el("filter", { id: state.tooltipFilterId, x: "-20%", y: "-20%", width: "140%", height: "140%" });
  tipFilter.appendChild(el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "0.8", result: "blur" }));
  const merge = el("feMerge");
  merge.appendChild(el("feMergeNode", { in: "blur" }));
  merge.appendChild(el("feMergeNode", { in: "SourceGraphic" }));
  tipFilter.appendChild(merge);
  defs.appendChild(tipFilter);

  svg.appendChild(defs);

  state.bg = el("g");
  state.fg = el("g");
  svg.appendChild(state.bg);
  svg.appendChild(state.fg);

  function resize() {
    const rect = svg.getBoundingClientRect();
    state.width = Math.max(200, rect.width);
    state.height = Math.max(200, rect.height);
    svg.setAttribute("viewBox", `0 0 ${state.width} ${state.height}`);

    // Update plot-area clip rect
    const x0 = state.pad.l;
    const y0 = state.pad.t;
    const x1 = state.width - state.pad.r;
    const y1 = state.height - state.pad.b;
    state.clipRect.setAttribute("x", String(x0));
    state.clipRect.setAttribute("y", String(y0));
    state.clipRect.setAttribute("width", String(Math.max(0, x1 - x0)));
    state.clipRect.setAttribute("height", String(Math.max(0, y1 - y0)));
  }

  function xFromH(h) {
    const { hMin, hMax } = state.domain;
    const w = state.width - state.pad.l - state.pad.r;
    return state.pad.l + ((h - hMin) / (hMax - hMin)) * w;
  }

  function yFromLogP(lp) {
    const { logPMin, logPMax } = state.domain;
    const h = state.height - state.pad.t - state.pad.b;
    // y downwards
    return state.pad.t + (1 - (lp - logPMin) / (logPMax - logPMin)) * h;
  }

  function hFromX(x) {
    const { hMin, hMax } = state.domain;
    const w = state.width - state.pad.l - state.pad.r;
    const t = (x - state.pad.l) / w;
    return hMin + t * (hMax - hMin);
  }

  function logPFromY(y) {
    const { logPMin, logPMax } = state.domain;
    const h = state.height - state.pad.t - state.pad.b;
    const t = 1 - (y - state.pad.t) / h;
    return logPMin + t * (logPMax - logPMin);
  }

  function clear() {
    state.bg.innerHTML = "";
    state.fg.innerHTML = "";
  }

  function niceLogTicks(minBar, maxBar) {
    const ticks = [];
    if (!(minBar > 0) || !(maxBar > 0) || minBar >= maxBar) return ticks;

    const eMin = Math.floor(Math.log10(minBar));
    const eMax = Math.ceil(Math.log10(maxBar));
    const mult = [1, 2, 5];

    for (let e = eMin; e <= eMax; e++) {
      for (const m of mult) {
        const v = m * Math.pow(10, e);
        if (v >= minBar * 0.999 && v <= maxBar * 1.001) ticks.push(v);
      }
    }
    return ticks;
  }

  function fmtBarTick(v) {
    if (v >= 10) return v.toFixed(0);
    if (v >= 1) return v.toFixed(1).replace(/\.0$/, "");
    if (v >= 0.1) return v.toFixed(2).replace(/0$/, "");
    return v.toFixed(3);
  }

  function drawAxes({ showTitles = true } = {}) {
    const { width, height, pad } = state;
    const x0 = pad.l,
      x1 = width - pad.r;
    const y0 = pad.t,
      y1 = height - pad.b;

    // frame / axis lines
    state.bg.appendChild(el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: "none", class: "axisLine" }));

    // grid
    const grid = el("g");
    const nx = 8;
    for (let i = 0; i <= nx; i++) {
      const t = i / nx;
      const x = x0 + t * (x1 - x0);
      grid.appendChild(el("line", { x1: x, y1: y0, x2: x, y2: y1, class: i % 2 === 0 ? "gridLineMajor" : "gridLine" }));
    }

    // horizontal grid: use nice log ticks in bar
    const { logPMin, logPMax } = state.domain;
    const pMinBar = Math.pow(10, logPMin);
    const pMaxBar = Math.pow(10, logPMax);
    const pTicks = niceLogTicks(pMinBar, pMaxBar);
    for (const pb of pTicks) {
      const y = yFromLogP(Math.log10(pb));
      const cls = pb.toString().startsWith("1") && Math.abs(Math.log10(pb) - Math.round(Math.log10(pb))) < 1e-9 ? "gridLineMajor" : "gridLine";
      grid.appendChild(el("line", { x1: x0, y1: y, x2: x1, y2: y, class: cls }));
    }
    state.bg.appendChild(grid);

    // axis titles (optional; can be moved outside the plot for compact layouts)
    if (showTitles) {
      state.bg.appendChild(el("text", { x: (x0 + x1) / 2, y: height - 14, class: "axisText", "text-anchor": "middle" })).textContent = "h [kJ/kg]";
      const yLab = el("text", { x: 14, y: (y0 + y1) / 2, class: "axisText", "text-anchor": "middle" });
      yLab.setAttribute("transform", `rotate(-90 14 ${(y0 + y1) / 2})`);
      yLab.textContent = "p [bar] (log scale)";
      state.bg.appendChild(yLab);
    }

    // ticks
    const { hMin, hMax } = state.domain;
    for (let i = 0; i <= nx; i += 2) {
      const t = i / nx;
      const x = x0 + t * (x1 - x0);
      const h = hMin + t * (hMax - hMin);
      const txt = el("text", { x, y: y1 + 16, class: "axisText", "text-anchor": "middle" });
      txt.textContent = h.toFixed(0);
      state.bg.appendChild(txt);
    }

    // Y tick labels in bar (log spaced)
    for (const pb of pTicks) {
      const y = yFromLogP(Math.log10(pb));
      const txt = el("text", { x: x0 - 8, y: y + 4, class: "axisText", "text-anchor": "end" });
      txt.textContent = fmtBarTick(pb);
      state.bg.appendChild(txt);
    }
  }

  function pathFromPoints(points) {
    let d = "";
    for (let i = 0; i < points.length; i++) {
      const { h, logP } = points[i];
      const x = xFromH(h);
      const y = yFromLogP(logP);
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
    }
    return d;
  }

  function setDomainFromSat(sat) {
    // sat items: {P,hL,hV}
    const hs = sat.flatMap((p) => [p.hL, p.hV]).filter(Number.isFinite);
    const ps = sat.map((p) => p.P).filter(Number.isFinite);

    const hMin = Math.min(...hs);
    const hMax = Math.max(...hs);
    const pMin = Math.min(...ps);
    const pMax = Math.max(...ps);

    // padding (asymmetric: give extra room to the right for points/labels)
    const spanH = hMax - hMin || 1;
    const hPadL = 0.08 * spanH;
    const hPadR = 0.26 * spanH;
    const lpMin = Math.log10(pMin / 1e5); // Pa->bar
    const lpMax = Math.log10(pMax / 1e5);

    state.domain.hMin = hMin - hPadL;
    state.domain.hMax = hMax + hPadR;
    state.domain.logPMin = lpMin - 0.15;
    state.domain.logPMax = lpMax + 0.08;
  }

  function drawSaturation(sat) {
    const left = sat.map((p) => ({ h: p.hL, logP: Math.log10(p.P / 1e5) }));
    const right = sat
      .slice()
      .reverse()
      .map((p) => ({ h: p.hV, logP: Math.log10(p.P / 1e5) }));

    const d = pathFromPoints([...left, ...right, left[0]]);
    const g = el("g", { "clip-path": `url(#${state.clipId})` });
    g.appendChild(el("path", { d, class: "domeFill" }));
    g.appendChild(el("path", { d, class: "dome" }));
    state.bg.appendChild(g);
  }

  function drawAuxIsobars() {
    // optional light auxiliary curves (constant pressure lines) just for orientation
    const g = el("g", { class: "aux", "clip-path": `url(#${state.clipId})` });

    const { logPMin, logPMax, hMin, hMax } = state.domain;
    const lpTicks = 6;
    for (let i = 1; i < lpTicks; i++) {
      const lp = logPMin + (i / lpTicks) * (logPMax - logPMin);
      const y = yFromLogP(lp);
      g.appendChild(el("path", { d: `M ${xFromH(hMin)} ${y} L ${xFromH(hMax)} ${y}` }));
    }
    state.bg.appendChild(g);
  }

  function drawAuxCurves(curves) {
    // curves: [{ kind: 'isotherm'|'quality', label, points:[{h,logP}] }]
    const g = el("g", { class: "auxCurves", "clip-path": `url(#${state.clipId})` });

    for (const c of curves || []) {
      const pts = (c.points || []).filter((p) => Number.isFinite(p?.h) && Number.isFinite(p?.logP));
      if (pts.length < 2) continue;

      const d = pathFromPoints(pts);
      const path = el("path", { d, class: `auxCurve ${c.kind || ""}`.trim() });
      g.appendChild(path);

      // Labels intentionally omitted to avoid clutter.
    }

    state.bg.appendChild(g);
  }

  function drawPointsAndCycle(points, { labelMode = "points", intersections = [] } = {}) {
    state.fg.innerHTML = "";

    const x0 = state.pad.l;
    const y1 = state.height - state.pad.b;

    const placed = [];
    // Allow labels to use the full SVG area (including padding) to reduce overlap
    // on small screens; keep them close to their points via a max leader length.
    const bounds = {
      xMin: 2,
      xMax: state.width - 2,
      yMin: 2,
      yMax: state.height - 2,
    };

    const isSmallScreen = typeof window !== "undefined" && window.matchMedia?.("(max-width: 980px)")?.matches;
    const MAX_LEADER_LEN = isSmallScreen ? 18 : 26;

    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    function intersects(a, b) {
      return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    }

    if (points.length >= 2) {
      const polyPts = points.map((p) => ({ h: p.h, logP: Math.log10(p.Pbar) }));
      const isPlaceholder = points.every((p) => p && p.placeholder);
      const d = pathFromPoints(points.length >= 3 ? [...polyPts, polyPts[0]] : polyPts);
      state.fg.appendChild(el("path", { d, class: isPlaceholder ? "cycle placeholderCycle" : "cycle" }));
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const lp = Math.log10(p.Pbar);
      const x = xFromH(p.h);
      const y = yFromLogP(lp);

      const isPlaceholder = !!p.placeholder;

      if (!isPlaceholder) {
        // dotted guides to axes
        state.fg.appendChild(el("line", { x1: x, y1: y, x2: x, y2: y1, class: "guideLine" }));
        state.fg.appendChild(el("line", { x1: x0, y1: y, x2: x, y2: y, class: "guideLine" }));
      }

      // draggable point (placeholders are not interactive)
      const phaseCls = p.phaseClass ? ` ${p.phaseClass}` : "";
      const phCls = isPlaceholder ? " placeholder" : "";
      const c = el("circle", { cx: x, cy: y, r: 6, class: `point${phaseCls}${phCls}`.trim() });
      if (!isPlaceholder) c.setAttribute("data-pt-index", String(i));
      state.fg.appendChild(c);

      // small index label
      const t = el("text", { x: x + 8, y: y - 8, class: "pointLabel" });
      t.textContent = String(i + 1);
      state.fg.appendChild(t);

      if (!isPlaceholder && labelMode === "points") {
        // value label: place in a non-overlapping position with a leader line.
        // pointer-events:none so you can always click/drag the point even if the label overlaps.
        const g = el("g", { "pointer-events": "none" });
        const leader = el("line", { class: "valueLeader" });
        const rect = el("rect", { rx: 6, ry: 6, class: "valueLabelBg", filter: `url(#${state.tooltipFilterId})` });
        const text = el("text", { class: "valueLabel" });

        const lines = [];
        lines.push(`p=${p.Pbar.toFixed(3)} bar`);
        lines.push(Number.isFinite(p.Tc) ? `T=${p.Tc.toFixed(2)} °C` : "T=?");
        if (Number.isFinite(p.s)) lines.push(`s=${p.s.toFixed(3)} kJ/kg·K`);
        if (p.phaseHint) lines.push(`phase=${p.phaseHint}`);

        let dy = 0;
        for (const ln of lines) {
          const ts = el("tspan", { dy });
          ts.textContent = ln;
          text.appendChild(ts);
          dy = 13;
        }

        g.appendChild(leader);
        g.appendChild(rect);
        g.appendChild(text);
        state.fg.appendChild(g);

        function setTextPos(tx, ty, anchor) {
          text.setAttribute("x", String(tx));
          text.setAttribute("y", String(ty));
          text.setAttribute("text-anchor", anchor);
          for (const ts of text.querySelectorAll("tspan")) ts.setAttribute("x", String(tx));
        }

        function tryPlace(tx, ty, anchor) {
          setTextPos(tx, ty, anchor);
          let bb = text.getBBox();
          const pad = 4;
          let rb = { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };

          // Clamp into bounds while keeping a leader line to the point.
          const availW = bounds.xMax - bounds.xMin;
          const availH = bounds.yMax - bounds.yMin;
          if (rb.width <= availW && rb.height <= availH) {
            const sx = clamp(rb.x, bounds.xMin, bounds.xMax - rb.width) - rb.x;
            const sy = clamp(rb.y, bounds.yMin, bounds.yMax - rb.height) - rb.y;
            if (sx || sy) {
              setTextPos(tx + sx, ty + sy, anchor);
              bb = text.getBBox();
              rb = { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };
            }
          }

          const inBounds = rb.x >= bounds.xMin && rb.y >= bounds.yMin && rb.x + rb.width <= bounds.xMax && rb.y + rb.height <= bounds.yMax;
          if (!inBounds) return null;

          for (const pbb of placed) {
            if (intersects(rb, pbb)) return null;
          }

          // Ensure the tooltip stays visually attached to the point.
          const x2 = clamp(x, rb.x, rb.x + rb.width);
          const y2 = clamp(y, rb.y, rb.y + rb.height);
          const d = Math.hypot(x - x2, y - y2);
          if (d > MAX_LEADER_LEN) return null;

          return { bb, rb, pad, x2, y2 };
        }

        const midX = (bounds.xMin + bounds.xMax) / 2;
        const midY = (bounds.yMin + bounds.yMax) / 2;
        const preferRight = x < midX;
        const preferDown = y < midY;

        const dirOrder = [];
        // Primary side first.
        dirOrder.push(preferRight ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 });
        // Then diagonals away from plot center.
        dirOrder.push({ dx: preferRight ? 1 : -1, dy: preferDown ? 1 : -1 });
        dirOrder.push({ dx: preferRight ? 1 : -1, dy: preferDown ? -1 : 1 });
        // Then opposite side.
        dirOrder.push(!preferRight ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 });
        // Then verticals.
        dirOrder.push(preferDown ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });
        dirOrder.push(!preferDown ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });

        const radii = [14, 22, 32, 44, 58, 76];

        let placedInfo = null;
        for (const d of dirOrder) {
          for (const r of radii) {
            const tx = x + d.dx * r;
            const ty = y + d.dy * r;
            const anchor = d.dx < 0 ? "end" : d.dx > 0 ? "start" : x < midX ? "start" : "end";
            placedInfo = tryPlace(tx, ty, anchor);
            if (placedInfo) break;
          }
          if (placedInfo) break;
        }

        // Fallback: place on the preferred side even if overlapping (but still close).
        if (!placedInfo) {
          const dx = preferRight ? 14 : -14;
          const anchor = preferRight ? "start" : "end";
          setTextPos(x + dx, y + 14, anchor);
          const bb = text.getBBox();
          const pad = 4;
          const rb = { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };
          const x2 = clamp(x, rb.x, rb.x + rb.width);
          const y2 = clamp(y, rb.y, rb.y + rb.height);
          placedInfo = { bb, rb, pad, x2, y2 };
        }

        placed.push(placedInfo.rb);

        rect.setAttribute("x", String(placedInfo.rb.x));
        rect.setAttribute("y", String(placedInfo.rb.y));
        rect.setAttribute("width", String(placedInfo.rb.width));
        rect.setAttribute("height", String(placedInfo.rb.height));

        leader.setAttribute("x1", String(x));
        leader.setAttribute("y1", String(y));
        leader.setAttribute("x2", String(placedInfo.x2));
        leader.setAttribute("y2", String(placedInfo.y2));
      }
    }

    if (labelMode === "intersections") {
      const usable = (intersections || []).filter((p) => Number.isFinite(p?.h) && Number.isFinite(p?.logP));
      for (let i = 0; i < usable.length; i++) {
        const p = usable[i];
        const x = xFromH(p.h);
        const y = yFromLogP(p.logP);

        const marker = el("circle", { cx: x, cy: y, r: 6, class: "point" });
        state.fg.appendChild(marker);

        const tag = el("text", { x: x + 8, y: y - 8, class: "pointLabel" });
        tag.textContent = `I${i + 1}`;
        state.fg.appendChild(tag);

        const g = el("g", { "pointer-events": "none" });
        const leader = el("line", { class: "valueLeader" });
        const rect = el("rect", { rx: 6, ry: 6, class: "valueLabelBg", filter: `url(#${state.tooltipFilterId})` });
        const text = el("text", { class: "valueLabel" });

        const pbar = Number.isFinite(p.Pbar) ? p.Pbar : Math.pow(10, p.logP);
        const lines = [
          `I${i + 1} (${p.boundary || "sat"})`,
          `p=${pbar.toFixed(3)} bar`,
          Number.isFinite(p.Tc) ? `T=${p.Tc.toFixed(2)} °C` : "T=?",
          `h=${p.h.toFixed(2)} kJ/kg`,
        ];
        let dy = 0;
        for (const ln of lines) {
          const ts = el("tspan", { dy });
          ts.textContent = ln;
          text.appendChild(ts);
          dy = 13;
        }

        // Keep parity with normal point labels: append before measuring getBBox().
        g.appendChild(leader);
        g.appendChild(rect);
        g.appendChild(text);
        state.fg.appendChild(g);

        function setTextPos(tx, ty, anchor) {
          text.setAttribute("x", String(tx));
          text.setAttribute("y", String(ty));
          text.setAttribute("text-anchor", anchor);
          for (const ts of text.querySelectorAll("tspan")) ts.setAttribute("x", String(tx));
        }

        function tryPlace(tx, ty, anchor) {
          setTextPos(tx, ty, anchor);
          let bb = text.getBBox();
          const pad = 4;
          let rb = { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };

          const availW = bounds.xMax - bounds.xMin;
          const availH = bounds.yMax - bounds.yMin;
          if (rb.width <= availW && rb.height <= availH) {
            const sx = clamp(rb.x, bounds.xMin, bounds.xMax - rb.width) - rb.x;
            const sy = clamp(rb.y, bounds.yMin, bounds.yMax - rb.height) - rb.y;
            if (sx || sy) {
              setTextPos(tx + sx, ty + sy, anchor);
              bb = text.getBBox();
              rb = { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };
            }
          }

          const inBounds = rb.x >= bounds.xMin && rb.y >= bounds.yMin && rb.x + rb.width <= bounds.xMax && rb.y + rb.height <= bounds.yMax;
          if (!inBounds) return null;

          for (const pbb of placed) {
            if (intersects(rb, pbb)) return null;
          }

          const x2 = clamp(x, rb.x, rb.x + rb.width);
          const y2 = clamp(y, rb.y, rb.y + rb.height);
          const d = Math.hypot(x - x2, y - y2);
          if (d > MAX_LEADER_LEN) return null;

          return { bb, rb, x2, y2 };
        }

        const midX = (bounds.xMin + bounds.xMax) / 2;
        const midY = (bounds.yMin + bounds.yMax) / 2;
        const preferRight = x < midX;
        const preferDown = y < midY;

        const dirOrder = [];
        dirOrder.push(preferRight ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 });
        dirOrder.push({ dx: preferRight ? 1 : -1, dy: preferDown ? 1 : -1 });
        dirOrder.push({ dx: preferRight ? 1 : -1, dy: preferDown ? -1 : 1 });
        dirOrder.push(!preferRight ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 });
        dirOrder.push(preferDown ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });
        dirOrder.push(!preferDown ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });

        const radii = [14, 22, 32, 44, 58, 76];
        let placedInfo = null;
        for (const d of dirOrder) {
          for (const r of radii) {
            const tx = x + d.dx * r;
            const ty = y + d.dy * r;
            const anchor = d.dx < 0 ? "end" : d.dx > 0 ? "start" : x < midX ? "start" : "end";
            placedInfo = tryPlace(tx, ty, anchor);
            if (placedInfo) break;
          }
          if (placedInfo) break;
        }

        if (!placedInfo) {
          const dx = preferRight ? 14 : -14;
          const anchor = preferRight ? "start" : "end";
          setTextPos(x + dx, y + 14, anchor);
          const bb = text.getBBox();
          const pad = 4;
          const rb = { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };
          const x2 = clamp(x, rb.x, rb.x + rb.width);
          const y2 = clamp(y, rb.y, rb.y + rb.height);
          placedInfo = { bb, rb, x2, y2 };
        }

        placed.push(placedInfo.rb);

        rect.setAttribute("x", String(placedInfo.rb.x));
        rect.setAttribute("y", String(placedInfo.rb.y));
        rect.setAttribute("width", String(placedInfo.rb.width));
        rect.setAttribute("height", String(placedInfo.rb.height));
        leader.setAttribute("x1", String(x));
        leader.setAttribute("y1", String(y));
        leader.setAttribute("x2", String(placedInfo.x2));
        leader.setAttribute("y2", String(placedInfo.y2));
      }
    }
  }

  function eventToData(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const loc = pt.matrixTransform(m.inverse());

    const h = hFromX(loc.x);
    const logP = logPFromY(loc.y);
    const Pbar = Math.pow(10, logP);
    return { h, Pbar };
  }

  return {
    state,
    resize,
    clear,
    drawAxes,
    setDomainFromSat,
    drawSaturation,
    drawAuxIsobars,
    drawAuxCurves,
    drawPointsAndCycle,
    eventToData,
  };
}
