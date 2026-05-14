/**
 * mlClient.js  v3.0
 *
 * Connects to the Archai FastAPI backend at /generate.
 * Handles the pure 3d_scene AI schema: { building, elements: { walls, doors, windows, furniture } }
 * and synthesizes "virtual rooms" for 2D UI enhancement.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

        if (data.error) {
            return { layout: null, error: data.error };
        }

        // Accept any layout that has rooms or walls
        if (!data.rooms && !data.walls) {
            throw new Error('Backend returned no rooms or walls data.');
        }

        // Ensure both arrays exist (even if empty)
        data.rooms = data.rooms || [];
        data.walls = data.walls || [];

        return { layout: data, error: null };


    } catch (err) {
        console.warn('[Archai] ML backend error:', err.message);
        return { layout: null, error: err.message };
    }
}

function detectRooms(walls) {
    const rooms = [];
    const tolerance = 0.5;

    // Convert architectural_scene walls to line segments for intersection testing
    const lines = walls.map((w, i) => {
        let x1, y1, x2, y2;
        if (w.x1 !== undefined && w.y1 !== undefined && w.x2 !== undefined && w.y2 !== undefined) {
             x1 = w.x1; y1 = w.y1; x2 = w.x2; y2 = w.y2;
        } else if (w.x !== undefined && w.y !== undefined) {
             x1 = w.x; y1 = w.y;
             const wd = w.width || 0;
             const dp = w.depth || w.thickness || 0.2;
             x2 = wd > dp ? x1 + wd : x1;
             y2 = wd > dp ? y1 : y1 + dp;
        } else {
             x1=0; y1=0; x2=0; y2=0;
        }

        const isHoriz = Math.abs(y1 - y2) < tolerance;
        return {
            id: `vw${i}`,
            isHoriz,
            x1: Math.min(x1, x2),
            y1: Math.min(y1, y2),
            x2: Math.max(x1, x2),
            y2: Math.max(y1, y2),
        };
    });

    const horiz = lines.filter(l => l.isHoriz);
    const vert = lines.filter(l => !l.isHoriz);

    function intersects(hWall, vWall) {
        const xOverlap = hWall.x1 - tolerance <= vWall.x1 && vWall.x1 <= hWall.x2 + tolerance;
        const yOverlap = vWall.y1 - tolerance <= hWall.y1 && hWall.y1 <= vWall.y2 + tolerance;
        return xOverlap && yOverlap;
    }

    // Find all enclosed rectangular loops
    for(let i=0; i<horiz.length; i++) {
        for(let j=i+1; j<horiz.length; j++) {
            const hTop = horiz[i].y1 < horiz[j].y1 ? horiz[i] : horiz[j];
            const hBot = horiz[i].y1 < horiz[j].y1 ? horiz[j] : horiz[i];
            
            for(let k=0; k<vert.length; k++) {
                for(let l=k+1; l<vert.length; l++) {
                    const vLeft = vert[k].x1 < vert[l].x1 ? vert[k] : vert[l];
                    const vRight = vert[k].x1 < vert[l].x1 ? vert[l] : vert[k];
                    
                    if (intersects(hTop, vLeft) && intersects(hTop, vRight) &&
                        intersects(hBot, vLeft) && intersects(hBot, vRight)) {
                        
                        const rx = vLeft.x1;
                        const ry = hTop.y1;
                        const rw = vRight.x1 - vLeft.x1;
                        const rh = hBot.y1 - hTop.y1;
                        
                        if (rw > 0.5 && rh > 0.5) {
                            rooms.push({ x: rx, y: ry, width: rw, height: rh, z: ry, depth: rh });
                        }
                    }
                }
            }
        }
    }
    
    // Deduplicate
    const uniqueRooms = [];
    for(const r of rooms) {
        const dup = uniqueRooms.find(ur => 
            Math.abs(ur.x - r.x) < 0.1 && 
            Math.abs(ur.y - r.y) < 0.1 && 
            Math.abs(ur.width - r.width) < 0.1 && 
            Math.abs(ur.height - r.height) < 0.1
        );
        if (!dup && uniqueRooms.every(ur => !(r.x >= ur.x + 0.1 && r.y >= ur.y + 0.1 && r.x+r.width <= ur.x+ur.width - 0.1 && r.y+r.height <= ur.y+ur.height - 0.1))) {
             uniqueRooms.push(r);
        }
    }
    
    // Check if a smaller room is fully inside a larger room, if so remove the larger room to only show the subdivided space
    // or keep the smaller spaces as rooms. In a full app, we'd build a partition graph.
    const minimalRooms = uniqueRooms.filter(r1 => {
        return !uniqueRooms.some(r2 => 
            r1 !== r2 && 
            Math.abs(r1.width * r1.height - r2.width * r2.height) > 0.1 &&
            r2.width * r2.height < r1.width * r1.height && 
            r2.x >= r1.x - 0.1 && r2.y >= r1.y - 0.1 && 
            r2.x + r2.width <= r1.x + r1.width + 0.1 && 
            r2.y + r2.height <= r1.y + r1.height + 0.1
        );
    });

    return minimalRooms.length > 0 ? minimalRooms : uniqueRooms;
}

function classifyRoom(room, furniture) {
    if (!furniture || furniture.length === 0) return 'Room';
    let counts = {};
    for(const f of furniture) {
        if (f.x >= room.x - 0.5 && f.x <= room.x + room.width + 0.5 && 
            f.y >= room.y - 0.5 && f.y <= room.y + room.height + 0.5) {
            counts[f.type] = (counts[f.type] || 0) + 1;
        }
    }
    if (counts['bed']) return 'Bedroom';
    if (counts['sofa'] || counts['tv']) return 'Living Room';
    if (counts['stove'] || counts['oven'] || counts['fridge']) return 'Kitchen';
    if (counts['toilet'] || counts['tub'] || counts['shower']) return 'Bathroom';
    if (counts['desk'] || counts['workstation']) return 'Office';
    if (counts['car']) return 'Garage';
    if (counts['table']) return 'Dining Room';
    return 'Room';
}

export function layoutSummary(layout) {
    if (!layout) return '';
    const title = layout.name || "3D Scene";
    
    // Use layout.building or floor to establish dimensions
    const w = layout.floor?.width || layout.building?.width || layout.dimensions?.width;
    const h = layout.floor?.depth || layout.building?.depth || layout.dimensions?.height;
    const area = w && h ? (w * h) : (layout.totalArea || 0);
    
    const wallsCount = (layout.walls || []).length;
    const doorsCount = (layout.doors || []).length;
    const windowsCount = (layout.windows || []).length;
    const furnCount = (layout.furniture || []).length;

    let summary = `🏠 **${title}** — ~${Math.round(area)}m²\n\n`;
    summary += `${wallsCount} walls · ${doorsCount} doors · ${windowsCount} windows${furnCount ? ` · ${furnCount} furniture` : ''}\n\n`;
    
    return summary + `Switch to 3D view to explore!`;
}

export async function fetchMlLayout(prompt, cursor2D = [0, 0]) {
    const { layout, error } = await generateLayout(prompt);
    const [cx, cz] = cursor2D || [0, 0];

    if (!layout) {
        return { success: false, error: error || 'Unknown error' };
    }

    // Map 3D walls -> 2D lines for legacy renderer
    const walls = (layout.walls || []).map((w, index) => {
        let wx1, wy1, wx2, wy2, w_thick = w.thickness || 0.2;
        if (w.x1 !== undefined && w.y1 !== undefined && w.x2 !== undefined && w.y2 !== undefined) {
             wx1 = w.x1; wy1 = w.y1; wx2 = w.x2; wy2 = w.y2;
        } else if (w.x !== undefined && w.y !== undefined) {
             const wd = w.width || 0;
             const dp = w.depth || w.thickness || 0.2;
             wx1 = w.x; wy1 = w.y;
             if (wd > dp) { wx2 = wx1 + wd; wy2 = wy1; w_thick = dp; }
             else { wx2 = wx1; wy2 = wy1 + dp; w_thick = wd; }
        } else {
             wx1 = 0; wy1 = 0; wx2 = 0; wy2 = 0;
        }

        let x1 = wx1 + cx, y1 = wy1 + cz, x2 = wx2 + cx, y2 = wy2 + cz;
        
        return {
            ...w,
            id: w.id || `w_${index}`,
            type: 'wall',
            x1, z1: y1,
            x2, z2: y2,
            start: [x1, y1],
            end: [x2, y2],
            thickness: w_thick,
            height: w.height || 3,
        };
    });

    const furniture = layout.furniture || [];
    
    // Auto Virtual Room inference
    const rawRooms = detectRooms(layout.walls || []);
    let inferredRooms = rawRooms.map((r, i) => {
         const label = classifyRoom(r, furniture);
         return {
             ...r,
             id: `vr_${i}`,
             name: label,
             label: label,
             type: label.toLowerCase(),
             x: r.x + cx,
             y: r.y + cz,
             z: r.y + cz, 
             depth: r.height || r.depth
         };
    });

    const doors = layout.doors || [];
    const windows = layout.windows || [];

    return {
        success: true,
        layout: { ...layout, rooms: inferredRooms, walls, doors, windows, furniture },
        rooms: inferredRooms,
        walls,
        doors,
        windows,
        furniture,
        message: layoutSummary(layout),
    };
}
