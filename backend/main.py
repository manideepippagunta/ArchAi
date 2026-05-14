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

SYSTEM_PROMPT = """You are an expert architectural AI assistant specialized in generating accurate 2D floor plans and 3D architectural models. When a user describes a building or space, you must interpret their request and generate a precise architectural design.

You understand and handle all building types including: residential homes (studio apartments, 1 to 6 bedroom houses, villas, townhouses, bungalows, tiny homes), commercial spaces (offices, retail shops, cafés, restaurants, co-working spaces, warehouses), and special purpose buildings (schools, clinics, gyms, hotels).

You always consider the following in every design:
- Exact dimensions in meters (width x depth x height)
- Number of floors and ceiling height per floor
- Room count, room names, and room sizes
- Door and window placement for natural light and ventilation
- Flow and connectivity between rooms (open plan vs closed rooms)
- Structural elements: walls, columns, staircases, and load-bearing elements
- Outdoor features: garden, garage, balcony, terrace, courtyard, pool, driveway
- Style and aesthetic: modern, minimalist, Mediterranean, Japanese, industrial, classical
- Orientation: north-facing, street-facing, garden-facing
- Accessibility: ramps, wide doorways, ground floor bedroom if needed

When the user says something like:
- "Create a 3-bedroom house with garage" → generate a full floor plan with bedrooms, bathrooms, kitchen, living room, and attached garage
- "Build a 6x4 studio apartment" → generate a compact open plan with sleeping area, kitchen, and bathroom
- "Design an open plan office 10x8 meters" → generate a floor plan with desk zones, meeting room, reception, and bathroom
- "Make an L-shaped 2-bedroom apartment with balcony" → generate an L-shaped layout with bedrooms, living room, kitchen, bathroom, and balcony attached
- "Create a 4-bedroom house with 2 bathrooms and a balcony" → generate a two-storey house with master bedroom with ensuite, 3 additional bedrooms, shared bathroom, living room, kitchen, and balcony on the upper floor

Always output:
1. A clean 2D floor plan with labeled rooms and dimensions
2. A 3D model view showing the exterior and interior layout
3. A brief description of the design decisions made

Default assumptions when not specified by the user:
- Ceiling height: 2.8 meters per floor
- Wall thickness: 0.2 meters
- Standard door width: 0.9 meters
- Standard window size: 1.2 x 1.4 meters
- Bathroom minimum size: 2x2 meters
- Bedroom minimum size: 3x3 meters
- Kitchen minimum size: 3x4 meters
- Living room minimum size: 4x5 meters

Style guide defaults:
- Modern style unless specified
- Flat or low-pitched roof unless specified
- Open plan kitchen and living area unless specified otherwise
- Natural light prioritized with windows on south and east walls

🚨 CRITICAL TECHNICAL REQUIREMENT 🚨
You must ALWAYS respond with a STRICT JSON payload matching the Archai schema. 
Even though your goal is to "output" 2D/3D views and descriptions, DO NOT respond with markdown text. 
INSTEAD, return a single JSON object. The frontend Archai app will read your JSON to render the 2D floor plan and 3D model.

The JSON MUST have this structure (include your description in 'description'):
{
  "name": "Design Name",
  "description": "A brief description of design decisions made",
  "floor": { "width": 10, "depth": 10 },
  "walls": [
    { "x1": 0, "y1": 0, "x2": 6, "y2": 0, "thickness": 0.2, "height": 2.8 }
  ],
  "rooms": [
    { "name": "Living Room", "x": 0, "y": 0, "width": 6, "height": 6 }
  ],
  "camera": { "x": 10, "y": 10, "z": 10 },
  "light": { "type": "directional", "intensity": 1 }
}

RULES FOR JSON OUTPUT:
- Place all geometry near origin (0,0).
- Camera MUST be configured: { "x": 10, "y": 10, "z": 10 } so it's not inside walls.
- NO conversational text outside the JSON block. ONLY output pure valid JSON.
"""

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
    layout.setdefault("floor", {"width": 10, "depth": 10})
    if "walls" not in layout or not layout["walls"]:
        layout["walls"] = [
            {"x1": 0, "y1": 0, "x2": 6, "y2": 0},
            {"x1": 6, "y1": 0, "x2": 6, "y2": 6},
            {"x1": 6, "y1": 6, "x2": 0, "y2": 6},
            {"x1": 0, "y1": 6, "x2": 0, "y2": 0}
        ]
    layout.setdefault("camera", {"x": 10, "y": 10, "z": 10})
    layout.setdefault("light", {"type": "directional", "intensity": 1})

    return layout

def _auto_walls(rooms: list) -> list:
    walls = []
    for idx, r in enumerate(rooms):
        x, y, w, h = r["x"], r["y"], r["width"], r["height"]
        walls += [
            {"x1": x,   "y1": y,   "x2": x+w, "y2": y,   "thickness": 0.2, "height": 3},
            {"x1": x+w, "y1": y,   "x2": x+w, "y2": y+h, "thickness": 0.2, "height": 3},
            {"x1": x+w, "y1": y+h, "x2": x,   "y2": y+h, "thickness": 0.2, "height": 3},
            {"x1": x,   "y1": y+h, "x2": x,   "y2": y,   "thickness": 0.2, "height": 3},
        ]
    return walls


# ═══════════════════════════════════════════════════════════════════════════
# Smart mock — context-aware fallback
# ═══════════════════════════════════════════════════════════════════════════

def _load_model_data(prompt: str = "") -> dict:
    """Load a matching layout from the fixed training dataset.
    Uses model_data_fixed.json (pre-scaled to metres).
    """
    import json, os, random
    filepath = os.path.join(os.path.dirname(__file__), "..", "model_data_fixed.json")
    if not os.path.exists(filepath):
        # Fall back to raw model_data.json if fixed file doesn't exist
        filepath = os.path.join(os.path.dirname(__file__), "..", "model_data.json")
        try:
            with open(filepath, "r") as f:
                content = f.read().rstrip() + ']'
            data = json.loads(content)
            # Scale and fix
            entries = []
            for e in data:
                rooms = [{
                    'type': r.get('type','room'),
                    'name': r.get('type','room').replace('space','').strip().title(),
                    'x': r.get('x',0)*0.01, 'y': r.get('y',0)*0.01,
                    'width': r.get('width',4)*0.01, 'height': r.get('height',4)*0.01,
                } for r in e.get('output',{}).get('rooms',[])]
                entries.append({'input': e.get('input',''), 'rooms': rooms, 'walls': []})
        except Exception as ex:
            print(f"[ARCHAI] Could not load model_data.json: {ex}")
            return None
    else:
        try:
            with open(filepath, "r") as f:
                entries = json.load(f)
        except Exception as ex:
            print(f"[ARCHAI] Could not load model_data_fixed.json: {ex}")
            return None

    if not entries:
        return None

    # ── Prompt matching: find entries that match bedroom count / type ──────────
    p = prompt.lower()
    def _beds_in_prompt(text):
        for tok, n in [("5-bed",5),("six bedroom",6),("five bedroom",5),("5 bedroom",5),("5-bedroom",5),
                       ("4-bed",4),("four bedroom",4),("4 bedroom",4),("4-bedroom",4),
                       ("3-bed",3),("three bedroom",3),("3 bedroom",3),("3-bedroom",3),
                       ("2-bed",2),("two bedroom",2),("2 bedroom",2),("2-bedroom",2),
                       ("1-bed",1),("one bedroom",1),("1 bedroom",1),("1-bedroom",1)]:
            if tok in text:
                return n
        return None

    target_beds = _beds_in_prompt(p)
    matched = entries  # default: all

    if "studio" in p:
        matched = [e for e in entries if 'studio' in e['input'].lower()]
    elif target_beds is not None:
        matched = [e for e in entries if _beds_in_prompt(e['input'].lower()) == target_beds]
    elif "office" in p or "commercial" in p:
        matched = [e for e in entries if any(k in e['input'].lower() for k in ['office','commercial'])]

    if not matched:
        matched = entries  # fallback to full dataset

    # Pick a random matching entry
    chosen = random.choice(matched)
    rooms = chosen.get('rooms', [])

    if not rooms:
        return None

    # ── Centre layout around origin ──────────────────────────────────────────
    all_x = [r['x'] + r['width'] for r in rooms]
    all_y = [r['y'] + r['height'] for r in rooms]
    max_x = max(all_x) if all_x else 10
    max_y = max(all_y) if all_y else 10
    cx, cy = max_x / 2, max_y / 2

    centred_rooms = []
    for r in rooms:
        centred_rooms.append({
            **r,
            'x': round(r['x'] - cx, 3),
            'y': round(r['y'] - cy, 3),
        })

    # ── Auto-generate walls from room bounding boxes ──────────────────────────
    walls = _auto_walls(centred_rooms)

    bed_count = sum(1 for r in centred_rooms if 'bedroom' in r.get('type',''))
    layout_name = chosen.get('input', 'House Layout').title()

    return {
        "name": layout_name,
        "description": f"Layout from training dataset: {chosen.get('input', '')}",
        "floor": {"width": round(max_x + 2, 2), "depth": round(max_y + 2, 2)},
        "walls": walls,
        "rooms": centred_rooms,
        "camera": {"x": 0, "y": 15, "z": 15},
        "light": {"type": "directional", "intensity": 1},
    }

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
            {"name":"Open Office", "x":0,  "y":0,   "width":sw,  "height":dp},
            {"name":"WC",          "x":sw, "y":0,   "width":2.5, "height":2.5},
            {"name":"Storage",    "x":sw, "y":2.5, "width":2.5, "height":2.0},
        ]
    elif is_studio:
        rooms = [
            {"name":"Studio Room","x":0,"y":0,"width":6,"height":5},
            {"name":"Kitchen",    "x":6,"y":0,"width":3,"height":3},
            {"name":"Bathroom",   "x":6,"y":3,"width":3,"height":2},
        ]
    else:
        rooms = [
            {"name":"Living Room","x":0,"y":0,"width":6,"height":5},
            {"name":"Kitchen",    "x":6,"y":0,"width":4,"height":4},
        ]
        if has_dining:
            rooms.append({"name":"Dining Room","x":6,"y":4,"width":4,"height":3})
        if num_beds >= 2:
            rooms.append({"name":"Hallway","x":0,"y":5,"width":3,"height":2})
        by = 5
        for i in range(num_beds):
            lbl = "Master Bedroom" if (i == 0 and num_beds >= 3) else f"Bedroom {i+1}"
            w   = 5 if (i == 0 and num_beds >= 3) else 4
            rooms.append({"name":lbl,"x":3,"y":by,"width":w,"height":4})
            by += 4
        n_baths = max(1, num_beds // 2)
        bath_y  = 5
        for i in range(n_baths):
            lbl = f"Bathroom {i+1}" if n_baths > 1 else "Bathroom"
            rooms.append({"name":lbl,"x":0,"y":bath_y,"width":3,"height":2.5})
            bath_y += 2.5
        ex = 10
        if has_garage:
            rooms.append({"name":"Garage","x":ex,"y":0,"width":6,"height":5})
            ex += 6
        if has_ofroom:
            rooms.append({"name":"Home Office","x":ex,"y":0,"width":4,"height":4})
        if has_balcony:
            rooms.append({"name":"Balcony","x":0,"y":-2,"width":4,"height":2})

    total_w = sum(r["width"] for r in rooms) if rooms else 10
    total_h = sum(r["height"] for r in rooms) if rooms else 10
    
    doors = [{"x": r["x"] + r["width"]/2, "y": r["y"] + r["height"], "width": 1, "height": 2} for r in rooms]
    windows = [{"x": r["x"] + r["width"]/2, "y": r["y"], "width": 1.5, "height": 1.2, "sillHeight": 1} for r in rooms if "Bathroom" not in r["name"]]
    
    furniture = []
    for r in rooms:
        if "Bedroom" in r["name"]:
            furniture.append({"type": "bed", "x": r["x"]+1, "y": r["y"]+1, "z": 0, "rotation": 0, "scale": 1})
        elif "Living" in r["name"]:
            furniture.append({"type": "sofa", "x": r["x"]+1, "y": r["y"]+1, "z": 0, "rotation": 0, "scale": 1})
        elif "Kitchen" in r["name"]:
            furniture.append({"type": "stove", "x": r["x"]+1, "y": r["y"]+1, "z": 0, "rotation": 0, "scale": 1})
        elif "Bathroom" in r["name"]:
            furniture.append({"type": "toilet", "x": r["x"]+1, "y": r["y"]+1, "z": 0, "rotation": 0, "scale": 1})

    return {
        "floor": {"width": total_w, "depth": total_h},
        "walls": _auto_walls(rooms),
        "camera": {"x": 10, "y": 10, "z": 10},
        "light": {"type": "directional", "intensity": 1}
    }

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

    # ── 0. USE MODEL_DATA TRAINING DATASET ─────────────────────────────────
    try:
        model_layout = _load_model_data(prompt)
        if model_layout:
            layout = model_layout
            print(f"[ARCHAI] Loaded from model_data dataset for: '{prompt}' in {time.time()-start_time:.2f}s")
            return layout
    except Exception as e:
        print(f"[ARCHAI] Failed loading model_data: {e}")


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

    old_walls = []
    for w in layout.get("walls", []):
        old_walls.append({
            "type": "wall", 
            "start": [w.get("x1", 0), w.get("y1", 0)], 
            "end": [w.get("x2", 0), w.get("y2", 0)], 
            "thickness": w.get("thickness", 0.2), 
            "height": w.get("height", 2.8)
        })

    return {"walls": old_walls, "rooms": []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
