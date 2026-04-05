"""Quick validation test for all 5 required prompts against the running /generate endpoint."""
import urllib.request, json, time

API = "http://127.0.0.1:8000/generate"
VALID_TYPES = {"bedroom","living","kitchen","bathroom","hallway","office","dining","garage","balcony","storage"}

PROMPTS = [
    "Create a studio apartment",
    "Build a 3-bedroom house with garage",
    "Make an L-shaped 2-bedroom apartment",
    "Design an open plan office 10x8 meters",
    "Create a 4-bedroom house with 2 bathrooms and a balcony",
]

# Edge-case inputs
EDGE_CASES = [
    ("hello",              "non-arch"),
    ("what is the weather","non-arch"),
    ("",                   "empty"),
    ("a room with 1000 bedrooms", "unrealistic"),
]

def validate(d):
    errs = []
    rooms = d.get("rooms", [])
    if not rooms:           errs.append("no rooms")
    if not d.get("walls"):  errs.append("no walls")
    if not d.get("doors"):  errs.append("no doors")
    if not d.get("windows"):errs.append("no windows")
    ids = set()
    for r in rooms:
        rid = r.get("id","?")
        if rid in ids: errs.append(f"dup id: {rid}")
        ids.add(rid)
        rt = r.get("type","")
        if rt not in VALID_TYPES: errs.append(f"bad type: {rt!r}")
    # Overlap check
    for i in range(len(rooms)):
        for j in range(i+1, len(rooms)):
            a, b = rooms[i], rooms[j]
            ax2 = a.get("x",0) + a.get("width",0)
            az2 = a.get("z",0) + a.get("depth",0)
            bx2 = b.get("x",0) + b.get("width",0)
            bz2 = b.get("z",0) + b.get("depth",0)
            if not (ax2 <= b.get("x",0) or bx2 <= a.get("x",0) or
                    az2 <= b.get("z",0) or bz2 <= a.get("z",0)):
                errs.append(f"overlap: {a.get('id')} + {b.get('id')}")
    return errs

def call(prompt):
    body = json.dumps({"prompt": prompt}).encode()
    req  = urllib.request.Request(
        API, data=body,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    return data, time.time() - t0

print("=" * 60)
print("PHASE 3 VALIDATION — 5 Required Prompts")
print("=" * 60)
passed = 0
for prompt in PROMPTS:
    try:
        data, elapsed = call(prompt)
        errs = validate(data)
        ok   = "PASS" if not errs else "FAIL"
        tm   = f"{elapsed:.2f}s" + (" ⚠SLOW" if elapsed >= 3 else "")
        rooms_n  = len(data.get("rooms",[]))
        walls_n  = len(data.get("walls",[]))
        doors_n  = len(data.get("doors",[]))
        wins_n   = len(data.get("windows",[]))
        print(f"\n[{ok}][{tm}] {prompt}")
        print(f"  Name : {data.get('name','?')}")
        print(f"  Area : {data.get('totalArea','?')}m²")
        print(f"  Rooms: {rooms_n}  Walls: {walls_n}  Doors: {doors_n}  Windows: {wins_n}")
        if errs:
            for e in errs: print(f"  ERR  : {e}")
        else:
            passed += 1
    except Exception as ex:
        print(f"\n[ERR] {prompt}: {ex}")

print("\n" + "=" * 60)
print(f"RESULTS: {passed}/{len(PROMPTS)} passed")
print("=" * 60)

print("\n\nPHASE 4 — Edge Case Error Handling")
print("=" * 60)
for prompt, kind in EDGE_CASES:
    try:
        data, elapsed = call(prompt)
        has_error = "error" in data
        has_rooms = bool(data.get("rooms"))
        if kind in ("non-arch","empty","unrealistic"):
            status = "PASS" if has_error and not has_rooms else "FAIL (no error message returned)"
        else:
            status = "PASS" if has_rooms else "FAIL"
        print(f"[{status}] {kind!r}: {prompt!r}")
        if has_error:
            print(f'  error: {data["error"]}')
    except Exception as ex:
        print(f"[ERR] {kind!r}: {ex}")
