# app.py

import traceback
from flask import Flask, render_template, send_from_directory, jsonify, request, abort
from grid import Grid
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

@app.route('/new-tests/<path:filename>')
def serve_new_tests(filename):
    # app.py is inside ...\new-tests, so this points at the new-tests folder itself
    directory = os.path.dirname(os.path.abspath(__file__))
    return send_from_directory(directory, filename)

@app.route("/sequences/<path:filename>")
def serve_sequences(filename):
    base = Path("sequences").resolve()        # points to new-tests/sequences
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

        # ✅ add a tiny debug payload
        dbg = {
            "pf_solved": bool(solved),
            "first_gens_pg": [round(g.pg, 2) for g in grid.generators[:8]],
            "first_branches": [
                {
                    "id": b.id,
                    "flow": round(b.flow, 3),
                    "rate_a": round(b.rate_a, 3),
                    "status": 0 if getattr(b, "unavailable", False) else 1
                } for b in grid.branches[:8]
            ]
        }

        mx = max((b.flow for b in grid.branches), default=0.0)
        mn_ra = min((b.rate_a for b in grid.branches if b.rate_a > 0), default=0.0)
        dbg.update({"max_flow": round(mx, 3), "min_rate_a": round(mn_ra, 3)})

        return jsonify({
            **scenario,
            'generators': grid.get_generators(),
            'lines': grid.get_branches(),
            'total_cost': grid.last_total_cost,
            'solved': solved,
            'debug': dbg   # ✅ here
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
    total_pg = sum(gen.pg for gen in grid.generators)
    total_cost = grid.last_total_cost or 0
    total_emissions = grid.compute_total_emissions()
    overloaded_lines = sum(1 for line in grid.branches if line.flow > line.rate_a)

    scenario = grid.active_scenario or {}

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
            'line_pct': scenario.get('line_limit_pct')
        },
        'scenario_met': scenario_met
    })






if __name__ == '__main__':
    app.run(debug=True)