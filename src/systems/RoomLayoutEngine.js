/**
 * RoomLayoutEngine.js
 *
 * Implements the structured AI prompt specification for architectural layout generation.
 * Converts natural language → structured room JSON → walls for the canvas.
 *
 * Spec rules:
 *  - Hall/living room near center
 *  - Bedrooms adjacent but not overlapping
 *  - Kitchen near hall
 *  - Bathroom near bedroom
 *  - Keep entrance accessible
 *  - Min 0.5m spacing between rooms
 *  - Grid-aligned (integer or 0.5 values)
 *  - Boundary: 0–20 units
 */

// ─── Room Size Presets ────────────────────────────────────────────────────────
const ROOM_SIZES = {
    hall:        { width: 5,   height: 4   },
    'living room': { width: 5, height: 4   },
    kitchen:     { width: 3,   height: 3   },
    bedroom:     { width: 4,   height: 4   },
    'master bedroom': { width: 5, height: 4.5 },
    bathroom:    { width: 2.5, height: 2.5 },
    toilet:      { width: 2,   height: 2   },
    office:      { width: 4,   height: 3.5 },
    garage:      { width: 6,   height: 3   },
    studio:      { width: 5,   height: 5   },
    hallway:     { width: 5,   height: 1.5 },
    corridor:    { width: 6,   height: 1.5 },
    dining:      { width: 4,   height: 3   },
    'dining room': { width: 4, height: 3   },
    laundry:     { width: 2.5, height: 2   },
    balcony:     { width: 3,   height: 1.5 },
    storeroom:   { width: 2,   height: 2   },
};

const SPACING = 0; // optimized for shared walls (zero-gap layout)

// ─── Snap to 0.5 grid ─────────────────────────────────────────────────────────
function snap(v) {
    return Math.round(v * 2) / 2;
}

// ─── Overlap check ────────────────────────────────────────────────────────────
function overlaps(a, b) {
    const gap = 0.1; // small margin for walls
    return !(
        a.x + a.width <= b.x - gap ||
        b.x + b.width <= a.x - gap ||
        a.y + a.height <= b.y - gap ||
        b.y + b.height <= a.y - gap
    );
}

function anyOverlap(room, placed) {
    return placed.some(p => overlaps(room, p));
}

// ─── Room placer ──────────────────────────────────────────────────────────────
/**
 * Given an ordered array of room specs (type, width, height),
 * place them in a non-overlapping, spatially logical arrangement.
 */
export function placeRooms(roomSpecs) {
    const placed = [];

    roomSpecs.forEach((spec, i) => {
        const { type, width, height } = spec;
        const w = snap(width);
        const h = snap(height);

        let x = 0, y = 0;

        if (i === 0) {
            // First room (usually hall) → near center of a 20x20 grid
            x = snap(10 - w / 2);
            y = snap(10 - h / 2);
        } else {
            // Try to place adjacent to the most relevant already-placed room
            const ref = findBestNeighbor(type, placed);

            // Try right, then bottom, then left, then top
            const candidates = [
                { x: snap(ref.x + ref.width + SPACING), y: ref.y },
                { x: ref.x, y: snap(ref.y + ref.height + SPACING) },
                { x: snap(ref.x - w - SPACING), y: ref.y },
                { x: ref.x, y: snap(ref.y - h - SPACING) },
                { x: snap(ref.x + ref.width + SPACING), y: snap(ref.y + ref.height / 2 - h / 2) },
                { x: snap(ref.x - w - SPACING), y: snap(ref.y + ref.height / 2 - h / 2) },
            ];

            let placed_pos = null;
            for (const c of candidates) {
                const candidate = { x: c.x, y: c.y, width: w, height: h, type };
                // Clamp to 0–20 boundary
                if (c.x < 0 || c.y < 0 || c.x + w > 22 || c.y + h > 22) continue;
                if (!anyOverlap(candidate, placed)) {
                    placed_pos = c;
                    break;
                }
            }

            if (!placed_pos) {
                // Fallback: scan a grid for a free position
                placed_pos = gridSearch(w, h, placed) || { x: i * (w + SPACING), y: 0 };
            }

            x = placed_pos.x;
            y = placed_pos.y;
        }

        placed.push({ type, x, y, width: w, height: h });
    });

    return placed;
}

/** Find the best already-placed room to be a neighbor for the new room type */
function findBestNeighbor(type, placed) {
    if (placed.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

    const affinities = {
        kitchen:    ['dining room', 'hall', 'living room'],
        'dining room': ['kitchen', 'hall'],
        hallway:    ['hall', 'living room', 'kitchen'], // The hub
        bedroom:    ['hallway', 'hall'], // Connect via hallway if possible
        'master bedroom': ['hallway', 'bedroom'],
        bathroom:   ['bedroom', 'master bedroom', 'hallway'], // Private rooms together
        office:     ['hallway', 'hall'],
        garage:     ['hall', 'kitchen'],
        laundry:    ['kitchen', 'bathroom'],
        balcony:    ['living room', 'bedroom'],
        storeroom:  ['kitchen', 'hallway'],
    };

    const preferred = affinities[type] || [];
    for (const pref of preferred) {
        const match = placed.find(p => p.type === pref);
        if (match) return match;
    }

    // Default: use the last placed room
    return placed[placed.length - 1];
}

/** Scan a grid to find a free position */
function gridSearch(w, h, placed, step = 0.5) {
    for (let y = 0; y <= 20 - h; y += step) {
        for (let x = 0; x <= 20 - w; x += step) {
            const candidate = { x, y, width: w, height: h };
            if (!anyOverlap(candidate, placed)) return { x, y };
        }
    }
    return null;
}

// ─── Rooms → Walls ────────────────────────────────────────────────────────────

let _uid = 0;
const uid = (prefix = 'room') => `${prefix}_${Date.now()}_${++_uid}`;

/**
 * Convert a placed room array into wall segments for the canvas.
 * Adjacent shared walls are de-duplicated (replaced with a thinner divider).
 */
export function roomsToWalls(rooms, wallHeight = 3, offsetX = 0, offsetY = 0) {
    const walls = [];

    rooms.forEach(room => {
        const ox = room.x + offsetX;
        const oy = room.y + offsetY;
        const { width: w, height: h } = room;

        // Check for shared edge with a neighbor → make it a divider (thinner, named)
        const pts = [
            { start: [ox, oy],         end: [ox + w, oy],         dir: 'top' },
            { start: [ox + w, oy],     end: [ox + w, oy + h],     dir: 'right' },
            { start: [ox + w, oy + h], end: [ox, oy + h],         dir: 'bottom' },
            { start: [ox, oy + h],     end: [ox, oy],             dir: 'left' },
        ];

        pts.forEach(({ start, end, dir }) => {
            const isDivider = isSharedEdge(room, dir, rooms);
            walls.push({
                id: uid('wall'),
                type: 'wall',
                name: isDivider
                    ? `${friendlyName(room.type)} / Divider`
                    : `${friendlyName(room.type)} Wall`,
                start: start.map(v => snap(v)),
                end: end.map(v => snap(v)),
                thickness: isDivider ? 0.15 : 0.2,
                height: wallHeight,
            });
        });
    });

    return walls;
}

/** Check if a wall edge is adjacent to (shared with) another room */
function isSharedEdge(room, dir, allRooms) {
    const tol = SPACING + 0.05;
    return allRooms.some(other => {
        if (other === room) return false;
        if (dir === 'right') {
            return Math.abs((room.x + room.width) - other.x) < tol &&
                rangesOverlap(room.y, room.y + room.height, other.y, other.y + other.height);
        }
        if (dir === 'left') {
            return Math.abs(room.x - (other.x + other.width)) < tol &&
                rangesOverlap(room.y, room.y + room.height, other.y, other.y + other.height);
        }
        if (dir === 'bottom') {
            return Math.abs((room.y + room.height) - other.y) < tol &&
                rangesOverlap(room.x, room.x + room.width, other.x, other.x + other.width);
        }
        if (dir === 'top') {
            return Math.abs(room.y - (other.y + other.height)) < tol &&
                rangesOverlap(room.x, room.x + room.width, other.x, other.x + other.width);
        }
        return false;
    });
}

function rangesOverlap(a0, a1, b0, b1) {
    return a0 < b1 && b0 < a1;
}

function friendlyName(type) {
    return type.replace(/\b\w/g, c => c.toUpperCase());
}

// ─── High-level: parse prompt → room specs ───────────────────────────────────

/**
 * Parse a prompt and return a structured room spec list, ready for placeRooms().
 */
export function parsePromptToRoomSpecs(prompt) {
    const t = prompt.toLowerCase();

    // Count bedrooms
    const bedMatch = t.match(/(\d+|one|two|three|four|five)\s*[-\s]?bedroom/i);
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const numBeds = bedMatch
        ? (words[bedMatch[1]] || parseInt(bedMatch[1]) || 2)
        : (t.includes('bedroom') ? 1 : 0);

    const specs = [];

    // Feature toggles
    const hasDining = /\b(dining|dining room)\b/.test(t);
    const hasKitchen = /\b(kitchen)\b/.test(t) || numBeds > 0;
    const hasBathroom = /\b(bathroom|bath|toilet|wc)\b/.test(t);
    const hasGarage = /\b(garage)\b/.test(t);
    const hasOffice = /\b(office|study)\b/.test(t);

    // ─── 1. Public Zone ───────────────────────────────────────────────────────
    specs.push({ type: 'hall', ...ROOM_SIZES['hall'] });
    if (hasKitchen) {
        specs.push({ type: 'kitchen', ...ROOM_SIZES['kitchen'] });
    }
    if (hasDining) {
        specs.push({ type: 'dining room', ...ROOM_SIZES['dining room'] });
    }

    // ─── 2. Circulation Zone (The Hallway) ────────────────────────────────────
    // Only add a dedicated hallway for multi-room layouts to ensure proper flow
    const isMultiRoom = numBeds >= 2 || (numBeds === 1 && hasOffice);
    if (isMultiRoom) {
        specs.push({ type: 'hallway', ...ROOM_SIZES['hallway'] });
    }

    // ─── 3. Private Zone ──────────────────────────────────────────────────────
    const actualBeds = numBeds || (specs.length > 1 ? 2 : 0);
    for (let i = 0; i < actualBeds; i++) {
        const type = i === 0 && actualBeds >= 3 ? 'master bedroom' : 'bedroom';
        specs.push({ type, ...ROOM_SIZES[type] });
    }

    // Bathrooms (efficiently placed near bedrooms)
    const numBaths = hasBathroom ? Math.max(1, actualBeds) : (actualBeds > 0 ? Math.max(1, Math.ceil(actualBeds / 2)) : 0);
    for (let i = 0; i < numBaths; i++) {
        specs.push({ type: 'bathroom', ...ROOM_SIZES['bathroom'] });
    }

    if (hasOffice) specs.push({ type: 'office', ...ROOM_SIZES['office'] });
    if (hasGarage) specs.push({ type: 'garage', ...ROOM_SIZES['garage'] });

    return specs;
}

// ─── Main export: generate full layout ───────────────────────────────────────

/**
 * Full pipeline: prompt → placed rooms → walls
 * Returns { rooms, walls, message }
 */
export function generateLayout(prompt, wallHeight = 3, originX = 0, originY = 0) {
    const specs   = parsePromptToRoomSpecs(prompt);
    const rooms   = placeRooms(specs);
    const walls   = roomsToWalls(rooms, wallHeight, originX, originY);

    const roomList = rooms.map(r => `• ${friendlyName(r.type)} (${r.width}m × ${r.height}m)`).join('\n');

    return {
        rooms,
        walls,
        message: `🏠 Generated **${rooms.length}-room layout** (${walls.length} walls):\n\n${roomList}\n\nSwitch to 3D view to see it!`,
    };
}

/**
 * Convert a raw { rooms: [...] } JSON object (from AI backend or spec)
 * directly into canvas walls, preserving exact x/y/width/height.
 */
export function convertSpecJsonToWalls(json, wallHeight = 3, originX = 0, originY = 0) {
    if (!json?.rooms || !Array.isArray(json.rooms)) return [];
    const rooms = json.rooms.map(r => ({
        type: r.type,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    }));
    return roomsToWalls(rooms, wallHeight, originX, originY);
}
