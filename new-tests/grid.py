# grid.py
from pypower import case118, runpf
from pypower.ppoption import ppoption
import numpy as np
import copy
from scenarios import load_scenario
from generator_info import GENERATOR_FUEL_TYPES, GENERATOR_NAMES
import os, json, re  # add to your imports if not present

# Path to the same JSON the UI uses. Adjust if your backend runs from a different cwd.
UI_LINES_JSON_PATH = os.environ.get("UI_LINES_JSON_PATH", "full_lines.json")

_bus_re = re.compile(r"^Bus(\d+)$")

def _bus_num(label: str):
    """Return int bus number from 'BusNNN', else None."""
    if not isinstance(label, str):
        return None
    m = _bus_re.match(label.strip())
    return int(m.group(1)) if m else None

def _load_ui_busbus_map(json_path: str):
    """
    Build a mapping from unordered (lo, hi) bus pair -> a UI line id.
    Prefers ids without a trailing '_2' when duplicates exist.
    Ignores Gen/Load edges; keeps only Bus–Bus lines.
    """
    pair_to_id = {}
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for item in data:
            sid, tid = item.get("source"), item.get("target")
            bs, bt = _bus_num(sid), _bus_num(tid)
            if bs is None or bt is None:
                # skip Gen/Load or anything not Bus–Bus
                continue
            lo, hi = (bs, bt) if bs <= bt else (bt, bs)
            ui_id = item.get("id")
            if not ui_id:
                continue
            # prefer base id over duplicates like *_2
            existing = pair_to_id.get((lo, hi))
            if existing is None or existing.endswith("_2"):
                pair_to_id[(lo, hi)] = ui_id
    except Exception as e:
        print(f"⚠️ Could not load UI lines from {json_path}: {e}")
    return pair_to_id

# --- NEW: normalize scenario "line key" to a (lo, hi) bus pair -------------
def _normalize_line_key_to_pair(key, id_to_pair=None):
    """
    Accepts:
      - exact UI id (e.g., 'Line_Bus48_Bus49')
      - dashed/loose strings ('Line-48-49', '48-49', 'Bus48 -> Bus49')
      - (a,b) tuples / lists
      - dicts: {from_bus,to_bus} or aliases {i,j}/{bus1,bus2}/{from,to}
    Returns (lo, hi) or None.
    """
    # tuple/list
    if isinstance(key, (list, tuple)) and len(key) >= 2:
        a, b = int(key[0]), int(key[1])
        return (a, b) if a <= b else (b, a)

    # dict
    if isinstance(key, dict):
        a = key.get('from_bus') or key.get('i') or key.get('bus1') or key.get('from') or key.get('a')
        b = key.get('to_bus')   or key.get('j') or key.get('bus2') or key.get('to')   or key.get('b')
        if a is not None and b is not None:
            a, b = int(a), int(b)
            return (a, b) if a <= b else (b, a)

    # string: try direct UI id map first, then any two ints in order
    if isinstance(key, str):
        if id_to_pair and key in id_to_pair:
            return id_to_pair[key]
        m = re.search(r'(\d+).*(\d+)', key)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            return (a, b) if a <= b else (b, a)

    return None




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


class Branch:
    def __init__(self, index, row):
        self.index = index
        self.from_bus = int(row[0])
        self.to_bus = int(row[1])
        # Base (from case118) — never change this
        self.rate_base = float(row[5])  # A rating from PYPOWER
        # Multipliers (can be changed by scenario)
        self.limit_pct = 1.0           # global scalar S_g or line_limit_pct
        self.m_line    = 1.0           # per-line nudge (fragile/relief)
        # Runtime
        self.flow = 0.0
        self.overloaded = False
        self.unavailable = False
        self.ui_id = None

    def effective_cap(self) -> float:
        """Effective continuous rating seen by the UI/evaluator."""
        return float(self.rate_base) * float(self.limit_pct) * float(self.m_line)

    def update_flow(self, new_row):
        # PF column 13 (MW from "from" to "to")
        self.flow = float(abs(new_row[13]))
        self.overloaded = self.flow > self.effective_cap()

    def to_dict(self):
        a, b = int(self.from_bus), int(self.to_bus)
        lo, hi = (a, b) if a <= b else (b, a)
        fallback_id = f"Line_Bus{lo}_Bus{hi}"
        ui_id = getattr(self, "ui_id", None)
        line_id = ui_id if ui_id else fallback_id

        rate_eff = self.effective_cap()

        return {
            "id": line_id,
            "from_bus": a,
            "to_bus": b,
            "flow": float(self.flow),
            # Expose both for clarity
            "rate_base": float(self.rate_base),
            "rate_a": float(rate_eff),    # effective continuous cap
            "unavailable": bool(self.unavailable),
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
         # Map PF branches to UI line ids; used to zero mismatches and label ids.
        self._ui_pair_to_id = _load_ui_busbus_map(UI_LINES_JSON_PATH)
        self._ui_pairs = set(self._ui_pair_to_id.keys())
        print(f"🧭 UI bus-bus pairs loaded: {len(self._ui_pairs)} from {UI_LINES_JSON_PATH}")
        #Debug: testing overloaded lines
        #for branch in self.branches:
        #    branch.rate_a = 1000  # Set all line limits low
        # Reverse lookup so scenarios can reference UI ids directly
        self._id_to_pair = {ui_id: pair for pair, ui_id in self._ui_pair_to_id.items()}


        self.last_total_cost = 0  # ✅ added to prevent errors before toggle

    def update_case_from_objects(self):
        print("🔍 Generator PGs before runpf:", [float(getattr(g, "pg", 0.0) or 0.0) for g in self.generators])

        GEN_BUS, PG, QG, QMAX, QMIN, VG, MBASE, GEN_STATUS, PMAX, PMIN = range(10)

        for i, gen in enumerate(self.generators):
            pg_val = float(getattr(gen, "pg", 0.0) or 0.0)
            is_disabled = bool(getattr(gen, "disabled", False))

            # Set on/off status
            self.case['gen'][i, GEN_STATUS] = 0 if is_disabled else 1

            if is_disabled:
                # If disabled: force zero output
                self.case['gen'][i, PG] = 0.0
            else:
                # Ensure feasibility: PMAX must be >= scheduled PG
                current_pmax = float(self.case['gen'][i, PMAX])
                if pg_val > current_pmax:
                    self.case['gen'][i, PMAX] = pg_val
                # Set scheduled PG
                self.case['gen'][i, PG] = pg_val

        # Quick sanity: total scheduled PG right before runpf
        try:
            total_pg = float(np.sum(self.case['gen'][:, PG]))
            print("🧮 Scheduled total PG (MW):", total_pg)
        except Exception as _e:
            print("⚠️ Could not sum scheduled PG:", _e)

    def calibrate_global_rate(self, percentile=0.90, target_level=0.90, exclude_pairs=None):
        """
        Run PF once with neutral multipliers, measure baseline utilizations U_i,
        and compute a global scalar S_g so that the chosen percentile sits at target_level.
        Returns S_g (float). If anything goes wrong, falls back to 0.20.
        """
        # 1) Temporarily neutralize multipliers
        for br in self.branches:
            br.limit_pct = 1.0
            br.m_line = 1.0

        # 2) PF with current generator settings
        _ = self.run_power_flow()

        # 3) Collect baseline utilizations for UI-visible, enabled lines
        utils = []
        excl = set(exclude_pairs or [])
        for br in self.branches:
            a, b = br.from_bus, br.to_bus
            lo, hi = (a, b) if a <= b else (b, a)
            if getattr(br, "unavailable", False):
                continue
            if (lo, hi) not in self._ui_pairs:
                continue
            if (lo, hi) in excl:
                continue
            base = max(1e-6, float(br.rate_base))
            U = abs(float(br.flow)) / base
            utils.append(U)

        if not utils:
            return 0.20  # safe fallback

        utils = np.array(utils, dtype=float)
        uq = float(np.quantile(utils, percentile))
        if uq <= 0:
            return 0.20

        # 4) S_g — if 90th perc is 0.18 and we want 0.90, S_g = 0.18 / 0.90 = 0.20
        S_g = uq / max(1e-6, float(target_level))
        # Optional guardrails so denominators never get too small/large
        S_g = float(np.clip(S_g, 0.10, 0.50))
        return S_g
    
    def debug_utilization_report(self, k=12, tag=""):
        lines = []
        rows = []
        for br in self.branches:
            try:
                eff_cap = br.effective_cap()
                if eff_cap <= 0: 
                    continue
                util = abs(float(br.flow)) / eff_cap
                rows.append((
                    util,
                    getattr(br, "ui_id", f"Line_Bus{min(br.from_bus, br.to_bus)}_Bus{max(br.from_bus, br.to_bus)}"),
                    float(br.flow),
                    float(br.rate_base),
                    float(getattr(br, "limit_pct", 1.0)),
                    float(getattr(br, "m_line", 1.0)),
                    float(eff_cap),
                    bool(getattr(br, "overloaded", False)),
                ))
            except Exception:
                pass
        rows.sort(key=lambda r: r[0], reverse=True)
        header = f"\n====== TOP {k} LINES by utilization (effective) {tag} ======\n"
        header += "util%   id                  flow    base   S_g   m_line   eff_cap   OVER?\n"
        lines.append(header)
        for r in rows[:k]:
            util_pct = f"{100*r[0]:5.1f}%"
            lines.append(f"{util_pct}  {r[1]:20s}  {r[2]:7.1f}  {r[3]:6.1f}  {r[4]:.3f}  {r[5]:.3f}   {r[6]:7.1f}   {r[7]}\n")
        text = "".join(lines)
        print(text)
        self._last_debug_report = text  # <-- save it

    def get_last_debug_report(self):
        return getattr(self, "_last_debug_report", "")





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
            gen.user_active = gen.pg > 0  # ✅ initialize user_active properly

        for b in self.branches:
            print(f"{b.from_bus} → {b.to_bus} = {b.flow:.2f}")

        # Apply initial outputs
        initial_outputs = scenario_data.get("initial_outputs", {})
        for gen in self.generators:
            gen.pg = float(initial_outputs.get(f"Gen{gen.bus}", 0))

        # Reset branch states
        raw_disabled = scenario_data.get("disabled_lines", []) or []
        disabled_pairs = set()
        for key in raw_disabled:
            # accepts "Line_Bus48_Bus49", "Line-48-49", "48-49", {from_bus:48,to_bus:49}, (48,49), etc.
            pair = _normalize_line_key_to_pair(key, getattr(self, "_id_to_pair", None))
            if pair:
                disabled_pairs.add(pair)

        # Keep for later PF enforcement (next step); mark objects for API/UI now
        self._disabled_pairs = disabled_pairs

        for br in self.branches:
            a, b = int(br.from_bus), int(br.to_bus)
            lo, hi = (a, b) if a <= b else (b, a)
            br.unavailable = (lo, hi) in disabled_pairs


        # Global scalar (same as before)
        try:
            limit_pct = float(scenario_data.get("line_limit_pct", 1.0) or 1.0)
        except Exception:
            limit_pct = 1.0

        # Optional: per-line multipliers as an OBJECT map
        # { "Line_Bus68_Bus69": 0.55, "Line_Bus69_Bus77": 0.7, ... }
                # --- Global scalar S_g (calibrated or provided) ---------------------
        stress_cfg = scenario_data.get("stress") or {}
        use_calibration = bool(stress_cfg.get("calibrate", False))
        if use_calibration:
            perc   = float(stress_cfg.get("percentile", 0.90) or 0.90)
            level  = float(stress_cfg.get("target_level", 0.90) or 0.90)
            # Optional: exclude a set of pairs by id list
            excl_keys = stress_cfg.get("exclude_lines") or []
            excl_pairs = set()
            for key in excl_keys:
                pair = _normalize_line_key_to_pair(key, getattr(self, "_id_to_pair", None))
                if pair:
                    excl_pairs.add(pair)
            S_g = self.calibrate_global_rate(percentile=perc, target_level=level, exclude_pairs=excl_pairs)
        else:
            # Backwards-compatible global knob
            try:
                S_g = float(scenario_data.get("line_limit_pct", 1.0) or 1.0)
            except Exception:
                S_g = 1.0
            # Optional safety, keep S_g sensible
            S_g = float(np.clip(S_g, 0.10, 0.50))

        # --- Per-line multipliers (bounded) ---------------------------------
        line_multipliers = scenario_data.get("line_multipliers") or {}
        pair_mult = {}
        for key, val in line_multipliers.items():
            pair = _normalize_line_key_to_pair(key, getattr(self, "_id_to_pair", None))
            if not pair:
                continue
            try:
                mline = float(val)
            except Exception:
                mline = 1.0
            # Boundaries to avoid tiny denominators or absurd relief
            mline = float(np.clip(mline, 0.85, 1.25))
            pair_mult[pair] = mline

        # --- Apply both to branches -----------------------------------------
        for br in self.branches:
            a, b = int(br.from_bus), int(br.to_bus)
            lo, hi = (a, b) if a <= b else (b, a)
            br.limit_pct = float(S_g)
            br.m_line    = float(pair_mult.get((lo, hi), 1.0))



        # ✅ Return full scenario including title, ID, and limits
        # at the end of apply_scenario(...)
        self.run_power_flow()  # run once so the report prints right away
        return scenario_data




    def run_power_flow(self):
        self.case = copy.deepcopy(self.original_case)
        self.update_case_from_objects()


        GEN_BUS, PG, QG, QMAX, QMIN, VG, MBASE, GEN_STATUS, PMAX, PMIN = range(10)
        try:
            for i, gen in enumerate(self.generators):
                pg_val = float(getattr(gen, "pg", 0.0) or 0.0)
                is_disabled = bool(getattr(gen, "disabled", False))

                # status
                self.case['gen'][i, GEN_STATUS] = 0 if is_disabled else 1

                if is_disabled:
                    # force offline & zero output
                    self.case['gen'][i, PG] = 0.0
                else:
                    # ensure PMAX >= desired PG (avoid infeasible case)
                    current_pmax = float(self.case['gen'][i, PMAX])
                    if pg_val > current_pmax:
                        self.case['gen'][i, PMAX] = pg_val
                    # set scheduled PG (initial dispatch)
                    self.case['gen'][i, PG] = pg_val
        except Exception as _e:
            print("⚠️ Failed to apply generator Pg/status to case:", _e)

        try:
            BR_STATUS_COL = 10
            for i, br in enumerate(self.branches):
                # default to enabled unless scenario marked it unavailable
                self.case['branch'][i, BR_STATUS_COL] = 0 if getattr(br, 'unavailable', False) else 1
        except Exception as _e:
            # Non-fatal: we still try to run PF; this just logs what went wrong
            print("⚠️ Failed to apply branch statuses from scenario:", _e)

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
            # 👇 add this
            self.debug_utilization_report(k=12, tag=f"(scenario={self.active_scenario.get('id') if self.active_scenario else ''})")
        else:
            print("⚠️ Power flow failed — clearing branch flows")
            success = False
            # after apply_scenario applies multipliers
            for probe in ["Line_Bus18_Bus19","Line_Bus65_Bus68","Line_Bus68_Bus69"]:
                pair = _normalize_line_key_to_pair(probe, getattr(self, "_id_to_pair", None))
                if pair:
                    for br in self.branches:
                        lo, hi = (min(br.from_bus, br.to_bus), max(br.from_bus, br.to_bus))
                        if (lo, hi) == pair:
                            print("multiplier check:", probe, "=>", br.m_line)


        return success


    def update_branch_flows(self, pf_branch_matrix):
        """
        Copy PF results into Branch objects, then:
        - attach a UI id if we have one
        - zero flow for any PF branch that has no corresponding UI line
        - compute 'overloaded' against the effective cap (limit_pct × m_line × rate_base)
        """
        F_BUS, T_BUS, PF = 0, 1, 13

        for i, br in enumerate(self.branches):
            try:
                f = int(pf_branch_matrix[i, F_BUS])
                t = int(pf_branch_matrix[i, T_BUS])
                lo, hi = (f, t) if f <= t else (t, f)
                ui_id = self._ui_pair_to_id.get((lo, hi))

                # Attach UI id for API output
                setattr(br, "ui_id", ui_id if ui_id else None)

                # Flow from PF
                flow_val = float(pf_branch_matrix[i, PF])

                # If this pair is not present in the UI, zero it to avoid mismatches
                if (lo, hi) not in self._ui_pairs:
                    br.flow = 0.0
                    setattr(br, "ui_mismatch", True)
                    br.overloaded = False
                else:
                    br.flow = abs(flow_val)
                    setattr(br, "ui_mismatch", False)
                    # ✅ overloaded vs effective cap
                    try:
                        br.overloaded = br.flow > br.effective_cap()
                    except Exception:
                        br.overloaded = False

            except Exception as e:
                print(f"⚠️ update_branch_flows row {i} error: {e}")
                br.flow = 0.0
                setattr(br, "ui_mismatch", True)
                br.overloaded = False



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
