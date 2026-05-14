import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { snap, pixelToWorld, worldToPixel } from '../systems/SnapSystem';
import { wallLength, formatLength } from '../systems/WallGeometry';
import { Room2DRenderer } from './Room2DRenderer';

const WORLD_W = 30; // 30 metres visible by default
const WORLD_H = 20;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;

export default function Viewport2D() {
    const svgRef = useRef(null);
    const [svgSize, setSvgSize] = useState({ w: 800, h: 600 });
    const [viewport, setViewport] = useState({ x: -WORLD_W / 2, y: -WORLD_H / 2, width: WORLD_W, height: WORLD_H });
    const [drawStart, setDrawStart] = useState(null);
    const [cursorWorld, setCursorWorld] = useState(null);
    const [isPanning, setIsPanning] = useState(false);
    const [dragSession, setDragSession] = useState(null); // { id, type: 'move'|'resize', startPos, initialRect }
    const panRef = useRef(null);
    const unitRef = useRef('m');

    const activeTool = useEditorStore((s) => s.activeTool);
    const selectedId = useEditorStore((s) => s.selectedId);
    const select = useEditorStore((s) => s.select);
    const deselect = useEditorStore((s) => s.deselect);
    const cursor2D = useEditorStore((s) => s.cursor2D);
    const setCursor2D = useEditorStore((s) => s.setCursor2D);
    const addWall = useEditorStore((s) => s.addWall);
    const addRooms = useEditorStore((s) => s.addRooms);
    const moveRoom = useEditorStore((s) => s.moveRoom);
    const resizeRoom = useEditorStore((s) => s.resizeRoom);
    const deleteSelected = useEditorStore((s) => s.deleteSelected);
    const setActiveTool = useEditorStore((s) => s.setActiveTool);
    
    const getAllWalls = useEditorStore((s) => s.getAllWalls);
    const getAllDoorsAndWindows = useEditorStore((s) => s.getAllDoorsAndWindows);
    const getActiveLevel = useEditorStore((s) => s.getActiveLevel);

    const walls = getAllWalls();
    const doorsAndWindows = getAllDoorsAndWindows();
    const activeLevel = getActiveLevel();
    const rooms = activeLevel?.rooms || [];

    // Track SVG size
    useEffect(() => {
        const obs = new ResizeObserver((entries) => {
            const r = entries[0].contentRect;
            setSvgSize({ w: r.width, h: r.height });
        });
        if (svgRef.current) obs.observe(svgRef.current.parentElement);
        return () => obs.disconnect();
    }, []);

    // ── Coordinate helpers ──────────────────────────────────────────────────
    const p2w = useCallback((px, py) =>
        pixelToWorld(px, py, viewport, svgSize.w, svgSize.h), [viewport, svgSize]);

    const w2p = useCallback((wx, wy) =>
        worldToPixel(wx, wy, viewport, svgSize.w, svgSize.h), [viewport, svgSize]);

    const getSnapped = useCallback((px, py) => {
        const raw = p2w(px, py);
        return snap(raw, walls);
    }, [p2w, walls]);

    // ── Mouse events ─────────────────────────────────────────────────────────
    const onMouseMove = (e) => {
        const rect = svgRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const pt = getSnapped(px, py);

        if (isPanning && panRef.current) {
            const dx = (e.clientX - panRef.current.x) * (viewport.width / svgSize.w);
            const dy = (e.clientY - panRef.current.y) * (viewport.height / svgSize.h);
            setViewport((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
            panRef.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (dragSession) {
            const dx = pt[0] - dragSession.startPos[0];
            const dy = pt[1] - dragSession.startPos[1];

            if (dragSession.type === 'move') {
                moveRoom(dragSession.id, dragSession.initialRect.x + dx - rooms.find(r => r.id === dragSession.id).x, dy + dragSession.initialRect.y - rooms.find(r => r.id === dragSession.id).y);
            } else if (dragSession.type === 'resize') {
                const newW = Math.max(0.5, dragSession.initialRect.width + dx);
                const newH = Math.max(0.5, dragSession.initialRect.height + dy);
                resizeRoom(dragSession.id, newW, newH);
            }
        }

        setCursorWorld(pt);
    };

    const onMouseDown = (e) => {
        const rect = svgRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const pt = getSnapped(px, py);

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            panRef.current = { x: e.clientX, y: e.clientY };
            return;
        }

        // TOOL: DELETE
        if (activeTool === 'delete') {
            const target = rooms.find(r => pt[0] >= r.x && pt[0] <= r.x + r.width && pt[1] >= r.y && pt[1] <= r.y + r.height);
            if (target) {
                select(target.id);
                deleteSelected();
            }
            return;
        }

        // TOOL: ROOM
        if (activeTool === 'room') {
            addRooms(activeLevel.id, [{ type: 'bedroom', x: pt[0], y: pt[1], width: 4, height: 4 }]);
            setActiveTool('select');
            return;
        }

        // Handle selection/dragging
        const clickedRoom = rooms.find(r => pt[0] >= r.x && pt[0] <= r.x + r.width && pt[1] >= r.y && pt[1] <= r.y + r.height);
        
        // Handle resize handle click if a room is selected
        if (selectedId) {
            const sel = rooms.find(r => r.id === selectedId);
            if (sel) {
                const handleSize = 0.4;
                const hx = sel.x + sel.width;
                const hy = sel.y + sel.height;
                if (Math.abs(pt[0] - hx) < handleSize && Math.abs(pt[1] - hy) < handleSize) {
                    setDragSession({ id: sel.id, type: 'resize', startPos: pt, initialRect: { ...sel } });
                    return;
                }
            }
        }

        if (clickedRoom) {
            select(clickedRoom.id);
            if (activeTool === 'move') {
                setDragSession({ id: clickedRoom.id, type: 'move', startPos: pt, initialRect: { ...clickedRoom } });
            }
        } else {
            if (activeTool === 'select') {
                setCursor2D(pt);
            }
            deselect();
        }

        if (activeTool === 'wall') {
            if (!drawStart) {
                setDrawStart(pt);
            } else {
                if (activeLevel) {
                    addWall(activeLevel.id, {
                        start: drawStart,
                        end: pt,
                        thickness: 0.2,
                        height: activeLevel.height ?? 3.0,
                    });
                }
                setDrawStart(null);
            }
        }
    };

    const onMouseUp = () => {
        setIsPanning(false);
        setDragSession(null);
    };

    const onWheel = (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        const rect = svgRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const wx = viewport.x + (px / svgSize.w) * viewport.width;
        const wy = viewport.y + (py / svgSize.h) * viewport.height;
        const newW = Math.min(Math.max(viewport.width * factor, WORLD_W / MAX_ZOOM), WORLD_W / MIN_ZOOM);
        const newH = Math.min(Math.max(viewport.height * factor, WORLD_H / MAX_ZOOM), WORLD_H / MIN_ZOOM);
        setViewport({
            x: wx - (px / svgSize.w) * newW,
            y: wy - (py / svgSize.h) * newH,
            width: newW,
            height: newH,
        });
    };

    const onRightClick = (e) => {
        e.preventDefault();
        setDrawStart(null);
    };

    // ── Grid lines ───────────────────────────────────────────────────────────
    const gridStep = 1; // 1 m minor grid
    const majorStep = 5;
    const startX = Math.floor(viewport.x);
    const startY = Math.floor(viewport.y);
    const endX = Math.ceil(viewport.x + viewport.width);
    const endY = Math.ceil(viewport.y + viewport.height);

    const gridLines = [];
    for (let gx = startX; gx <= endX; gx++) {
        const [px1] = w2p(gx, 0);
        const isMajor = gx % majorStep === 0;
        gridLines.push(
            <line key={`vx${gx}`} x1={px1} y1={0} x2={px1} y2={svgSize.h}
                stroke={isMajor ? 'rgba(34,197,94,0.2)' : 'rgba(0,0,0,0.05)'}
                strokeWidth={isMajor ? 1 : 0.5} />
        );
        // Measurement label on major lines
        if (isMajor && gx !== 0) {
            gridLines.push(
                <text key={`lx${gx}`} x={px1 + 3} y={svgSize.h - 6}
                    fontSize={9} fill="rgba(148,163,184,0.9)" fontFamily="Inter, sans-serif">
                    {gx}m
                </text>
            );
        }
    }
    for (let gy = startY; gy <= endY; gy++) {
        const [, py1] = w2p(0, gy);
        const isMajor = gy % majorStep === 0;
        gridLines.push(
            <line key={`hy${gy}`} x1={0} y1={py1} x2={svgSize.w} y2={py1}
                stroke={isMajor ? 'rgba(34,197,94,0.2)' : 'rgba(0,0,0,0.05)'}
                strokeWidth={isMajor ? 1 : 0.5} />
        );
        if (isMajor && gy !== 0) {
            gridLines.push(
                <text key={`ly${gy}`} x={4} y={py1 - 3}
                    fontSize={9} fill="rgba(148,163,184,0.9)" fontFamily="Inter, sans-serif">
                    {gy}m
                </text>
            );
        }
    }

    // ── Axis lines ───────────────────────────────────────────────────────────
    const [ax] = w2p(0, 0);
    const [, ay] = w2p(0, 0);

    return (
        <div className="viewport-2d">
            {/* Cursor info */}
            <div className="vp2d-hud">
                {cursorWorld && (
                    <span>{cursorWorld[0].toFixed(2)} m, {cursorWorld[1].toFixed(2)} m</span>
                )}
                {activeTool === 'wall' && drawStart && cursorWorld && (
                    <span style={{ marginLeft: '12px', color: 'var(--primary)' }}>
                        Δ {formatLength(wallLength(drawStart, cursorWorld), unitRef.current)}
                    </span>
                )}
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '11px' }}>
                    {activeTool === 'wall'
                        ? drawStart ? 'Click to place end point • Right-click to cancel' : 'Click to start wall'
                        : 'Alt+drag or scroll to pan/zoom'}
                </span>
            </div>

            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                style={{ cursor: activeTool === 'wall' ? 'crosshair' : isPanning ? 'grabbing' : 'default', display: 'block' }}
                onMouseMove={onMouseMove}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onWheel={onWheel}
                onContextMenu={onRightClick}
            >
                {/* Grid */}
                <g>{gridLines}</g>

                {/* Axes */}
                <line x1={ax} y1={0} x2={ax} y2={svgSize.h} stroke="rgba(34,197,94,0.5)" strokeWidth={1.5} />
                <line x1={0} y1={ay} x2={svgSize.w} y2={ay} stroke="rgba(34,197,94,0.5)" strokeWidth={1.5} />

                {/* Rooms (Floor fills) */}
                <Room2DRenderer rooms={rooms} w2p={w2p} selectedId={selectedId} onSelect={select} />

                {/* Resize handle for selected room */}
                {selectedId && rooms.find(r => r.id === selectedId) && (
                    <g transform={`translate(${w2p(rooms.find(r => r.id === selectedId).x + rooms.find(r => r.id === selectedId).width, rooms.find(r => r.id === selectedId).y + rooms.find(r => r.id === selectedId).height)[0]}, ${w2p(rooms.find(r => r.id === selectedId).x + rooms.find(r => r.id === selectedId).width, rooms.find(r => r.id === selectedId).y + rooms.find(r => r.id === selectedId).height)[1]})`}>
                        <circle r="6" className="resize-handle" />
                    </g>
                )}

                {/* Rooms (Floor fills) */}
                <Room2DRenderer rooms={rooms} w2p={w2p} />

                {/* AI Cursor / Area Selection Indicator */}
                {cursor2D && (
                    <g transform={`translate(${w2p(cursor2D[0], cursor2D[1])[0]}, ${w2p(cursor2D[0], cursor2D[1])[1]})`}>
                        <circle r="12" fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 2" />
                        <line x1="-16" y1="0" x2="16" y2="0" stroke="#f43f5e" strokeWidth="1.5" />
                        <line x1="0" y1="-16" x2="0" y2="16" stroke="#f43f5e" strokeWidth="1.5" />
                        <circle r="3" fill="#f43f5e" />
                    </g>
                )}

                {/* Drawn walls */}
                {walls.map((wall) => {
                    const [x1, y1] = w2p(wall.start[0], wall.start[1]);
                    const [x2, y2] = w2p(wall.end[0], wall.end[1]);
                    const isSelected = selectedId === wall.id;
                    // Midpoint for label
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    const len = wallLength(wall.start, wall.end);
                    return (
                        <g key={wall.id} onClick={() => select(wall.id)} style={{ cursor: 'pointer' }}>
                            {/* Wall hit area (wider, invisible) */}
                            <line
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke="transparent"
                                strokeWidth={12}
                            />
                            {/* Wall line */}
                            <line
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke={isSelected ? '#22c55e' : '#334155'}
                                strokeWidth={isSelected ? 4 : 3}
                                strokeLinecap="round"
                                opacity={isSelected ? 1 : 0.85}
                            />
                            {/* Endpoint dots */}
                            <circle cx={x1} cy={y1} r={5} fill={isSelected ? '#22c55e' : '#94a3b8'} stroke="white" strokeWidth={1.5} />
                            <circle cx={x2} cy={y2} r={5} fill={isSelected ? '#22c55e' : '#94a3b8'} stroke="white" strokeWidth={1.5} />
                            {/* Length label */}
                            <rect x={mx - 20} y={my - 18} width={40} height={14} rx={4} fill="white" opacity={0.85} />
                            <text
                                x={mx} y={my - 8}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={isSelected ? 700 : 500}
                                fill={isSelected ? '#16a34a' : '#64748b'}
                                fontFamily="Inter, sans-serif"
                            >
                                {formatLength(len)}
                            </text>
                        </g>
                    );
                })}

                {/* Drawn doors & windows */}
                {doorsAndWindows.map((item) => {
                    const hostWall = walls.find(w => w.id === item.attachedTo);
                    if (!hostWall) return null;

                    const isSelected = selectedId === item.id;
                    const wallLen = wallLength(hostWall.start, hostWall.end);
                    const t = item.distanceFromStart / wallLen;
                    
                    // Position
                    const wx = hostWall.start[0] + (hostWall.end[0] - hostWall.start[0]) * t;
                    const wy = hostWall.start[1] + (hostWall.end[1] - hostWall.start[1]) * t;
                    const [px, py] = w2p(wx, wy);

                    // Rotation
                    const dx = hostWall.end[0] - hostWall.start[0];
                    const dy = hostWall.end[1] - hostWall.start[1];
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    const widthPx = item.width * (viewport.width ? svgSize.w / viewport.width : 50);

                    if (item.type === 'window') {
                        return (
                            <g key={item.id} onClick={(e) => { e.stopPropagation(); select(item.id); }} style={{ cursor: 'pointer' }} transform={`translate(${px}, ${py}) rotate(${angle})`}>
                                <rect
                                    x={-widthPx / 2} y={-4}
                                    width={widthPx} height={8}
                                    fill={isSelected ? '#dcfce7' : 'white'}
                                    stroke={isSelected ? '#22c55e' : '#86efac'}
                                    strokeWidth={2}
                                    rx={2}
                                />
                                <line x1={-widthPx / 2} y1={0} x2={widthPx / 2} y2={0} stroke={isSelected ? '#22c55e' : '#86efac'} strokeWidth={1} />
                            </g>
                        );
                    }

                    if (item.type === 'door') {
                        return (
                            <g key={item.id} onClick={(e) => { e.stopPropagation(); select(item.id); }} style={{ cursor: 'pointer' }} transform={`translate(${px}, ${py}) rotate(${angle})`}>
                                {/* Door swing arc */}
                                <path
                                    d={`M ${-widthPx / 2} 0 A ${widthPx} ${widthPx} 0 0 1 ${widthPx / 2} ${-widthPx} L ${-widthPx / 2} 0`}
                                    fill="rgba(34,197,94,0.06)"
                                    stroke={isSelected ? '#22c55e' : '#94a3b8'}
                                    strokeWidth={1}
                                    strokeDasharray="4 2"
                                />
                                {/* Door panel */}
                                <line x1={-widthPx / 2} y1={0} x2={widthPx / 2} y2={-widthPx} stroke={isSelected ? '#22c55e' : '#475569'} strokeWidth={3} strokeLinecap="round" />
                                {/* Hole cutout */}
                                <rect x={-widthPx / 2} y={-3} width={widthPx} height={6} fill="white" />
                            </g>
                        );
                    }
                    return null;
                })}

                {/* Ghost wall while drawing */}
                {drawStart && cursorWorld && (
                    <g>
                        <line
                            x1={w2p(drawStart[0], drawStart[1])[0]}
                            y1={w2p(drawStart[0], drawStart[1])[1]}
                            x2={w2p(cursorWorld[0], cursorWorld[1])[0]}
                            y2={w2p(cursorWorld[0], cursorWorld[1])[1]}
                            stroke="#22c55e"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            strokeLinecap="round"
                            opacity={0.8}
                        />
                        <circle
                            cx={w2p(drawStart[0], drawStart[1])[0]}
                            cy={w2p(drawStart[0], drawStart[1])[1]}
                            r={6} fill="#22c55e" opacity={0.9}
                        />
                        <circle
                            cx={w2p(cursorWorld[0], cursorWorld[1])[0]}
                            cy={w2p(cursorWorld[0], cursorWorld[1])[1]}
                            r={6} fill="#22c55e" opacity={0.5}
                        />
                    </g>
                )}

                {/* Snap indicator */}
                {cursorWorld && (
                    <circle
                        cx={w2p(cursorWorld[0], cursorWorld[1])[0]}
                        cy={w2p(cursorWorld[0], cursorWorld[1])[1]}
                        r={7} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.6}
                    />
                )}
            </svg>
        </div>
    );
}
