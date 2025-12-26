import { interp1, interp2Grid } from "./tableInterp.js";

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function tryLoadTable(fluidKey) {
  // Static JSON tables under assets/tables.
  // NOTE: query-string cache busting breaks file:// (it becomes part of the filename), so only use it on http(s).
  const base = `assets/tables/${encodeURIComponent(fluidKey)}.json`;
  const isFile = typeof window !== "undefined" && window.location?.protocol === "file:";
  const ver = !isFile ? "?v=20251225_2" : "";
  return (await fetchJson(`${base}${ver}`)) ?? (await fetchJson(base));
}

export async function createPropertyModel() {
  // Static mode: use precomputed JSON tables only.
  const tables = new Map();

  async function ensureTable(fluidKey) {
    if (tables.has(fluidKey)) {
      const cached = tables.get(fluidKey);
      if (!cached) throw new Error(`Missing JSON table for ${fluidKey}`);
      return cached;
    }

    const t = await tryLoadTable(fluidKey);
    if (!t) {
      throw new Error(`Missing JSON table for ${fluidKey}. Ensure assets/tables/${fluidKey}.json is accessible (serve via http://, not file://).`);
    }

    tables.set(fluidKey, t);
    return t;
  }

  function hFromTable(tbl, TK, PPa, which = "vap") {
    let logPbar = Math.log10(PPa / 1e5);
    const lpMin = tbl?.axes?.logPbar?.[0];
    const lpMax = tbl?.axes?.logPbar?.[tbl.axes.logPbar.length - 1];
    if (Number.isFinite(lpMin) && Number.isFinite(lpMax) && lpMax > lpMin) {
      logPbar = Math.min(lpMax, Math.max(lpMin, logPbar));
    }
    const grid = tbl.v >= 2 ? (which === "liq" ? tbl.hLiq : tbl.hVap) : tbl.h;
    return interp2Grid(tbl.axes.logPbar, tbl.axes.T, grid, logPbar, TK);
  }

  function sFromTable(tbl, TK, PPa, which = "vap") {
    let logPbar = Math.log10(PPa / 1e5);
    const lpMin = tbl?.axes?.logPbar?.[0];
    const lpMax = tbl?.axes?.logPbar?.[tbl.axes.logPbar.length - 1];
    if (Number.isFinite(lpMin) && Number.isFinite(lpMax) && lpMax > lpMin) {
      logPbar = Math.min(lpMax, Math.max(lpMin, logPbar));
    }
    const grid = which === "liq" ? tbl.sLiq : tbl.sVap;
    return interp2Grid(tbl.axes.logPbar, tbl.axes.T, grid, logPbar, TK);
  }

  function satPropsAtPFromSatArray(satArr, PPa, fluidKey = "") {
    // satArr items (v2): {T,P,hL,hV}
    // satArr items (v3 CoolProp): {P, TL, TV, T, hL, hV}
    const ps = satArr.map((s) => s.P);
    if (!(PPa >= ps[0] && PPa <= ps[ps.length - 1])) return null;

    const hLs = satArr.map((s) => s.hL);
    const hVs = satArr.map((s) => s.hV);

    const TLs = satArr.map((s) => (s.TL ?? s.T));
    const TVs = satArr.map((s) => (s.TV ?? s.T));

    let TL = interp1(ps, TLs, PPa);
    let TV = interp1(ps, TVs, PPa);


    const T = Number.isFinite(TL) && Number.isFinite(TV) ? 0.5 * (TL + TV) : interp1(ps, satArr.map((s) => s.T), PPa);

    const hL = interp1(ps, hLs, PPa);
    const hV = interp1(ps, hVs, PPa);

    return { T, TL, TV, P: PPa, hL, hV };
  }

  function twoPhaseAvailable(tbl) {
    return (
      tbl?.twoPhase &&
      Array.isArray(tbl.twoPhase.q) &&
      tbl.twoPhase.q.length >= 2 &&
      Array.isArray(tbl.twoPhase.logPbar) &&
      tbl.twoPhase.logPbar.length >= 2 &&
      Array.isArray(tbl.twoPhase.T) &&
      Array.isArray(tbl.twoPhase.h)
    );
  }

  function twoPhaseInterp(tbl, field, PPa, q) {
    let logP = Math.log10(PPa / 1e5);
    const lpMin = tbl?.twoPhase?.logPbar?.[0];
    const lpMax = tbl?.twoPhase?.logPbar?.[tbl.twoPhase.logPbar.length - 1];
    if (Number.isFinite(lpMin) && Number.isFinite(lpMax) && lpMax > lpMin) {
      logP = Math.min(lpMax, Math.max(lpMin, logP));
    }
    const grid = field === "T" ? tbl.twoPhase.T : tbl.twoPhase.h;
    return interp2Grid(tbl.twoPhase.logPbar, tbl.twoPhase.q, grid, logP, q);
  }

  function invertTwoPhaseQ(tbl, PPa, target, field) {
    let lo = 0.0,
      hi = 1.0;

    let flo = twoPhaseInterp(tbl, field, PPa, lo) - target;
    let fhi = twoPhaseInterp(tbl, field, PPa, hi) - target;

    if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return NaN;

    // If the target is slightly outside due to rounding, clamp to endpoints.
    if (flo >= 0) return 0.0;
    if (fhi <= 0) return 1.0;

    for (let it = 0; it < 60; it++) {
      const mid = 0.5 * (lo + hi);
      const fm = twoPhaseInterp(tbl, field, PPa, mid) - target;
      if (!Number.isFinite(fm)) break;
      if (Math.abs(fm) < 1e-6) return mid;
      if (fm > 0) hi = mid;
      else lo = mid;
    }

    return 0.5 * (lo + hi);
  }

  function twoPhaseTFromPH(tbl, PPa, hKJkg) {
    const q = invertTwoPhaseQ(tbl, PPa, hKJkg, "h");
    if (!Number.isFinite(q)) return NaN;
    return twoPhaseInterp(tbl, "T", PPa, q);
  }

  function twoPhaseHFromTP(tbl, PPa, TK) {
    const q = invertTwoPhaseQ(tbl, PPa, TK, "T");
    if (!Number.isFinite(q)) return NaN;
    return twoPhaseInterp(tbl, "h", PPa, q);
  }

  async function hFromTP(fluidKey, TK, PPa, phaseMode = "auto") {
    const tbl = await ensureTable(fluidKey);
    if (tbl) {
      let sat = null;
      if (Array.isArray(tbl.sat)) sat = satPropsAtPFromSatArray(tbl.sat, PPa, fluidKey);

      if (sat && (phaseMode === "liq" || phaseMode === "vap")) {
        const TsL = sat.TL ?? sat.T;
        const TsV = sat.TV ?? sat.T;

        // Prevent metastable leakage across the dome boundary.
        if (phaseMode === "liq" && Number.isFinite(TsL) && TK >= TsL) return sat.hL;
        if (phaseMode === "vap" && Number.isFinite(TsV) && TK <= TsV) return sat.hV;

        // Blend into saturation enthalpy very near the boundary to avoid table edge artifacts.
        const Ts = phaseMode === "liq" ? TsL : TsV;
        if (Number.isFinite(Ts)) {
          const BLEND_DT = 2.0; // K
          const dT = Math.abs(TK - Ts);
          if (dT < BLEND_DT) {
            const which = phaseMode;
            const hTab = hFromTable(tbl, TK, PPa, which);
            const hSat = phaseMode === "liq" ? sat.hL : sat.hV;
            if (Number.isFinite(hTab) && Number.isFinite(hSat)) {
              const t = dT / BLEND_DT;
              return hSat * (1 - t) + hTab * t;
            }
            if (Number.isFinite(hSat)) return hSat;
          }
        }
      }

      // Use phase-specific table when available (v2+), otherwise fall back to legacy single grid.
      // For auto mode, pick branch based on T vs Tsat(P) so liquid points don't accidentally use the vapor grid.
      let which = phaseMode === "liq" ? "liq" : "vap";
      if (phaseMode === "auto" && sat) {
        const TsL = sat.TL ?? sat.T;
        const TsV = sat.TV ?? sat.T;
        const DT = 0.5; // K deadband around the saturation boundary

        if (Number.isFinite(TsL) && Number.isFinite(TsV) && TsV > TsL + 1e-6) {
          // Zeotropic blend: two saturation temperatures at the same pressure.
          if (TK <= TsL - DT) which = "liq";
          else if (TK >= TsV + DT) which = "vap";
          else {
            // Inside 2φ for (T,P): use the dedicated 2φ grid (accounts for mixture glide + nonlinearity).
            if (twoPhaseAvailable(tbl)) {
              const h2 = twoPhaseHFromTP(tbl, PPa, TK);
              if (Number.isFinite(h2)) return h2;
            }

            // Fallback: linearized quality estimate
            const xT = Math.max(0, Math.min(1, (TK - TsL) / (TsV - TsL)));
            if (Number.isFinite(sat.hL) && Number.isFinite(sat.hV)) return sat.hL + xT * (sat.hV - sat.hL);
          }
        } else if (Number.isFinite(TsL)) {
          // Pseudo-pure: single Tsat(P)
          const Ts = TsL;
          if (TK <= Ts - DT) which = "liq";
          else if (TK >= Ts + DT) which = "vap";
          else {
            const t = (TK - (Ts - DT)) / (2 * DT);
            if (Number.isFinite(sat.hL) && Number.isFinite(sat.hV)) return sat.hL * (1 - t) + sat.hV * t;
          }
        }
      }

      const h = hFromTable(tbl, TK, PPa, which);

      return Number.isFinite(h) ? h : NaN;
    }

    return NaN;
  }

  async function sFromTP(fluidKey, TK, PPa, phaseMode = "auto") {
    const tbl = await ensureTable(fluidKey);
    if (!tbl?.sVap || !tbl?.sLiq) return NaN;

    let sat = null;
    if (Array.isArray(tbl.sat)) sat = satPropsAtPFromSatArray(tbl.sat, PPa, fluidKey);

    let which = phaseMode === "liq" ? "liq" : "vap";
    if (phaseMode === "auto" && sat) {
      const TsL = sat.TL ?? sat.T;
      const TsV = sat.TV ?? sat.T;
      const DT = 0.5;
      if (Number.isFinite(TsL) && Number.isFinite(TsV) && TsV > TsL + 1e-6) {
        if (TK <= TsL - DT) which = "liq";
        else if (TK >= TsV + DT) which = "vap";
        else return NaN; // don't report s inside 2φ
      } else if (Number.isFinite(TsL)) {
        if (TK <= TsL - DT) which = "liq";
        else if (TK >= TsL + DT) which = "vap";
        else return NaN;
      }
    }

    const s = sFromTable(tbl, TK, PPa, which);
    return Number.isFinite(s) ? s : NaN;
  }

  async function satPropsAtP(fluidKey, PPa) {
    const tbl = await ensureTable(fluidKey);
    if (tbl?.sat?.length) {
      const sat = satPropsAtPFromSatArray(tbl.sat, PPa, fluidKey);
      if (sat) return sat;
    }

    return null;
  }

  async function tFromPH(fluidKey, PPa, hKJkg) {
    const sat = await satPropsAtP(fluidKey, PPa);
    let which = "vap";

    // If inside dome, return Tsat(P) (or a temperature glide when available).
    // Otherwise pick correct branch for inversion.
    if (sat) {
      const hLo = Math.min(sat.hL, sat.hV);
      const hHi = Math.max(sat.hL, sat.hV);
      if (hKJkg >= hLo - 0.5 && hKJkg <= hHi + 0.5) {
        const tbl = await ensureTable(fluidKey);
        if (twoPhaseAvailable(tbl)) {
          const T2 = twoPhaseTFromPH(tbl, PPa, hKJkg);
          if (Number.isFinite(T2)) return T2;
        }

        const x = sat.hV > sat.hL ? Math.max(0, Math.min(1, (hKJkg - sat.hL) / (sat.hV - sat.hL))) : 0.5;

        // If the table provides bubble/dew temperatures, use them (zeotropic blends).
        if (Number.isFinite(sat.TL) && Number.isFinite(sat.TV) && sat.TV > sat.TL + 1e-6) {
          return sat.TL + x * (sat.TV - sat.TL);
        }

        return sat.T;
      }
      which = hKJkg < hLo ? "liq" : "vap";
    }

    // Invert using table if present
    const tbl = await ensureTable(fluidKey);
    if (tbl) {
      const TArr = tbl.axes.T;

      // Sample along the temperature axis to find a valid bracket.
      // (Some tables may contain NaNs near edges for a given pressure.)
      let bestT = NaN;
      let bestErr = Infinity;

      let havePrev = false;
      let prevT = NaN;
      let prevF = NaN;

      for (let i = 0; i < TArr.length; i++) {
        const T = TArr[i];
        const h = hFromTable(tbl, T, PPa, which);
        if (!Number.isFinite(h)) continue;

        const f = h - hKJkg;
        const err = Math.abs(f);
        if (err < bestErr) {
          bestErr = err;
          bestT = T;
        }

        if (havePrev) {
          // sign change => bracket
          if (f === 0) return T;
          if (prevF === 0) return prevT;
          if (f * prevF < 0) {
            let lo = prevT,
              hi = T;
            let flo = prevF,
              fhi = f;

            for (let it = 0; it < 60; it++) {
              const mid = 0.5 * (lo + hi);
              const fm = hFromTable(tbl, mid, PPa, which) - hKJkg;
              if (!Number.isFinite(fm)) break;
              if (Math.abs(fm) < 1e-4) return mid;
              if (fm * flo < 0) {
                hi = mid;
                fhi = fm;
              } else {
                lo = mid;
                flo = fm;
              }
            }
            return 0.5 * (lo + hi);
          }
        }

        havePrev = true;
        prevT = T;
        prevF = f;
      }

      // No clean bracket found; return the closest temperature we saw.
      if (Number.isFinite(bestT)) return bestT;
    }

    return NaN;
  }

  async function saturationCurve(fluidKey, opts = {}) {
    const tbl = await ensureTable(fluidKey);
    if (tbl?.sat?.length) {
      return tbl.sat;
    }

    return [];
  }

  return {
    name: "Static JSON tables",
    useCoolProp: false,
    hFromTP,
    sFromTP,
    tFromPH,
    satPropsAtP,
    saturationCurve,
  };
}
