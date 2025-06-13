# app.py

import traceback
from flask import Flask, render_template, send_from_directory, jsonify, request
from grid import Grid
import os

app = Flask(__name__, static_folder='css', static_url_path='/css')
grid = Grid()

@app.route("/")
def start():
    return render_template("start.html")

@app.route("/list")
def list_view():
    return render_template("listView-prototype.html")

@app.route("/map")
def map_view():
    return render_template("mapView-prototype.html")

@app.route("/scaling")
def scaling():
    return render_template("/tests/chevronScaling.html")

@app.route('/new-tests/<path:filename>')
def serve_json_from_same_folder(filename):
    directory = os.path.dirname(os.path.abspath(__file__))  # points to /new-tests/
    return send_from_directory(directory, filename)


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