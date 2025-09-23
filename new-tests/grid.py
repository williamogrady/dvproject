from pypower import case118, runpf
from pypower.ppoption import ppoption
import numpy as np
import copy, json, os
from scenarios import load_scenario
from generator_info import GENERATOR_FUEL_TYPES, GENERATOR_NAMES

# Load fuel defaults from JSON once
with open(os.path.join("data", "fuel_defaults.json"), "r") as f:
    FUEL_DEFAULTS = json.load(f)

def json_clean(d):
    def safe(v):
        if isinstance(v, (np.bool_, bool)): return bool(v)
        if isinstance(v, (np.integer, np.int64)): return int(v)
        if isinstance(v, (np.floating, np.float64)): return float(v)
        return v
    return {k: safe(v) for k, v in d.items()}


class Generator:
    def __init__(self, index, row):
        self.index = index
        self.bus = int(row[0])

        self.fuel_type = GENERATOR_FUEL_TYPES.get(self.bus, "gas")
        defaults = FUEL_DEFAULTS.get(self.fuel_type, FUEL_DEFAULTS["gas"])

        # Clamp pmax to [100, 900]
        raw_pmax = float(row[8])
        self.pmax = max(100.0, min(900.0, raw_pmax))

        self.pg = 0
        self.user_active = False
        self.locked = False
        self.disabled = False

        # Costs & emissions
        self.cost_per_mw = defaults["cost_per_mwh"]
        self.emissions_per_mw = defaults["co2_per_mwh"]

    def to_dict(self):
        return {
            'index': int(self.index),
            'bus': int(self.bus),
            'pmax': float(self.pmax),
            'pg': float(self.pg),
            'fuel_type': self.fuel_type,
            'cost_per_mw': self.cost_per_mw,
            'emissions_per_mw': self.emissions_per_mw,
            'station_name': GENERATOR_NAMES.get(self.bus, f"Gen {self.bus}"),
            'disabled': getattr(self, 'disabled', False),
            'locked': getattr(self, 'locked', False),
            'user_active': self.user_active
        }

    def set_percent(self, percent, user_active=None):
        percent = max(0, min(100, percent))
        self.pg = (percent / 100.0) * self.pmax
        if user_active is not None:
            self.user_active = bool(user_active)
        else:
            self.user_active = percent > 0


class Branch:
    def __init__(self, index, row):
        self.index = index
        self.from_bus = int(row[0])
        self.to_bus = int(row[1])
        self.rate_a = float(row[5])  # Rating A
        self.flow = 0.0
        self.overloaded = False
        self.unavailable = False

    def update_flow(self, new_row, limit_pct=1.0):
        self.flow = abs(new_row[13])
        cap = self.rate_a * limit_pct if self.rate_a > 0 else 0
        self.overloaded = (cap > 0) and (self.flow > cap)

    def to_dict(self):
        return {
            'index': int(self.index),
            'from_bus': int(self.from_bus),
            'to_bus': int(self.to_bus),
            'flow': float(self.flow),
            'rate_a': float(self.rate_a),
            'overloaded': bool(self.overloaded),
            'unavailable': self.unavailable
        }


class Grid:
    def __init__(self):
        self.original_case = case118.case118()
        self.case = copy.deepcopy(self.original_case)
        self.active_scenario = None

        self.generators = [Generator(i, row) for i, row in enumerate(self.case['gen'])]
        self.branches = [Branch(i, row) for i, row in enumerate(self.case['branch'])]

        self.line_limit_pct = 1.0
        self.last_total_cost = 0

    def update_case_from_objects(self):
        for gen in self.generators:
            self.case['gen'][gen.index][1] = gen.pg
        # Apply branch availability
        for i, br in enumerate(self.branches):
            self.case['branch'][i][10] = 0 if br.unavailable else 1

    def compute_total_cost(self, results):
        return sum(gen.pg * gen.cost_per_mw for gen in self.generators)

    def compute_total_emissions(self):
        return sum(gen.pg * gen.emissions_per_mw for gen in self.generators)

    def apply_scenario(self, scenario_id):
        path = os.path.join("scenarios", f"{scenario_id}.json")
        with open(path, 'r') as f:
            scenario_data = json.load(f)

        self.active_scenario = scenario_data
        self.line_limit_pct = float(scenario_data.get("line_limit_pct", 1.0))

        disabled_lines = scenario_data.get("disabled_lines", [])
        for br in self.branches:
            line_id = f"Line-{br.from_bus}-{br.to_bus}"
            br.unavailable = line_id in disabled_lines

        initial_outputs = scenario_data.get("initial_outputs", {})
        def bus_id(gid):
            return int(gid[3:]) if gid.startswith("Gen") and gid[3:].isdigit() else None
        disabled_gens = [bus_id(g) for g in scenario_data.get("disabled_generators", []) if bus_id(g)]
        locked_gens   = [bus_id(g) for g in scenario_data.get("locked_generators", []) if bus_id(g)]

        for gen in self.generators:
            gen.disabled = gen.bus in disabled_gens
            gen.locked = gen.bus in locked_gens
            gen.pg = float(initial_outputs.get(f"Gen{gen.bus}", 0))
            gen.user_active = gen.pg > 0

        return scenario_data

    def run_power_flow(self):
        self.case = copy.deepcopy(self.original_case)
        self.update_case_from_objects()
        try:
            options = ppoption(VERBOSE=0, OUT_ALL=0)
            results, success = runpf.runpf(self.case, options)
        except Exception as e:
            success, results = False, None

        if success:
            self.update_branch_flows(results['branch'])
            self.last_total_cost = self.compute_total_cost(results)
            scen = self.active_scenario or {}
            if scen.get("instant_fail") and any(br.overloaded for br in self.branches):
                return False
        else:
            for br in self.branches:
                br.flow = 0.0
                br.overloaded = False
            self.last_total_cost = None
        return success

    def update_branch_flows(self, new_branch_data):
        for i, data in enumerate(new_branch_data):
            self.branches[i].update_flow(data, limit_pct=self.line_limit_pct)

    def toggle_generator(self, gen_index):
        if gen_index < 0 or gen_index >= len(self.generators):
            raise IndexError(f"Generator {gen_index} does not exist")
        g = self.generators[gen_index]
        new_percent = 60 if g.pg <= 1e-6 else 0
        g.set_percent(new_percent, user_active=(new_percent > 0))
        return self.run_power_flow()

    def get_generators(self):
        return [json_clean(gen.to_dict()) for gen in self.generators]

    def get_branches(self):
        return [json_clean(br.to_dict()) for br in self.branches]
