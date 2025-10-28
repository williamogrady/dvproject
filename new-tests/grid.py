# grid.py
from pypower import case118, runpf
from pypower.ppoption import ppoption
import numpy as np
import copy
from scenarios import load_scenario
# grid.py (top imports)
from generator_info import (
    GENERATOR_FUEL_TYPES, GENERATOR_NAMES,
    GEN_COSTS_BY_ID, GEN_EMIS_BY_ID
)

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
            if (lo, hi) is None:
                    print("⚠️ Line", {lo}, "to", {hi}, "missing from _ui_pairs — flow zeroed")
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

        # grid.py :: class Generator.__init__(...)
        self.fuel_type = GENERATOR_FUEL_TYPES.get(self.bus, "gas")

        # NEW: pull per-generator values from generator_info tables
        gkey = f"Gen{self.bus}"
        self.cost_per_mw      = float(GEN_COSTS_BY_ID.get(gkey, 7.0))
        self.emissions_per_mw = float(GEN_EMIS_BY_ID.get(gkey, 4.0))

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
        self.flow = 0.0            # magnitude (MW)
        self.flow_signed = 0.0     # signed (MW), + = from_bus→to_bus, - = reverse
        self.direction = 0         # +1 forward, -1 reverse
        self.overloaded = False
        self.unavailable = False
        self.ui_id = None

    def effective_cap(self) -> float:
        """Effective continuous rating seen by the UI/evaluator."""
        return float(self.rate_base) * float(self.limit_pct) * float(self.m_line)

    def update_flow(self, new_row):
        # PF column 13 is MW from "from_bus" → "to_bus"
        self.flow_signed = float(new_row[13])     # ← keep the sign
        self.flow = abs(self.flow_signed)         # magnitude for % load/widths/etc.
        self.direction = 1 if self.flow_signed >= 0 else -1
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

            # === Flow & Direction ===
            "flow": float(self.flow),                  # magnitude (backward-compat)
            "flow_signed": float(self.flow_signed),    # signed MW for direction
            "dir_sign": 1 if self.direction >= 0 else -1,  # +1: from→to, -1: to→from
            "dir": "from_to" if self.direction >= 0 else "to_from",

            # === Ratings ===
            "rate_base": float(self.rate_base),
            "rate_a": float(rate_eff),

            # === Flags ===
            "unavailable": bool(self.unavailable),
            "overloaded": bool(self.overloaded),
        }

def scale_bus_loads(case, multipliers):
    """
    multipliers: dict {bus_number: scale}  (applies to both Pd and Qd)
    E_final: {69: 1.6, 77: 1.5, 80: 1.5, 81: 1.4}
    """
    BUS_I, PD, QD = 0, 2, 3
    bus = case['bus']
    for i in range(bus.shape[0]):
        b = int(bus[i, BUS_I])
        s = multipliers.get(b)
        if s is not None:
            bus[i, PD] = float(bus[i, PD]) * s
            bus[i, QD] = float(bus[i, QD]) * s
    case['bus'] = bus
    return case




class Grid:
    def __init__(self):
        self.original_case = case118.case118()
        self.case = copy.deepcopy(self.original_case)      # <-- create self.case first
        self._base_gen_pg = self.case['gen'][:, 1].astype(float).copy()  # <-- now safe

        self.active_scenario = None
        self.generators = [Generator(i, row) for i, row in enumerate(self.case['gen'])]
        self.branches   = [Branch(i, row)    for i, row in enumerate(self.case['branch'])]

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

        for br in self.branches:
            a, b = br.from_bus, br.to_bus
            lo, hi = (a, b) if a <= b else (b, a)
            br.ui_id = self._ui_pair_to_id.get((lo, hi), f"Line_Bus{lo}_Bus{hi}")

    def _assign_slack_bus(self):
        # Bus and Gen column indices (MATPOWER)
        BUS_I, BUS_TYPE = 0, 1
        PV, REF = 2, 3
        GEN_BUS, PG, GEN_STATUS, PMAX = 0, 1, 7, 8

        gen  = self.case['gen']
        busm = self.case['bus']

        # Identify user-touched gens
        touched = {i for i, g in enumerate(self.generators) if bool(getattr(g, "user_active", False))}

        def eligible(include_touched=False, restrict_to_agc=False):
            pool = getattr(self, "_agc_pool", set())
            lst = []
            for i in range(gen.shape[0]):
                if int(gen[i, GEN_STATUS]) != 1:
                    continue
                if not include_touched and i in touched:
                    continue
                if float(gen[i, PG]) <= 0.0:
                    continue
                busnum = int(gen[i, GEN_BUS])
                if restrict_to_agc and busnum not in pool:
                    continue
                headroom = float(gen[i, PMAX] - gen[i, PG])
                lst.append((headroom, busnum))
            return lst

        # Priority ladder
        eligible_sets = [
            eligible(False, True),   # 1) AGC pool, not touched
            eligible(False, False),  # 2) Any, not touched
            eligible(True, True),    # 3) AGC pool, even if touched
            eligible(True, False),   # 4) Any, last resort
        ]

        chosen = None
        for cand in eligible_sets:
            if cand:
                _, ref_bus = max(cand, key=lambda t: t[0])
                chosen = ref_bus
                break

        if not chosen:
            # No enabled gens → leave as-is
            return

        # Reset existing REF → PV
        mask_ref = (busm[:, BUS_TYPE] == REF)
        busm[mask_ref, BUS_TYPE] = PV

        # Set chosen bus to REF
        idx = np.where(busm[:, BUS_I].astype(int) == int(chosen))[0]
        if idx.size:
            busm[idx[0], BUS_TYPE] = REF
            src = "AGC pool" if getattr(self, "_agc_pool", None) and chosen in self._agc_pool else "default"
            print(f"🎛️ Slack assigned to Bus {int(chosen)} ({src})")



    def update_case_from_objects(self):
        """
        Soft-distributed balancing:
        • Scenario 'initial_outputs' sets defaults.
        • Generators not listed start OFF but enabled (user can turn on).
        • disabled=True => hard OFF (GEN_STATUS=0), user cannot turn on.
        • User edits always win (including explicit OFF at 0 MW).
        • If any gens are ON, distribute only a *soft* fraction (alpha) of the
        net mismatch across free (non user-touched) ON generators, with a
        per-gen clamp (±clamp_frac * PMAX). User-touched gens never change here.
        • If no gens are ON, mark de-energized and skip PF upstream.

        Tunables (optional on self):
        self.soft_balance_alpha  ∈ [0,1], default 0.6
        self.soft_balance_clamp_frac ∈ (0,1], default 0.05
        """
        import numpy as np

        # MATPOWER case['gen'] columns
        GEN_BUS, PG, QG, QMAX, QMIN, VG, MBASE, GEN_STATUS, PMAX, PMIN = range(10)

        # Read tunables (with safe defaults)
        alpha = float(getattr(self, "soft_balance_alpha", 0.6))         # how much of the mismatch to pre-close
        clamp_frac = float(getattr(self, "soft_balance_clamp_frac", 0.05))  # per-gen cap as % of PMAX

        # Total active demand (Pd), already scenario-scaled elsewhere
        total_pd = float(np.sum(self.case['bus'][:, 2]))

        # Start from ZERO; fill with scenario/user values
        desired_pg = np.zeros_like(self._base_gen_pg, dtype=float)

        # 1) Apply status & desired_pg from (disabled → user → scenario)
        any_on = False
        for i, gen in enumerate(self.generators):
            is_disabled = bool(getattr(gen, "disabled", False))
            ua = bool(getattr(gen, "user_active", getattr(gen, "touched", False)))
            user_pg = float(getattr(gen, "pg", 0.0) or 0.0)

            # status: disabled => OFF hard; else enabled
            self.case['gen'][i, GEN_STATUS] = 0 if is_disabled else 1

            if is_disabled:
                desired_pg[i] = 0.0  # hard off
            elif ua:
                # user intent always wins (including explicit OFF at 0)
                desired_pg[i] = user_pg
            else:
                # not user-touched → scenario decides ON/OFF (apply_scenario set gen.pg)
                scen_pg = float(getattr(gen, "pg", 0.0) or 0.0)
                desired_pg[i] = scen_pg

            if desired_pg[i] > 0.0:
                any_on = True

            # Ensure PMAX ≥ scheduled PG (avoid trivial infeasibility)
            if desired_pg[i] > float(self.case['gen'][i, PMAX]):
                self.case['gen'][i, PMAX] = desired_pg[i]

        # 2) De-energized flag OR soft distributed balancing among free, scenario-ON gens
        if not any_on:
            # mark: blackout baseline → skip PF, zero flows later
            self._deenergized = True
            # Clear any stale annotations
            for gen in self.generators:
                setattr(gen, "auto_balance_delta", 0.0)
        else:
            self._deenergized = False

            # Clear per-gen auto-balance annotations (UI can show these)
            for gen in self.generators:
                setattr(gen, "auto_balance_delta", 0.0)

            scheduled = float(np.sum(desired_pg))
            deficit = total_pd - scheduled  # >0 means we need more generation

            # Only act if there is a meaningful mismatch
            if abs(deficit) > 1e-6 and alpha > 0.0 and clamp_frac > 0.0:
                # free = enabled, not user-touched, and currently ON (desired_pg>0)
                free_idx = []
                for i, gen in enumerate(self.generators):
                    is_enabled = (self.case['gen'][i, GEN_STATUS] == 1)
                    ua = bool(getattr(gen, "user_active", getattr(gen, "touched", False)))
                    if is_enabled and (not ua) and (desired_pg[i] > 0.0):
                        free_idx.append(i)

                # Fallback: if user touched everything, spread across all enabled gens
                if not free_idx:
                    for i, gen in enumerate(self.generators):
                        if self.case['gen'][i, GEN_STATUS] == 1:
                            free_idx.append(i)

                if free_idx:
                    # Participation weights: prefer current desired outputs; fallback to PMAX
                    base = desired_pg[free_idx].copy()
                    if float(np.sum(base)) <= 1e-9:
                        base = np.maximum(self.case['gen'][free_idx, PMAX], 1e-3)
                    weights = base / float(np.sum(base))

                    # SOFT distribution: only a fraction of the mismatch
                    soft_deficit = alpha * deficit

                    # Apply bounded adjustments
                    for k, j in enumerate(free_idx):
                        pmax_j = float(self.case['gen'][j, PMAX])
                        delta_j = float(soft_deficit) * float(weights[k])

                        # clamp by ±(clamp_frac * PMAX)
                        cap = clamp_frac * pmax_j
                        if delta_j > cap:  delta_j = cap
                        if delta_j < -cap: delta_j = -cap

                        # respect physical limits
                        new_pg = float(np.clip(desired_pg[j] + delta_j, 0.0, pmax_j))
                        gen_delta = new_pg - desired_pg[j]
                        desired_pg[j] = new_pg

                        # record for UI
                        self.generators[j].auto_balance_delta = float(gen_delta)

        # 3) Write initial dispatch for PF
        self.case['gen'][:, PG] = desired_pg

        # Debug
        try:
            print("🧮 Scheduled total PG (MW):", float(np.sum(self.case['gen'][:, PG])))
            print("🔌 De-energized:", bool(getattr(self, "_deenergized", False)))
            # Optional: quick summary of auto-balance
            total_auto = sum(float(getattr(g, "auto_balance_delta", 0.0)) for g in self.generators)
            if abs(total_auto) > 1e-6:
                print(f"🪄 Auto-balance distributed (pre-PF): {total_auto:+.2f} MW "
                    f"(alpha={alpha}, clamp={clamp_frac*100:.1f}% PMAX)")
        except Exception as _e:
            print("⚠️ Could not sum scheduled PG:", _e)




    def calibrate_global_rate(self, percentile=0.90, target_level=0.90, exclude_pairs=None):
        """
        Run PF once with neutral multipliers, measure baseline utilizations U_i,
        and compute a global scalar S_g so that the chosen percentile sits at target_level.
        Returns S_g (float). Falls back to 0.20 only if we truly have no data.
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

        uq = float(np.quantile(np.array(utils, dtype=float), percentile))
        if uq <= 0 or target_level <= 1e-6:
            return 0.20

        # No clipping: let scenarios dictate stress naturally.
        S_g = uq / float(target_level)
        return float(S_g)

    
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

        # --- NEW: AGC pool (optional) ----------------------------------------------
        agc_pool_buses = []
        for gid in scenario_data.get("agc_pool", []):
            b = extract_bus_id(gid)
            if b is not None:
                agc_pool_buses.append(b)
        self._agc_pool = set(agc_pool_buses)

        # Warn if defined but empty or all invalid
        if scenario_data.get("agc_pool") and not self._agc_pool:
            print("⚠️ AGC pool defined but empty or invalid IDs — falling back to default slack logic.")



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
            # Use scenario-provided knob as-is; default 1.0 (no global scaling)
            try:
                S_g = float(scenario_data.get("line_limit_pct", 1.0) or 1.0)
            except Exception:
                S_g = 1.0

        # --- Per-line multipliers (use scenario values as-is) ---------------
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
            # No clipping — trust the scenario to define sensitivity
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
        # Always start from the original case
        self.case = copy.deepcopy(self.original_case)

        # Update case with current generator/user/scenario state
        self.update_case_from_objects()

        # 🔑 NEW: move slack away from user-touched units so their setpoints stick
        self._assign_slack_bus()

        # Apply branch enable/disable flags from the active scenario (if any)
        try:
            BR_STATUS_COL = 10
            for i, br in enumerate(self.branches):
                self.case['branch'][i, BR_STATUS_COL] = 0 if getattr(br, 'unavailable', False) else 1
        except Exception as _e:
            print("⚠️ Failed to apply branch statuses from scenario:", _e)

        # 🔕 BLACKOUT BASELINE: if de-energized, do NOT run PF → zero flows (prevents slack overloads)
        if getattr(self, "_deenergized", False):
            print("🌑 De-energized grid: skipping PF; zeroing flows & overloads.")
            for br in self.branches:
                br.flow = 0.0
                br.flow_signed = 0.0
                br.direction = 0
                br.overloaded = False
            self.last_total_cost = 0
            # Optional: print a compact debug report to make it visible in logs
            self.debug_utilization_report(k=8, tag="(de-energized)")
            return True

        # Run power flow
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
            self.debug_utilization_report(
                k=12,
                tag=f"(scenario={self.active_scenario.get('id') if self.active_scenario else ''})"
            )
        else:
            print("⚠️ Power flow failed — clearing branch flows")
            for br in self.branches:
                br.flow = 0.0
                br.flow_signed = 0.0
                br.direction = 0
                br.overloaded = False

        return success




    def update_branch_flows(self, pf_branch_matrix):
        F_BUS, T_BUS, PF = 0, 1, 13

        for i, br in enumerate(self.branches):
            try:
                f = int(pf_branch_matrix[i, F_BUS])
                t = int(pf_branch_matrix[i, T_BUS])
                lo, hi = (f, t) if f <= t else (t, f)
                ui_id = self._ui_pair_to_id.get((lo, hi))

                # Attach UI id for API output
                setattr(br, "ui_id", ui_id if ui_id else None)

                # Flow from PF (SIGNED)
                flow_val = float(pf_branch_matrix[i, PF])
                br.flow_signed = flow_val
                br.flow = abs(flow_val)                     # magnitude for % utilization
                br.direction = 1 if flow_val >= 0 else -1   # +1: from→to, -1: to→from

                # If this pair is not present in the UI, zero it to avoid mismatches
                if (lo, hi) not in self._ui_pairs:
                    br.flow = 0.0
                    br.flow_signed = 0.0
                    br.direction = 0
                    setattr(br, "ui_mismatch", True)
                    br.overloaded = False
                else:
                    setattr(br, "ui_mismatch", False)
                    # Overload against effective cap
                    try:
                        br.overloaded = br.flow > br.effective_cap()
                    except Exception:
                        br.overloaded = False

            except Exception as e:
                print(f"⚠️ update_branch_flows row {i} error: {e}")
                br.flow = 0.0
                br.flow_signed = 0.0
                br.direction = 0
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

