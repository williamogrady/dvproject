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
        if not success:
            return jsonify({'error': 'Power flow failed'}), 500

        generators = grid.get_generators()
        lines = grid.get_branches()

        # 🔍 Debug print:
        print("🔍 Sample generator:", generators[0])
        print("🔍 Sample line:", lines[0])
        print("✅ About to return response")

        return jsonify({
            'generators': generators,
            'lines': lines
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)
