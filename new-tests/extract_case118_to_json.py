# extract_case118_to_json.py
# --------------------------------------------
# Extracts (fbus, tbus) branch pairs from:
#   1) your local grid.py (default), or
#   2) PYPOWER's case118 (with --use-pypower)
# and saves them as JSON (and optional CSV).
#
# Usage:
#   python extract_case118_to_json.py \
#       --grid ./grid.py \
#       --out-json ./case118_branches.json \
#       --out-csv  ./case118_branches.csv
#
#   python extract_case118_to_json.py \
#       --use-pypower \
#       --out-json ./case118_branches.json
# --------------------------------------------

import argparse
import importlib.util
import json
import os
import sys
from typing import List, Tuple, Any, Optional

def dynamic_import(py_path: str, module_name: str = "grid_module"):
    spec = importlib.util.spec_from_file_location(module_name, py_path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Could not load module from {py_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)  # type: ignore
    return mod

def to_2d_array(x: Any) -> Optional[list]:
    # very permissive: list-of-lists or something with .tolist()
    try:
      if hasattr(x, "tolist"):
          x = x.tolist()
      if isinstance(x, list) and x and isinstance(x[0], (list, tuple)):
          return [list(r) for r in x]
      if isinstance(x, list) and all(isinstance(r, (list, tuple)) for r in x):
          return [list(r) for r in x]
    except Exception:
      return None
    return None

def extract_pairs_from_branch(branch_2d: list) -> List[Tuple[int, int]]:
    pairs: List[Tuple[int, int]] = []
    for row in branch_2d:
        if len(row) >= 2:
            try:
                f = int(float(row[0]))
                t = int(float(row[1]))
                pairs.append((f, t))
            except Exception:
                pass
    return pairs

def find_branch_arrays_in_grid_module(mod) -> List[list]:
    candidates: List[list] = []

    # 1) dicts with 'branch' (e.g., ppc['branch'])
    for name in dir(mod):
        obj = getattr(mod, name)
        if isinstance(obj, dict) and "branch" in obj:
            arr = to_2d_array(obj["branch"])
            if arr:
                candidates.append(arr)

    # 2) objects with .branch
    for name in dir(mod):
        obj = getattr(mod, name)
        if hasattr(obj, "branch"):
            arr = to_2d_array(getattr(obj, "branch"))
            if arr:
                candidates.append(arr)

    # 3) loose arrays with suggestive names
    for name in dir(mod):
        if any(h in name.lower() for h in ["branch", "ppc", "case", "matpower"]):
            obj = getattr(mod, name)
            arr = to_2d_array(obj)
            if arr:
                candidates.append(arr)

    # dedupe by id
    uniq, seen = [], set()
    for a in candidates:
        if id(a) not in seen:
            uniq.append(a)
            seen.add(id(a))
    return uniq

def write_json(path: str, pairs: List[Tuple[int,int]]):
    data = [{"fbus": f, "tbus": t} for f, t in pairs]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"[OK] Wrote JSON → {path} ({len(pairs)} rows)")

def write_csv(path: str, pairs: List[Tuple[int,int]]):
    with open(path, "w", encoding="utf-8") as f:
        f.write("fbus,tbus\n")
        for fbus, tbus in pairs:
            f.write(f"{fbus},{tbus}\n")
    print(f"[OK] Wrote CSV  → {path} ({len(pairs)} rows)")

def main():
    ap = argparse.ArgumentParser(description="Extract (fbus,tbus) pairs from grid.py or PYPOWER case118")
    ap.add_argument("--grid", default="grid.py", help="Path to your grid.py (default: grid.py)")
    ap.add_argument("--use-pypower", action="store_true", help="Use PYPOWER's case118 instead of grid.py")
    ap.add_argument("--out-json", default="case118_branches.json", help="Output JSON path")
    ap.add_argument("--out-csv", default=None, help="Optional CSV output path")
    args = ap.parse_args()

    pairs: List[Tuple[int,int]] = []

    if args.use_pypower:
        try:
            from pypower.case118 import case118  # type: ignore
            ppc = case118()
            branch = ppc.get("branch", None)
            if not branch:
                raise RuntimeError("ppc has no 'branch' key")
            arr = to_2d_array(branch)
            if not arr:
                raise RuntimeError("Could not interpret ppc['branch'] as a 2D array")
            pairs = extract_pairs_from_branch(arr)
            src = "PYPOWER case118()"
        except Exception as e:
            print(f"[ERR] Failed to use PYPOWER case118: {e}")
            sys.exit(1)
    else:
        if not os.path.exists(args.grid):
            print(f"[ERR] grid.py not found at {args.grid} (or use --use-pypower)")
            sys.exit(1)
        try:
            mod = dynamic_import(args.grid)
            cands = find_branch_arrays_in_grid_module(mod)
            if not cands:
                raise RuntimeError("No branch-like arrays found inside grid.py")
            # Pick the one with most rows
            cands.sort(key=lambda a: len(a), reverse=True)
            pairs = extract_pairs_from_branch(cands[0])
            src = f"{args.grid} (largest branch-like array, rows={len(cands[0])})"
        except Exception as e:
            print(f"[ERR] Failed to extract from grid.py: {e}")
            print("       Try again with --use-pypower if available.")
            sys.exit(1)

    if not pairs:
        print("[ERR] No (fbus,tbus) pairs extracted.")
        sys.exit(1)

    write_json(args.out_json, pairs)
    if args.out_csv:
        write_csv(args.out_csv, pairs)

    print(f"[INFO] Source: {src}")

if __name__ == "__main__":
    main()
