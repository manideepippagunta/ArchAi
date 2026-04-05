/**
 * WallGeometry — generates wall mesh parameters from 2D line segments.
 * Returns geometry data that can be used directly in Three.js.
 */

/**
 * Given two 2D points (start, end), a thickness, and a height,
 * compute the transform needed to position a BoxGeometry as a wall.
 *
 * @param {[number, number]} start - [x, z] start point
 * @param {[number, number]} end   - [x, z] end point
 * @param {number} thickness       - wall thickness in metres (default 0.2)
 * @param {number} height          - wall height in metres (default 3.0)
 * @param {number} elevation       - base Y elevation (default 0)
 * @returns {{ position, rotation, scale, length }}
 */
export function buildWallTransform(start, end, thickness = 0.2, height = 3.0, elevation = 0) {
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.001) return null;

    const angle = Math.atan2(dz, dx);

    const midX = (start[0] + end[0]) / 2;
    const midZ = (start[1] + end[1]) / 2;
    const midY = elevation + height / 2;

    return {
        position: [midX, midY, midZ],
        rotation: [0, -angle, 0],
        scale: [length, height, thickness],
        length,
    };
}

/**
 * Compute the length of a wall segment in metres.
 */
export function wallLength(start, end) {
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Format a length for display (supports 'm' and 'mm' units).
 */
export function formatLength(metres, unit = 'm') {
    if (unit === 'mm') return `${Math.round(metres * 1000)} mm`;
    return `${metres.toFixed(2)} m`;
}
