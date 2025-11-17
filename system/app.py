# app.py

import traceback
from flask import Flask, render_template, send_from_directory, jsonify, request, abort
from grid import Grid
import inspect
print("🔎 grid module file:", inspect.getfile(Grid))

import os
from pathlib import Path
import json, datetime


BASE_DIR = Path(__file__).resolve().parent
NEW_TEMPLATES = BASE_DIR / "templates"
NEW_STATIC    = BASE_DIR / "static"
LEGACY_CSS    = BASE_DIR / "css"

# ✅ Point Flask to the new locations
app = Flask(
    __name__,
    template_folder=str(NEW_TEMPLATES),
    static_folder=str(NEW_STATIC),     # serves at /static/*
    static_url_path="/static"
)
grid = Grid()



@app.route("/")
@app.route("/start")
@app.route("/home")
def start():
    return render_template("start.html")

@app.route("/list")
def list_view():
    return render_template("listView-prototype.html")

@app.route("/listB")
def list_viewB():
    return render_template("listView-prototypeB.html")

@app.route("/map")
def map_view():
    return render_template("mapView-prototype.html")

@app.route("/mapB")
def map_viewB():
    return render_template("mapView-prototypeB.html")

@app.route("/tutorials")
def tutorials():
    return render_template("tutorial_slides_unified.html")

@app.route("/test")
def test_runner():
    """
    A minimal stub that renders the test runner template.
    The front-end JS (testRunner.js) will parse ?flow=... and orchestrate.
    """
    return render_template("testRunner.html")

@app.route("/results")
def results_page():
    return render_template("results.html")

# ✅ Keep legacy /css/* working for older pages
@app.route("/css/<path:filename>")
def serve_legacy_css(filename):
    return send_from_directory(LEGACY_CSS, filename)

@app.route('/system/<path:filename>')
def serve_new_tests(filename):
    # app.py is inside ...\system, so this points at the system folder itself
    directory = os.path.dirname(os.path.abspath(__file__))
    return send_from_directory(directory, filename)

@app.route("/sequences/<path:filename>")
def serve_sequences(filename):
    base = Path("sequences").resolve()        # points to system/sequences
    p = (base / filename).resolve()
    if not str(p).startswith(str(base)) or not p.exists():
        abort(404)
    return send_from_directory(base, filename)


# ✅ Optional: direct scenarios if you fetch raw files (otherwise use /api/scenario/<id>)
@app.route("/scenarios/<path:filename>")
def serve_scenarios(filename):
    return send_from_directory(BASE_DIR / "scenarios", filename)

@app.route("/api/sequences")
def api_sequences():
    base = BASE_DIR / "sequences"
    items = []
    if base.exists():
        for p in sorted(base.glob("*.json")):
            items.append({
                "id": p.stem,  # use file stem as the machine id (e.g., "x-y-z")
                "label": p.stem.replace("-", " ").replace("_", " ").title()
            })
    return jsonify({"sequences": items})

@app.route("/api/results", methods=["POST"])
def api_save_results():
    try:
        payload = request.get_json(silent=True, force=True) or {}
    except Exception:
        return jsonify({"error": "bad json"}), 400

    if not payload.get("save"):
        return jsonify({"message": "Save skipped (save=false)."}), 200

    run = payload.get("run")
    if not isinstance(run, dict):
        return jsonify({"error": "missing run object"}), 400

    out_dir = BASE_DIR / "results"
    out_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    # hint sequence if present
    seq = (run.get("plan") or {}).get("sequence") or "run"
    safe_seq = "".join(c for c in str(seq) if c.isalnum() or c in "-_")[:40]
    out_path = out_dir / f"{ts}_{safe_seq}.json"

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(run, f, ensure_ascii=False, indent=2)

    return jsonify({"message": f"Saved: {out_path.name}"}), 201


@app.route('/api/generators')
def get_generators():
    return jsonify(grid.get_generators())

@app.route('/api/lines')
def get_lines():
    return jsonify(grid.get_branches())

@app.route('/api/toggle/<int:gen_id>', methods=['POST'])
def toggle_generator(gen_id):
    try:
        success = grid.toggle_generator(gen_id)
        print("✅ TOGGLE SOLVE RESULT:", success)

        return jsonify({
            'generators': grid.get_generators(),
            'lines': grid.get_branches(),
            'total_cost': grid.last_total_cost,
            'solved': success  # ✅ this will now be True or False
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'generators': grid.get_generators(),
            'lines': grid.get_branches(),
            'total_cost': None,
            'solved': False,
            'error': str(e)
        })

@app.route('/api/set_generation/<int:gen_id>', methods=['POST'])
def set_generation(gen_id):
    try:
        data = request.get_json()
        percent = data.get('percent', 0)
        user_active = data.get('user_active', None)  # ✅ Optional override

        # ✅ Updated set_percent to take both values
        grid.generators[gen_id].set_percent(percent, user_active)

        success = grid.run_power_flow()

        return jsonify({
            'generators': grid.get_generators(),
            'lines': grid.get_branches(),
            'total_cost': grid.last_total_cost,
            'solved': success
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

    

@app.route('/api/scenario/<scenario_id>')
def apply_scenario(scenario_id):
    try:
        scenario = grid.apply_scenario(scenario_id)
        solved = grid.run_power_flow()

        return jsonify({
            **scenario,
            'generators': grid.get_generators(),
            'lines': grid.get_branches(),
            'total_cost': grid.last_total_cost,
            'solved': solved
        })

    except Exception as e:
        print("❌ Error loading scenario:")
        traceback.print_exc()
        return jsonify({
            "error": str(e),
            "generators": grid.get_generators(),
            "lines": grid.get_branches(),
            "total_cost": None,
            "solved": False
        }), 500


    
@app.route("/api/scenarios")
def get_all_scenarios():
    from scenarios import list_all_scenarios
    return jsonify(list_all_scenarios())


@app.route('/api/status')
def get_status():
    scenario = grid.active_scenario or {}

    # Effective cap scalar (Method C)
    try:
        limit_pct = float(scenario.get('line_limit_pct', 1.0) or 1.0)
        if limit_pct <= 0:
            limit_pct = 1e-6
    except Exception:
        limit_pct = 1.0

    total_pg = sum(gen.pg for gen in grid.generators)
    total_cost = grid.last_total_cost or 0
    total_emissions = grid.compute_total_emissions()

    ui_filter_on = bool(getattr(grid, "_ui_map_ready", False))
    ui_pairs = getattr(grid, "_ui_pairs", set())

    overloaded_lines = 0
    overloaded_list = []

    # For diagnostics
    def _rows_iter():
        for line in grid.branches:
            # Skip disabled lines
            if getattr(line, 'unavailable', False):
                continue
            # Skip PF-only branches if UI whitelist is available
            a = int(getattr(line, 'from_bus', 0)); b = int(getattr(line, 'to_bus', 0))
            lo, hi = (a, b) if a <= b else (b, a)
            if ui_filter_on and (lo, hi) not in ui_pairs:
                continue

            flow = float(getattr(line, 'flow', 0.0) or 0.0)
            base_cap = float(getattr(line, 'rate_a', 0.0) or 0.0)
            eff_cap = base_cap * limit_pct
            line_id = getattr(line, 'ui_id', None) or f"Line_Bus{lo}_Bus{hi}"
            yield (line_id, flow, base_cap, eff_cap)

    rows = list(_rows_iter())

    # Overload count (effective definition)
    for line_id, flow, base_cap, eff_cap in rows:
        if eff_cap > 0 and flow > eff_cap:
            overloaded_lines += 1
            overloaded_list.append({
                "id": line_id,
                "flow": flow,
                "rate_eff": eff_cap
            })

    # Diagnostics: highest % and top-5 under both definitions
    def _pct(x, cap): 
        return (x / cap) if cap and cap > 0 else 0.0

    # Effective
    ranked_eff = sorted(
        [{"id": i, "flow": f, "rate_eff": e, "pct_eff": _pct(f,e)} for (i,f,_,e) in rows],
        key=lambda r: r["pct_eff"], reverse=True
    )
    highest_eff = (ranked_eff[0]["pct_eff"] * 100.0) if ranked_eff else 0.0
    top_eff = [
        {"id": r["id"], "flow": r["flow"], "rate_eff": r["rate_eff"], "pct_eff": r["pct_eff"] * 100.0}
        for r in ranked_eff[:5]
    ]

    # Base
    ranked_base = sorted(
        [{"id": i, "flow": f, "rate_base": b, "pct_base": _pct(f,b)} for (i,f,b,_) in rows],
        key=lambda r: r["pct_base"], reverse=True
    )
    highest_base = (ranked_base[0]["pct_base"] * 100.0) if ranked_base else 0.0
    top_base = [
        {"id": r["id"], "flow": r["flow"], "rate_base": r["rate_base"], "pct_base": r["pct_base"] * 100.0}
        for r in ranked_base[:5]
    ]

    scenario_met = (
        (not scenario.get('target_mw') or total_pg >= scenario['target_mw']) and
        (not scenario.get('cost_limit') or total_cost <= scenario['cost_limit']) and
        (not scenario.get('emissions_limit') or total_emissions <= scenario['emissions_limit']) and
        overloaded_lines == 0
    )

    return jsonify({
        'current': {
            'pg': total_pg,
            'cost': total_cost,
            'emissions': total_emissions,
            'overloads': overloaded_lines
        },
        'target': {
            'pg': scenario.get('target_mw'),
            'cost': scenario.get('cost_limit'),
            'emissions': scenario.get('emissions_limit'),
            'line_pct': limit_pct
        },
        'overloaded': overloaded_list,
        'highest_load_eff_pct': highest_eff,
        'highest_load_base_pct': highest_base,
        'top_lines_eff': top_eff,
        'top_lines_base': top_base,
        'scenario_met': scenario_met
    })

# === EXPORT CASE118 BRANCH DIRECTIONS =====================
@app.route("/api/branch-directions")
def api_branch_directions():
    """
    Returns the canonical electrical from→to directions
    (fbus→tbus) from the MATPOWER case118 dataset.
    Each entry gives the bus numbers and index.
    """
    try:
        from pypower.api import case118
        case = case118()
        branch = case['branch']
        fbus_col, tbus_col = 0, 1  # MATPOWER standard

        data = []
        for i in range(branch.shape[0]):
            fbus = int(branch[i, fbus_col])
            tbus = int(branch[i, tbus_col])
            # create both a strict id and a UI-friendly key
            data.append({
                "index": i,
                "fbus": fbus,
                "tbus": tbus,
                "id": f"Line_Bus{fbus}_Bus{tbus}",
                "unordered_key": f"{min(fbus,tbus)}|{max(fbus,tbus)}"
            })

        return jsonify({"branches": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
# ==========================================================


if __name__ == '__main__':
    app.run(debug=True)