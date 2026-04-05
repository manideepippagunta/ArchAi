/**
 * SnapSystem — snapping utilities for the 2D drafting canvas.
 */

const DEFAULT_GRID = 0.5; // 0.5 m grid

/**
 * Snap a point [x, y] to the nearest grid cell.
 * @param {[number, number]} point - raw canvas point in world units
 * @param {number} gridSize        - grid cell size in world units
 */
export function snapToGrid(point, gridSize = DEFAULT_GRID) {
    return [
        Math.round(point[0] / gridSize) * gridSize,
        Math.round(point[1] / gridSize) * gridSize,
    ];
}

/**
 * Snap a point to any nearby wall endpoint within snapRadius.
 * @param {[number, number]} point   - raw point
 * @param {Array} walls              - array of wall objects { start, end }
 * @param {number} snapRadius        - snap distance in world units
 * @returns {[number, number]} - snapped point (or original if no snap)
 */
export function snapToEndpoints(point, walls, snapRadius = 0.3) {
    let best = null;
    let bestDist = Infinity;

    for (const wall of walls) {
        for (const pt of [wall.start, wall.end]) {
            const dx = pt[0] - point[0];
            const dy = pt[1] - point[1];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < snapRadius && d < bestDist) {
                bestDist = d;
                best = pt;
            }
        }
    }

    return best || point;
}

/**
 * Combined snap: endpoint snap takes priority over grid snap.
 */
export function snap(point, walls, gridSize = DEFAULT_GRID, snapRadius = 0.3) {
    const endSnap = snapToEndpoints(point, walls, snapRadius);
    if (endSnap !== point) return endSnap; // endpoint snap hit
    return snapToGrid(point, gridSize);
}

/**
 * Convert a pixel coordinate from the SVG canvas to world units.
 * @param {number} px          - pixel X
 * @param {number} py          - pixel Y
 * @param {object} viewport    - { x, y, width, height } of the visible world area
 * @param {number} svgWidth    - SVG element width in px
 * @param {number} svgHeight   - SVG element height in px
 */
export function pixelToWorld(px, py, viewport, svgWidth, svgHeight) {
    const worldX = viewport.x + (px / svgWidth) * viewport.width;
    const worldY = viewport.y + (py / svgHeight) * viewport.height;
    return [worldX, worldY];
}

/**
 * Convert world coordinates to svg pixel coordinates.
 */
export function worldToPixel(wx, wy, viewport, svgWidth, svgHeight) {
    const px = ((wx - viewport.x) / viewport.width) * svgWidth;
    const py = ((wy - viewport.y) / viewport.height) * svgHeight;
    return [px, py];
}
