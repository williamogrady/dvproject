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
        self.user_active = False  # Track user choice independently from pg
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
            'locked': getattr(self, 'locked', False),
            'user_active': self.user_active  # ✅ New line
        }
    
    def set_percent(self, percent, user_active=None):
        percent = max(0, min(100, percent))
        self.pg = (percent / 100.0) * self.pmax
        if user_active is not None:
            self.user_active = bool(user_active)
        else:
            self.user_active = percent > 0

    def toggle(self):
        # simple on/off: if off → set to 50% as a visible start; if on → 0%
        if self.pg <= 0:
            self.set_percent(50, user_active=True)
        else:
            self.set_percent(0, user_active=False)


class Branch:
    def __init__(self, index, row):
        self.index = index
        self.from_bus = int(row[0])
        self.to_bus   = int(row[1])
        self.rate_a   = float(row[5])  # Rating A (limit)
        self.base_rate_a = self.rate_a  # <-- remember original

        lo, hi = (self.from_bus, self.to_bus) if self.from_bus < self.to_bus else (self.to_bus, self.from_bus)
        self.id = f"Line_Bus{lo}_Bus{hi}"         # <-- stable, UI-compatible ID

        self.flow = 0.0
        self.overloaded = False

    def update_flow(self, new_row):
        self.flow = abs(new_row[13])  # Real power flow
        self.overloaded = self.flow > self.rate_a

    def to_dict(self):
        return {
            'id': self.id,                            # <-- add this
            'index': int(self.index),
            'from_bus': int(self.from_bus),
            'to_bus': int(self.to_bus),
            'flow': float(self.flow),
            'rate_a': float(self.rate_a),
            'overloaded': bool(self.overloaded),
            'unavailable': getattr(self, 'unavailable', False),
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

        self.last_total_cost = 0  # ✅ added to prevent errors before toggle

    # grid.py
    def update_case_from_objects(self):
        print("🔍 Generator PGs before runpf:", [g.pg for g in self.generators])
        for gen in self.generators:
            self.case['gen'][gen.index][1] = float(gen.pg)   # Pg

        # push line limits + availability
        for br in self.branches:
            self.case['branch'][br.index][5]  = float(br.rate_a or 0.0)                       # RATE_A
            self.case['branch'][br.index][10] = 0 if getattr(br, "unavailable", False) else 1 # BR_STATUS




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
        # grid.py (inside Grid.apply_scenario)
        import os, json, re
        from pathlib import Path  # ← add at top of file if not present

        here = Path(__file__).resolve().parent
        path = here / "scenarios" / f"{scenario_id}.json"
        with path.open('r', encoding='utf-8') as f:
            scenario_data = json.load(f)

        self.active_scenario = scenario_data

        # -------- Generators (original behavior) --------
        initial_outputs = scenario_data.get("initial_outputs", {}) or {}

        def extract_bus_id(gid):
            if isinstance(gid, str) and gid.startswith("Gen") and gid[3:].isdigit():
                return int(gid[3:])
            return None

        disabled_gens = [extract_bus_id(gid) for gid in scenario_data.get("disabled_generators", [])]
        locked_gens   = [extract_bus_id(gid) for gid in scenario_data.get("locked_generators", [])]
        disabled_gens = [b for b in disabled_gens if b is not None]
        locked_gens   = [b for b in locked_gens if b is not None]

        for gen in self.generators:
            gen.pg = 0.0
            gen.disabled = gen.bus in disabled_gens
            gen.locked   = gen.bus in locked_gens
            gen.pg = float(initial_outputs.get(f"Gen{gen.bus}", 0) or 0)
            gen.user_active = gen.pg > 0

        # -------- Line sensitivity (NEW) --------
        # Scenario knobs
        gmult      = float(scenario_data.get("line_limit_pct", 1.0) or 1.0)
        overrides  = scenario_data.get("line_limit_overrides", {}) or {}
        default_ra = float(scenario_data.get("default_rate_a", 300.0) or 300.0)
        use_native = bool(scenario_data.get("use_native_rate_a", False))  # opt-in to 9900

        # Normalize helper
        def _norm_from_any(key):
            nums = re.findall(r"(\d+)", str(key))
            if len(nums) >= 2:
                a, b = int(nums[0]), int(nums[1])
                lo, hi = (a, b) if a < b else (b, a)
                return f"Line_Bus{lo}_Bus{hi}"
            return str(key)

        # Reset limits to realistic base * global, then apply per-line overrides
        id_to_branch = {br.id: br for br in self.branches}
        for br in self.branches:
            # Treat 0 or very large (e.g., 9900) as "no native rating"
            native_ok = (br.base_rate_a > 0.0 and br.base_rate_a < 9000.0) if use_native else (br.base_rate_a > 0.0 and br.base_rate_a < 9000.0)
            base = br.base_rate_a if native_ok else default_ra
            br.rate_a = base * gmult

        for key, val in overrides.items():
            lid = _norm_from_any(key)
            br = id_to_branch.get(lid)
            if not br:
                continue
            if isinstance(val, (int, float)):
                br.rate_a = br.rate_a * float(val)
            elif isinstance(val, str) and val.lower().startswith("abs:"):
                try:
                    br.rate_a = float(val.split(":", 1)[1])
                except Exception:
                    pass

        # -------- Disabled lines (flag for UI + PF sync will use it) --------
        disabled_lines = scenario_data.get("disabled_lines", []) or []
        self._disabled_line_ids = set(_norm_from_any(x) for x in disabled_lines)
        for br in self.branches:
            br.unavailable = (br.id in self._disabled_line_ids)

        for br in self.branches[:8]:
            print("[GRID.PY]", br.id, "rate_a:", br.rate_a, "flow:", br.flow, "unavail:", br.unavailable)

        return scenario_data





    # grid.py
    def run_power_flow(self):
        self.case = copy.deepcopy(self.original_case)
        self.update_case_from_objects()

        # ✅ If user/scenario left absolutely everything at 0, give the slack ~100 MW
        if all(gen.pg == 0 for gen in self.generators):
            slack_idx = 0  # case118's first generator is the slack
            self.case['gen'][slack_idx][1] = 100.0
            print("⚠️ All Pg were 0 → setting slack Pg to 100 MW to ensure network isn't trivial.")

        try:
            options = ppoption(VERBOSE=0, OUT_ALL=0)
            print("🚧 CASE GEN BEFORE RUNPF:\n", self.case['gen'])
            results, success = runpf.runpf(self.case, options)
            print("✅ runpf executed, success =", success)
        except Exception as e:
            print("❌ runpf exception:", e)
            success, results = False, None

        if success:
            self.update_branch_flows(results['branch'])
            self.last_total_cost = self.compute_total_cost(results)
        else:
            print("⚠️ Power flow failed — clearing branch flows")
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
