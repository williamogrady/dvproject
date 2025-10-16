import json

# === CONFIG ===
source_file = "full_nodes.json"        # file that has the rotation attributes
target_file = "full_nodes_new.json"    # file to receive them
output_file = "full_nodes_merged.json" # or overwrite target_file if you prefer

# === LOAD FILES ===
with open(source_file, "r", encoding="utf-8") as f:
    src = {item["id"]: item for item in json.load(f)}

with open(target_file, "r", encoding="utf-8") as f:
    tgt = json.load(f)

# === TRANSFER ATTRIBUTES ===
count = 0
for item in tgt:
    node_id = item.get("id")
    if not node_id:
        continue
    src_item = src.get(node_id)
    if not src_item:
        continue

    for key in ("rotate", "rotateX", "rotateY"):
        if key in src_item:
            item[key] = src_item[key]
    count += 1

print(f"✅ Transferred rotation attributes to {count} matching nodes.")

# === SAVE ===
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(tgt, f, indent=2, ensure_ascii=False)

print(f"💾 Saved merged file → {output_file}")
