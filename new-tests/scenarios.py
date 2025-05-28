import json
import os

SCENARIO_DIR = os.path.join(os.path.dirname(__file__), 'scenarios')

def load_scenario(scenario_id):
    path = os.path.join(SCENARIO_DIR, f"{scenario_id}.json")
    with open(path, 'r') as f:
        return json.load(f)

def list_all_scenarios():
    scenario_list = []
    for filename in os.listdir(SCENARIO_DIR):
        if filename.endswith(".json"):
            path = os.path.join(SCENARIO_DIR, filename)
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                    # Just return ID + title for dropdown
                    scenario_list.append({
                        "scenario_id": data.get("scenario_id", filename.replace(".json", "")),
                        "title": data.get("title", filename.replace(".json", "").capitalize())
                    })
            except Exception as e:
                print(f"⚠️ Failed to load scenario {filename}: {e}")
    return scenario_list