#!/usr/bin/env python
"""Generate offline log(p)-h property tables using CoolProp

Usage:
  python tools\\generateTablesCoolProp.py
  python tools\\generateTablesCoolProp.py R-407C R-410A

It regenerates JSON files under assets\\tables\\*.json using schema v3:
  - axes: T [K], logPbar [log10(bar)]
  - hVap/hLiq: kJ/kg grids (NaN where phase-forced solve is invalid)
  - sat: array over pressure with {P, TL, TV, T, hL, hV}
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path


def _try_import_coolprop():
    try:
        import CoolProp.CoolProp as CP  # type: ignore
        # In the PyPI package, AbstractState lives under CoolProp.CoolProp.
        return CP, CP.AbstractState
    except Exception:
        return None, None


def linspace(a: float, b: float, n: int):
    if n <= 1:
        return [a]
    return [a + (i / (n - 1)) * (b - a) for i in range(n)]


def logspace(a: float, b: float, n: int):
    # a,b > 0
    la = math.log(a)
    lb = math.log(b)
    return [math.exp(la + (i / (n - 1)) * (lb - la)) for i in range(n)]


def coolprop_name_for_key(key: str) -> str:
    # Map our UI keys -> CoolProp fluid strings (HEOS backend)
    special = {
        "R-718": "Water",
        "R-744": "CO2",
        "R-717": "Ammonia",
        "NH3": "Ammonia",
        "CO2": "CO2",
        "Air": "Air",
        "N2": "Nitrogen",
        "O2": "Oxygen",
    }
    if key in special:
        return special[key]

    # Most refrigerants in CoolProp are without the hyphen (R410A, R407C, ...)
    if key.startswith("R-"):
        return "R" + key[2:]

    return key


def main(argv: list[str]):
    CP, AbstractState = _try_import_coolprop()
    if CP is None:
        print("CoolProp is not installed.\n")
        print("Install it locally, then rerun:")
        print("  python -m pip install CoolProp")
        print("  python tools\\generateTablesCoolProp.py")
        return 2

    repo_root = Path(__file__).resolve().parents[1]
    out_dir = repo_root / "assets" / "tables"
    out_dir.mkdir(parents=True, exist_ok=True)

    # If no args, regenerate all existing tables by filename.
    keys = argv[1:]
    if not keys:
        keys = sorted([p.stem for p in out_dir.glob("*.json") if p.stem != "index"])

    if not keys:
        print("No fluid keys found (assets\\tables\\*.json is empty).")
        return 2

    # Grid settings (keep consistent with the frontend expectations)
    N_T = 600
    N_P = 600
    LOGP_MIN = -1.2  # ~0.063 bar
    LOGP_MAX = 2.3   # ~200 bar

    for key in keys:
        name = coolprop_name_for_key(key)
        fluid = f"HEOS::{name}"

        try:
            AS = AbstractState("HEOS", name)
            Tc = float(AS.T_critical())
            Pc = float(AS.p_critical())
        except Exception as e:
            print(f"Skipping {key}: cannot initialize CoolProp state for '{fluid}': {e}")
            continue

        T = linspace(0.50 * Tc, 1.30 * Tc, N_T)
        logPbar = linspace(LOGP_MIN, LOGP_MAX, N_P)

        def h_forced(TK: float, PPa: float, phase: str) -> float:
            # Return kJ/kg
            try:
                if phase == "liq":
                    AS.specify_phase(CP.iphase_liquid)
                elif phase == "vap":
                    AS.specify_phase(CP.iphase_gas)
                else:
                    AS.unspecify_phase()

                AS.update(CP.PT_INPUTS, PPa, TK)
                return float(AS.hmass()) / 1000.0
            except Exception:
                # Fallback: try without forcing (supercritical / boundary cases)
                try:
                    AS.unspecify_phase()
                    AS.update(CP.PT_INPUTS, PPa, TK)
                    return float(AS.hmass()) / 1000.0
                except Exception:
                    return float("nan")
            finally:
                try:
                    AS.unspecify_phase()
                except Exception:
                    pass

        def s_forced(TK: float, PPa: float, phase: str) -> float:
            # Return kJ/kg/K
            try:
                if phase == "liq":
                    AS.specify_phase(CP.iphase_liquid)
                elif phase == "vap":
                    AS.specify_phase(CP.iphase_gas)
                else:
                    AS.unspecify_phase()

                AS.update(CP.PT_INPUTS, PPa, TK)
                return float(AS.smass()) / 1000.0
            except Exception:
                # Fallback: try without forcing (supercritical / boundary cases)
                try:
                    AS.unspecify_phase()
                    AS.update(CP.PT_INPUTS, PPa, TK)
                    return float(AS.smass()) / 1000.0
                except Exception:
                    return float("nan")
            finally:
                try:
                    AS.unspecify_phase()
                except Exception:
                    pass

        hVap: list[list[float]] = []
        hLiq: list[list[float]] = []
        sVap: list[list[float]] = []
        sLiq: list[list[float]] = []

        for TK in T:
            rowV: list[float | None] = []
            rowL: list[float | None] = []
            rowSV: list[float | None] = []
            rowSL: list[float | None] = []
            for lp in logPbar:
                PPa = (10.0 ** lp) * 1e5
                hv = h_forced(TK, PPa, "vap")
                hl = h_forced(TK, PPa, "liq")
                sv = s_forced(TK, PPa, "vap")
                sl = s_forced(TK, PPa, "liq")
                rowV.append(hv if math.isfinite(hv) else None)
                rowL.append(hl if math.isfinite(hl) else None)
                rowSV.append(sv if math.isfinite(sv) else None)
                rowSL.append(sl if math.isfinite(sl) else None)
            hVap.append(rowV)
            hLiq.append(rowL)
            sVap.append(rowSV)
            sLiq.append(rowSL)

        # Saturation curve (bubble/dew) + 2φ grids from CoolProp.
        # For zeotropic blends, TL != TV and T changes with quality at fixed pressure.
        sat = []
        two_phase = None
        try:
            p_min = max(2.0e4, 5.0e-4 * Pc)
            p_max = 0.999 * Pc
            Pvals = logspace(p_min, p_max, 240)

            q = linspace(0.0, 1.0, 21)
            logP_sat: list[float] = []
            T2: list[list[float]] = [[] for _ in q]  # grid[qIndex][pIndex]
            h2: list[list[float]] = [[] for _ in q]

            for PPa in Pvals:
                try:
                    Tq = []
                    hq = []
                    for qi in q:
                        Tq.append(float(CP.PropsSI("T", "P", PPa, "Q", qi, fluid)))
                        hq.append(float(CP.PropsSI("H", "P", PPa, "Q", qi, fluid)) / 1000.0)

                    # Require endpoints (bubble + dew) to accept this pressure level.
                    TL, TV = Tq[0], Tq[-1]
                    hL, hV = hq[0], hq[-1]
                    if not (math.isfinite(TL) and math.isfinite(TV) and math.isfinite(hL) and math.isfinite(hV)):
                        continue

                    logP_sat.append(math.log10(PPa / 1e5))
                    for i in range(len(q)):
                        T2[i].append(Tq[i] if math.isfinite(Tq[i]) else None)
                        h2[i].append(hq[i] if math.isfinite(hq[i]) else None)

                    sat.append({
                        "P": PPa,
                        "TL": TL,
                        "TV": TV,
                        "T": 0.5 * (TL + TV),
                        "hL": hL,
                        "hV": hV,
                    })
                except Exception:
                    continue

            two_phase = {
                "q": q,
                "logPbar": logP_sat,
                "T": T2,
                "h": h2,
            }
        except Exception:
            sat = []
            two_phase = None

        payload = {
            "v": 4,
            "source": "CoolProp",
            "generatedBy": "generateTablesCoolProp.py (CoolProp HEOS, hi-res, vap+liq h+s grids, bubble+dew sat, 2phi (P,Q)->(T,H))",
            "fluidKey": key,
            "coolprop": fluid,
            "axes": {"T": T, "logPbar": logPbar},
            "hVap": hVap,
            "hLiq": hLiq,
            "sVap": sVap,
            "sLiq": sLiq,
            "sat": sat,
            "twoPhase": two_phase,
        }

        out_file = out_dir / f"{key}.json"
        # allow_nan=False ensures we never emit invalid JSON tokens like NaN/Infinity.
        out_file.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
        print("wrote", out_file)

    # Regenerate assets\\tables\\index.json (fluids available offline)
    keys_out = sorted([p.stem for p in out_dir.glob("*.json") if p.stem != "index"])
    (out_dir / "index.json").write_text(json.dumps({"fluids": keys_out}, separators=(",", ":")))

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
