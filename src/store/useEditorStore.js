import { create } from 'zustand';
import { temporal } from 'zundo';
import { get, set } from 'idb-keyval';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';


// ─── Unique ID helper ──────────────────────────────────────────────────────
let _id = 0;
const uid = () => `id_${Date.now()}_${++_id}`;

// ─── Default scene structure ───────────────────────────────────────────────
const defaultSite = () => ({
    id: uid(),
    type: 'site',
    name: 'My Site',
    children: [defaultBuilding()],
});

const defaultBuilding = () => ({
    id: uid(),
    type: 'building',
    name: 'Building 1',
    children: [defaultLevel()],
});

const defaultLevel = () => ({
    id: uid(),
    type: 'level',
    name: 'Level 1',
    elevation: 0,
    height: 3.0,
    elements: [],
    rooms: [],
});

// ─── Persistence — Firestore (primary) + IndexedDB (offline cache) ─────────
const DB_KEY = 'archai-editor-state';

/** Load: try Firestore first, fall back to IndexedDB */
const loadState = async () => {
    try {
        const snap = await getDoc(doc(db, 'projects', 'default'));
        if (snap.exists()) {
            const data = snap.data();
            await set(DB_KEY, data).catch(() => {});
            return data;
        }
    } catch {
        // Firestore unavailable — try local cache
    }
    try {
        const saved = await get(DB_KEY);
        return saved || null;
    } catch {
        return null;
    }
};

// Debounce timer — avoid hammering Firestore on every change
let _saveTimer = null;
const saveState = (state) => {
    const payload = { sites: state.sites, viewMode: state.viewMode };
    // Always write immediately to IndexedDB (offline-safe)
    set(DB_KEY, payload).catch(() => {});
    // Debounce Firestore writes to 1.5 s
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
        try {
            await setDoc(doc(db, 'projects', 'default'), payload);
        } catch {
            // silently fail — IndexedDB already has the data
        }
    }, 1500);
};

// ─── Store ────────────────────────────────────────────────────────────────
const storeSlice = (set, get) => ({
    // Scene graph
    sites: [defaultSite()],
    selectedId: null,
    activeLevelId: null,

    // UI mode
    viewMode: '2d',       // '2d' | '3d'
    activeTool: 'select', // 'select' | 'move' | 'wall' | 'room' | 'delete'
    commandOpen: false,
    initialized: false,
    
    // 2D AI Placement Cursor
    cursor2D: null,       // [x, z] or null

    // ── Lifecycle ─────────────────────────────────────────────────────────
    hydrate: async () => {
        const saved = await loadState();
        if (saved) {
            set({
                sites: saved.sites,
                viewMode: saved.viewMode || '3d',
                initialized: true,
            });
        } else {
            set({ initialized: true });
        }
    },

    persistNow: () => saveState(get()),

    // ── Selection ─────────────────────────────────────────────────────────
    select: (id) => set({ selectedId: id }),
    deselect: () => set({ selectedId: null }),

    setActiveLevel: (id) => set({ activeLevelId: id }),

    // ── Mode & Tools ──────────────────────────────────────────────────────
    setViewMode: (mode) => {
        set({ viewMode: mode, activeTool: 'select' });
        saveState(get());
    },
    setActiveTool: (tool) => set({ activeTool: tool }),
    setCommandOpen: (open) => set({ commandOpen: open }),
    setCursor2D: (pos) => set({ cursor2D: pos }),

    // ── Scene Mutations ───────────────────────────────────────────────────
    addWall: (levelId, wall) => {
        const { sites } = get();
        const next = deepAddElement(sites, levelId, {
            id: uid(),
            type: 'wall',
            name: 'Wall',
            ...wall,
        });
        set({ sites: next });
        saveState(get());
    },

    // ── Bulk add walls (used by AI interpreter) ───────────────────────────
    addWalls: (levelId, walls) => {
        const { sites } = get();
        let next = sites;
        for (const wall of walls) {
            next = deepAddElement(next, levelId, wall);
        }
        set({ sites: next });
        saveState(get());
    },

    // ── Clear all elements and rooms from active level ───────────────────
    clearLevel: (levelId) => {
        const { sites } = get();
        const next = deepClearLevel(sites, levelId);
        set({ sites: next, selectedId: null });
        saveState(get());
    },

    // ── Load full AI scene (rooms + walls + doors + windows) ─────────────
    /**
     * loadScene(layout)
     * Accepts the full Archai JSON schema returned by POST /generate.
     * Clears the active level, then populates rooms, walls, doors, windows.
     */
    loadScene: (layout) => {
        if (!layout || !Array.isArray(layout.rooms)) return;

        const { sites, activeLevelId } = get();
        // Resolve target level
        const level = activeLevelId
            ? findNode(sites, activeLevelId)
            : sites[0]?.children?.[0]?.children?.[0];
        if (!level) return;

        const levelId = level.id;

        // 1. Clear existing content
        let next = deepClearLevel(sites, levelId);

        // 2. Add rooms
        for (const room of layout.rooms) {
            next = deepAddRoom(next, levelId, {
                ...room,
                id: room.id || uid(),
                type: 'room',
                roomType: room.type,   // store original type on roomType
                name: room.label || room.type,
                // z → y for internal 2D plane (legacy compat)
                y: room.z,
                height: room.depth,    // depth in schema = height in 2D canvas
            });
        }

        // 3. Add walls from schema walls[]
        const wallHeight = layout.rooms[0]?.height ?? 2.8;
        for (const w of (layout.walls || [])) {
            next = deepAddElement(next, levelId, {
                id: w.id || uid(),
                type: 'wall',
                name: 'Wall',
                start: [w.x1, w.z1],
                end:   [w.x2, w.z2],
                thickness: w.thickness ?? 0.2,
                height: wallHeight,
            });
        }

        // 4. Add doors and windows as elements
        for (const d of (layout.doors || [])) {
            next = deepAddElement(next, levelId, {
                id: d.id || uid(),
                type: 'door',
                name: 'Door',
                roomId: d.roomId,
                wall: d.wall,
                position: d.position,
                width: d.width ?? 0.9,
            });
        }
        for (const w of (layout.windows || [])) {
            next = deepAddElement(next, levelId, {
                id: w.id || uid(),
                type: 'window',
                name: 'Window',
                roomId: w.roomId,
                wall: w.wall,
                position: w.position,
                width: w.width ?? 1.2,
                height: w.height ?? 1.2,
                sillHeight: w.sillHeight ?? 0.9,
            });
        }

        set({ sites: next, selectedId: null });
        saveState(get());
    },

    // ── Room Actions ──────────────────────────────────────────────────────
    addRooms: (levelId, rooms) => {
        const { sites } = get();
        let next = sites;
        for (const room of rooms) {
            next = deepAddRoom(next, levelId, {
                id: uid(),
                ...room,
            });
        }
        set({ sites: next });
        saveState(get());
    },

    moveRoom: (id, dx, dy) => {
        const { sites } = get();
        const room = findNode(sites, id);
        if (!room) return;
        const next = deepUpdate(sites, id, {
            x: Math.round((room.x + dx) * 2) / 2, // Snap to 0.5 grid
            y: Math.round((room.y + dy) * 2) / 2,
        });
        set({ sites: next });
        saveState(get());
    },

    resizeRoom: (id, width, height) => {
        const { sites } = get();
        const next = deepUpdate(sites, id, {
            width: Math.max(0.5, Math.round(width * 2) / 2),
            height: Math.max(0.5, Math.round(height * 2) / 2),
        });
        set({ sites: next });
        saveState(get());
    },

    updateRoom: (id, props) => {
        const { sites } = get();
        const next = deepUpdate(sites, id, props);
        set({ sites: next });
        saveState(get());
    },

    addLevel: (buildingId) => {
        const { sites } = get();
        const building = findNode(sites, buildingId);
        const levelCount = building ? building.children.length + 1 : 1;
        const level = defaultLevel();
        level.name = `Level ${levelCount}`;
        level.elevation = (levelCount - 1) * 3.0;
        const next = deepAddChild(sites, buildingId, level);
        set({ sites: next });
        saveState(get());
    },

    deleteSelected: () => {
        const { selectedId, sites } = get();
        if (!selectedId) return;
        const next = deepDelete(sites, selectedId);
        set({ sites: next, selectedId: null });
        saveState(get());
    },

    renameNode: (id, name) => {
        const { sites } = get();
        const next = deepUpdate(sites, id, { name });
        set({ sites: next });
        saveState(get());
    },

    updateElement: (id, props) => {
        const { sites } = get();
        const next = deepUpdate(sites, id, props);
        set({ sites: next });
        saveState(get());
    },

    // ── Computed helpers ───────────────────────────────────────────────────
    getAllWalls: () => {
        const { sites } = get();
        const walls = [];
        collectByType(sites, 'wall', walls);
        return walls;
    },

    getAllDoorsAndWindows: () => {
        const { sites } = get();
        const items = [];
        collectByType(sites, 'door', items);
        collectByType(sites, 'window', items);
        return items;
    },

    getActiveLevel: () => {
        const { sites, activeLevelId } = get();
        if (activeLevelId) return findNode(sites, activeLevelId);
        // Default: first level
        const first = sites[0]?.children?.[0]?.children?.[0];
        return first || null;
    },

    getSelectedNode: () => {
        const { sites, selectedId } = get();
        if (!selectedId) return null;
        return findNode(sites, selectedId);
    },
});

// ─── Create store with temporal (undo/redo) ────────────────────────────────
export const useEditorStore = create(
    temporal(storeSlice, {
        partialize: (state) => ({
            sites: state.sites,
            selectedId: state.selectedId,
        }),
        limit: 50,
    })
);

// ─── Convenience undo/redo hooks ───────────────────────────────────────────
export const useUndoRedo = () => {
    const { undo, redo, pastStates, futureStates } = useEditorStore.temporal.getState();
    return {
        undo,
        redo,
        canUndo: pastStates.length > 0,
        canRedo: futureStates.length > 0,
    };
};

// ─── Pure tree helpers ─────────────────────────────────────────────────────
function findNode(sites, id) {
    for (const site of sites) {
        const found = walkFind(site, id);
        if (found) return found;
    }
    return null;
}

function walkFind(node, id) {
    if (node.id === id) return node;
    const kids = node.children || node.elements || [];
    for (const k of kids) {
        const found = walkFind(k, id);
        if (found) return found;
    }
    return null;
}

function deepUpdate(sites, id, props) {
    return sites.map((site) => walkUpdate(site, id, props));
}

function walkUpdate(node, id, props) {
    if (node.id === id) return { ...node, ...props };
    const updChildren = node.children ? node.children.map((c) => walkUpdate(c, id, props)) : undefined;
    const updElements = node.elements ? node.elements.map((e) => walkUpdate(e, id, props)) : undefined;
    return {
        ...node,
        ...(updChildren !== undefined ? { children: updChildren } : {}),
        ...(updElements !== undefined ? { elements: updElements } : {}),
    };
}

function deepAddChild(sites, parentId, child) {
    return sites.map((site) => walkAddChild(site, parentId, child));
}

function walkAddChild(node, parentId, child) {
    if (node.id === parentId) {
        return { ...node, children: [...(node.children || []), child] };
    }
    const updChildren = node.children ? node.children.map((c) => walkAddChild(c, parentId, child)) : undefined;
    const updElements = node.elements ? node.elements.map((e) => walkAddChild(e, parentId, child)) : undefined;
    return {
        ...node,
        ...(updChildren !== undefined ? { children: updChildren } : {}),
        ...(updElements !== undefined ? { elements: updElements } : {}),
    };
}

function deepAddElement(sites, levelId, element) {
    return sites.map((site) => walkAddElement(site, levelId, element));
}

function walkAddElement(node, levelId, element) {
    if (node.id === levelId && node.type === 'level') {
        return { ...node, elements: [...(node.elements || []), element] };
    }
    const updChildren = node.children ? node.children.map((c) => walkAddElement(c, levelId, element)) : undefined;
    return {
        ...node,
        ...(updChildren !== undefined ? { children: updChildren } : {}),
    };
}

function deepAddRoom(sites, levelId, room) {
    return sites.map((site) => walkAddRoom(site, levelId, room));
}

function walkAddRoom(node, levelId, room) {
    if (node.id === levelId && node.type === 'level') {
        return { ...node, rooms: [...(node.rooms || []), room] };
    }
    const updChildren = node.children ? node.children.map((c) => walkAddRoom(c, levelId, room)) : undefined;
    return {
        ...node,
        ...(updChildren !== undefined ? { children: updChildren } : {}),
    };
}

function deepDelete(sites, id) {
    return sites
        .filter((s) => s.id !== id)
        .map((site) => walkDelete(site, id));
}

function walkDelete(node, id) {
    const updChildren = node.children
        ? node.children.filter((c) => c.id !== id).map((c) => walkDelete(c, id))
        : undefined;
    const updElements = node.elements
        ? node.elements.filter((e) => e.id !== id)
        : undefined;
    const updRooms = node.rooms
        ? node.rooms.filter((r) => r.id !== id)
        : undefined;
    return {
        ...node,
        ...(updChildren !== undefined ? { children: updChildren } : {}),
        ...(updElements !== undefined ? { elements: updElements } : {}),
        ...(updRooms !== undefined ? { rooms: updRooms } : {}),
    };
}

function collectByType(sites, type, acc) {
    for (const site of sites) walkCollect(site, type, acc);
}

function walkCollect(node, type, acc) {
    if (node.type === type) acc.push(node);
    for (const k of [...(node.children || []), ...(node.elements || [])]) {
        walkCollect(k, type, acc);
    }
}

function deepClearLevel(sites, levelId) {
    return sites.map((site) => walkClearLevel(site, levelId));
}

function walkClearLevel(node, levelId) {
    if (node.id === levelId && node.type === 'level') {
        return { ...node, elements: [], rooms: [] };
    }
    const updChildren = node.children
        ? node.children.map((c) => walkClearLevel(c, levelId))
        : undefined;
    return {
        ...node,
        ...(updChildren !== undefined ? { children: updChildren } : {}),
    };
}

