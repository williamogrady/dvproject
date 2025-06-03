# grid.py
from pypower import case118, runpf
from pypower.ppoption import ppoption
import numpy as np
import copy
from scenarios import load_scenario
from generator_info import GENERATOR_FUEL_TYPES, GENERATOR_NAMES

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

        # Assign costs and emissions based on fuel type
        fuel_costs = {
            "coal": 6.0,
            "gas": 7.5,
            "combined": 4.0,
            "hydro": 0.5
        }
        fuel_emissions = {
        "coal": 2.0,     # previously 950
        "gas": 1.2,      # previously 500
        "combined": 0.8, # previously 400
        "hydro": 0
}

        self.cost_per_mw = fuel_costs.get(self.fuel_type, 75)
        self.emissions_per_mw = fuel_emissions.get(self.fuel_type, 500)
        
        self.pmax = float(row[8])
        self.pg = 0
        self.locked = False  # New attribute to track if generator is locked
        self.disabled = False



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
            'locked': getattr(self, 'locked', False)
        }
    
    def set_percent(self, percent):
        percent = max(0, min(100, percent))
        self.pg = (percent / 100.0) * self.pmax


class Branch:
    def __init__(self, index, row):
        self.index = index
        self.from_bus = int(row[0])
        self.to_bus = int(row[1])
        self.rate_a = float(row[5])  # Rating A (limit)
        self.flow = 0.0
        self.overloaded = False

    def update_flow(self, new_row):
        self.flow = abs(new_row[13])  # Real power flow
        self.overloaded = self.flow > self.rate_a

    def to_dict(self):
        return {
            'index': int(self.index),
            'from_bus': int(self.from_bus),
            'to_bus': int(self.to_bus),
            'flow': float(self.flow),
            'rate_a': float(self.rate_a),
            'overloaded': bool(self.overloaded),
            'unavailable': getattr(self, 'unavailable', False)
        }

class Grid:
    def __init__(self):
        self.original_case = case118.case118()
        self.case = copy.deepcopy(self.original_case)
        self.active_scenario = None

        self.generators = [
            Generator(i, row) for i, row in enumerate(self.case['gen'])
            ]
        self.branches = [
            Branch(i, row) for i, row in enumerate(self.case['branch'])
            ]
        
        #Debug: testing overloaded lines
        for branch in self.branches:
            branch.rate_a = 1000  # Set all line limits low

        self.last_total_cost = 0  # ✅ added to prevent errors before toggle

    def update_case_from_objects(self):
        print("🔍 Generator PGs before runpf:", [g.pg for g in self.generators])
        for gen in self.generators:
            pg = gen.pg
            self.case['gen'][gen.index][1] = pg      # column 1 = Pg


    def compute_total_cost(self, results):
        
        """
        total_cost = 0
        Pg_matrix = results['gen'][:, 1]  # PG values after runpf
        gencost = results['gencost']

        for i, row in enumerate(gencost):
            model = int(row[0])
            n = int(row[3])
            coeffs = row[4:4+n]

            # PyPower gives highest-degree term first
            Pg = Pg_matrix[i]
            cost = 0
            for power, coeff in enumerate(reversed(coeffs)):
                cost += coeff * Pg**power
            total_cost += cost

        return float(total_cost)
        """
        return sum(
            gen.pg * gen.cost_per_mw
            for gen in self.generators
        )


    def apply_scenario(self, scenario_id):
        import os
        import json
        

        path = os.path.join("scenarios", f"{scenario_id}.json")
        with open(path, 'r') as f:
            scenario_data = json.load(f)

        self.active_scenario = scenario_data
        initial_outputs = scenario_data.get("initial_outputs", {})

        def extract_bus_id(gid):
            if gid.startswith("Gen") and gid[3:].isdigit():
                return int(gid[3:])
            return None

        disabled_gens = [
            extract_bus_id(gid) for gid in scenario_data.get("disabled_generators", [])
        ]
        disabled_gens = [bus for bus in disabled_gens if bus is not None]

        locked_gens = [
            extract_bus_id(gid) for gid in scenario_data.get("locked_generators", [])
        ]
        locked_gens = [bus for bus in locked_gens if bus is not None]


        for gen in self.generators:
            gen.pg = 0
            gen.disabled = gen.bus in disabled_gens
            gen.locked = gen.bus in locked_gens
            gen.pg = float(initial_outputs.get(f"Gen{gen.bus}", 0))

        for b in self.branches:
            print(f"{b.from_bus} → {b.to_bus} = {b.flow:.2f}")

        # Apply initial outputs
        initial_outputs = scenario_data.get("initial_outputs", {})
        for gen in self.generators:
            gen.pg = float(initial_outputs.get(f"Gen{gen.bus}", 0))

        # Reset branch states
        disabled_lines = scenario_data.get("disabled_lines", [])
        for branch in self.branches:
            line_id = f"Line-{branch.from_bus}-{branch.to_bus}"
            branch.unavailable = line_id in disabled_lines

        # ✅ Return full scenario including title, ID, and limits
        return scenario_data



    def run_power_flow(self):
        self.case = copy.deepcopy(self.original_case)
        self.update_case_from_objects()

        try:
            options = ppoption(VERBOSE=0, OUT_ALL=0)
            print("🚧 CASE GEN BEFORE RUNPF:\n", self.case['gen'])
            results, success = runpf.runpf(self.case, options)
            print("✅ runpf executed, success =", success)
        except Exception as e:
            print("❌ runpf exception:", e)
            success = False
            results = None

        if success:
            self.update_branch_flows(results['branch'])
            self.last_total_cost = self.compute_total_cost(results)
        else:
            print("⚠️ Power flow failed — clearing branch flows")
            success = False
            for branch in self.branches:
                branch.flow = 0.0
                branch.overloaded = False
            self.last_total_cost = None

        return success




    def update_branch_flows(self, new_branch_data):
        for i, branch_data in enumerate(new_branch_data):
            self.branches[i].update_flow(branch_data)


    def compute_total_emissions(self):
        return sum(
            gen.pg * getattr(gen, 'emissions_per_mw', 0)
            for gen in self.generators
        )

    def toggle_generator(self, gen_index):
        if gen_index < 0 or gen_index >= len(self.generators):
            raise IndexError(f"Generator {gen_index} does not exist")

        self.generators[gen_index].toggle()
        return self.run_power_flow()  # ✅ pass success through

    def get_generators(self):
        return [json_clean(gen.to_dict()) for gen in self.generators]

    def get_branches(self):
        return [json_clean(branch.to_dict()) for branch in self.branches]
