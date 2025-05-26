import json
import os

SCENARIO_DIR = os.path.join(os.path.dirname(__file__), 'scenarios')

def load_scenario(scenario_id):
    path = os.path.join(SCENARIO_DIR, f"{scenario_id}.json")
    with open(path, 'r') as f:
        return json.load(f)
