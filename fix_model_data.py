"""
Fix and parse model_data.json:
1. Close the truncated JSON array
2. Load all 988 training pairs
3. Build a clean lookup table by input prompt category
4. Export a fixed model_data_fixed.json for backend use
"""
import json

with open('model_data.json', 'r') as f:
    content = f.read()

# Close the truncated array
content_fixed = content.rstrip() + '\n]'

try:
    data = json.loads(content_fixed)
    print(f'Successfully parsed {len(data)} training entries')
except json.JSONDecodeError as e:
    print(f'JSON error: {e}')
    # Try to load as many complete entries as possible
    # by finding the last complete object
    last_good = content_fixed.rfind('  },\n  {')
    if last_good == -1:
        last_good = content_fixed.rfind('  }')
    content_truncated = content_fixed[:last_good + 3] + '\n]'
    data = json.loads(content_truncated)
    print(f'Recovered {len(data)} training entries from truncated dataset')

# Fix rooms: scale from pixel/cm units to metres
SCALE = 0.01

fixed_entries = []
for entry in data:
    inp = entry.get('input', '')
    out = entry.get('output', {})
    rooms = out.get('rooms', [])
    walls = out.get('walls', [])

    # Scale rooms
    scaled_rooms = []
    for r in rooms:
        scaled_rooms.append({
            'type': r.get('type', 'room'),
            'name': r.get('type', 'room').replace('space', '').strip().title(),
            'x': round(r.get('x', 0) * SCALE, 3),
            'y': round(r.get('y', 0) * SCALE, 3),
            'width': round(r.get('width', 4) * SCALE, 3),
            'height': round(r.get('height', 4) * SCALE, 3),
        })

    # Scale walls if present
    scaled_walls = []
    for w in walls:
        scaled_walls.append({
            'x1': round(w.get('x1', 0) * SCALE, 3),
            'y1': round(w.get('y1', 0) * SCALE, 3),
            'x2': round(w.get('x2', 0) * SCALE, 3),
            'y2': round(w.get('y2', 0) * SCALE, 3),
            'thickness': w.get('thickness', 0.2),
            'height': w.get('height', 3.0),
        })

    fixed_entries.append({
        'input': inp,
        'rooms': scaled_rooms,
        'walls': scaled_walls,
    })

print(f'Fixed & scaled {len(fixed_entries)} entries')

# Save the fixed, scaled dataset
with open('model_data_fixed.json', 'w') as f:
    json.dump(fixed_entries, f, indent=2)

print('Saved to model_data_fixed.json')

# Summary stats
room_types = {}
for e in fixed_entries:
    for r in e['rooms']:
        t = r['type']
        room_types[t] = room_types.get(t, 0) + 1

print(f'\nTop 10 room types in dataset:')
for k, v in sorted(room_types.items(), key=lambda x: -x[1])[:10]:
    print(f'  {k}: {v}')
