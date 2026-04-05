"""
Archai Generative AI Backend  v2.0
────────────────────────────────────
POST /generate            { prompt, image? } → full Archai JSON schema
POST /api/generate-layout { prompt }         → legacy { walls: [...] }
GET  /health              → { mode, gemini, lora }

Priority: 1) Gemini 2.0 Flash  2) Local LoRA  3) Smart mock
"""

from __future__ import annotations
import base64, json, os, re, time
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── optional ML deps ────────────────────────────────────────────────────────
try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel, PeftConfig
    HAS_ML_DEPS = True
except ImportError:
    HAS_ML_DEPS = False

# ── optional Gemini dep ──────────────────────────────────────────────────────
try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False
    print("WARNING: google-generativeai not installed. Run: pip install google-generativeai")

# ═══════════════════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════════════════

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyCcyBup1C4YZP4At2Vmo2lz04-704BHYdE")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "ml_pipeline", "archai-lora-model")

ROOM_SIZE_MIN = {
    "bedroom": 9, "living": 20, "kitchen": 8, "bathroom": 4,
    "hallway": 2, "balcony": 4, "garage": 16, "office": 9,
    "dining": 10, "storage": 2,
}

VALID_TYPES = set(ROOM_SIZE_MIN.keys())

NON_ARCH_KEYWORDS = [
    "weather", "news", "stock", "recipe", "joke", "hello", "hi there",
    "what is", "who is", "when did", "translate", "calculate", "poem",
]

SYSTEM_PROMPT = "\n".join([
    "You are an expert architectural designer AI.",
    "Given a natural language description, output ONLY a single valid JSON object.",
    "No markdown fences, no commentary, no explanation. Raw JSON only.",
    "",
    "OUTPUT SCHEMA:",
    "{",
    '  "name": "string",',
    '  "totalArea": number,',
    '  "rooms": [{"id":"r1","type":"bedroom|living|kitchen|bathroom|hallway|office|dining|garage|balcony|storage","label":"string","x":number,"z":number,"width":number,"depth":number,"height":2.8}],',
    '  "walls": [{"id":"w1","x1":number,"z1":number,"x2":number,"z2":number,"thickness":0.2}],',
    '  "doors": [{"id":"d1","roomId":"r1","wall":"north|south|east|west","position":0.5,"width":0.9}],',
    '  "windows": [{"id":"win1","roomId":"r1","wall":"north","position":0.5,"width":1.2,"height":1.2,"sillHeight":0.9}]',
    "}",
    "",
    "STRICT RULES:",
    "1. Rooms MUST NOT overlap. x/z is the top-left corner. All meters.",
    "2. Min areas: bedroom>=9, living>=20, kitchen>=8, bathroom>=4, hallway>=2, balcony>=4, garage>=16, office>=9, dining>=10, storage>=2",
    "3. Every room needs a door. Every room except bathroom/storage needs a window.",
    "4. Multi-bedroom layouts must have a hallway. Kitchen must touch dining or living.",
    "5. Generate walls for all room boundaries (thickness=0.2, height=2.8).",
    "6. OUTPUT ONLY RAW JSON. Absolutely no markdown or code fences.",
])

# ═══════════════════════════════════════════════════════════════════════════
# App
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(title="Archai AI Backend", version="2.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str
    image: Optional[str] = None

class LegacyRequest(BaseModel):
    prompt: str

_gemini_model   = None
_lora_model     = None
_lora_tokenizer = None
USE_LORA_MOCK   = True

# ═══════════════════════════════════════════════════════════════════════════
# Startup
# ═══════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
def load_models():
    global _gemini_model, _lora_model, _lora_tokenizer, USE_LORA_MOCK
    if HAS_GEMINI and GEMINI_API_KEY:
        try:
            genai.configure(api_key=GEMINI_API_KEY)
            _gemini_model = genai.GenerativeModel("gemini-2.0-flash")
            print("OK  Gemini 2.0 Flash ready.")
        except Exception as e:
            print(f"WARN Gemini init failed: {e}")
    if HAS_ML_DEPS and os.path.exists(MODEL_DIR):
        try:
            config = PeftConfig.from_pretrained(MODEL_DIR)
            base = AutoModelForCausalLM.from_pretrained(
                config.base_model_name_or_path, device_map="auto", torch_dtype=torch.float16)
            _lora_model = PeftModel.from_pretrained(base, MODEL_DIR)
            _lora_tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
            USE_LORA_MOCK = False
            print("OK  LoRA model loaded.")
        except Exception as e:
            print(f"ERR LoRA load: {e}")
    else:
        print("INFO No local LoRA model — Gemini/mock active.")

# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _is_non_architectural(prompt: str) -> bool:
    p = prompt.lower().strip()
    if len(p) < 3:
        return True
    return any(kw in p for kw in NON_ARCH_KEYWORDS)

def _is_unrealistic(prompt: str) -> bool:
    import re as _re
    nums = [int(x) for x in _re.findall(r'\d+', prompt)]
    return any(n > 50 for n in nums)

def _extract_json(text: str) -> dict:
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text).strip()
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON found")
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    raise ValueError("Unbalanced JSON")

def _call_gemini(prompt: str, image_b64: Optional[str] = None) -> dict:
    full = f"{SYSTEM_PROMPT}\n\nUser request: {prompt}"
    parts: list = [full]
    if image_b64:
        data = base64.b64decode(image_b64)
        parts.append({"mime_type": "image/jpeg", "data": data})
    response = _gemini_model.generate_content(parts)
    return _extract_json(response.text)

def _repair(layout: dict) -> dict:
    for i, room in enumerate(layout.get("rooms", [])):
        room.setdefault("id", f"r{i+1}")
        room.setdefault("height", 2.8)
        room.setdefault("label", room.get("type", "room").replace("_", " ").title())
        rtype = room.get("type", "bedroom")
        if rtype not in VALID_TYPES:
            room["type"] = "storage"
        min_a = ROOM_SIZE_MIN.get(room.get("type", "bedroom"), 4)
        w, d = room.get("width", 3), room.get("depth", 3)
        if w * d < min_a:
            factor = (min_a / max(w * d, 0.01)) ** 0.5
            room["width"]  = round(w * factor, 2)
            room["depth"]  = round(d * factor, 2)
    layout["totalArea"] = round(
        sum(r.get("width", 0) * r.get("depth", 0) for r in layout.get("rooms", [])), 1)
    layout.setdefault("walls",   [])
    layout.setdefault("doors",   [])
    layout.setdefault("windows", [])
    return layout

def _auto_walls(rooms: list) -> list:
    walls = []
    for idx, r in enumerate(rooms):
        x, z, w, d = r["x"], r["z"], r["width"], r["depth"]
        b = f"w{idx}"
        walls += [
            {"id": f"{b}n", "x1": x,   "z1": z,   "x2": x+w, "z2": z,   "thickness": 0.2},
            {"id": f"{b}e", "x1": x+w, "z1": z,   "x2": x+w, "z2": z+d, "thickness": 0.2},
            {"id": f"{b}s", "x1": x+w, "z1": z+d, "x2": x,   "z2": z+d, "thickness": 0.2},
            {"id": f"{b}w", "x1": x,   "z1": z+d, "x2": x,   "z2": z,   "thickness": 0.2},
        ]
    return walls

# ═══════════════════════════════════════════════════════════════════════════
# Smart mock — context-aware fallback
# ═══════════════════════════════════════════════════════════════════════════

def _mock_layout(prompt: str) -> dict:
    p = prompt.lower()
    num_beds = 0
    for tok, n in [("4-bed",4),("four bedroom",4),("4 bedroom",4),("4-bedroom",4),
                   ("3-bed",3),("three bedroom",3),("3 bedroom",3),("3-bedroom",3),
                   ("2-bed",2),("two bedroom",2),("2 bedroom",2),("2-bedroom",2),
                   ("1-bed",1),("one bedroom",1),("1 bedroom",1),("1-bedroom",1)]:
        if tok in p:
            num_beds = n
            break

    is_studio   = "studio" in p
    is_office   = ("office" in p or "open plan" in p) and num_beds == 0
    has_garage  = "garage"  in p
    has_ofroom  = "office"  in p and num_beds > 0
    has_balcony = "balcony" in p
    has_dining  = "dining"  in p

    if not is_studio and not is_office and num_beds == 0:
        num_beds = 2

    rooms: list = []

    if is_office:
        sw = 10 if ("10x8" in p or "10 x 8" in p) else 8
        dp = 8
        rooms = [
            {"id":"r1","type":"office",  "label":"Open Office","x":0,  "z":0,   "width":sw,  "depth":dp,  "height":2.8},
            {"id":"r2","type":"bathroom","label":"WC",         "x":sw, "z":0,   "width":2.5, "depth":2.5, "height":2.8},
            {"id":"r3","type":"storage", "label":"Storage",   "x":sw, "z":2.5, "width":2.5, "depth":2.0, "height":2.8},
        ]
    elif is_studio:
        rooms = [
            {"id":"r1","type":"living",  "label":"Studio Room","x":0,"z":0,"width":6,"depth":5,"height":2.8},
            {"id":"r2","type":"kitchen", "label":"Kitchen",    "x":6,"z":0,"width":3,"depth":3,"height":2.8},
            {"id":"r3","type":"bathroom","label":"Bathroom",   "x":6,"z":3,"width":3,"depth":2,"height":2.8},
        ]
    else:
        rooms = [
            {"id":"r1","type":"living", "label":"Living Room","x":0,"z":0,"width":6,"depth":5,"height":2.8},
            {"id":"r2","type":"kitchen","label":"Kitchen",    "x":6,"z":0,"width":4,"depth":4,"height":2.8},
        ]
        if has_dining:
            rooms.append({"id":f"r{len(rooms)+1}","type":"dining","label":"Dining Room","x":6,"z":4,"width":4,"depth":3,"height":2.8})
        if num_beds >= 2:
            rooms.append({"id":f"r{len(rooms)+1}","type":"hallway","label":"Hallway","x":0,"z":5,"width":3,"depth":2,"height":2.8})
        bz = 5
        for i in range(num_beds):
            lbl = "Master Bedroom" if (i == 0 and num_beds >= 3) else f"Bedroom {i+1}"
            w   = 5 if (i == 0 and num_beds >= 3) else 4
            rooms.append({"id":f"r{len(rooms)+1}","type":"bedroom","label":lbl,"x":3,"z":bz,"width":w,"depth":4,"height":2.8})
            bz += 4
        n_baths = max(1, num_beds // 2)
        bath_z  = 5
        for i in range(n_baths):
            lbl = f"Bathroom {i+1}" if n_baths > 1 else "Bathroom"
            rooms.append({"id":f"r{len(rooms)+1}","type":"bathroom","label":lbl,"x":0,"z":bath_z,"width":3,"depth":2.5,"height":2.8})
            bath_z += 2.5
        ex = 10
        if has_garage:
            rooms.append({"id":f"r{len(rooms)+1}","type":"garage","label":"Garage","x":ex,"z":0,"width":6,"depth":5,"height":2.8})
            ex += 6
        if has_ofroom:
            rooms.append({"id":f"r{len(rooms)+1}","type":"office","label":"Home Office","x":ex,"z":0,"width":4,"depth":4,"height":2.8})
        if has_balcony:
            rooms.append({"id":f"r{len(rooms)+1}","type":"balcony","label":"Balcony","x":0,"z":-2,"width":4,"depth":2,"height":2.8})

    walls   = _auto_walls(rooms)
    doors   = [{"id":f"door_{r['id']}","roomId":r["id"],"wall":"south","position":0.5,"width":0.9} for r in rooms]
    windows = [{"id":f"win_{r['id']}","roomId":r["id"],"wall":"north","position":0.5,"width":1.2,"height":1.2,"sillHeight":0.9}
               for r in rooms if r["type"] not in ("bathroom","storage")]
    total   = round(sum(r["width"]*r["depth"] for r in rooms), 1)

    if   is_studio:  name = "Studio Apartment"
    elif is_office:  name = "Open Plan Office"
    elif num_beds:
        t    = "House" if (has_garage or num_beds >= 3) else "Apartment"
        name = f"{num_beds}-Bedroom {t}"
    else:            name = "Custom Layout"

    return {"name":name,"totalArea":total,"rooms":rooms,"walls":walls,"doors":doors,"windows":windows}

# ═══════════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {
        "status": "ok",
        "gemini": _gemini_model is not None,
        "lora": not USE_LORA_MOCK,
        "mode": "gemini" if _gemini_model else ("lora" if not USE_LORA_MOCK else "mock"),
    }


@app.post("/generate")
async def generate(req: GenerateRequest):
    """
    Primary endpoint — used by the Archai React frontend.
    Returns full Archai JSON: { name, totalArea, rooms, walls, doors, windows }
    """
    start_time = time.time()
    prompt = req.prompt.strip()

    # ── Input validation ────────────────────────────────────────────────────
    if not prompt:
        return {"error": "I can only generate architectural layouts. Please describe a building or space."}
    if _is_non_architectural(prompt):
        return {"error": "I can only generate architectural layouts. Please describe a building or space."}
    if _is_unrealistic(prompt):
        return {"error": "That layout is too large to generate. Please try a smaller building."}

    layout = None

    # ── 1. Gemini ───────────────────────────────────────────────────────────
    if _gemini_model is not None:
        try:
            layout = _repair(_call_gemini(prompt, req.image))
            print(f"[ARCHAI] Gemini: '{layout.get('name')}' in {time.time()-start_time:.2f}s")
        except Exception as e:
            print(f"[ARCHAI] Gemini error: {e} — falling to mock")

    # ── 2. Local LoRA ───────────────────────────────────────────────────────
    if layout is None and not USE_LORA_MOCK:
        try:
            tag_sys  = "<" + "|system|>"
            tag_user = "<" + "|user|>"
            tag_asst = "<" + "|assistant|>"
            fmt = (f"{tag_sys}\nYou are an architectural AI. Output only Archai JSON.\n"
                   f"{tag_user}\n{prompt}\n{tag_asst}\n")
            inputs = _lora_tokenizer(fmt, return_tensors="pt").to(_lora_model.device)
            with torch.no_grad():
                out = _lora_model.generate(**inputs, max_new_tokens=1024, temperature=0.3, top_p=0.9)
            text = _lora_tokenizer.decode(out[0], skip_special_tokens=True)
            resp = text.split(tag_asst)[-1].strip()
            layout = _repair(_extract_json(resp))
            print(f"[ARCHAI] LoRA: '{layout.get('name')}' in {time.time()-start_time:.2f}s")
        except Exception as e:
            print(f"[ARCHAI] LoRA error: {e} — falling to mock")

    # ── 3. Smart mock ───────────────────────────────────────────────────────
    if layout is None:
        layout = _mock_layout(prompt)
        print(f"[ARCHAI] Mock: '{layout.get('name')}' in {time.time()-start_time:.2f}s")

    elapsed = time.time() - start_time
    print(f"[ARCHAI] Response time: {elapsed:.2f}s for: {prompt!r}")
    if elapsed > 3.0:
        print(f"[ARCHAI] WARNING: Response too slow ({elapsed:.2f}s)")

    return layout


# ── Legacy endpoint (backward compat) ───────────────────────────────────────

@app.post("/api/generate-layout")
async def legacy_generate(req: LegacyRequest):
    """Legacy endpoint — returns { walls: [...] } in old format."""
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    layout = None
    if _gemini_model is not None:
        try:
            layout = _repair(_call_gemini(prompt))
        except Exception:
            pass
    if layout is None:
        layout = _mock_layout(prompt)

    # Convert new schema rooms back to old walls format for legacy consumers
    old_walls = []
    for room in layout.get("rooms", []):
        x, z, w, d = room["x"], room["z"], room["width"], room["depth"]
        old_walls.append({"type": "wall", "start": [x, z],     "end": [x+w, z],   "thickness": 0.2, "height": 2.8})
        old_walls.append({"type": "wall", "start": [x+w, z],   "end": [x+w, z+d], "thickness": 0.2, "height": 2.8})
        old_walls.append({"type": "wall", "start": [x+w, z+d], "end": [x, z+d],   "thickness": 0.2, "height": 2.8})
        old_walls.append({"type": "wall", "start": [x, z+d],   "end": [x, z],     "thickness": 0.2, "height": 2.8})

    return {"walls": old_walls, "rooms": layout.get("rooms", [])}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
