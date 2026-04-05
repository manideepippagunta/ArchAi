/**
 * mlClient.js  v2.0
 *
 * Connects to the Archai FastAPI backend at /generate.
 * Handles the full Archai JSON schema: { name, totalArea, rooms, walls, doors, windows }
 * Returns the raw layout object for useEditorStore.loadScene().
 *
 * Falls back to null (caller uses procedural RoomLayoutEngine) on error.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Generate a full architectural layout from a text prompt (and optionally an image).
 *
 * @param {string} prompt  - Natural language description
 * @param {string} [imageB64] - Optional base64-encoded image for multimodal input
 * @returns {Promise<{ layout: object|null, error: string|null }>}
 */
export async function generateLayout(prompt, imageB64 = null) {
    try {
        const body = { prompt };
        if (imageB64) body.image = imageB64;

        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // ── API-level error message ─────────────────────────────────────────
        if (data.error) {
            return { layout: null, error: data.error };
        }

        // ── Validate minimum required fields ────────────────────────────────
        if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
            throw new Error('Backend returned no rooms in the layout.');
        }

        return { layout: data, error: null };

    } catch (err) {
        console.warn('[Archai] ML backend error:', err.message);
        return { layout: null, error: err.message };
    }
}

/**
 * Build a human-readable summary string from a layout object.
 * Used for chat messages after generation.
 */
export function layoutSummary(layout) {
    if (!layout || !layout.rooms) return '';
    const roomLines = layout.rooms
        .map(r => `• ${r.label} (${r.width}m × ${r.depth}m)`)
        .join('\n');
    return (
        `🏠 **${layout.name}** — ${layout.totalArea}m²\n\n` +
        `${roomLines}\n\n` +
        `${layout.rooms.length} rooms · ${layout.walls.length} walls · ` +
        `${layout.doors.length} doors · ${layout.windows.length} windows\n\n` +
        `Switch to 3D view to explore!`
    );
}

/**
 * Legacy adapter — kept so existing code that calls fetchMlLayout() still works.
 * Maps the new schema into the old { success, walls, rooms, message } shape.
 */
export async function fetchMlLayout(prompt, cursor2D = [0, 0]) {
    const { layout, error } = await generateLayout(prompt);
    const [cx, cz] = cursor2D || [0, 0];

    if (!layout) {
        return { success: false, error: error || 'Unknown error' };
    }

    // Offset rooms by cursor position
    const rooms = layout.rooms.map(r => ({
        ...r,
        x: r.x + cx,
        z: r.z + cz,
    }));

    // Offset walls
    const walls = layout.walls.map(w => ({
        ...w,
        x1: w.x1 + cx, z1: w.z1 + cz,
        x2: w.x2 + cx, z2: w.z2 + cz,
        // Legacy fields for existing renderers
        type: 'wall',
        start: [w.x1 + cx, w.z1 + cz],
        end:   [w.x2 + cx, w.z2 + cz],
        thickness: w.thickness ?? 0.2,
        height: 2.8,
    }));

    return {
        success: true,
        layout: { ...layout, rooms, walls },
        rooms,
        walls,
        doors: layout.doors,
        windows: layout.windows,
        message: layoutSummary({ ...layout, rooms }),
    };
}
