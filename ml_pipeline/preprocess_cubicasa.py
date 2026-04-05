"""
preprocess_cubicasa.py
──────────────────────
Parses the CubiCasa5K dataset (SVG annotations) into the Archai JSON schema.

Usage:
    python preprocess_cubicasa.py --input ../CubiCasa5k --output ./processed/cubicasa_schema.jsonl

Output: one JSON object per line (JSONL), each matching the Archai schema.
"""

import argparse
import json
import os
import re
import glob
from pathlib import Path

# Optional SVG parser
try:
    import xml.etree.ElementTree as ET
    HAS_ET = True
except ImportError:
    HAS_ET = False

ROOM_TYPE_MAP = {
    # CubiCasa5K label → Archai type
    "Bedroom":        "bedroom",
    "MasterBedroom":  "bedroom",
    "LivingRoom":     "living",
    "Living":         "living",
    "Kitchen":        "kitchen",
    "Bathroom":       "bathroom",
    "Toilet":         "bathroom",
    "WC":             "bathroom",
    "Hallway":        "hallway",
    "Hall":           "hallway",
    "Corridor":       "hallway",
    "Office":         "office",
    "DiningRoom":     "dining",
    "Dining":         "dining",
    "Garage":         "garage",
    "Balcony":        "balcony",
    "Storage":        "storage",
    "Closet":         "storage",
    "Laundry":        "storage",
}

ROOM_SIZE_MIN = {
    "bedroom": 9, "living": 20, "kitchen": 8, "bathroom": 4,
    "hallway": 2, "balcony": 4, "garage": 16, "office": 9,
    "dining": 10, "storage": 2,
}


def map_room_type(raw: str) -> str:
    for key, val in ROOM_TYPE_MAP.items():
        if key.lower() in raw.lower():
            return val
    return "storage"


def bbox_to_room(idx: int, rtype: str, x1: float, y1: float, x2: float, y2: float,
                  scale: float = 0.05) -> dict | None:
    """Convert pixel bounding box to meter-based room dict."""
    x = round(min(x1, x2) * scale, 2)
    z = round(min(y1, y2) * scale, 2)
    w = round(abs(x2 - x1) * scale, 2)
    d = round(abs(y2 - y1) * scale, 2)
    min_a = ROOM_SIZE_MIN.get(rtype, 2)
    if w * d < min_a:
        # Scale up to meet minimum
        factor = (min_a / max(w * d, 0.01)) ** 0.5
        w = round(w * factor, 2)
        d = round(d * factor, 2)
    return {
        "id":  f"r{idx+1}",
        "type": rtype,
        "label": rtype.replace("_", " ").title(),
        "x": x, "z": z,
        "width": w, "depth": d,
        "height": 2.8,
    }


def parse_svg_floor_plan(svg_path: str) -> list[dict]:
    """Extract room bounding boxes from a CubiCasa5K SVG annotation file."""
    rooms = []
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        ns = {"svg": "http://www.w3.org/2000/svg"}

        idx = 0
        for elem in root.iter():
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            # Room polygons/rects are labeled with class or id attributes
            class_attr = elem.get("class", "") or elem.get("id", "")
            rtype = map_room_type(class_attr)

            if tag == "rect":
                try:
                    x1 = float(elem.get("x", 0))
                    y1 = float(elem.get("y", 0))
                    w  = float(elem.get("width", 0))
                    h  = float(elem.get("height", 0))
                    if w > 10 and h > 10:  # skip tiny elements
                        room = bbox_to_room(idx, rtype, x1, y1, x1+w, y1+h)
                        if room:
                            rooms.append(room)
                            idx += 1
                except (ValueError, TypeError):
                    pass

            elif tag == "polygon" or tag == "polyline":
                pts_str = elem.get("points", "")
                pts = [float(v) for v in re.findall(r"[\d.]+", pts_str)]
                if len(pts) >= 4:
                    xs = pts[0::2]
                    ys = pts[1::2]
                    x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
                    if (x2-x1) > 10 and (y2-y1) > 10:
                        room = bbox_to_room(idx, rtype, x1, y1, x2, y2)
                        if room:
                            rooms.append(room)
                            idx += 1
    except Exception as e:
        print(f"  SVG parse error {svg_path}: {e}")
    return rooms


def auto_walls(rooms: list) -> list:
    walls = []
    for i, r in enumerate(rooms):
        x, z, w, d = r["x"], r["z"], r["width"], r["depth"]
        b = f"aw{i}"
        walls += [
            {"id": f"{b}n", "x1": x,   "z1": z,   "x2": x+w, "z2": z,   "thickness": 0.2},
            {"id": f"{b}e", "x1": x+w, "z1": z,   "x2": x+w, "z2": z+d, "thickness": 0.2},
            {"id": f"{b}s", "x1": x+w, "z1": z+d, "x2": x,   "z2": z+d, "thickness": 0.2},
            {"id": f"{b}w", "x1": x,   "z1": z+d, "x2": x,   "z2": z,   "thickness": 0.2},
        ]
    return walls


def rooms_to_schema(rooms: list, source_id: str) -> dict | None:
    if not rooms:
        return None
    type_counts: dict[str, int] = {}
    for r in rooms:
        type_counts[r["type"]] = type_counts.get(r["type"], 0) + 1
    beds  = type_counts.get("bedroom", 0)
    baths = type_counts.get("bathroom", 0)
    btype = "House" if beds >= 3 else "Apartment"
    if beds == 0:
        name = "Studio" if any(r["type"] == "living" for r in rooms) else "Unit"
    else:
        name = f"{beds}-Bedroom {btype}"
    total = round(sum(r["width"] * r["depth"] for r in rooms), 1)
    walls   = auto_walls(rooms)
    doors   = [{"id": f"door_{r['id']}", "roomId": r["id"], "wall": "south", "position": 0.5, "width": 0.9} for r in rooms]
    windows = [{"id": f"win_{r['id']}",  "roomId": r["id"], "wall": "north", "position": 0.5, "width": 1.2, "height": 1.2, "sillHeight": 0.9}
               for r in rooms if r["type"] not in ("bathroom", "storage")]
    return {"_source": source_id, "name": name, "totalArea": total,
            "rooms": rooms, "walls": walls, "doors": doors, "windows": windows}


def process_cubicasa(input_dir: str, output_path: str, limit: int = 0):
    input_path = Path(input_dir)
    svg_files = list(input_path.rglob("*.svg"))
    if not svg_files:
        print(f"No SVG files found in {input_dir}. Checking for floor plan images...")
        # Try image-only mode (no annotations)
        svg_files = list(input_path.rglob("F1_original.png"))[:200]
        if not svg_files:
            print("No CubiCasa5K data found. Generating synthetic samples instead.")
            _generate_synthetic(output_path, n=500)
            return

    if limit:
        svg_files = svg_files[:limit]

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    count = 0
    with open(output_path, "w", encoding="utf-8") as out:
        for svg_file in svg_files:
            source_id = str(svg_file.relative_to(input_path))
            rooms = parse_svg_floor_plan(str(svg_file))
            schema = rooms_to_schema(rooms, source_id)
            if schema and len(schema["rooms"]) >= 2:
                out.write(json.dumps(schema) + "\n")
                count += 1
                if count % 100 == 0:
                    print(f"  Processed {count}/{len(svg_files)} files...")

    print(f"CubiCasa5K: wrote {count} valid layouts to {output_path}")


def _generate_synthetic(output_path: str, n: int = 500):
    """Generate synthetic training data when real dataset is unavailable."""
    import random
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    count = 0
    with open(output_path, "w", encoding="utf-8") as out:
        for i in range(n):
            num_beds = random.choice([1, 2, 2, 3, 3, 4])
            # Arrange in an adjacent grid to prevent overlap
            rooms = [
                {"id": "r1", "type": "living",   "label": "Living Room", "x": 0, "z": 0, "width": 6, "depth": 5, "height": 2.8},
                {"id": "r2", "type": "kitchen",  "label": "Kitchen",     "x": 6, "z": 0, "width": 4, "depth": 4, "height": 2.8},
            ]
            current_x = 0
            current_z = 5
            
            if num_beds >= 2:
                rooms.append({"id": f"r{len(rooms)+1}", "type": "hallway", "label": "Hallway", "x": current_x, "z": current_z, "width": 3, "depth": 2, "height": 2.8})
                current_x += 3

            for j in range(num_beds):
                lbl = "Master Bedroom" if (j == 0 and num_beds >= 3) else f"Bedroom {j+1}"
                rooms.append({"id": f"r{len(rooms)+1}", "type": "bedroom", "label": lbl, "x": current_x, "z": current_z, "width": 4, "depth": 4, "height": 2.8})
                current_x += 4
                if current_x > 10:
                    current_x = 0
                    current_z += 4

            n_baths = max(1, num_beds // 2)
            for j in range(n_baths):
                rooms.append({"id": f"r{len(rooms)+1}", "type": "bathroom", "label": "Bathroom", "x": current_x, "z": current_z, "width": 3, "depth": 2.5, "height": 2.8})
                current_x += 3
                if current_x > 10:
                    current_x = 0
                    current_z += 2.5

            schema = rooms_to_schema(rooms, f"synthetic_{i}")
            if schema:
                out.write(json.dumps(schema) + "\n")
                count += 1
    print(f"Synthetic: wrote {count} layouts to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preprocess CubiCasa5K → Archai JSON schema")
    parser.add_argument("--input",  default="../CubiCasa5k", help="Path to CubiCasa5k root directory")
    parser.add_argument("--output", default="./processed/cubicasa_schema.jsonl")
    parser.add_argument("--limit",  type=int, default=0, help="Max files to process (0=all)")
    args = parser.parse_args()
    process_cubicasa(args.input, args.output, args.limit)
