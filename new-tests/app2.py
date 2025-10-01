# app2.py
from flask import Flask, request, jsonify, send_from_directory
import numpy as np

# PYPOWER
from pypower.api import case118, rundcpf, ppoption, runpf

app = Flask(__name__, static_url_path="", static_folder="static")

# --- column indices (MATPOWER/PYPOWER format) ---
BUS_I   = 0
BUS_TYPE= 1
PD      = 2
QD      = 3

F_BUS   = 0
T_BUS   = 1
BR_R    = 2
BR_X    = 3
BR_B    = 4
RATE_A  = 5
BR_STATUS = 10

# After PF solve, these appear at the end of each branch row:
# 13: PF (MW), 14: QF, 15: PT, 16: QT
PF_COL = 13

USUAL_SET = {(65,68),(68,69),(69,77),(68,81),(81,80)}

GEN_BUS    = 0
PG         = 1
QG         = 2
QMAX       = 3
QMIN       = 4
VG         = 5
MBASE      = 6
GEN_STATUS = 7
PMAX       = 8
PMIN       = 9

# ---------- helpers ----------
def solve_powerflow(ppc, mode="dc"):
    ppopt = ppoption(OUT_ALL=0, VERBOSE=0)
    if mode == "ac":
        results, ok = runpf(ppc, ppopt)
    else:
        results, ok = rundcpf(ppc, ppopt)
    return results, bool(ok)

def pairs_to_mask_and_count(ppc, pairs):
    """Return (mask, matched_list, missing_list) for branch pairs."""
    br = ppc['branch']
    mask_accum = np.zeros(len(br), dtype=bool)
    matched, missing = [], []
    for (a,b) in pairs:
        m = ((br[:,F_BUS]==a) & (br[:,T_BUS]==b)) | ((br[:,F_BUS]==b) & (br[:,T_BUS]==a))
        if m.any():
            mask_accum |= m
            matched.append((a,b,int(m.sum())))
        else:
            missing.append((a,b))
    return mask_accum, matched, missing

def toggle_usual_corridor(ppc, kill=True):
    br = ppc['branch']
    for (a,b) in USUAL_SET:
        m = ((br[:,F_BUS]==a) & (br[:,T_BUS]==b)) | ((br[:,F_BUS]==b) & (br[:,T_BUS]==a))
        br[m, BR_STATUS] = 0 if kill else 1

def seed_missing_rateA_with_baseline_limits(ppc, margin=1.20):
    """
    For branches with RATE_A == 0, run a baseline DC PF and set RATE_A
    to margin * abs(PF_baseline). Gives every line a plausible limit.
    """
    ppopt = ppoption(OUT_ALL=0, VERBOSE=0)
    base_res, ok = rundcpf(ppc, ppopt)
    if not ok:
        return
    br = base_res['branch']
    nz = ppc['branch'][:, RATE_A] <= 0
    if br.shape[0] == ppc['branch'].shape[0]:
        ppc['branch'][nz, RATE_A] = margin * np.abs(br[nz, PF_COL])

def apply_scenario_remix(ppc,
                         load_scale=1.00,
                         focus_lo=60,
                         focus_hi=80,
                         focus_scale=1.30,
                         out_lines=None,
                         rate_mult=1.00):
    """Global knobs: scale loads, stress a bus range, open lines, scale all RATE_A."""
    # Scale all loads
    ppc['bus'][:, PD] *= load_scale
    ppc['bus'][:, QD] *= load_scale

    # Extra regional stress (by bus number range)
    lo, hi = min(focus_lo, focus_hi), max(focus_lo, focus_hi)
    mask_focus = (ppc['bus'][:, BUS_I] >= lo) & (ppc['bus'][:, BUS_I] <= hi)
    ppc['bus'][mask_focus, PD] *= focus_scale
    ppc['bus'][mask_focus, QD] *= focus_scale

    # Disable specific branches by (from, to) unordered pairs
    if out_lines:
        br = ppc['branch']
        for (a, b) in out_lines:
            m = ((br[:, F_BUS] == a) & (br[:, T_BUS] == b)) | ((br[:, F_BUS] == b) & (br[:, T_BUS] == a))
            br[m, BR_STATUS] = 0

    # Scale line ratings
    if rate_mult != 1.0:
        rated = ppc['branch'][:, RATE_A]
        nz = rated > 0
        rated[nz] *= rate_mult
        ppc['branch'][:, RATE_A] = rated

def parse_pair_map(s):
    # "a-b:x,c-d:y" -> dict[(a,b)] = x
    out = {}
    if not s: return out
    for p in s.split(","):
        if ":" not in p or "-" not in p: continue
        ab, val = p.split(":")
        a, b = ab.split("-")
        out[(int(a), int(b))] = float(val)
    return out

def parse_ranges(s):
    # "lo-hi:scale,..." -> list[(lo,hi,scale)]
    out = []
    if not s: return out
    for p in s.split(","):
        if ":" not in p or "-" not in p: continue
        rng, val = p.split(":")
        lo, hi = rng.split("-")
        out.append((int(lo), int(hi), float(val)))
    return out

def apply_targeted_overrides(ppc, offline_gens=None, tighten=None, relax=None, region_loads=None):
    """Targeted knobs: offline gens (by BUS), regional load multipliers, tighten/relax specific lines."""
    # Generators offline by BUS number list
    if offline_gens:
        buses_off = set(int(x) for x in offline_gens.split(",") if x.strip())
        for i, g in enumerate(ppc['gen']):
            if int(g[GEN_BUS]) in buses_off:
                ppc['gen'][i, GEN_STATUS] = 0
                ppc['gen'][i, PMAX] = 0.0

    # Regional load multipliers
    if region_loads:
        for lo, hi, scale in parse_ranges(region_loads):
            lo, hi = min(lo, hi), max(lo, hi)
            mask = (ppc['bus'][:, BUS_I] >= lo) & (ppc['bus'][:, BUS_I] <= hi)
            ppc['bus'][mask, PD] *= scale
            ppc['bus'][mask, QD] *= scale

    # Tighten/relax specific lines
    br = ppc['branch']
    if tighten:
        for (a, b), mult in parse_pair_map(tighten).items():
            m = ((br[:, F_BUS] == a) & (br[:, T_BUS] == b)) | ((br[:, F_BUS] == b) & (br[:, T_BUS] == a))
            ppc['branch'][m, RATE_A] = np.where(ppc['branch'][m, RATE_A] > 0,
                                                ppc['branch'][m, RATE_A] * mult,
                                                ppc['branch'][m, RATE_A])
    if relax:
        for (a, b), mult in parse_pair_map(relax).items():
            m = ((br[:, F_BUS] == a) & (br[:, T_BUS] == b)) | ((br[:, F_BUS] == b) & (br[:, T_BUS] == a))
            ppc['branch'][m, RATE_A] = np.where(ppc['branch'][m, RATE_A] > 0,
                                                ppc['branch'][m, RATE_A] * mult,
                                                ppc['branch'][m, RATE_A])

def set_slack_bus(ppc, slack_bus):
    """Make all buses PQ, then set one bus as slack (type 3)."""
    if slack_bus is None: return
    bus = ppc['bus']
    bus[:, BUS_TYPE] = 1
    bus[bus[:, BUS_I] == slack_bus, BUS_TYPE] = 3

def make_bottleneck(ppc, target_pair=(8,9), region=(1,30),
                    relax_usual=3.0, tighten_target=0.55,
                    region_boost=1.30, slack_bus=None):
    """
    Deterministically push the first overload to `target_pair` by:
      1) Relaxing the usual corridor
      2) Tightening the target pair (and neighbors)
      3) Boosting load in a local region
      4) (Optional) moving the slack to reduce bias
    Assumes RATE_A already seeded for all lines.
    """
    br = ppc['branch']; bus = ppc['bus']

    # (A) Relax the usual corridor hard so it won't bind first
    for (a,b) in USUAL_SET:
        m = ((br[:,F_BUS]==a) & (br[:,T_BUS]==b)) | ((br[:,F_BUS]==b) & (br[:,T_BUS]==a))
        br[m, RATE_A] = np.where(br[m, RATE_A] > 0, br[m, RATE_A] * relax_usual, br[m, RATE_A])

    # (B) Tighten target pair (both directions)
    a, b = target_pair
    mt = ((br[:,F_BUS]==a) & (br[:,T_BUS]==b)) | ((br[:,F_BUS]==b) & (br[:,T_BUS]==a))
    br[mt, RATE_A] = np.where(br[mt, RATE_A] > 0, br[mt, RATE_A] * tighten_target, br[mt, RATE_A])

    # also lightly tighten immediate neighbors to help "pin" the choke
    neigh = []
    neigh.extend([(a, int(x)) for x in br[br[:,F_BUS]==a, T_BUS]])
    neigh.extend([(int(x), a) for x in br[br[:,T_BUS]==a, F_BUS]])
    neigh.extend([(b, int(x)) for x in br[br[:,F_BUS]==b, T_BUS]])
    neigh.extend([(int(x), b) for x in br[br[:,T_BUS]==b, F_BUS]])
    for (u,v) in neigh:
        m = ((br[:,F_BUS]==u) & (br[:,T_BUS]==v)) | ((br[:,F_BUS]==v) & (br[:,T_BUS]==u))
        br[m, RATE_A] = np.where(br[m, RATE_A] > 0,
                                 br[m, RATE_A] * max(0.75, tighten_target*1.15),
                                 br[m, RATE_A])

    # (C) Boost regional loads (PD/QD)
    lo, hi = sorted(region)
    mask_region = (bus[:,BUS_I] >= lo) & (bus[:,BUS_I] <= hi)
    bus[mask_region, PD] *= region_boost
    bus[mask_region, QD] *= region_boost

    # (D) Optional: set slack
    set_slack_bus(ppc, slack_bus)

def compute_top_lines(ppc, n=12, solver="dc"):
    """Solve PF and return top N lines by utilization (|PF|/RATE_A)."""
    results, success = solve_powerflow(ppc, mode=solver)
    br = results['branch']
    out = []
    for row in br:
        f = int(row[F_BUS]); t = int(row[T_BUS])
        rate = float(row[RATE_A])
        pf = float(row[PF_COL])
        util = abs(pf) / rate if rate and rate > 0 else 0.0
        out.append({
            "from": f, "to": t,
            "pf_mw": round(pf, 2),
            "rate_a_mva": round(rate, 2),
            "utilization": util,
            "util_pct": round(100.0 * util, 1),
            "overloaded": util > 1.0
        })
    out.sort(key=lambda d: d["utilization"], reverse=True)
    return out[:n], bool(success)

def pair_in_top(top_rows, pair):
    a, b = pair
    for r in top_rows:
        if (r["from"] == a and r["to"] == b) or (r["from"] == b and r["to"] == a):
            return True
    return False

def debug_gen_status(ppc):
    """Return dict: bus -> {online, total} generator counts."""
    d = {}
    for g in ppc['gen']:
        bus = int(g[GEN_BUS]); on = int(g[GEN_STATUS]) == 1
        d.setdefault(bus, {"online":0,"total":0})
        d[bus]["total"] += 1
        if on: d[bus]["online"] += 1
    return d

# ---------- API ----------
@app.get("/api/top-lines")
def api_top_lines():
    try:
        # global knobs
        n            = int(request.args.get("n", 12))
        load_scale   = float(request.args.get("load_scale", 1.00))
        focus_lo     = int(request.args.get("focus_lo", 60))
        focus_hi     = int(request.args.get("focus_hi", 80))
        focus_scale  = float(request.args.get("focus_scale", 1.30))
        rate_mult    = float(request.args.get("rate_mult", 1.00))
        kill_usual   = request.args.get("kill_usual", "0") == "1"
        solver       = request.args.get("solver", "dc").lower().strip()
        if solver not in ("dc","ac"):
            solver = "dc"

        out_lines_param = request.args.get("out_lines", "").strip()
        out_lines = []
        if out_lines_param:
            for pair in out_lines_param.split(","):
                if "-" in pair:
                    a, b = pair.split("-", 1)
                    out_lines.append((int(a), int(b)))

        # targeted knobs
        offline_gens = request.args.get("offline_gens", "").strip()
        tighten_lines = request.args.get("tighten_lines", "").strip()
        relax_lines   = request.args.get("relax_lines", "").strip()
        region_loads  = request.args.get("region_loads", "").strip()

        # deterministic bottleneck builder
        target_pair_s = request.args.get("target_pair", "").strip()  # "8-9"
        region_s      = request.args.get("region", "").strip()       # "1-30"
        slack_s       = request.args.get("slack", "").strip()

        # fresh base case
        ppc = case118()

        # seed RATE_A where zero (so any line can bind)
        seed_missing_rateA_with_baseline_limits(ppc, margin=1.20)

        # optional: kill usual corridor entirely (for "proof" scenarios)
        if kill_usual:
            toggle_usual_corridor(ppc, kill=True)

        # global remix
        apply_scenario_remix(
            ppc,
            load_scale=load_scale,
            focus_lo=focus_lo,
            focus_hi=focus_hi,
            focus_scale=focus_scale,
            out_lines=out_lines,
            rate_mult=rate_mult
        )

        # targeted overrides
        apply_targeted_overrides(
            ppc,
            offline_gens=offline_gens,
            tighten=tighten_lines,
            relax=relax_lines,
            region_loads=region_loads
        )

        # deterministic "make X the bottleneck"
        forced_target = None
        if target_pair_s:
            a, b = map(int, target_pair_s.split("-"))
            if region_s:
                lo, hi = map(int, region_s.split("-"))
            else:
                lo, hi = (1, 118)
            slack_bus = int(slack_s) if slack_s else None
            make_bottleneck(ppc,
                            target_pair=(a,b),
                            region=(lo,hi),
                            relax_usual=3.0,
                            tighten_target=0.55,
                            region_boost=1.30,
                            slack_bus=slack_bus)
            forced_target = (a,b)

        # compute
        top, ok = compute_top_lines(ppc, n=n, solver=solver)

        # debug echoes
        tighten_pairs = list(parse_pair_map(tighten_lines).keys()) if tighten_lines else []
        relax_pairs   = list(parse_pair_map(relax_lines).keys()) if relax_lines else []
        out_pairs     = out_lines

        _, matched_tighten, missing_tighten = pairs_to_mask_and_count(ppc, tighten_pairs) if tighten_pairs else (None, [], [])
        _, matched_relax,   missing_relax   = pairs_to_mask_and_count(ppc, relax_pairs)   if relax_pairs   else (None, [], [])
        _, matched_out,     missing_out     = pairs_to_mask_and_count(ppc, out_pairs)     if out_pairs     else (None, [], [])

        debug = {
            "solver": solver,
            "gen_status_by_bus": debug_gen_status(ppc),
            "matched_tighten_pairs": matched_tighten,
            "missing_tighten_pairs": missing_tighten,
            "matched_relax_pairs": matched_relax,
            "missing_relax_pairs": missing_relax,
            "matched_out_lines": matched_out,
            "missing_out_lines": missing_out,
        }
        if forced_target:
            debug["forced_target_in_topN"] = pair_in_top(top, forced_target)

        return jsonify({
            "ok": ok,
            "params": {
                "n": n,
                "load_scale": load_scale,
                "focus_lo": focus_lo,
                "focus_hi": focus_hi,
                "focus_scale": focus_scale,
                "out_lines": out_lines,
                "rate_mult": rate_mult,
                "offline_gens": offline_gens,
                "tighten_lines": tighten_lines,
                "relax_lines": relax_lines,
                "region_loads": region_loads,
                "kill_usual": kill_usual,
                "target_pair": target_pair_s,
                "region": region_s or "1-118",
                "slack": slack_s or "",
            },
            "top_lines": top,
            "debug": debug
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.get("/")
def index():
    return send_from_directory("static", "index.html")

if __name__ == "__main__":
    app.run(debug=True)
