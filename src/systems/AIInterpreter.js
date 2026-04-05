/**
 * AIInterpreter — converts natural language architectural prompts into editor actions.
 * Uses RoomLayoutEngine for structured, non-overlapping layout generation.
 * Falls back to procedural logic for simple single-room/wall operations.
 */
import { generateLayout, roomsToWalls, placeRooms } from './RoomLayoutEngine.js';

// ─── Type aliases ────────────────────────────────────────────────────────────
// Action: { type, payload }
// Response: { message: string, actions: Action[], preview?: string }

// ─── Dimension extractors ────────────────────────────────────────────────────

/** Pull the first pair of dimensions, e.g. "5x4", "5 by 4", "5m x 4m", "5 × 4" → [5, 4] */
function extractDims(text) {
    const t = text.toLowerCase();
    let m;
    // "5x4", "5 x 4", "5×4"
    m = t.match(/(\d+\.?\d*)\s*[x×by\s]\s*(\d+\.?\d*)\s*m?/i);
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    // single number like "5m square"
    m = t.match(/(\d+\.?\d*)\s*m?\s*square/i);
    if (m) { const v = parseFloat(m[1]); return [v, v]; }
    return null;
}

/** Pull a single numeric value (metres). "4m" → 4, "height 3" → 3 */
function extractNum(text, keywords = []) {
    const t = text.toLowerCase();
    for (const kw of keywords) {
        const m = t.match(new RegExp(`${kw}\\s*(\\d+\\.?\\d*)\\s*m?`));
        if (m) return parseFloat(m[1]);
    }
    const m = t.match(/(\d+\.?\d*)\s*m(?:etres?)?/);
    if (m) return parseFloat(m[1]);
    return null;
}

// ─── Wall builders ───────────────────────────────────────────────────────────

let _uid = 0;
const uid = (prefix = 'ai') => `${prefix}_${Date.now()}_${++_uid}`;

/** Build a rectangular set of 4 walls given origin (ox,oz) and size (w,d) */
function buildRect(ox, oz, w, d, wallHeight = 3, thickness = 0.2) {
    const pts = [
        [[ox, oz], [ox + w, oz]],
        [[ox + w, oz], [ox + w, oz + d]],
        [[ox + w, oz + d], [ox, oz + d]],
        [[ox, oz + d], [ox, oz]],
    ];
    return pts.map(([start, end]) => ({
        id: uid('wall'),
        type: 'wall',
        name: 'Wall',
        start,
        end,
        thickness,
        height: wallHeight,
    }));
}

/** Build an L-shaped room (two rectangles sharing a corner, joined) */
function buildLShape(ox, oz, w, d, wallHeight = 3) {
    const hw = w / 2, hd = d / 2;
    // outer L = large rect minus inner corner
    return [
        ...buildRect(ox, oz, w, hd, wallHeight),      // bottom half
        ...buildRect(ox, oz + hd, hw, hd, wallHeight), // top-left quarter
    ];
}

/** Build a simple 2-room split (left wall + divider) */
function buildTwoRooms(ox, oz, w, d, wallHeight = 3) {
    const mid = w / 2;
    return [
        ...buildRect(ox, oz, w, d, wallHeight),
        // divider
        {
            id: uid('wall'),
            type: 'wall',
            name: 'Divider',
            start: [ox + mid, oz],
            end: [ox + mid, oz + d],
            thickness: 0.15,
            height: wallHeight,
        },
    ];
}

/** Named room presets */
function buildNamedRoom(name, ox = 0, oz = 0, wallHeight = 3) {
    const presets = {
        bedroom: [4, 4],
        'master bedroom': [5, 4.5],
        bathroom: [2.5, 2],
        kitchen: [4, 3],
        'living room': [6, 5],
        lounge: [6, 5],
        office: [4, 3.5],
        garage: [6, 3],
        studio: [5, 5],
        hallway: [5, 1.5],
        corridor: [6, 1.5],
    };
    const dims = presets[name.toLowerCase()] || [4, 4];
    return buildRect(ox, oz, dims[0], dims[1], wallHeight);
}

// ─── Intent classifiers ──────────────────────────────────────────────────────

const SHAPES = {
    rect: /\b(rect(angular)?|square|box|room|space|area)\b/i,
    house: /\b(house|home|bungalow|cottage|villa|building)\b/i,
    lshape: /\bl[-\s]?shape/i,
    tshape: /\bt[-\s]?shape/i,
    two: /\btwo\b|\b2\s*room/i,
    single: /\b(wall|partition|panel)\b/i,
};

const FEATURES = {
    door: /\b(door|entrance|exit|doorway)\b/i,
    window: /\b(window|windows)\b/i,
};

const ROOM_NAMES = [
    'master bedroom', 'bedroom', 'bathroom', 'kitchen', 'living room',
    'lounge', 'office', 'garage', 'studio', 'hallway', 'corridor',
];

const CLEAR_WORDS = /\b(clear|reset|delete all|remove all|start over|empty|wipe)\b/i;
const SWITCH_3D = /\b(3d|three d|view 3d|go 3d|3 d)\b/i;
const SWITCH_2D = /\b(2d|plan|floor\s*plan|go 2d)\b/i;
const HELP_WORDS = /\b(help|what can|how do|example|tip|hint)\b/i;
const FLOOR_WORDS = /\b(floor|storey|story|level)\b/i;

// ─── Main interpreter ────────────────────────────────────────────────────────

/**
 * Interpret a natural language prompt and return { message, actions }.
 * @param {string} prompt
 * @param {object} storeState - snapshot of current editor store
 * @returns {{ message: string, actions: Array }}
 */
export function interpret(prompt, storeState = {}) {
    const t = prompt.trim().toLowerCase();

    const cx = storeState.cursor2D?.[0] || 0;
    const cz = storeState.cursor2D?.[1] || 0;

    // ── Help ──────────────────────────────────────────────────────────────────
    if (HELP_WORDS.test(t)) {
        return {
            message: `Here are some things you can ask me:\n\n• *"Create a 6x5 room"* — draws a rectangular room\n• *"Make a 3-bedroom house"* — generates a full floor plan\n• *"Add a kitchen next to the bedroom"* — adds named rooms\n• *"Build an L-shaped apartment 8x6"* — L-shape floor plan\n• *"Add a wall from (0,0) to (5,0)"* — precise wall placement\n• *"Set wall height to 3.5m"* — changes wall heights\n• *"Clear everything"* — resets the canvas\n• *"Switch to 3D view"* — changes viewport mode\n\nYou can also manually draw walls and adjust them in the properties panel on the right.`,
            actions: [],
        };
    }

    // ── Clear ─────────────────────────────────────────────────────────────────
    if (CLEAR_WORDS.test(t)) {
        return {
            message: '🗑️ Clearing all elements from the active level.',
            actions: [{ type: 'CLEAR_LEVEL' }],
        };
    }

    // ── Switch mode ───────────────────────────────────────────────────────────
    if (SWITCH_3D.test(t)) {
        return { message: '📐 Switching to 3D view.', actions: [{ type: 'SET_MODE', payload: '3d' }] };
    }
    if (SWITCH_2D.test(t)) {
        return { message: '📋 Switching to 2D plan view.', actions: [{ type: 'SET_MODE', payload: '2d' }] };
    }

    // ── Bedroom count → multi-room layout via RoomLayoutEngine ───────────────
    const bedroomCountMatch = t.match(/(\d+|one|two|three|four|five)\s*[-\s]?bedroom/i);
    if (bedroomCountMatch || (SHAPES.house.test(t) && !extractDims(t))) {
        const height = extractNum(t, ['height', 'tall', 'high']) || 3;
        const result = generateLayout(prompt, height, cx, cz);
        const offsetRooms = result.rooms.map(r => ({
            ...r,
            x: r.x + cx,
            y: r.y + cz
        }));
        return {
            message: result.message,
            actions: [
                { type: 'ADD_WALLS', payload: result.walls },
                { type: 'ADD_ROOMS', payload: offsetRooms }
            ],
        };
    }

    // ── Named single room ─────────────────────────────────────────────────────
    const matchedRoom = ROOM_NAMES.find((r) => t.includes(r));
    if (matchedRoom) {
        const dims = extractDims(t);
        const h = extractNum(t, ['height', 'tall']) || 3;
        let walls;
        if (dims) {
            walls = buildRect(cx, cz, dims[0], dims[1], h);
        } else {
            const result = generateLayout(matchedRoom, h, cx, cz);
            walls = result.walls;
            const rooms = result.rooms.map(r => ({
                ...r,
                x: r.x + cx,
                y: r.y + cz
            }));
            const friendly = matchedRoom.replace(/\b\w/g, (c) => c.toUpperCase());
            return {
                message: `🏠 Added **${friendly}** (${walls.length} walls). Select any wall to adjust properties.`,
                actions: [
                    { type: 'ADD_WALLS', payload: walls },
                    { type: 'ADD_ROOMS', payload: rooms }
                ],
            };
        }
    }

    // ── L-shape ───────────────────────────────────────────────────────────────
    if (SHAPES.lshape.test(t)) {
        const dims = extractDims(t) || [8, 6];
        const h = extractNum(t, ['height', 'tall']) || 3;
        const walls = buildLShape(cx, cz, dims[0], dims[1], h);
        return {
            message: `📐 Generated L-shaped floor plan (${dims[0]}m × ${dims[1]}m). ${walls.length} walls added.`,
            actions: [{ type: 'ADD_WALLS', payload: walls }],
        };
    }

    // ── Two-room split ────────────────────────────────────────────────────────
    if (SHAPES.two.test(t)) {
        const dims = extractDims(t) || [8, 5];
        const h = extractNum(t, ['height', 'tall']) || 3;
        const walls = buildTwoRooms(cx, cz, dims[0], dims[1], h);
        return {
            message: `🏠 Generated 2-room layout (${dims[0]}m × ${dims[1]}m) with a divider wall. ${walls.length} walls total.`,
            actions: [{ type: 'ADD_WALLS', payload: walls }],
        };
    }

    // ── Single explicit wall (coordinate syntax) ──────────────────────────────
    const coordMatch = t.match(/\(?\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*\)?\s*(?:to|->|→)\s*\(?\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*\)?/i);
    if (coordMatch || SHAPES.single.test(t)) {
        if (coordMatch) {
            const [, x1, z1, x2, z2] = coordMatch.map(Number);
            const h = extractNum(t, ['height', 'tall']) || 3;
            const wall = {
                id: uid('wall'),
                type: 'wall',
                name: 'Wall',
                start: [x1 + cx, z1 + cz],
                end: [x2 + cx, z2 + cz],
                thickness: 0.2,
                height: h,
            };
            return {
                message: `📏 Added wall from (${x1}, ${z1}) to (${x2}, ${z2}).`,
                actions: [{ type: 'ADD_WALLS', payload: [wall] }],
            };
        }
    }

    // ── Generic room / house with dims ────────────────────────────────────────
    const dims = extractDims(t);
    if (dims) {
        const h = extractNum(t, ['height', 'tall', 'high']) || 3;
        const [w, d] = dims;
        const isHouse = SHAPES.house.test(t);
        const walls = buildRect(cx, cz, w, d, h);
        const label = isHouse ? 'house shell' : 'room';
        
        // Did they also ask for a door/window right away?
        const addDoor = FEATURES.door.test(t);
        const addWin = FEATURES.window.test(t);
        let msg = `🏗️ Created ${label} (${w}m × ${d}m, ${h}m tall) — ${walls.length} walls added.`;
        
        if (addDoor || addWin) {
            msg += ` Added requested features.`;
            const primaryWall = walls[0]; // bottom wall
            if (addDoor) {
                walls.push({
                    id: uid('door'), type: 'door', name: 'Door',
                    attachedTo: primaryWall.id,
                    width: 0.9, height: 2.1, distanceFromStart: w / 2,
                });
            }
            if (addWin) {
                const winWall = addDoor ? walls[1] : walls[0]; // right wall if door on bottom
                const ww = addDoor ? d : w;
                walls.push({
                    id: uid('window'), type: 'window', name: 'Window',
                    attachedTo: winWall.id,
                    width: 1.5, height: 1.2, distanceFromStart: ww / 2,
                });
            }
        }
        
        msg += ` Switch to 3D to see it!`;
        return { message: msg, actions: [{ type: 'ADD_WALLS', payload: walls }] };
    }

    // ── Add Door / Window to existing wall ─────────────────────────────────────
    const isAddingDoor = FEATURES.door.test(t);
    const isAddingWindow = FEATURES.window.test(t);
    if (isAddingDoor || isAddingWindow) {
        if (!storeState.selectedId) {
            return {
                message: `I can add a ${isAddingDoor ? 'door' : 'window'}, but I don't know which wall to put it on! Please **click on a wall** first to select it, then ask me again.`,
                actions: [],
            };
        }
        // Find selected wall in state to get its length
        let selectedWall = null;
        for (const site of storeState.sites || []) {
            const b = site.children?.[0];
            const l = b?.children?.[0];
            selectedWall = l?.elements?.find(e => e.id === storeState.selectedId);
            if (selectedWall) break;
        }

        if (!selectedWall || selectedWall.type !== 'wall') {
            return { message: "Please select a *wall* to add this to.", actions: [] };
        }

        const dx = selectedWall.end[0] - selectedWall.start[0];
        const dz = selectedWall.end[1] - selectedWall.start[1];
        const length = Math.sqrt(dx * dx + dz * dz);
        
        const type = isAddingDoor ? 'door' : 'window';
        const el = {
            id: uid(type),
            type,
            name: isAddingDoor ? 'Door' : 'Window',
            attachedTo: selectedWall.id,
            width: isAddingDoor ? 0.9 : 1.5,
            height: isAddingDoor ? 2.1 : 1.2,
            distanceFromStart: length / 2, // Place in middle
        };

        return {
            message: `🚪 Added a ${type} to the selected wall. You can move it or change its size in the Properties panel.`,
            actions: [{ type: 'ADD_ELEMENTS', payload: [el] }],
        };
    }

    // ── Height update for selected ─────────────────────────────────────────────
    if (/height|tall/i.test(t)) {
        const h = extractNum(t, ['height', 'tall', 'high', 'make', 'set', 'to']) || extractNum(t) || 3;
        if (storeState.selectedId) {
            return {
                message: `📏 Updated wall height to ${h}m.`,
                actions: [{ type: 'UPDATE_SELECTED', payload: { height: h } }],
            };
        }
        return {
            message: `Please select a wall first, then ask me to change its height. You can also edit height directly in the Properties panel on the right.`,
            actions: [],
        };
    }

    // ── Fallback ───────────────────────────────────────────────────────────────
    return {
        message: `I'm not sure how to interpret that. Try something like:\n• *"Create a 5x4 room"*\n• *"Build a 2-bedroom house"*\n• *"Add a kitchen"*\n\nOr type *"help"* to see all commands.`,
        actions: [],
    };
}

// ─── Legacy multi-room builder (kept as fallback) ─────────────────────────────
// Now routes through RoomLayoutEngine via interpret(), but kept for direct calls.
function buildMultiRoomHouse(numBeds, wallHeight = 3, cx = 0, cz = 0) {
    const prompt = `${numBeds}-bedroom house`;
    const result = generateLayout(prompt, wallHeight, cx, cz);
    return {
        message: result.message,
        actions: [
            { type: 'ADD_WALLS', payload: result.walls },
            { type: 'ADD_ROOMS', payload: result.rooms }
        ],
    };
}
