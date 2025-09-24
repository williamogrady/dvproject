from pypower import case118, runpf
from pypower.ppoption import ppoption
import numpy as np
import copy, json, os
from scenarios import load_scenario
from generator_info import GENERATOR_FUEL_TYPES, GENERATOR_NAMES
import re

import math

def json_clean(d):
    def safe(v):
        # booleans
        if isinstance(v, (np.bool_, bool)): 
            return bool(v)
        # integers
        if isinstance(v, (np.integer, int)): 
            return int(v)
        # floats (numpy or python)
        if isinstance(v, (np.floating, float)):
            fv = float(v)
            # JSON must not contain NaN/Infinity
            if not math.isfinite(fv):
                return 0.0   # or: return None
            return fv
        # pass through others
        return v
    return {k: safe(v) for k, v in d.items()}


def _norm_line_id(a: int, b: int) -> str:
    lo, hi = (a, b) if a <= b else (b, a)
    return f"Line_Bus{lo}_Bus{hi}"

def _parse_line_id_any(s: str) -> tuple[int|None, int|None]:
    """
    Accepts 'Line_Bus12_Bus34', 'Line-12-34', '12-34', 'bus12 to 34', etc.
    Returns (a,b) as ints or (None,None) if no match.
    """
    m = re.findall(r'(\d+)', str(s))
    if len(m) >= 2:
        a, b = int(m[0]), int(m[1])
        return (a, b)
    return (None, None)

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
        # Safe rating
        ra = float(row[5])
        self.rate_a = ra if math.isfinite(ra) and ra > 0 else 300.0  # fallback
        self.flow = 0.0
        self.line_pct = 0.0
        self.overloaded = False
        self.unavailable = False
        self.id = _norm_line_id(self.from_bus, self.to_bus)

    def update_flow(self, new_row, limit_pct=1.0):
        f = float(abs(new_row[13]))  # PF
        self.flow = f if math.isfinite(f) else 0.0

        cap = self.rate_a * limit_pct if self.rate_a > 0 else 0.0
        # pct vs raw rate_a so 100% = at-the-rating
        if self.rate_a > 0:
            pct = (self.flow / self.rate_a) * 100.0
            self.line_pct = pct if math.isfinite(pct) and pct >= 0 else 0.0
        else:
            self.line_pct = 0.0

        # overload respects scenario limit
        self.overloaded = (cap > 0.0) and (self.flow > cap)

    def to_dict(self):
        return json_clean({
            'index': int(self.index),
            'id': self.id,
            'from_bus': int(self.from_bus),
            'to_bus': int(self.to_bus),
            'flow': float(self.flow),
            'rate_a': float(self.rate_a),
            'line_pct': float(self.line_pct),
            'overloaded': bool(self.overloaded),
            'unavailable': bool(self.unavailable)
        })



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

        # Build a set of normalized IDs from whatever strings/objects we get
        disabled_lines_in = scenario_data.get("disabled_lines", [])
        disabled_norm = set()
        for v in disabled_lines_in:
            if isinstance(v, dict):
                a = v.get('from_bus') or v.get('i') or v.get('bus1') or v.get('from') or v.get('a')
                b = v.get('to_bus')   or v.get('j') or v.get('bus2') or v.get('to')   or v.get('b')
                if a is not None and b is not None:
                    disabled_norm.add(_norm_line_id(int(a), int(b)))
            else:
                a, b = _parse_line_id_any(v)
                if a is not None and b is not None:
                    disabled_norm.add(_norm_line_id(a, b))

        for br in self.branches:
            br.unavailable = (br.id in disabled_norm)

        # Generators as before
        initial_outputs = scenario_data.get("initial_outputs", {})
        def bus_id(gid):
            return int(gid[3:]) if isinstance(gid, str) and gid.startswith("Gen") and gid[3:].isdigit() else None
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
                        # --- debug: after PF solve ---
        try:
                bus = results['bus']
                branch = results['branch']
                gen = results['gen']

                Pd_sum = float(np.sum(bus[:, 2]))  # Pd column
                Pg_sum = float(np.sum(gen[:, 1]))  # Pg column
                PF = branch[:, 13]                 # active flow F->T
                nonzero = int(np.sum(np.abs(PF) > 1e-3))
                max_abs = float(np.max(np.abs(PF))) if PF.size else 0.0

                print(f"[PF] success={success} | ΣPd={Pd_sum:.2f} MW | ΣPg={Pg_sum:.2f} MW")
                print(f"[PF] lines with |PF|>1e-3: {nonzero}/{PF.size} | max|PF|={max_abs:.3f}")
                print(f"[PF] sample PF (first 5): {list(np.round(PF[:5], 3))}")
        except Exception as _e:
                print("[PF] debug print failed:", _e)
            # --- end debug ---

            # --- debug: guard we have branch results and populate objects ---
        try:
                branch = results['branch']
                assert branch.shape[0] > 0, "PF branch array empty"
                # propagate PF back into Branch objects
                self.update_branch_flows(branch)
                print(f"[grid.py/run_power_flow] branches now: {len(self.branches)}")
        except Exception as e:
                print("[grid.py/run_power_flow] FAILED to update branches:", e)
            # --- end debug ---


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

        # --- debug: sample a few lines after update ---
        try:
            sample = []
            for br in self.branches[:3]:
                sample.append({
                    "id": br.id,
                    "flow": round(br.flow, 3),
                    "rate_a": round(br.rate_a, 3),
                    "pct": round(br.line_pct, 1),
                    "over": bool(br.overloaded),
                    "unavail": bool(br.unavailable)
                })
            print("[PF->Branch] sample:", sample)
        except Exception as _e:
            print("[PF->Branch] debug print failed:", _e)
        # --- end debug ---


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
