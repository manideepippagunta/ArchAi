import React from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

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

export function Room3DRenderer({ rooms }) {
    if (!rooms || rooms.length === 0) return null;

    return (
        <group name="rooms-layer">
            {rooms.map((room) => {
                const color = ROOM_COLORS[room.type.toLowerCase()] || ROOM_COLORS.default;
                
                // Convert hex to THREE color for slab
                const threeColor = new THREE.Color(color).multiplyScalar(0.9); // Slightly darker for depth

                // Centering the room (room.x/y is top-left in our 2D coordinate system, 
                // but in 3D X/Z is the floor plane)
                const posX = room.x + room.width / 2;
                const posZ = room.y + room.height / 2;
                const posY = 0.05; // Slightly above ground to avoid z-fighting

                return (
                    <group key={room.id} position={[posX, posY, posZ]}>
                        {/* Floor Slab */}
                        <mesh receiveShadow>
                            <boxGeometry args={[room.width, 0.1, room.height]} />
                            <meshStandardMaterial 
                                color={color} 
                                transparent 
                                opacity={0.7}
                                roughness={0.4}
                                metalness={0.1}
                            />
                        </mesh>
                        
                        {/* Room Label */}
                        <Html
                            position={[0, 0.2, 0]}
                            center
                            distanceFactor={10}
                            occlude
                            style={{
                                color: '#0f172a',
                                background: 'rgba(255, 255, 255, 0.95)',
                                padding: '6px 12px',
                                borderRadius: '12px',
                                fontSize: '14px',
                                fontWeight: '800',
                                whiteSpace: 'nowrap',
                                border: `2px solid ${color}`,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                pointerEvents: 'none',
                                userSelect: 'none',
                                transform: 'translateY(-20px)'
                            }}
                        >
                            <div className="room-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '10px', opacity: 0.6, marginBottom: '2px' }}>ROOM</span>
                                {room.type.toUpperCase()}
                            </div>
                        </Html>
                    </group>
                );
            })}
        </group>
    );
}
