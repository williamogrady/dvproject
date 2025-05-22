# grid.py

from pypower import case118, runpf
import numpy as np
import copy

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
            'index': self.index,
            'bus': self.bus,
            'pmax': self.pmax,
            'status': self.status
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
            'index': self.index,
            'from_bus': self.from_bus,
            'to_bus': self.to_bus,
            'flow': self.flow,
            'rate_a': self.rate_a,
            'overloaded': self.overloaded
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
        self.update_case_from_objects()
        results, success = runpf.runpf(self.case, verbose=False)
        if success:
            self.update_branch_flows(results['branch'])
            return results
        return None

    def update_branch_flows(self, new_branch_data):
        for i, branch_data in enumerate(new_branch_data):
            self.branches[i].update_flow(branch_data)

    def toggle_generator(self, gen_index):
        self.generators[gen_index].toggle()
        results = self.run_power_flow()
        return results is not None

    def get_generators(self):
        return [gen.to_dict() for gen in self.generators]

    def get_branches(self):
        return [branch.to_dict() for branch in self.branches]
