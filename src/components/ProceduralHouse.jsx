import React from 'react';
import { MeshWobbleMaterial, Float } from '@react-three/drei';

const ProceduralHouse = () => {
    return (
        <group position={[0, -1, 0]}>
            {/* Foundation / Multi-level Podiums */}
            <mesh position={[0, 0.05, 0]} receiveShadow>
                <boxGeometry args={[10, 0.1, 8]} />
                <meshStandardMaterial color="#2d2d30" />
            </mesh>

            {/* Main Floor - Ground */}
            <mesh position={[-2, 1.25, 0]} castShadow receiveShadow>
                <boxGeometry args={[5, 2.5, 6]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.2} />
            </mesh>

            {/* Large Glass Section */}
            <mesh position={[2, 1.25, 1]} castShadow receiveShadow>
                <boxGeometry args={[4, 2.5, 4]} />
                <meshStandardMaterial
                    color="#a5f3fc"
                    transparent
                    opacity={0.4}
                    roughness={0}
                    metalness={1}
                />
            </mesh>

            {/* Second Floor - Offset */}
            <mesh position={[0.5, 3.25, -1]} castShadow receiveShadow>
                <boxGeometry args={[6, 1.5, 5]} />
                <meshStandardMaterial color="#ffffff" roughness={0.2} />
            </mesh>

            {/* Roof Terrace / Flat Roof */}
            <mesh position={[0.5, 4.05, -1]} castShadow receiveShadow>
                <boxGeometry args={[6.2, 0.1, 5.2]} />
                <meshStandardMaterial color="#1e293b" />
            </mesh>

            {/* Architectural Accents - Columns */}
            <mesh position={[4, 1.25, 3]} castShadow>
                <cylinderGeometry args={[0.1, 0.1, 2.5, 16]} />
                <meshStandardMaterial color="#6366f1" />
            </mesh>
            <mesh position={[4, 1.25, -1]} castShadow>
                <cylinderGeometry args={[0.1, 0.1, 2.5, 16]} />
                <meshStandardMaterial color="#6366f1" />
            </mesh>

            {/* Windows Details */}
            <mesh position={[-2, 1.5, 3.01]} castShadow>
                <boxGeometry args={[3, 1, 0.05]} />
                <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Interior Glow (Fake) */}
            <pointLight position={[2, 1.5, 1]} intensity={0.5} color="#fbbf24" distance={5} />

            {/* Exterior Decor - Small Pool / Water Feature */}
            <mesh position={[3, 0.06, -3]} receiveShadow>
                <boxGeometry args={[3, 0.02, 2]} />
                <meshStandardMaterial color="#0ea5e9" opacity={0.6} transparent roughness={0} metalness={0.5} />
            </mesh>
        </group>
    );
};

export default ProceduralHouse;
