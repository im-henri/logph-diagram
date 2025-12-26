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
  };

  svg.innerHTML = "";
  const defs = el("defs");
  const clipPath = el("clipPath", { id: clipId });
  state.clipRect = el("rect", { x: 0, y: 0, width: 0, height: 0 });
  clipPath.appendChild(state.clipRect);
  defs.appendChild(clipPath);
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

  function drawAxes() {
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

    // axis labels
    state.bg.appendChild(el("text", { x: (x0 + x1) / 2, y: height - 14, class: "axisText", "text-anchor": "middle" })).textContent = "h [kJ/kg]";
    const yLab = el("text", { x: 14, y: (y0 + y1) / 2, class: "axisText", "text-anchor": "middle" });
    yLab.setAttribute("transform", `rotate(-90 14 ${(y0 + y1) / 2})`);
    yLab.textContent = "p [bar] (log scale)";
    state.bg.appendChild(yLab);

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

  function drawPointsAndCycle(points) {
    state.fg.innerHTML = "";

    const x0 = state.pad.l;
    const y1 = state.height - state.pad.b;

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

      if (!isPlaceholder) {
        // value label
        const g = el("g");
        const ty = y + 12;
        let tx = x + 10;
        const text = el("text", { x: tx, y: ty, class: "valueLabel" });
        const l1 = el("tspan", { x: tx, dy: 0 });
        l1.textContent = `p=${p.Pbar.toFixed(3)} bar`;
        const l2 = el("tspan", { x: tx, dy: 13 });
        l2.textContent = Number.isFinite(p.Tc) ? `T=${p.Tc.toFixed(2)} °C` : "T=?";

        const l3 = el("tspan", { x: tx, dy: 13 });
        l3.textContent = Number.isFinite(p.s) ? `s=${p.s.toFixed(3)} kJ/kg·K` : "";

        const l4 = el("tspan", { x: tx, dy: 13 });
        l4.textContent = p.phaseHint ? `phase=${p.phaseHint}` : "";

        text.appendChild(l1);
        text.appendChild(l2);
        if (Number.isFinite(p.s)) text.appendChild(l3);
        if (p.phaseHint) text.appendChild(l4);
        g.appendChild(text);

        // background box sized after text is in DOM
        state.fg.appendChild(g);
        let bb = text.getBBox();

        // If label would overflow right edge, flip it to the left of the point.
        const maxX = state.width - state.pad.r - 4;
        if (bb.x + bb.width > maxX) {
          tx = Math.max(state.pad.l + 4, x - 10 - bb.width);
          text.setAttribute("x", String(tx));
          l1.setAttribute("x", String(tx));
          l2.setAttribute("x", String(tx));
          l3.setAttribute("x", String(tx));
          l4.setAttribute("x", String(tx));
          bb = text.getBBox();
        }

        const pad = 4;
        const rect = el("rect", {
          x: bb.x - pad,
          y: bb.y - pad,
          width: bb.width + 2 * pad,
          height: bb.height + 2 * pad,
          rx: 6,
          ry: 6,
          class: "valueLabelBg",
        });
        g.insertBefore(rect, text);
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
