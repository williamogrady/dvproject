# grid.py

from pypower import case118, runpf
import numpy as np
import copy

def json_clean(d):
    def safe(v):
        if isinstance(v, (np.bool_, np.bool)): return bool(v)
        if isinstance(v, (np.integer, np.int64)): return int(v)
        if isinstance(v, (np.floating, np.float64)): return float(v)
        return v
    return {k: safe(v) for k, v in d.items()}


class Generator:
    def __init__(self, index, row):
        self.index = index
        self.bus = int(row[0])
        self.pmax = float(row[8])
        self.status = int(row[7])  # 1 = on, 0 = off

    def toggle(self):
        self.status = 0 if self.status == 1 else 1

    def to_dict(self):
        return {
            'index': int(self.index),
            'bus': int(self.bus),
            'pmax': float(self.pmax),
            'status': int(self.status)
        }

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
            'overloaded': bool(self.overloaded)
        }

class Grid:
    def __init__(self):
        self.original_case = case118.case118()
        self.case = copy.deepcopy(self.original_case)

        self.generators = [
            Generator(i, row) for i, row in enumerate(self.case['gen'])
        ]
        self.branches = [
            Branch(i, row) for i, row in enumerate(self.case['branch'])
        ]

    def update_case_from_objects(self):
        for gen in self.generators:
            self.case['gen'][gen.index][7] = gen.status  # update status

    def run_power_flow(self):
        print("🧪 Running power flow...")
        self.case = case118.case118()
        self.update_case_from_objects()

        try:
            from pypower.ppoption import ppoption
            options = ppoption(VERBOSE=0, OUT_ALL=0)  # ✅ silent mode, no print
            results, success = runpf.runpf(self.case, options)
            print("✅ runpf executed, success =", success)
        except Exception as e:
            print("❌ Error running runpf:", e)
            raise

        if success:
            self.update_branch_flows(results['branch'])
            return results
        return None



    def update_branch_flows(self, new_branch_data):
        for i, branch_data in enumerate(new_branch_data):
            self.branches[i].update_flow(branch_data)

    def toggle_generator(self, gen_index):
        if gen_index < 0 or gen_index >= len(self.generators):
            raise IndexError(f"Generator {gen_index} does not exist")
        self.generators[gen_index].toggle()
        results = self.run_power_flow()
        if not results:
            raise RuntimeError("Power flow failed")
        return True

    def get_generators(self):
        return [json_clean(gen.to_dict()) for gen in self.generators]

    def get_branches(self):
        return [json_clean(branch.to_dict()) for branch in self.branches]
