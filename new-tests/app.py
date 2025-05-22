# app.py

from flask import Flask, jsonify, request, render_template
from grid import Grid

app = Flask(__name__)
grid = Grid()

@app.route('/')
def index():
    return render_template('case118-data-exploration.html')

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




if __name__ == '__main__':
    app.run(debug=True)
