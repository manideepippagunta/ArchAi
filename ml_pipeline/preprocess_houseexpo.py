"""
preprocess_houseexpo.py
───────────────────────
Parses HouseExpo dataset (JSON files with room_category bounding boxes)
into the Archai JSON schema.

Usage:
    python preprocess_houseexpo.py --input ../HouseExpo --output ./processed/houseexpo_schema.jsonl

HouseExpo JSON structure per file:
  {
    "id": "...",
    "room_num": 5,
    "bbox": {"min": [x1,y1], "max": [x2,y2]},
    "verts": [[x,y], ...],
    "room_category": { "kitchen": [x1,y1,x2,y2], "bathroom": [...] }
  }
"""

import argparse
import json
import os
from pathlib import Path

ROOM_TYPE_MAP = {
    "bedroom":    "bedroom",
    "masterbedroom": "bedroom",
    "livingroom": "living",
    "living":     "living",
    "lounge":     "living",
    "kitchen":    "kitchen",
    "bathroom":   "bathroom",
    "toilet":     "bathroom",
    "wc":         "bathroom",
    "hallway":    "hallway",
    "hall":       "hallway",
    "corridor":   "hallway",
    "office":     "office",
    "study":      "office",
    "diningroom": "dining",
    "dining":     "dining",
    "garage":     "garage",
    "balcony":    "balcony",
    "storage":    "storage",
    "closet":     "storage",
    "laundry":    "storage",
    "utilityroom": "storage",
}

ROOM_SIZE_MIN = {
    "bedroom": 9, "living": 20, "kitchen": 8, "bathroom": 4,
    "hallway": 2, "balcony": 4, "garage": 16, "office": 9,
    "dining": 10, "storage": 2,
}


def map_type(raw: str) -> str:
    key = raw.lower().replace(" ", "").replace("_", "")
    return ROOM_TYPE_MAP.get(key, "storage")


def normalize_bbox(x1: float, y1: float, x2: float, y2: float,
                   scale: float = 1.0) -> tuple:
    """Normalize a bounding box to meters. HouseExpo coords are already in meters."""
    x  = round(min(x1, x2) * scale, 2)
    z  = round(min(y1, y2) * scale, 2)
    w  = round(abs(x2 - x1) * scale, 2)
    d  = round(abs(y2 - y1) * scale, 2)
    return x, z, w, d


def parse_houseexpo_file(filepath: str) -> list[dict]:
    """Parse one HouseExpo JSON file into a list of room dicts."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    room_cat = data.get("room_category", {})
    if not room_cat:
        return []

    # Detect scale: if coordinates look like pixels (>100), divide by ~20
    sample_bbox = next(iter(room_cat.values()))
    try:
        coords = sample_bbox if isinstance(sample_bbox, list) else list(sample_bbox.values())
        max_coord = max(abs(float(c)) for c in coords[:4])
        scale = 0.05 if max_coord > 50 else 1.0
    except Exception:
        scale = 1.0

    rooms = []
    idx   = 0
    for raw_type, bbox in room_cat.items():
        rtype = map_type(raw_type)
        try:
            # bbox can be [x1,y1,x2,y2] list or {"x1":..., "y1":..., ...} dict
            if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
                x1, y1, x2, y2 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
            elif isinstance(bbox, dict):
                x1 = float(bbox.get("x1", bbox.get("min_x", 0)))
                y1 = float(bbox.get("y1", bbox.get("min_y", 0)))
                x2 = float(bbox.get("x2", bbox.get("max_x", 0)))
                y2 = float(bbox.get("y2", bbox.get("max_y", 0)))
            else:
                continue
        except (ValueError, TypeError):
            continue

        x, z, w, d = normalize_bbox(x1, y1, x2, y2, scale)
        if w <= 0 or d <= 0:
            continue

        # Enforce minimum size
        min_a = ROOM_SIZE_MIN.get(rtype, 2)
        if w * d < min_a:
            factor = (min_a / max(w * d, 0.01)) ** 0.5
            w = round(w * factor, 2)
            d = round(d * factor, 2)

        rooms.append({
            "id":    f"r{idx+1}",
            "type":  rtype,
            "label": raw_type.replace("_", " ").title(),
            "x": x, "z": z,
            "width": w, "depth": d,
            "height": 2.8,
        })
        idx += 1

    return rooms


def auto_walls(rooms: list) -> list:
    walls = []
    for i, r in enumerate(rooms):
        x, z, w, d = r["x"], r["z"], r["width"], r["depth"]
        b = f"hw{i}"
        walls += [
            {"id": f"{b}n", "x1": x,   "z1": z,   "x2": x+w, "z2": z,   "thickness": 0.2},
            {"id": f"{b}e", "x1": x+w, "z1": z,   "x2": x+w, "z2": z+d, "thickness": 0.2},
            {"id": f"{b}s", "x1": x+w, "z1": z+d, "x2": x,   "z2": z+d, "thickness": 0.2},
            {"id": f"{b}w", "x1": x,   "z1": z+d, "x2": x,   "z2": z,   "thickness": 0.2},
        ]
    return walls


def to_schema(rooms: list, source_id: str) -> dict | None:
    if not rooms:
        return None
    type_counts: dict[str, int] = {}
    for r in rooms:
        type_counts[r["type"]] = type_counts.get(r["type"], 0) + 1
    beds  = type_counts.get("bedroom", 0)
    btype = "House" if beds >= 3 else "Apartment"
    name  = f"{beds}-Bedroom {btype}" if beds else "Unit"
    total = round(sum(r["width"] * r["depth"] for r in rooms), 1)
    walls   = auto_walls(rooms)
    doors   = [{"id": f"door_{r['id']}", "roomId": r["id"], "wall": "south", "position": 0.5, "width": 0.9} for r in rooms]
    windows = [{"id": f"win_{r['id']}",  "roomId": r["id"], "wall": "north", "position": 0.5, "width": 1.2, "height": 1.2, "sillHeight": 0.9}
               for r in rooms if r["type"] not in ("bathroom", "storage")]
    return {"_source": source_id, "name": name, "totalArea": total,
            "rooms": rooms, "walls": walls, "doors": doors, "windows": windows}


def process_houseexpo(input_dir: str, output_path: str, limit: int = 0):
    input_path = Path(input_dir)
    # HouseExpo stores JSONs in a json/ subdirectory
    json_files = list((input_path / "json").glob("*.json")) if (input_path / "json").exists() else list(input_path.rglob("*.json"))
    # Exclude non-floor-plan JSONs
    json_files = [f for f in json_files if f.stem.isdigit() or len(f.stem) < 20]

    if not json_files:
        print(f"No JSON files found in {input_dir}. Generating synthetic samples...")
        _gen_synthetic(output_path, 500)
        return

    if limit:
        json_files = json_files[:limit]

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    count = 0
    with open(output_path, "w", encoding="utf-8") as out:
        for jf in json_files:
            try:
                rooms = parse_houseexpo_file(str(jf))
            except Exception as e:
                print(f"  Error parsing {jf}: {e}")
                continue
            schema = to_schema(rooms, str(jf.name))
            if schema and len(schema["rooms"]) >= 2:
                out.write(json.dumps(schema) + "\n")
                count += 1
                if count % 500 == 0:
                    print(f"  Processed {count}/{len(json_files)} files...")

    print(f"HouseExpo: wrote {count} valid layouts to {output_path}")


def _gen_synthetic(output_path: str, n: int = 500):
    import random
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    room_templates = [
        ("living",  "Living Room", 0, 0, 6, 5),
        ("kitchen", "Kitchen",     6, 0, 4, 4),
        ("bedroom", "Bedroom 1",   0, 5, 4, 4),
        ("bathroom","Bathroom",    4, 5, 3, 2.5),
    ]
    with open(output_path, "w", encoding="utf-8") as out:
        for i in range(n):
            rooms = []
            for j, (rtype, lbl, x, z, w, d) in enumerate(room_templates):
                rooms.append({"id": f"r{j+1}", "type": rtype, "label": lbl,
                              "x": x, "z": z,
                              "width": w,
                              "depth": d, "height": 2.8})
            schema = to_schema(rooms, f"synthetic_he_{i}")
            if schema:
                out.write(json.dumps(schema) + "\n")
    print(f"Synthetic HouseExpo: wrote {n} layouts to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preprocess HouseExpo → Archai JSON schema")
    parser.add_argument("--input",  default="../HouseExpo", help="Path to HouseExpo root directory")
    parser.add_argument("--output", default="./processed/houseexpo_schema.jsonl")
    parser.add_argument("--limit",  type=int, default=0, help="Max JSON files to process (0=all)")
    args = parser.parse_args()
    process_houseexpo(args.input, args.output, args.limit)
