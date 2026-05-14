"""
generate_text_labels.py
───────────────────────
Reads one or more JSONL files of Archai schema layouts
and generates varied natural-language prompts for each,
building the final training_pairs.jsonl file.

Usage:
    python generate_text_labels.py \
        --input ./processed/cubicasa_schema.jsonl ./processed/houseexpo_schema.jsonl \
        --output ./processed/training_pairs.jsonl
"""

import argparse
import json
import os
import random
from pathlib import Path

# ── Prompt templates ────────────────────────────────────────────────────────

def make_prompts(layout: dict) -> list[str]:
    """Generate 5-8 varied prompts for a given layout."""
    rooms       = layout.get("rooms", [])
    total_area  = layout.get("totalArea", 0)
    name        = layout.get("name", "")

    type_counts: dict[str, int] = {}
    for r in rooms:
        t = r.get("type", "storage")
        type_counts[t] = type_counts.get(t, 0) + 1

    beds   = type_counts.get("bedroom", 0)
    baths  = type_counts.get("bathroom", 0)
    has_garage  = type_counts.get("garage", 0) > 0
    has_office  = type_counts.get("office", 0) > 0
    has_balcony = type_counts.get("balcony", 0) > 0
    has_dining  = type_counts.get("dining", 0) > 0
    has_living  = type_counts.get("living", 0) > 0
    is_studio   = beds == 0 and has_living

    room_list_parts = []
    if has_living:  room_list_parts.append("living room")
    if has_dining:  room_list_parts.append("dining room")
    if type_counts.get("kitchen",0): room_list_parts.append("kitchen")
    if baths:       room_list_parts.append(f"{baths} bathroom{'s' if baths>1 else ''}")
    if has_garage:  room_list_parts.append("garage")
    if has_office:  room_list_parts.append("home office")
    if has_balcony: room_list_parts.append("balcony")
    room_list_str = ", ".join(room_list_parts)

    btype = "house" if (has_garage or beds >= 3) else "apartment"
    bed_w = ["one", "two", "three", "four", "five"]
    bed_str = bed_w[beds-1] if 1 <= beds <= 5 else str(beds)

    prompts = []

    if is_studio:
        prompts += [
            "Create a studio apartment",
            "Design a studio flat",
            f"Build a studio apartment, total area about {int(total_area)}m²",
            "Generate a compact studio layout with kitchen and bathroom",
            "Make a one-room apartment layout",
        ]
    elif beds > 0:
        prompts += [
            f"Create a {beds}-bedroom {btype}",
            f"Design a {bed_str}-bedroom {btype}",
            f"Build a {beds}-bedroom {btype} with {room_list_str}",
            f"Generate a {beds} bed {btype} floor plan",
            f"Make a {beds}-bedroom {btype}, total area {int(total_area)} square meters",
        ]
        if baths > 1:
            prompts.append(f"Create a {beds}-bedroom {btype} with {baths} bathrooms")
        if has_garage:
            prompts.append(f"Design a {beds}-bedroom house with a garage")
        if has_balcony:
            prompts.append(f"Build a {beds}-bedroom {btype} with balcony")
        if has_office:
            prompts.append(f"Design a {beds}-bedroom {btype} with home office")
        if has_dining:
            prompts.append(f"Create a {beds}-bedroom {btype} with separate dining room")
    else:
        prompts += [
            "Design an open plan office",
            f"Create an office space of about {int(total_area)}m²",
            "Build a commercial office layout",
        ]

    # Shuffle and take random 5-7
    random.shuffle(prompts)
    n_prompts = len(prompts)
    if n_prompts == 0:
        return []
    limit = min(7, n_prompts)
    lower = min(5, limit)
    return prompts[:random.randint(lower, limit)]


def build_training_pairs(input_paths: list[str], output_path: str):
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)

    all_layouts = []
    for path in input_paths:
        p = Path(path)
        if not p.exists():
            print(f"WARNING: Input file not found: {path} — skipping")
            continue
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    layout = json.loads(line)
                    all_layouts.append(layout)
                except json.JSONDecodeError:
                    pass
        print(f"  Loaded layouts from {path}: {len(all_layouts)} total so far")

    if not all_layouts:
        print("No layouts found. Run preprocess_cubicasa.py and preprocess_houseexpo.py first.")
        return

    pairs = []
    for layout in all_layouts:
        # Strip internal _source key before using as training target
        clean = {k: v for k, v in layout.items() if not k.startswith("_")}
        completion = json.dumps(clean, separators=(",", ":"))
        for prompt in make_prompts(layout):
            pairs.append({"prompt": prompt, "completion": completion})

    random.shuffle(pairs)

    with open(output_path, "w", encoding="utf-8") as out:
        for pair in pairs:
            out.write(json.dumps(pair) + "\n")

    print(f"\nTraining pairs: {len(pairs)} written to {output_path}")
    print(f"Layouts processed: {len(all_layouts)}")
    print(f"Average prompts/layout: {len(pairs)/len(all_layouts):.1f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate text labels for Archai training data")
    parser.add_argument("--input",  nargs="+",
                        default=["./processed/cubicasa_schema.jsonl", "./processed/houseexpo_schema.jsonl"])
    parser.add_argument("--output", default="./processed/training_pairs.jsonl")
    args = parser.parse_args()
    build_training_pairs(args.input, args.output)
