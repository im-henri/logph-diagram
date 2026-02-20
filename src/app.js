import { createPropertyModel } from "./propertyModel.js";
import { createChart } from "./chart.js";

const fluidSelect = document.getElementById("fluidSelect");
const themeBtn = document.getElementById("themeBtn");
const panelBtn = document.getElementById("panelBtn");
const panelCloseBtn = document.getElementById("panelCloseBtn");
const appRoot = document.querySelector(".app");
const clearBtn = document.getElementById("clearBtn");
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
const deleteBtn = document.getElementById("deleteBtn");
const savedSelect = document.getElementById("savedSelect");
const pointsTbody = document.getElementById("pointsTbody");
const intersectionInfoEl = document.getElementById("intersectionInfo");
const resultsEl = document.getElementById("results");
const svg = document.getElementById("chart");
const chartWrap = document.querySelector(".chartWrap");
const chartOverlay = document.getElementById("chartOverlay");
const chartOverlayText = document.getElementById("chartOverlayText");
const chartAxisHeader = document.querySelector(".chartAxisHeader");
const chartStage = document.querySelector(".chartStage");

const viewResetBtn = document.getElementById("viewReset");
const pointValuesToggleBtn = document.getElementById("pointValuesToggleBtn");
const pressureLockBtn = document.getElementById("pressureLockBtn");
const pointsViewBadge = document.getElementById("pointsViewBadge");

const chart = createChart(svg);

// Keep the plot readable on very wide/short viewports by fitting the SVG into the
// available space with a preferred aspect ratio (width/height), while still using
// as much space as possible.
const ASPECT_MIN = 0.75;
const ASPECT_MAX = 2.0;

function fitChartSvg() {
  if (!chartWrap || !svg) return;
  const host = chartStage || chartWrap;
  const r = host.getBoundingClientRect();
  const maxW = Math.max(1, r.width);
  const maxH = Math.max(1, r.height);

  const isMobilePortrait = window.matchMedia?.("(max-width: 980px) and (orientation: portrait)")?.matches;
  const containerAspect = maxW / maxH;
  const targetAspect = isMobilePortrait ? 1.0 : Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, containerAspect));

  let w = maxW;
  let h = w / targetAspect;
  if (h > maxH) {
    h = maxH;
    w = h * targetAspect;
  }

  svg.style.width = `${Math.max(1, Math.floor(w))}px`;
  svg.style.height = `${Math.max(1, Math.floor(h))}px`;
}

function clampZoom(z) {
  return Math.max(0.08, Math.min(40, z));
}

function zoomFactorFromStep(step) {
  // Exponential feels natural: each ~40 steps doubles/halves the span.
  return Math.pow(2, step / 40);
}

function applyZoomToDomain({ anchor, fromDomain } = {}) {
  if (!baseDomain) return;

  const d = chart.state.domain;
  const old = fromDomain ? { ...fromDomain } : { hMin: d.hMin, hMax: d.hMax, logPMin: d.logPMin, logPMax: d.logPMax };

  const baseSpanH = baseDomain.hMax - baseDomain.hMin;
  const baseSpanLp = baseDomain.logPMax - baseDomain.logPMin;

  const newSpanH = baseSpanH / zoomX;
  const newSpanLp = baseSpanLp / zoomY;

  // Default: keep current center.
  let newHMin, newHMax, newLpMin, newLpMax;
  if (anchor && Number.isFinite(anchor.h) && Number.isFinite(anchor.logP)) {
    const tH = (anchor.h - old.hMin) / (old.hMax - old.hMin);
    const tLp = (anchor.logP - old.logPMin) / (old.logPMax - old.logPMin);
    newHMin = anchor.h - tH * newSpanH;
    newHMax = newHMin + newSpanH;
    newLpMin = anchor.logP - tLp * newSpanLp;
    newLpMax = newLpMin + newSpanLp;
  } else {
    const cH = 0.5 * (old.hMin + old.hMax);
    const cLp = 0.5 * (old.logPMin + old.logPMax);
    newHMin = cH - 0.5 * newSpanH;
    newHMax = cH + 0.5 * newSpanH;
    newLpMin = cLp - 0.5 * newSpanLp;
    newLpMax = cLp + 0.5 * newSpanLp;
  }

  // Allow zoom-out beyond base a bit, but avoid runaway ranges.
  const maxSpanH = baseSpanH * 3.0;
  const maxSpanLp = baseSpanLp * 3.0;
  const spanH = Math.min(maxSpanH, Math.max(baseSpanH / 40, newHMax - newHMin));
  const spanLp = Math.min(maxSpanLp, Math.max(baseSpanLp / 40, newLpMax - newLpMin));
  const cH2 = 0.5 * (newHMin + newHMax);
  const cLp2 = 0.5 * (newLpMin + newLpMax);

  d.hMin = cH2 - 0.5 * spanH;
  d.hMax = cH2 + 0.5 * spanH;
  d.logPMin = cLp2 - 0.5 * spanLp;
  d.logPMax = cLp2 + 0.5 * spanLp;
}

function resetView() {
  zoomX = 1;
  zoomY = 1;
  if (baseDomain) {
    chart.state.domain.hMin = baseDomain.hMin;
    chart.state.domain.hMax = baseDomain.hMax;
    chart.state.domain.logPMin = baseDomain.logPMin;
    chart.state.domain.logPMax = baseDomain.logPMax;
  }
}

function drawChartFromSat(sat, { noTable = false, keepDomain = false } = {}) {
  // Titles are rendered outside the SVG to save space, so we can reduce padding.
  chart.state.pad.l = 44;
  chart.state.pad.r = 28;
  chart.state.pad.t = 12;
  chart.state.pad.b = 32;

  fitChartSvg();
  chart.resize();
  chart.clear();

  if (!keepDomain) {
    if (sat?.length) {
      chart.setDomainFromSat(sat);
      baseDomain = { ...chart.state.domain };
    } else {
      // Fallback domain: 0.1..100 bar and a reasonable enthalpy span.
      chart.state.domain.hMin = -200;
      chart.state.domain.hMax = 800;
      chart.state.domain.logPMin = -1;
      chart.state.domain.logPMax = 2;
      baseDomain = { ...chart.state.domain };
    }

    // New chart domain implies we reset view (fluid/table changed).
    resetView();
    applyZoomToDomain();
  }

  chart.drawAxes({ showTitles: false });
  chart.drawAuxIsobars();
  if (sat?.length) chart.drawSaturation(sat);

  // Auxiliary overlay: quality lines inside the dome
  if (sat?.length) {
    const xs = [0.05, 0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85, 0.95];
    const qualityCurves = xs.map((x) => ({
      kind: "quality",
      label: `x=${x.toFixed(2)}`,
      points: sat.map((s) => ({
        h: s.hL + x * (s.hV - s.hL),
        logP: Math.log10(s.P / 1e5),
      })),
    }));
    chart.drawAuxCurves(qualityCurves);
  }

  if (noTable) drawPointsOnChart();
  else renderPoints();
  validate();
}

function setChartLoading(on, msg) {
  chartWrap?.classList.toggle("isLoading", !!on);
  if (chartOverlay) chartOverlay.hidden = !on;
  if (msg && chartOverlayText) chartOverlayText.textContent = String(msg);
}

const STORAGE_PREFIX = "lphCycle:";
const THEME_KEY = "lph:theme";

function applyTheme(theme) {
  const t = theme === "light" ? "light" : theme === "dark" ? "dark" : null;
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  if (themeBtn) {
    const cur = document.documentElement.getAttribute("data-theme") || (window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark");
    themeBtn.textContent = cur === "light" ? "Dark" : "Light";
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") applyTheme(saved);
  else applyTheme(window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark");

  themeBtn?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

let propModel = null;
let pointTarget = 4;
let points = Array.from({ length: pointTarget }, () => null); // [{Pbar, h, Tc?, x?, phase?} | null]
let currentFluidKey = null;
let currentSat = []; // saturation curve currently displayed
let computeSeq = Array.from({ length: pointTarget }, () => 0);
let chartGenSeq = 0;

let baseDomain = null; // set from saturation curve; zoom derives from this
let zoomX = 1;
let zoomY = 1;
let valueViewMode = "actual";
let currentIntersections = [];
let pressureLockEnabled = false;

function fmt(x, n = 3) {
  if (!Number.isFinite(x)) return "";
  return Number(x).toFixed(n);
}

function updateValueViewUi() {
  const showingIntersections = valueViewMode === "intersections";
  if (pointValuesToggleBtn) {
    pointValuesToggleBtn.textContent = showingIntersections ? "Show point values" : "Show intersections";
    pointValuesToggleBtn.classList.toggle("isIntersections", showingIntersections);
  }
  if (pointsViewBadge) {
    if (showingIntersections) {
      pointsViewBadge.textContent = `Showing: Intersection points (${currentIntersections.length})`;
    } else {
      pointsViewBadge.textContent = "Showing: Actual points";
    }
  }
}

function updatePressureLockUi() {
  if (!pressureLockBtn) return;
  pressureLockBtn.textContent = pressureLockEnabled ? "Pressure lock: On" : "Pressure lock: Off";
  pressureLockBtn.classList.toggle("isLocked", pressureLockEnabled);
}

function pairedPressureIndex(i) {
  if (i === 0) return 3;
  if (i === 3) return 0;
  if (i === 1) return 2;
  if (i === 2) return 1;
  return -1;
}

function syncPairedPressure(i, Pbar, { refresh = false } = {}) {
  const pair = pairedPressureIndex(i);
  if (pair < 0 || !Number.isFinite(Pbar) || Pbar <= 0) return;
  const pj = points[pair];
  const pairDefaultPhase = pair === 3 ? "2p" : "auto";
  bumpSeq(pair);
  points[pair] = {
    ...(pj || { Pbar: NaN, h: NaN, Tc: NaN, x: NaN, phase: pairDefaultPhase }),
    Pbar,
    phase: pj?.phase || pairDefaultPhase,
  };
  if (refresh) refreshPointDerivedAfterPressureSync(pair);
}

function normalizePressureLocks() {
  const groups = [
    [0, 3],
    [1, 2],
  ];
  for (const [a, b] of groups) {
    const pa = points[a]?.Pbar;
    const pb = points[b]?.Pbar;
    const target = Number.isFinite(pa) && pa > 0 ? pa : Number.isFinite(pb) && pb > 0 ? pb : NaN;
    if (!Number.isFinite(target)) continue;
    const paDef = a === 3 ? "2p" : "auto";
    const pbDef = b === 3 ? "2p" : "auto";
    points[a] = { ...(points[a] || { Pbar: NaN, h: NaN, Tc: NaN, x: NaN, phase: paDef }), Pbar: target, phase: points[a]?.phase || paDef };
    points[b] = { ...(points[b] || { Pbar: NaN, h: NaN, Tc: NaN, x: NaN, phase: pbDef }), Pbar: target, phase: points[b]?.phase || pbDef };
    bumpSeq(a);
    bumpSeq(b);
    refreshPointDerivedAfterPressureSync(a);
    refreshPointDerivedAfterPressureSync(b);
  }
}

function refreshPointDerivedAfterPressureSync(idx) {
  const p = points[idx];
  if (!p || !Number.isFinite(p.Pbar) || p.Pbar <= 0) return;

  const phase = p.phase || (idx === 3 ? "2p" : "auto");
  if (Number.isFinite(p.h)) {
    const hAdj = phase === "2p" ? clampHToTwoPhase(p.Pbar, p.h) : p.h;
    points[idx] = {
      ...p,
      h: hAdj,
      Tc: NaN,
      s: NaN,
      x: qualityFromPH(p.Pbar, hAdj),
      phase,
    };
    updatePointTemperature(idx);
    return;
  }

  if (Number.isFinite(p.Tc)) {
    if (phase === "2p") {
      const res = twoPhaseFromTPForced(p.Pbar, p.Tc, p);
      if (Number.isFinite(res?.h)) {
        points[idx] = { ...p, h: res.h, Tc: res.TcOut, x: res.x, s: NaN, phase };
        renderPoints();
        validate();
      }
      return;
    }

    const seq = bumpSeq(idx);
    computeHFromTPStable(p.Pbar, p.Tc, phase, p, "p")
      .then((res) => {
        if (computeSeq[idx] !== seq) return;
        const hCalc = res?.h;
        if (!Number.isFinite(hCalc)) return;
        points[idx] = { ...points[idx], Pbar: p.Pbar, h: hCalc, Tc: res.TcOut, x: res.x, s: NaN, phase };
        renderPoints();
        validate();
      })
      .catch(() => {
        /* keep user values */
      });
  }
}

function setStatus() {}

function isCompletePoint(p) {
  return p && Number.isFinite(p.Pbar) && p.Pbar > 0 && Number.isFinite(p.h);
}

function satAtP(Pbar, { clamp = false } = {}) {
  // currentSat items:
  //  - v2: {T,P,hL,hV}
  //  - v3 (CoolProp): {P,TL,TV,T,hL,hV}
  const sat = currentSat;
  if (!sat || sat.length < 2) return null;
  let P = Pbar * 1e5;
  const p0 = sat[0].P;
  const p1 = sat[sat.length - 1].P;
  if (!(P > 0)) return null;
  if (P < p0 || P > p1) {
    if (!clamp) return null;
    P = Math.min(p1, Math.max(p0, P));
  }

  let lo = 0,
    hi = sat.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sat[mid].P <= P) lo = mid;
    else hi = mid;
  }
  const a = sat[lo],
    b = sat[hi];
  const t = (P - a.P) / (b.P - a.P);

  const TL = (a.TL ?? a.T) * (1 - t) + (b.TL ?? b.T) * t;
  const TV = (a.TV ?? a.T) * (1 - t) + (b.TV ?? b.T) * t;
  const T = Number.isFinite(TL) && Number.isFinite(TV) ? 0.5 * (TL + TV) : a.T * (1 - t) + b.T * t;

  return {
    P,
    T,
    TL,
    TV,
    hL: a.hL * (1 - t) + b.hL * t,
    hV: a.hV * (1 - t) + b.hV * t,
  };
}

function phaseHintForPoint(Pbar, h) {
  // Exactly 3 states for display: LIQ / 2φ / VAP.
  // If P is outside the dome range, we clamp to the nearest edge just to choose a reasonable bucket.
  const eps = 0.5; // kJ/kg tolerance
  const s = satAtP(Pbar, { clamp: true });
  if (s && Number.isFinite(s.hL) && Number.isFinite(s.hV) && s.hV > s.hL) {
    if (h < s.hL - eps) return { short: "LIQ", cls: "phaseLiq" };
    if (h > s.hV + eps) return { short: "VAP", cls: "phaseVap" };
    const x = Math.max(0, Math.min(1, (h - s.hL) / (s.hV - s.hL)));
    return { short: `2φ x=${x.toFixed(2)}`, cls: "phase2p" };
  }

  // If we can't classify, default to vapor-like.
  return { short: "VAP", cls: "phaseVap" };
}

function completePoints() {
  return points.filter(isCompletePoint);
}

async function computeHFromTP(Pbar, Tc, phaseMode) {
  const TK = Tc + 273.15;
  const PPa = Pbar * 1e5;
  return propModel.hFromTP(currentFluidKey, TK, PPa, phaseMode);
}

function qualityFromPH(Pbar, h) {
  const s = satAtP(Pbar, { clamp: true });
  if (!s || !(s.hV > s.hL) || !Number.isFinite(h)) return NaN;
  if (h < s.hL - 0.5 || h > s.hV + 0.5) return NaN;
  return Math.max(0, Math.min(1, (h - s.hL) / (s.hV - s.hL)));
}

function clampHToTwoPhase(Pbar, h) {
  const s = satAtP(Pbar, { clamp: true });
  if (!s || !(s.hV > s.hL) || !Number.isFinite(h)) return h;
  return Math.min(s.hV, Math.max(s.hL, h));
}

function twoPhaseFromPKeepX(Pbar, prevPoint) {
  const s = satAtP(Pbar, { clamp: true });
  if (!s || !(s.hV > s.hL)) return { h: NaN, TcOut: NaN, x: NaN };

  let x = Number.isFinite(prevPoint?.x) ? prevPoint.x : qualityFromPH(prevPoint?.Pbar, prevPoint?.h);
  if (!Number.isFinite(x)) x = 0.5;
  x = Math.max(0, Math.min(1, x));

  const TsatC = Number.isFinite(s.T) ? s.T - 273.15 : NaN;
  const TLc = Number.isFinite(s.TL ?? s.T) ? (s.TL ?? s.T) - 273.15 : TsatC;
  const TVc = Number.isFinite(s.TV ?? s.T) ? (s.TV ?? s.T) - 273.15 : TsatC;

  let TcOut = TsatC;
  if (Number.isFinite(TLc) && Number.isFinite(TVc) && TVc > TLc + 1e-6) TcOut = TLc + x * (TVc - TLc);

  return { h: s.hL + x * (s.hV - s.hL), TcOut, x };
}

function twoPhaseFromTPForced(Pbar, Tc, prevPoint) {
  const s = satAtP(Pbar, { clamp: true });
  if (!s || !(s.hV > s.hL)) return { h: NaN, TcOut: Tc, x: NaN };

  const TsatC = Number.isFinite(s.T) ? s.T - 273.15 : NaN;
  const TLc = Number.isFinite(s.TL ?? s.T) ? (s.TL ?? s.T) - 273.15 : TsatC;
  const TVc = Number.isFinite(s.TV ?? s.T) ? (s.TV ?? s.T) - 273.15 : TsatC;

  // Zeotropic: quality follows temperature glide band [TL..TV].
  if (Number.isFinite(TLc) && Number.isFinite(TVc) && TVc > TLc + 1e-6 && Number.isFinite(Tc)) {
    let x = (Tc - TLc) / (TVc - TLc);
    x = Math.max(0, Math.min(1, x));
    const TcOut = TLc + x * (TVc - TLc);
    return { h: s.hL + x * (s.hV - s.hL), TcOut, x };
  }

  // Pseudo-pure (TL≈TV): can't infer x from T; keep previous x (or default).
  let x = Number.isFinite(prevPoint?.x) ? prevPoint.x : qualityFromPH(Pbar, prevPoint?.h);
  if (!Number.isFinite(x)) x = 0.5;
  x = Math.max(0, Math.min(1, x));

  return { h: s.hL + x * (s.hV - s.hL), TcOut: TsatC, x };
}

async function computeHFromTPStable(Pbar, Tc, phaseMode, prevPoint, source) {
  if (phaseMode !== "auto") {
    const h = await computeHFromTP(Pbar, Tc, phaseMode);
    return { h, TcOut: Tc, x: NaN };
  }

  const prev = prevPoint || null;
  const prevComplete = isCompletePoint(prev);

  // Determine what branch the user was on before (liq / 2phi / vap)
  let prevBucket = null;
  let prevX = Number.isFinite(prev?.x) ? prev.x : NaN;
  if (prevComplete) {
    const sPrev = satAtP(prev.Pbar, { clamp: true });
    if (sPrev && Number.isFinite(prev.h) && sPrev.hV > sPrev.hL) {
      if (prev.h < sPrev.hL - 0.5) prevBucket = "liq";
      else if (prev.h > sPrev.hV + 0.5) prevBucket = "vap";
      else {
        prevBucket = "2p";
        if (!Number.isFinite(prevX)) prevX = (prev.h - sPrev.hL) / (sPrev.hV - sPrev.hL);
      }
    }
  }

  const sNow = satAtP(Pbar, { clamp: true });
  const TsatC = sNow?.T ? sNow.T - 273.15 : NaN;
  const TLc = sNow?.TL ? sNow.TL - 273.15 : TsatC;
  const TVc = sNow?.TV ? sNow.TV - 273.15 : TsatC;

  // If the point was in the dome and the user tweaks P/phase, keep the same quality x.
  // This prevents the common "snap to saturation boundary" jump.
  if (prevBucket === "2p" && sNow && source !== "t") {
    const x = Number.isFinite(prevX) ? Math.max(0, Math.min(1, prevX)) : 0.5;
    const h = sNow.hL + x * (sNow.hV - sNow.hL);

    // Prefer bubble/dew temperatures when present (zeotropic blends).
    let TcGlide = TsatC;
    if (Number.isFinite(TLc) && Number.isFinite(TVc) && TVc > TLc + 1e-6) TcGlide = TLc + x * (TVc - TLc);

    return { h, TcOut: TcGlide, x };
  }

  const [hV, hL] = await Promise.all([computeHFromTP(Pbar, Tc, "vap"), computeHFromTP(Pbar, Tc, "liq")]);

  // If one branch fails, fall back to the other.
  if (!Number.isFinite(hL) && Number.isFinite(hV)) return { h: hV, TcOut: Tc, x: NaN };
  if (!Number.isFinite(hV) && Number.isFinite(hL)) return { h: hL, TcOut: Tc, x: NaN };

  // If the user provided a temperature that is clearly subcooled/superheated,
  // don't let continuity override physics (prevents snapping into the dome).
  if (sNow && Number.isFinite(Tc)) {
    // For zeotropic blends, treat the 2φ band as [TL..TV] at this pressure.
    if (Number.isFinite(TLc) && Number.isFinite(TVc) && TVc > TLc + 1e-6) {
      const FAR_DT = 1.5; // K
      if (source === "t" || Tc < TLc - FAR_DT || Tc > TVc + FAR_DT) {
        if (Tc < TLc) return { h: hL, TcOut: Tc, x: NaN };
        if (Tc > TVc) return { h: hV, TcOut: Tc, x: NaN };
      }
    } else if (Number.isFinite(TsatC)) {
      const dT = Tc - TsatC;
      const FAR_DT = 1.5; // K
      if (source === "t" || Math.abs(dT) > FAR_DT) {
        if (dT < 0) return { h: hL, TcOut: Tc, x: NaN };
        return { h: hV, TcOut: Tc, x: NaN };
      }
    }
  }

  // Prefer continuity only near saturation, where branch selection is ambiguous.
  if (prevComplete && Number.isFinite(prev.h) && Number.isFinite(hL) && Number.isFinite(hV)) {
    const pick = Math.abs(hL - prev.h) < Math.abs(hV - prev.h) ? "liq" : "vap";
    return { h: pick === "liq" ? hL : hV, TcOut: Tc, x: NaN };
  }

  // Otherwise choose based on T relative to Tsat(P).
  if (sNow && Number.isFinite(Tc)) {
    if (Number.isFinite(TLc) && Number.isFinite(TVc) && TVc > TLc + 1e-6) {
      if (Tc <= TLc - 0.5) return { h: hL, TcOut: Tc, x: NaN };
      if (Tc >= TVc + 0.5) return { h: hV, TcOut: Tc, x: NaN };
      // Inside 2φ band (T,P): map temperature fraction -> quality fraction (approx)
      const xT = Math.max(0, Math.min(1, (Tc - TLc) / (TVc - TLc)));
      const h = sNow.hL + xT * (sNow.hV - sNow.hL);
      return { h, TcOut: Tc, x: xT };
    }
    if (Number.isFinite(TsatC)) {
      if (Tc < TsatC - 0.5) return { h: hL, TcOut: Tc, x: NaN };
      return { h: hV, TcOut: Tc, x: NaN };
    }
  }

  return { h: hV, TcOut: Tc, x: NaN };
}

async function computeTFromPH(Pbar, h) {
  const PPa = Pbar * 1e5;
  const TK = await propModel.tFromPH(currentFluidKey, PPa, h);
  return Number.isFinite(TK) ? TK - 273.15 : NaN;
}


function bumpSeq(i) {
  computeSeq[i] = (computeSeq[i] || 0) + 1;
  return computeSeq[i];
}

function setPointTarget(_n, { clear = false } = {}) {
  // This app is fixed to 4 points (classic 1-2-3-4 vapor-compression cycle).
  const next = 4;

  if (pointTarget !== next) pointTarget = next;

  // Resize arrays, keeping existing points if possible.
  const oldPoints = points;
  points = Array.from({ length: pointTarget }, (_, i) => (clear ? null : oldPoints[i] ?? null));
  computeSeq = Array.from({ length: pointTarget }, (_, i) => (computeSeq[i] ?? 0));

  renderPoints();
  validate();
}

function rebuildTable() {
  pointsTbody.innerHTML = "";

  for (let i = 0; i < pointTarget; i++) {
    const tr = document.createElement("tr");
    const defaultPhase = i === 3 ? "2p" : "auto";
    const p0 = points[i] || { Pbar: NaN, h: NaN, Tc: NaN, x: NaN, phase: defaultPhase };

    const tdIdx = document.createElement("td");
    tdIdx.textContent = String(i + 1);

    const tdP = document.createElement("td");
    const inP = document.createElement("input");
    inP.type = "number";
    inP.step = "0.01";
    inP.placeholder = "bar";
    inP.value = Number.isFinite(p0.Pbar) ? fmt(p0.Pbar, 2) : "";

    const tdT = document.createElement("td");
    const inT = document.createElement("input");
    inT.type = "number";
    inT.step = "any";
    inT.placeholder = "°C";
    inT.value = Number.isFinite(p0.Tc) ? fmt(p0.Tc, 2) : "";

    const tdPhase = document.createElement("td");
    const sel = document.createElement("select");
    for (const [val, label] of [
      ["auto", "auto"],
      ["liq", "liquid"],
      ["vap", "vapor"],
      ["2p", "2φ (forced)"],
    ]) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      sel.appendChild(o);
    }
    sel.value = p0.phase || defaultPhase;

    const tdH = document.createElement("td");
    const inH = document.createElement("input");
    inH.type = "number";
    inH.step = "any";
    inH.placeholder = "kJ/kg";
    inH.value = Number.isFinite(p0.h) ? fmt(p0.h, 2) : "";

    function updateFromInputs(source) {
      const Pbar = inP.value === "" ? NaN : Number(inP.value);
      const Tc = inT.value === "" ? NaN : Number(inT.value);
      const hIn = inH.value === "" ? NaN : Number(inH.value);
      const phase = sel.value || defaultPhase;

      const seq = bumpSeq(i);

      // Always store raw inputs first (so fields don't "jump" / disappear)
      const prev = points[i] || { Pbar: NaN, h: NaN, Tc: NaN, x: NaN, phase: "auto" };
      const prevOld = prev;
      points[i] = {
        ...prev,
        Pbar: Number.isFinite(Pbar) ? Pbar : prev.Pbar,
        Tc: Number.isFinite(Tc) ? Tc : prev.Tc,
        h: Number.isFinite(hIn) ? hIn : prev.h,
        x: prev.x,
        phase,
      };

      // If P is missing, we can't place/solve anything.
      if (!Number.isFinite(Pbar) || Pbar <= 0) {
        renderPoints();
        validate();
        return;
      }
      inP.value = fmt(Pbar, 2);

      // Optional pressure lock for paired low/high states:
      // P1 <-> P4 and P2 <-> P3.
      if (source === "p") {
        const pair = pairedPressureIndex(i);
        if (pair >= 0) {
          if (pressureLockEnabled) {
            syncPairedPressure(i, Pbar, { refresh: true });
          } else {
            const pj = points[pair];
            const hasP = Number.isFinite(pj?.Pbar) && pj.Pbar > 0;
            const hasT = Number.isFinite(pj?.Tc);
            if (!hasP && !hasT) {
              syncPairedPressure(i, Pbar);
            }
          }
        }
      }

      // Resolve from whichever pair the user is defining.
      // - If user changed T (or P/phase with T present): solve h from (T,P)
      // - If user changed h (or P with h present and T missing): solve T from (h,P)

      if (phase === "2p") {
        // Keep 2φ pinned: (a) T-> quality (zeotropic), or (b) keep previous x on P changes, or (c) clamp h into the dome.
        if (Number.isFinite(Tc) && source !== "h") {
          const res = twoPhaseFromTPForced(Pbar, Tc, prevOld);
          if (!Number.isFinite(res?.h)) {
            setStatus(["Could not compute 2φ state at that pressure."], "warn");
            renderPoints();
            validate();
            return;
          }
          points[i] = { Pbar, h: res.h, Tc: res.TcOut, x: res.x, s: NaN, phase };
          inH.value = fmt(res.h, 2);
          if (Number.isFinite(res?.TcOut)) inT.value = fmt(res.TcOut, 2);
          renderPoints();
          validate();
          return;
        }

        if ((source === "p" || source === "phase") && isCompletePoint(prevOld)) {
          const res = twoPhaseFromPKeepX(Pbar, prevOld);
          if (Number.isFinite(res?.h)) {
            points[i] = { Pbar, h: res.h, Tc: res.TcOut, x: res.x, s: NaN, phase };
            inH.value = fmt(res.h, 2);
            if (Number.isFinite(res?.TcOut)) inT.value = fmt(res.TcOut, 2);
            renderPoints();
            validate();
            return;
          }
        }

        const hRaw = Number.isFinite(hIn) ? hIn : prev.h;
        if (Number.isFinite(hRaw)) {
          const hClamped = clampHToTwoPhase(Pbar, hRaw);
          if (hClamped !== hRaw) inH.value = fmt(hClamped, 2);
          computeTFromPH(Pbar, hClamped)
            .then((TcCalc) => {
              if (computeSeq[i] !== seq) return;
              points[i] = { Pbar, h: hClamped, Tc: TcCalc, x: qualityFromPH(Pbar, hClamped), s: NaN, phase };
              if (Number.isFinite(TcCalc)) inT.value = fmt(TcCalc, 2);
              renderPoints();
              validate();
            })
            .catch(() => {
              /* keep raw inputs */
            });
        }

        renderPoints();
        validate();
        return;
      }

      const canTP = phase === "auto" || phase === "vap" || phase === "liq";

      if (canTP && Number.isFinite(Tc) && source !== "h") {
        setStatus(["Computing enthalpy..."], "info");
        computeHFromTPStable(Pbar, Tc, phase, prevOld, source)
          .then((res) => {
            if (computeSeq[i] !== seq) return;
            const hCalc = res?.h;
            if (!Number.isFinite(hCalc)) {
              setStatus(["Could not compute enthalpy for that T,P."], "warn");
              return;
            }
            points[i] = { Pbar, h: hCalc, Tc: res.TcOut, x: res.x, s: NaN, phase };
            inH.value = fmt(hCalc, 2);
            if (Number.isFinite(res?.TcOut)) inT.value = fmt(res.TcOut, 2);
            renderPoints();
            validate();
            setStatus(["Ready."], "info");
          })
          .catch(() => setStatus(["Could not compute enthalpy for that T,P."], "warn"));
        renderPoints();
        validate();
        return;
      }

      // If we have h, compute temperature (for display), regardless of source.
      const h = Number.isFinite(hIn) ? hIn : prev.h;
      if (Number.isFinite(h)) {
        computeTFromPH(Pbar, h)
          .then((TcCalc) => {
            if (computeSeq[i] !== seq) return;
            points[i] = { Pbar, h, Tc: TcCalc, x: qualityFromPH(Pbar, h), s: NaN, phase };
            if (Number.isFinite(TcCalc)) inT.value = fmt(TcCalc, 2);
            renderPoints();
            validate();
          })
          .catch(() => {
            /* keep raw inputs */
          });
      }

      renderPoints();
      validate();
    }

    inP.addEventListener("change", () => updateFromInputs("p"));
    inT.addEventListener("change", () => updateFromInputs("t"));
    sel.addEventListener("change", () => updateFromInputs("phase"));
    inH.addEventListener("change", () => updateFromInputs("h"));

    tdP.appendChild(inP);
    tdT.appendChild(inT);
    tdPhase.appendChild(sel);
    tdH.appendChild(inH);

    tr.appendChild(tdIdx);
    tr.appendChild(tdP);
    tr.appendChild(tdT);
    tr.appendChild(tdPhase);
    tr.appendChild(tdH);
    pointsTbody.appendChild(tr);
  }
}

function validate() {}

async function updatePointEntropy(idx) {
  const p = points[idx];
  if (!isCompletePoint(p)) return;
  if (Number.isFinite(p.s)) return;
  if (!propModel?.sFromTP) return;

  const PPa = p.Pbar * 1e5;

  try {
    // 2φ: approximate mixture entropy using saturated endpoints at this pressure.
    const sat = satAtP(p.Pbar, { clamp: true });
    let x = Number.isFinite(p.x) ? p.x : qualityFromPH(p.Pbar, p.h);
    if (Number.isFinite(x)) x = Math.max(0, Math.min(1, x));

    const inDome =
      sat &&
      Number.isFinite(sat.hL) &&
      Number.isFinite(sat.hV) &&
      sat.hV > sat.hL &&
      Number.isFinite(p.h) &&
      p.h >= sat.hL - 0.5 &&
      p.h <= sat.hV + 0.5;

    if (inDome && Number.isFinite(x)) {
      const TK_L = sat.TL ?? sat.T;
      const TK_V = sat.TV ?? sat.T;
      if (Number.isFinite(TK_L) && Number.isFinite(TK_V)) {
        const sL = await propModel.sFromTP(currentFluidKey, TK_L, PPa, "liq");
        const sV = await propModel.sFromTP(currentFluidKey, TK_V, PPa, "vap");
        const sMix = Number.isFinite(sL) && Number.isFinite(sV) ? sL + x * (sV - sL) : NaN;
        if (Number.isFinite(sMix)) {
          points[idx] = { ...points[idx], s: sMix, x };
          renderPoints();
        }
        return;
      }
    }

    // 1φ: need a temperature; if missing, compute it first.
    let Tc = p.Tc;
    if (!Number.isFinite(Tc)) {
      const TK = await propModel.tFromPH(currentFluidKey, PPa, p.h);
      Tc = Number.isFinite(TK) ? TK - 273.15 : NaN;
    }
    if (!Number.isFinite(Tc)) return;

    const ph = phaseHintForPoint(p.Pbar, p.h);
    const phaseMode = ph?.cls === "phaseLiq" ? "liq" : "vap";

    const s = await propModel.sFromTP(currentFluidKey, Tc + 273.15, PPa, phaseMode);
    if (!Number.isFinite(s)) return;

    points[idx] = { ...points[idx], s };
    renderPoints();
  } catch {
    // ignore
  }
}

async function updatePointTemperature(idx) {
  const p = points[idx];
  if (!isCompletePoint(p)) return;
  if (Number.isFinite(p.Tc)) return;

  // If inside the dome and the sat curve provides bubble/dew temperatures (zeotropic blends),
  // compute a glide temperature directly so it never appears pseudo-pure.
  const s = satAtP(p.Pbar, { clamp: true });
  if (
    s &&
    Number.isFinite(s.hL) &&
    Number.isFinite(s.hV) &&
    s.hV > s.hL &&
    Number.isFinite(p.h) &&
    p.h >= s.hL - 0.5 &&
    p.h <= s.hV + 0.5 &&
    Number.isFinite(s.TL) &&
    Number.isFinite(s.TV) &&
    s.TV > s.TL + 1e-6
  ) {
    const x = Math.max(0, Math.min(1, (p.h - s.hL) / (s.hV - s.hL)));
    points[idx] = { ...points[idx], Tc: s.TL + x * (s.TV - s.TL) - 273.15, x };
    renderPoints();
    return;
  }

  try {
    const TK = await propModel.tFromPH(currentFluidKey, p.Pbar * 1e5, p.h);
    let Tc = Number.isFinite(TK) ? TK - 273.15 : NaN;

    // Fallback: if the superheated/subcooled inversion fails (table edge), show Tsat(P) instead of "?".
    if (!Number.isFinite(Tc)) {
      const s = satAtP(p.Pbar, { clamp: true });
      Tc = s?.T ? s.T - 273.15 : NaN;
    }

    points[idx] = { ...points[idx], Tc, x: qualityFromPH(p.Pbar, p.h) };
  } catch {
    const s = satAtP(p.Pbar, { clamp: true });
    points[idx] = { ...points[idx], Tc: s?.T ? s.T - 273.15 : NaN };
  }
  renderPoints();
  updatePointEntropy(idx);
}

function renderResults(pts) {
  if (!resultsEl) return;

  if (!pts.length) {
    resultsEl.innerHTML = `<div class="muted">Define a cycle.</div>`;
    return;
  }

  if (pts.length < 4) {
    resultsEl.innerHTML = `<div class="muted">Cycle is closed.</div>`;
    return;
  }

  const [a, b, c, d] = pts;
  const f1 = (x) => (Number.isFinite(x) ? Number(x).toFixed(1) : "?");
  const f2 = (x) => (Number.isFinite(x) ? Number(x).toFixed(2) : "?");

  const wComp = b.h - a.h;
  const qOut = b.h - c.h; // condenser
  const qIn = a.h - d.h; // evaporator

  const copH = qOut / wComp;
  const copC = qIn / wComp;

  resultsEl.innerHTML = [
    `<div><b>Performance</b></div>`,
    `<div class="mono">COP(H) ≈ ${f2(copH)}</div>`,
    `<div class="mono">COP(C) ≈ ${f2(copC)}</div>`,
  ].join("");
}

function renderIntersectionInfo() {
  if (!intersectionInfoEl) return;
  if (!currentIntersections.length) {
    intersectionInfoEl.innerHTML = `<div class="muted">Intersections: none.</div>`;
    return;
  }

  const rows = currentIntersections.map((p, i) => {
    const side = p.boundary === "liq" ? "sat(liq)" : p.boundary === "vap" ? "sat(vap)" : "sat";
    return `<div class="mono">I${i + 1} (${side}): p=${p.Pbar.toFixed(3)} bar, h=${p.h.toFixed(2)} kJ/kg</div>`;
  });
  intersectionInfoEl.innerHTML = [`<div><b>Intersections</b> <span class="muted">(read-only)</span></div>`, ...rows].join("");
}

function segmentIntersectionPH(a, b, c, d) {
  const rH = b.h - a.h;
  const rLp = b.logP - a.logP;
  const sH = d.h - c.h;
  const sLp = d.logP - c.logP;
  const den = rH * sLp - rLp * sH;
  if (Math.abs(den) < 1e-9) return null;

  const qH = c.h - a.h;
  const qLp = c.logP - a.logP;
  const t = (qH * sLp - qLp * sH) / den;
  const u = (qH * rLp - qLp * rH) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;

  const h = a.h + t * rH;
  const logP = a.logP + t * rLp;
  if (!Number.isFinite(h) || !Number.isFinite(logP)) return null;
  return { h, logP, t };
}

function computeCycleIntersections(pts) {
  if (!Array.isArray(pts) || pts.length < 2 || !Array.isArray(currentSat) || currentSat.length < 2) return [];

  const cycle = pts
    .map((p) => ({ h: p.h, logP: Math.log10(p.Pbar) }))
    .filter((p) => Number.isFinite(p.h) && Number.isFinite(p.logP));
  if (cycle.length < 2) return [];

  const closeCycle = cycle.length >= 3;
  const segCount = closeCycle ? cycle.length : cycle.length - 1;
  if (segCount < 1) return [];

  const boundaries = [
    {
      boundary: "liq",
      points: currentSat
        .map((s) => ({ h: s.hL, logP: Math.log10(s.P / 1e5) }))
        .filter((p) => Number.isFinite(p.h) && Number.isFinite(p.logP)),
    },
    {
      boundary: "vap",
      points: currentSat
        .map((s) => ({ h: s.hV, logP: Math.log10(s.P / 1e5) }))
        .filter((p) => Number.isFinite(p.h) && Number.isFinite(p.logP)),
    },
  ];

  const intersections = [];
  for (let i = 0; i < segCount; i++) {
    const a = cycle[i];
    const b = cycle[(i + 1) % cycle.length];
    for (const boundary of boundaries) {
      const edge = boundary.points;
      for (let j = 0; j < edge.length - 1; j++) {
        const hit = segmentIntersectionPH(a, b, edge[j], edge[j + 1]);
        if (!hit) continue;
        intersections.push({
          h: hit.h,
          logP: hit.logP,
          Pbar: Math.pow(10, hit.logP),
          segmentIndex: i,
          segmentT: hit.t,
          boundary: boundary.boundary,
        });
      }
    }
  }

  intersections.sort((x, y) => (x.segmentIndex - y.segmentIndex) || (x.segmentT - y.segmentT));

  const unique = [];
  for (const hit of intersections) {
    const exists = unique.some((u) => Math.abs(u.h - hit.h) < 1e-3 && Math.abs(u.logP - hit.logP) < 1e-5);
    if (!exists) unique.push(hit);
  }
  return unique;
}


function drawPointsOnChart() {
  const pts = completePoints().map((p) => {
    const ph = phaseHintForPoint(p.Pbar, p.h);
    return { ...p, phaseHint: ph.short, phaseClass: ph.cls };
  });

  currentIntersections = computeCycleIntersections(pts);

  // If no real points are defined yet, draw a faint placeholder cycle to show the intended order.
  if (pts.length === 0) {
    const d = chart.state.domain;
    const hA = d.hMin + 0.28 * (d.hMax - d.hMin);
    const hB = d.hMin + 0.72 * (d.hMax - d.hMin);
    const lpLo = d.logPMin + 0.25 * (d.logPMax - d.logPMin);
    const lpHi = d.logPMin + 0.78 * (d.logPMax - d.logPMin);

    // Placeholder cycle order: 1 (right-lower), 2 (right-upper), 3 (left-upper), 4 (left-lower)
    const placeholders = [
      { h: hB, Pbar: Math.pow(10, lpLo), placeholder: true },
      { h: hB, Pbar: Math.pow(10, lpHi), placeholder: true },
      { h: hA, Pbar: Math.pow(10, lpHi), placeholder: true },
      { h: hA, Pbar: Math.pow(10, lpLo), placeholder: true },
    ];

    chart.drawPointsAndCycle(placeholders, { labelMode: "points", intersections: [] });
  } else {
    chart.drawPointsAndCycle(pts, {
      labelMode: valueViewMode === "intersections" ? "intersections" : "points",
      intersections: currentIntersections,
    });
  }

  return pts;
}

function renderPoints() {
  const pts = drawPointsOnChart();

  rebuildTable();
  renderIntersectionInfo();
  renderResults(pts);
  updateValueViewUi();

  // Best-effort entropy for all points (computed lazily).
  for (let i = 0; i < pointTarget; i++) updatePointEntropy(i);
}

function listSavedCycles() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
    const name = k.slice(STORAGE_PREFIX.length);

    let fluidKey = null;
    try {
      const raw = localStorage.getItem(k);
      const payload = raw ? JSON.parse(raw) : null;
      fluidKey = payload?.fluidKey || null;

      // Back-compat: older saves stored fluidName; if it matches a table key, accept it.
      if (!fluidKey && payload?.fluidName && availableFluidKeys.includes(payload.fluidName)) fluidKey = payload.fluidName;
    } catch {
      // ignore: keep entry but without metadata
    }

    items.push({ name, fluidKey });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

function refreshSavedSelect() {
  if (!savedSelect) return;
  const items = listSavedCycles();
  savedSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = items.length ? "Select…" : "(none)";
  savedSelect.appendChild(placeholder);
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.name;
    opt.textContent = it.fluidKey ? `${it.name} (${it.fluidKey})` : it.name;
    savedSelect.appendChild(opt);
  }
}

function saveCurrentCycle() {
  const pts = completePoints();
  if (pts.length !== pointTarget) {
    setStatus([`Define exactly ${pointTarget} complete points (P + h, or P + T) before saving.`], "warn");
    return;
  }
  const defaultName = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = window.prompt("Save cycle as:", defaultName);
  if (!name) return;

  // JSON.stringify turns NaN into null, which later reloads as 0 if we Number() it.
  const cleanPoints = pts.map((p) => {
    const out = { ...p };
    if (!Number.isFinite(out.Tc)) delete out.Tc;
    if (!Number.isFinite(out.x)) delete out.x;
    if (!Number.isFinite(out.s)) delete out.s;
    return out;
  });

  const payload = {
    v: 4,
    fluidKey: currentFluidKey,
    pointCount: pointTarget,
    points: cleanPoints,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(payload));
  refreshSavedSelect();
  savedSelect.value = name;
  const fn = payload.fluidKey ? ` • ${payload.fluidKey}` : "";
  setStatus([`Saved: ${name}${fn}`], "ok");
}

async function loadSelectedCycle() {
  const name = savedSelect?.value;
  if (!name) {
    setStatus(["Select a saved cycle to load."], "warn");
    return;
  }
  const raw = localStorage.getItem(STORAGE_PREFIX + name);
  if (!raw) {
    setStatus(["Saved cycle not found."], "warn");
    refreshSavedSelect();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    setStatus(["Saved cycle is corrupted (invalid JSON)."], "warn");
    return;
  }

  let { fluidKey, fluidName, points: pts, pointCount } = payload || {};
  if (!fluidKey && fluidName && availableFluidKeys.includes(fluidName)) fluidKey = fluidName;
  if (!Array.isArray(pts)) {
    setStatus(["Saved cycle has unexpected format."], "warn");
    return;
  }


  if (!fluidKey || !availableFluidKeys.includes(fluidKey)) {
    setStatus([`Saved cycle uses unknown fluid: ${fluidKey || fluidName || "(missing)"}`], "warn");
    return;
  }

  // Apply point count before restoring points.
  setPointTarget(pointCount || pts.length || 4, { clear: true });

  currentFluidKey = fluidKey;
  fluidSelect.value = currentFluidKey;
  await regenerateChart();
  refreshSavedSelect();
  savedSelect.value = name;

  points = Array.from({ length: pointTarget }, () => null);
  function numOrNaN(v) {
    if (v === undefined || v === null || v === "") return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  pts.slice(0, pointTarget).forEach((p, idx) => {
    points[idx] = {
      Pbar: Number(p.Pbar),
      h: Number(p.h),
      Tc: numOrNaN(p.Tc),
      x: numOrNaN(p.x),
      s: numOrNaN(p.s),
      phase: p.phase || (idx === 3 ? "2p" : "auto"),
    };
  });

  renderPoints();
  validate();
  const fn = currentFluidKey;
  setStatus([`Loaded: ${name}${fn ? ` • ${fn}` : ""}`], "ok");
}

function deleteSelectedCycle() {
  const name = savedSelect?.value;
  if (!name) {
    setStatus(["Select a saved cycle to delete."], "warn");
    return;
  }
  if (!window.confirm(`Delete saved cycle "${name}"?`)) return;
  localStorage.removeItem(STORAGE_PREFIX + name);
  refreshSavedSelect();
  setStatus([`Deleted: ${name}`], "ok");
}

async function regenerateChart() {
  const mySeq = ++chartGenSeq;
  localStorage.setItem("lph:lastFluid", currentFluidKey);
  setChartLoading(true, "Computing saturation dome…");
  setStatus(["Computing saturation dome…"]);

  try {
    // Compute dome
    let sat = [];
    try {
      sat = await propModel.saturationCurve(currentFluidKey, { n: 120 });
    } catch (e) {
      if (mySeq === chartGenSeq) {
        currentSat = [];
        setStatus([String(e?.message || e || "Could not load JSON table.")], "warn");
      }
      return;
    }
    if (mySeq !== chartGenSeq) return;

    currentSat = sat;
    if (sat.length < 10) {
      setStatus(["Could not compute a stable saturation curve for this fluid.", `Model: ${propModel?.name}`], "warn");
    }

    drawChartFromSat(sat);
  } finally {
    if (mySeq === chartGenSeq) setChartLoading(false);
  }
}

let availableFluidKeys = [];

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function loadTableIndex() {
  const base = "assets/tables/index.json";
  const isFile = window.location?.protocol === "file:";
  const ver = !isFile ? "?v=20251225_2" : "";
  return (await fetchJson(`${base}${ver}`)) ?? (await fetchJson(base));
}

async function initFluidSelect() {
  const idx = await loadTableIndex();
  const keys = Array.isArray(idx?.fluids) ? idx.fluids.filter((k) => typeof k === "string" && k) : [];
  availableFluidKeys = keys;

  fluidSelect.innerHTML = "";
  if (!keys.length) {
    fluidSelect.disabled = true;
    setStatus([
      "No table index found (assets/tables/index.json), or it contains no fluids.",
      "Commit JSON tables + update assets/tables/index.json to enable fluid selection.",
    ], "warn");
    return;
  }

  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    fluidSelect.appendChild(opt);
  }
  currentFluidKey = keys[0];
  fluidSelect.value = currentFluidKey;

  fluidSelect.addEventListener("change", async () => {
    currentFluidKey = fluidSelect.value;
    clearPoints();
    await regenerateChart();
  });

  // Attempt to restore last-used fluid
  const last = localStorage.getItem("lph:lastFluid");
  if (last && availableFluidKeys.includes(last)) {
    currentFluidKey = last;
    fluidSelect.value = currentFluidKey;
  }
}

function clearPoints() {
  points = Array.from({ length: pointTarget }, () => null);
  renderPoints();
  validate();
  setStatus(["Cleared."], "info");
}

function addPoint(p) {
  if (!Number.isFinite(p.Pbar) || !Number.isFinite(p.h) || p.Pbar <= 0) return;

  const filled = completePoints().length;
  if (filled >= pointTarget) {
    setStatus([`Point limit reached (${pointTarget}). Use “Clear points” to start over.`], "info");
    return;
  }

  const idx = points.findIndex((x) => !isCompletePoint(x));
  if (idx < 0) return;

  const phase = points[idx]?.phase || (idx === 3 ? "2p" : "auto");
  const h = phase === "2p" ? clampHToTwoPhase(p.Pbar, p.h) : p.h;
  points[idx] = { ...(points[idx] || {}), Pbar: p.Pbar, h, Tc: NaN, s: NaN, phase };
  renderPoints();
  validate();
  updatePointTemperature(idx);
}

function updatePointFromDrag(idx, p) {
  if (idx < 0 || idx >= points.length) return;

  const phase = points[idx]?.phase || (idx === 3 ? "2p" : "auto");
  let h = p.h;
  if (phase === "2p") h = clampHToTwoPhase(p.Pbar, h);

  if (!points[idx]) points[idx] = { Pbar: p.Pbar, h, Tc: NaN, s: NaN, phase };
  points[idx] = { ...points[idx], Pbar: p.Pbar, h, Tc: NaN, s: NaN, phase };
  if (pressureLockEnabled) syncPairedPressure(idx, p.Pbar);
}

function setPanelOpen(open) {
  if (!appRoot) return;
  appRoot.classList.toggle("panelOpen", !!open);
}

function wireInteractions() {
  clearBtn?.addEventListener("click", clearPoints);
  pointValuesToggleBtn?.addEventListener("click", () => {
    valueViewMode = valueViewMode === "intersections" ? "actual" : "intersections";
    renderPoints();
  });
  pressureLockBtn?.addEventListener("click", () => {
    pressureLockEnabled = !pressureLockEnabled;
    if (pressureLockEnabled) normalizePressureLocks();
    renderPoints();
    validate();
    updatePressureLockUi();
  });
  panelBtn?.addEventListener("click", () => setPanelOpen(true));
  panelCloseBtn?.addEventListener("click", () => setPanelOpen(false));

  saveBtn?.addEventListener("click", saveCurrentCycle);
  loadBtn?.addEventListener("click", loadSelectedCycle);
  deleteBtn?.addEventListener("click", deleteSelectedCycle);

  function redrawZoomed({ anchor } = {}) {
    if (!baseDomain) return;
    applyZoomToDomain({ anchor });
    drawChartFromSat(currentSat, { noTable: true, keepDomain: true });
  }

  viewResetBtn?.addEventListener("click", () => {
    resetView();
    drawChartFromSat(currentSat, { noTable: true, keepDomain: true });
  });

  function eventToSvgXY(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const loc = pt.matrixTransform(m.inverse());
    return { x: loc.x, y: loc.y };
  }

  // Drag: move existing points.
  const drag = { active: false, idx: -1, moved: false, pid: null };

  svg.addEventListener(
    "wheel",
    (ev) => {
      if (!baseDomain) return;
      ev.preventDefault();

      // Wheel default: zoom both. Shift: X only. Alt: Y only.
      const dz = ev.deltaY;
      const step = dz > 0 ? -6 : 6;
      const f = zoomFactorFromStep(step);

      const anchor = chart.eventToData(ev);
      const a = anchor ? { h: anchor.h, logP: Math.log10(anchor.Pbar) } : null;

      if (ev.shiftKey) zoomX = clampZoom(zoomX * f);
      else if (ev.altKey) zoomY = clampZoom(zoomY * f);
      else {
        zoomX = clampZoom(zoomX * f);
        zoomY = clampZoom(zoomY * f);
      }

      redrawZoomed({ anchor: a });
    },
    { passive: false }
  );

  // Touch: two-finger pinch-to-zoom + two-finger pan (centroid move).
  const pinch = { pts: new Map(), active: false, moved: false, startDist: 0, startX: 0, startY: 0, startZX: 1, startZY: 1, anchor: null, startDomain: null };
  function dist2(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  svg.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.pointerType !== "touch") return;
      pinch.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      // When a second finger goes down, switch into gesture mode regardless of target.
      if (pinch.pts.size === 2 && baseDomain) {
        const [a, b] = [...pinch.pts.values()];
        pinch.active = true;
        pinch.startDist = dist2(a, b);
        pinch.startX = (a.x + b.x) / 2;
        pinch.startY = (a.y + b.y) / 2;
        pinch.moved = false;
        pinch.startDomain = { ...chart.state.domain };
        pinch.startZX = zoomX;
        pinch.startZY = zoomY;
        const anc = chart.eventToData({ clientX: pinch.startX, clientY: pinch.startY });
        pinch.anchor = anc ? { h: anc.h, logP: Math.log10(anc.Pbar) } : null;

        // Cancel single-finger point drag if a 2-finger gesture begins.
        if (drag.active) {
          drag.active = false;
          drag.moved = false;
          drag.pid = null;
        }
      }
    },
    { passive: true }
  );

  svg.addEventListener(
    "pointermove",
    (ev) => {
      if (!pinch.pts.has(ev.pointerId)) return;
      pinch.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (!pinch.active || pinch.pts.size !== 2) return;

      const [a, b] = [...pinch.pts.values()];
      const d = dist2(a, b);
      if (!(d > 5) || !(pinch.startDist > 5)) return;

      const scale = d / pinch.startDist;
      const newZ = clampZoom(pinch.startZX * scale);
      // Pinch zooms both axes equally
      zoomX = newZ;
      zoomY = newZ;

      const curMid = eventToSvgXY({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      const startMid = eventToSvgXY({ clientX: pinch.startX, clientY: pinch.startY });

      // Zoom (anchored at gesture start midpoint) from the domain at gesture start.
      applyZoomToDomain({ anchor: pinch.anchor, fromDomain: pinch.startDomain });

      // Then: 2-finger pan by moving the midpoint (same feel as drag-pan)
      if (curMid && startMid) {
        const dx = curMid.x - startMid.x;
        const dy = curMid.y - startMid.y;
        if (!pinch.moved && (Math.abs(dx) > 2.5 || Math.abs(dy) > 2.5 || Math.abs(scale - 1) > 0.015)) pinch.moved = true;

        const plotW = Math.max(1, chart.state.width - chart.state.pad.l - chart.state.pad.r);
        const plotH = Math.max(1, chart.state.height - chart.state.pad.t - chart.state.pad.b);
        const spanH = chart.state.domain.hMax - chart.state.domain.hMin;
        const spanLp = chart.state.domain.logPMax - chart.state.domain.logPMin;

        const dh = (-dx / plotW) * spanH;
        const dlp = (dy / plotH) * spanLp;

        chart.state.domain.hMin += dh;
        chart.state.domain.hMax += dh;
        chart.state.domain.logPMin += dlp;
        chart.state.domain.logPMax += dlp;
      }

      drawChartFromSat(currentSat, { noTable: true, keepDomain: true });
    },
    { passive: true }
  );

  function endPinch(ev) {
    pinch.pts.delete(ev.pointerId);
    if (pinch.pts.size < 2) {
      pinch.active = false;
      pinch.anchor = null;
      pinch.startDomain = null;
    }
  }
  svg.addEventListener("pointerup", endPinch);
  svg.addEventListener("pointercancel", endPinch);


  svg.addEventListener(
    "pointerdown",
    (ev) => {
    if (pinch.active || pinch.pts.size >= 2) return;
    const idxStr = ev.target?.getAttribute?.("data-pt-index");
    if (idxStr == null) return;
    drag.active = true;
    drag.idx = Number(idxStr);
    drag.moved = false;
    drag.pid = ev.pointerId;
    svg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    },
    { passive: false }
  );

  svg.addEventListener(
    "pointermove",
    (ev) => {
      if (!drag.active) return;
      const p = chart.eventToData(ev);
      if (!p) return;
      ev.preventDefault();
      drag.moved = true;
      updatePointFromDrag(drag.idx, { Pbar: p.Pbar, h: p.h });
      renderPoints();
      validate();
    },
    { passive: false }
  );

  function endDrag(ev) {
    if (!drag.active) return;
    const idx = drag.idx;
    drag.active = false;
    try {
      svg.releasePointerCapture(drag.pid);
    } catch {
      // ignore
    }
    drag.pid = null;
    updatePointTemperature(idx);
    if (pressureLockEnabled) {
      const pair = pairedPressureIndex(idx);
      if (pair >= 0) refreshPointDerivedAfterPressureSync(pair);
    }
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  svg.addEventListener("click", (ev) => {
    // ignore click following a drag/gesture, or clicking an existing point
    if (drag.moved || pinch.moved || ev.target?.getAttribute?.("data-pt-index") != null) {
      drag.moved = false;
      pinch.moved = false;
      return;
    }
    const p = chart.eventToData(ev);
    if (!p) return;
    addPoint({ Pbar: p.Pbar, h: p.h });
  });

  const ro = new ResizeObserver(() => {
    // On mobile, the on-screen keyboard triggers a resize; avoid rebuilding the controls table
    // (which would drop focus and immediately hide the keyboard).
    drawChartFromSat(currentSat, { noTable: true, keepDomain: true });
  });
  if (chartStage) ro.observe(chartStage);
  else if (chartWrap) ro.observe(chartWrap);
  else ro.observe(svg);
}

async function main() {
  initTheme();
  if (window.location?.protocol === "file:") {
    setStatus(["If tables fail to load on file://, run a simple static server.", "Example: python -m http.server 5173", "Then open: http://127.0.0.1:5173/"], "warn");
  }
  await initFluidSelect();
  if (!availableFluidKeys.length) return;

  refreshSavedSelect();
  propModel = await createPropertyModel();
  setStatus(["Ready."], "info");
  wireInteractions();
  updateValueViewUi();
  updatePressureLockUi();
  await regenerateChart();
}

main();
