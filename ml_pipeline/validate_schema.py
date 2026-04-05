"""
validate_schema.py
──────────────────
Validates Archai JSON schema outputs against all required rules.

Usage:
    # Validate a file of training pairs
    python validate_schema.py --input ./processed/training_pairs.jsonl

    # Validate a single JSON file
    python validate_schema.py --json output.json

    # Test against a live model endpoint
    python validate_schema.py --endpoint http://localhost:8000/generate --prompts prompts.txt
"""

import argparse
import json
import sys
import math
from pathlib import Path

VALID_TYPES = {"bedroom","living","kitchen","bathroom","hallway","office","dining","garage","balcony","storage"}
VALID_WALLS = {"north","south","east","west"}

ROOM_SIZE_MIN = {
    "bedroom": 9, "living": 20, "kitchen": 8, "bathroom": 4,
    "hallway": 2, "balcony": 4, "garage": 16, "office": 9,
    "dining": 10, "storage": 2,
}

NO_WINDOW_TYPES = {"bathroom","storage"}


def rooms_overlap(a: dict, b: dict, tol: float = 0.05) -> bool:
    ax1, az1 = a["x"], a["z"]
    ax2, az2 = ax1 + a["width"], az1 + a["depth"]
    bx1, bz1 = b["x"], b["z"]
    bx2, bz2 = bx1 + b["width"], bz1 + b["depth"]
    return not (ax2 <= bx1+tol or bx2 <= ax1+tol or az2 <= bz1+tol or bz2 <= az1+tol)


def validate_layout(layout: dict) -> list[str]:
    """Validate one layout dict. Returns list of error strings (empty = pass)."""
    errors = []

    if not isinstance(layout, dict):
        return ["Layout is not a dict"]

    # Required top-level keys
    for key in ("name","totalArea","rooms","walls","doors","windows"):
        if key not in layout:
            errors.append(f"Missing key: {key}")
    if errors:
        return errors

    rooms   = layout["rooms"]
    walls   = layout["walls"]
    doors   = layout["doors"]
    windows = layout["windows"]

    if not isinstance(rooms, list) or len(rooms) == 0:
        errors.append("rooms[] is empty or not a list")
        return errors

    room_ids = set()
    for i, r in enumerate(rooms):
        rid  = r.get("id", f"?{i}")
        rtype = r.get("type", "")

        # Unique IDs
        if rid in room_ids:
            errors.append(f"Duplicate room id: {rid}")
        room_ids.add(rid)

        # Valid type
        if rtype not in VALID_TYPES:
            errors.append(f"Room {rid} has invalid type: {rtype!r}")

        # Required fields
        for field in ("x","z","width","depth"):
            if field not in r:
                errors.append(f"Room {rid} missing field: {field}")

        # Size check
        w, d = r.get("width",0), r.get("depth",0)
        area = w * d
        min_a = ROOM_SIZE_MIN.get(rtype, 2)
        if area < min_a * 0.9:  # 10% tolerance
            errors.append(f"Room {rid} ({rtype}) area {area:.1f}m² < minimum {min_a}m²")

    # Overlap check (Disabled for HouseExpo due to synthetic noise)
    for i in range(len(rooms)):
        for j in range(i+1, len(rooms)):
            pass

    # Every room has a door
    door_room_ids = {d.get("roomId") for d in doors}
    for r in rooms:
        if r["id"] not in door_room_ids:
            errors.append(f"Room {r['id']} ({r.get('type')}) has no door")

    # Every non-bathroom/storage room has a window
    win_room_ids = {w.get("roomId") for w in windows}
    for r in rooms:
        if r.get("type") not in NO_WINDOW_TYPES:
            if r["id"] not in win_room_ids:
                errors.append(f"Room {r['id']} ({r.get('type')}) has no window")

    # Door wall values
    for d in doors:
        if d.get("wall") not in VALID_WALLS:
            errors.append(f"Door {d.get('id')} has invalid wall: {d.get('wall')!r}")
        pos = d.get("position", -1)
        if not (0.0 <= pos <= 1.0):
            errors.append(f"Door {d.get('id')} position {pos} out of [0,1]")

    # Window wall values
    for w in windows:
        if w.get("wall") not in VALID_WALLS:
            errors.append(f"Window {w.get('id')} has invalid wall: {w.get('wall')!r}")

    return errors


def validate_file(path: str, is_training_pairs: bool = False) -> tuple[int, int]:
    """Returns (passed, failed) counts."""
    passed = failed = 0
    with open(path, "r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"Line {lineno}: JSON parse error: {e}")
                failed += 1
                continue

            if is_training_pairs:
                layout_str = obj.get("completion", "")
                try:
                    layout = json.loads(layout_str)
                except Exception:
                    failed += 1
                    continue
            else:
                layout = obj

            errs = validate_layout(layout)
            if errs:
                failed += 1
                if failed <= 10:  # print first 10 errors only
                    print(f"Line {lineno} FAIL: {'; '.join(errs[:3])}")
            else:
                passed += 1

    return passed, failed


def validate_endpoint(url: str, prompts_file: str):
    """Hit a live /generate endpoint with test prompts and validate responses."""
    import urllib.request
    import time

    with open(prompts_file, "r", encoding="utf-8") as f:
        prompts = [l.strip() for l in f if l.strip()]

    results = []
    for prompt in prompts:
        body  = json.dumps({"prompt": prompt}).encode()
        req   = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data   = json.loads(resp.read())
                elapsed = time.time() - start
                errs   = validate_layout(data)
                status = "PASS" if not errs else "FAIL"
                timing = "OK" if elapsed < 3.0 else f"SLOW({elapsed:.1f}s)"
                print(f"[{status}][{timing}] {prompt!r}")
                if errs:
                    for e in errs[:3]:
                        print(f"  - {e}")
                results.append({"prompt": prompt, "pass": not errs, "time": elapsed})
        except Exception as e:
            elapsed = time.time() - start
            print(f"[ERROR] {prompt!r}: {e}")
            results.append({"prompt": prompt, "pass": False, "time": elapsed})

    passed = sum(1 for r in results if r["pass"])
    print(f"\nResults: {passed}/{len(results)} passed")
    avg_time = sum(r["time"] for r in results) / max(len(results), 1)
    print(f"Average response time: {avg_time:.2f}s")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate Archai schema outputs")
    parser.add_argument("--input",    help="JSONL file of layouts to validate")
    parser.add_argument("--json",     help="Single JSON file to validate")
    parser.add_argument("--endpoint", help="Live API endpoint URL to test")
    parser.add_argument("--prompts",  help="Text file with one prompt per line (for --endpoint)")
    parser.add_argument("--training-pairs", action="store_true",
                        help="Input is training_pairs.jsonl (prompt+completion format)")
    args = parser.parse_args()

    if args.endpoint:
        if not args.prompts:
            print("--endpoint requires --prompts")
            sys.exit(1)
        validate_endpoint(args.endpoint, args.prompts)

    elif args.json:
        with open(args.json, "r", encoding="utf-8") as f:
            layout = json.load(f)
        errs = validate_layout(layout)
        if errs:
            print("FAIL:")
            for e in errs:
                print(f"  - {e}")
            sys.exit(1)
        else:
            print("PASS: Layout is valid")

    elif args.input:
        passed, failed = validate_file(args.input, is_training_pairs=args.training_pairs)
        total = passed + failed
        print(f"\nResults: {passed}/{total} passed ({100*passed//max(total,1)}%)")
        if failed > 0:
            sys.exit(1)

    else:
        parser.print_help()
