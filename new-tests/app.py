# app.py

from flask import Flask, jsonify, request, render_template
from grid import Grid

app = Flask(__name__)
grid = Grid()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/generators')
def get_generators():
    return jsonify(grid.get_generators())

@app.route('/api/lines')
def get_lines():
    return jsonify(grid.get_branches())

@app.route('/api/toggle/<int:gen_id>', methods=['POST'])
def toggle_generator(gen_id):
    success = grid.toggle_generator(gen_id)
    if not success:
        return jsonify({'error': 'Power flow failed'}), 500

    return jsonify({
        'generators': grid.get_generators(),
        'lines': grid.get_branches()
    })

if __name__ == '__main__':
    app.run(debug=True)
