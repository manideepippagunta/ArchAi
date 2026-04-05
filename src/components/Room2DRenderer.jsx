import React from 'react';

const ROOM_COLORS = {
    bedroom: '#add8e6',
    'master bedroom': '#add8e6',
    kitchen: '#ffcc99',
    hall: '#90ee90',
    'living room': '#90ee90',
    bathroom: '#ff9999',
    toilet: '#ff9999',
    office: '#e0e7ff',
    garage: '#f1f5f9',
    default: '#f8fafc',
};

export function Room2DRenderer({ rooms, w2p, selectedId, onSelect }) {
    if (!rooms || rooms.length === 0) return null;

    // Use a fixed scale baseline to calculate pixel dimensions accurately
    const [p0x, p0y] = w2p(0, 0);
    const [p1x, p1y] = w2p(1, 1);
    const meterPxX = Math.abs(p1x - p0x);
    const meterPxY = Math.abs(p1y - p0y);

    return (
        <g className="rooms-layer">
            {rooms.map((room) => {
                const [px, py] = w2p(room.x, room.y);
                const widthPx = room.width * meterPxX;
                const heightPx = room.height * meterPxY;

                const typeKey = room.type.toLowerCase();
                const color = ROOM_COLORS[typeKey] || ROOM_COLORS.default;

                const isSelected = selectedId === room.id;
                
                return (
                    <g key={room.id} onClick={(e) => { e.stopPropagation(); onSelect(room.id); }} style={{ cursor: 'pointer' }}>
                        <rect
                            x={px}
                            y={py}
                            width={widthPx}
                            height={heightPx}
                            fill={color}
                            fillOpacity={isSelected ? 0.7 : 0.5}
                            stroke={isSelected ? 'var(--primary)' : color}
                            strokeWidth={isSelected ? 3 : 2}
                            strokeOpacity={0.8}
                            rx={2}
                            style={{ transition: 'all 0.2s ease' }}
                        />
                        {isSelected && (
                             <rect
                                x={px - 2} y={py - 2}
                                width={widthPx + 4} height={heightPx + 4}
                                fill="transparent"
                                stroke="var(--primary)"
                                strokeWidth={1}
                                strokeDasharray="4 2"
                                rx={3}
                                opacity={0.6}
                             />
                        )}
                        <text
                            x={px + widthPx / 2}
                            y={py + heightPx / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={Math.max(10, Math.min(16, widthPx / 8))}
                            fontWeight="700"
                            fill="rgba(0,0,0,0.7)"
                            style={{ pointerEvents: 'none', userSelect: 'none', textShadow: '0 0 4px rgba(255,255,255,0.5)' }}
                        >
                            {room.type.toUpperCase()}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}
