import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useEditorStore } from '../store/useEditorStore';
import { buildWallTransform } from '../systems/WallGeometry';
import { Room3DRenderer } from './Room3DRenderer';

// ─── Wall Mesh ─────────────────────────────────────────────────────────────────
function WallMesh({ wall }) {
    if (!wall?.start || !wall?.end) return null;
    const transform = buildWallTransform(
        wall.start, wall.end,
        wall.thickness ?? 0.2,
        wall.height ?? 3.0, 0
    );
    if (!transform) return null;
    return (
        <mesh position={transform.position} rotation={transform.rotation} castShadow receiveShadow>
            <boxGeometry args={[transform.scale[0], transform.scale[1], transform.scale[2]]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.15} />
        </mesh>
    );
}

// ─── Floor ─────────────────────────────────────────────────────────────────────
function Floor() {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[200, 200]} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} metalness={0.0} />
        </mesh>
    );
}

// ─── Camera Animator — smooth lerp to frame the layout ────────────────────────
function CameraAnimator({ rooms, controlsRef }) {
    const { camera } = useThree();
    const targetPos  = useRef([15, 12, 15]);
    const targetLook = useRef([0, 0, 0]);

    // Recompute ideal camera framing when room count changes
    useEffect(() => {
        if (!rooms.length) return;
        const xs = rooms.flatMap(r => [r.x ?? 0, (r.x ?? 0) + (r.width ?? 4)]);
        const zs = rooms.flatMap(r => [r.y ?? 0, (r.y ?? 0) + (r.height ?? 4)]);
        const cx   = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cz   = (Math.min(...zs) + Math.max(...zs)) / 2;
        const span = Math.max(
            Math.max(...xs) - Math.min(...xs),
            Math.max(...zs) - Math.min(...zs)
        );
        const dist = Math.max(span * 0.55, 8) + 4; // Zoom closer
        targetPos.current  = [cx + dist * 0.65, dist * 0.75, cz + dist * 0.65]; // Better angle
        targetLook.current = [cx, 0, cz];
    }, [rooms.length]);

    // Smooth lerp every frame
    useFrame(() => {
        const sp = 0.040; // lerp speed — higher = snappier
        const [tx, ty, tz] = targetPos.current;
        camera.position.x += (tx - camera.position.x) * sp;
        camera.position.y += (ty - camera.position.y) * sp;
        camera.position.z += (tz - camera.position.z) * sp;

        if (controlsRef.current) {
            const [lx, ly, lz] = targetLook.current;
            const t = controlsRef.current.target;
            t.x += (lx - t.x) * sp;
            t.y += (ly - t.y) * sp;
            t.z += (lz - t.z) * sp;
            controlsRef.current.update();
        }
    });

    return null;
}

// ─── Scene ─────────────────────────────────────────────────────────────────────
function Scene() {
    const getAllWalls  = useEditorStore(s => s.getAllWalls);
    const activeLevel  = useEditorStore(s => s.getActiveLevel());
    const walls = getAllWalls() || [];
    const rooms = activeLevel?.rooms || [];
    const controlsRef = useRef();

    return (
        <>
            {/* Smooth camera animator */}
            <CameraAnimator rooms={rooms} controlsRef={controlsRef} />

            {/* Orbit controls — user can still drag manually */}
            <OrbitControls
                ref={controlsRef}
                minPolarAngle={0.1}
                maxPolarAngle={Math.PI / 2.1}
                minDistance={3}
                maxDistance={160}
                enableDamping
                dampingFactor={0.08}
            />

            {/* Lighting — layered for realistic bright architectural look */}
            <ambientLight intensity={0.75} color="#ffffff" />
            <directionalLight
                position={[20, 35, 15]} intensity={1.15} color="#ffffff"
                castShadow
                shadow-mapSize-width={4096} shadow-mapSize-height={4096}
                shadow-camera-left={-40} shadow-camera-right={40}
                shadow-camera-top={40} shadow-camera-bottom={-40}
                shadow-bias={-0.0001}
            />
            <directionalLight position={[-15, 15, -10]} intensity={0.5} color="#e0f2fe" />
            <pointLight position={[0, 4, 20]} intensity={0.35} color="#fef3c7" distance={80} />
            <hemisphereLight args={['#ffffff', '#f8fafc', 0.6]} />

            <Suspense fallback={null}>
                <Room3DRenderer rooms={rooms} />
                {walls.map(wall => <WallMesh key={wall.id} wall={wall} />)}
                <Floor />
                <Grid
                    position={[0, 0.001, 0]} args={[80, 80]}
                    cellSize={1} cellThickness={0.4} cellColor="#e2e8f0"
                    sectionSize={5} sectionThickness={0.8} sectionColor="#cbd5e1"
                    infiniteGrid
                />
                {walls.length === 0 && rooms.length === 0 && (
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
                        <ringGeometry args={[1.5, 1.8, 64]} />
                        <meshStandardMaterial color="#22c55e" opacity={0.7} transparent emissive="#22c55e" emissiveIntensity={0.5} />
                    </mesh>
                )}
            </Suspense>
        </>
    );
}

// ─── Main Viewport ─────────────────────────────────────────────────────────────
export default function Viewport3D() {
    return (
        <div className="viewport-3d" style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
                <group scale={[1.05, 1.05, 1.05]}>
                    <Scene />
                </group>
            </Canvas>

            {/* HUD */}
            <div className="vp3d-hud" style={{
                position: 'absolute', bottom: 12, right: 12,
                background: 'rgba(15,23,42,0.7)', color: '#e2e8f0',
                padding: '6px 12px', borderRadius: 8, fontSize: 11,
                pointerEvents: 'none',
                display: 'flex', gap: 8,
            }}>
                <span>3D View</span>
                <span style={{ color: '#94a3b8' }}>Drag · Scroll · Right-drag</span>
            </div>
        </div>
    );
}