import React, { Suspense, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
    OrbitControls,
    Grid,
    Environment,
    PerspectiveCamera,
    Sky,
    BakeShadows,
} from '@react-three/drei';
import * as THREE from 'three';
import { SUBTRACTION, Brush, Evaluator } from 'three-bvh-csg';
import { useEditorStore } from '../store/useEditorStore';
import { buildWallTransform, wallLength } from '../systems/WallGeometry';
import { Room3DRenderer } from './Room3DRenderer';

// ─── Material presets ──────────────────────────────────────────────────────
const MATERIALS = {
    concrete: { color: '#f8fafc', roughness: 0.85, metalness: 0.05 },
    brick: { color: '#e5e5e5', roughness: 0.9, metalness: 0.0 },
    glass: { color: '#a7f3d0', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 },
    wood: { color: '#e2e8f0', roughness: 0.8, metalness: 0.0 },
    metal: { color: '#cbd5e1', roughness: 0.3, metalness: 0.7 },
};

// Slightly darker tone for interior divider walls
const DIVIDER_TINT = '#f1f5f9';

// ─── Reusable CSG Evaluator ────────────────────────────────────────────────
const csgEvaluator = new Evaluator();
csgEvaluator.useGroups = true;

function WallMesh({ wall, isSelected, holes = [] }) {
    const select = useEditorStore((s) => s.select);
    const transform = buildWallTransform(
        wall.start,
        wall.end,
        wall.thickness ?? 0.2,
        wall.height ?? 3.0,
        0
    );
    if (!transform) return null;

    const isDivider = wall.name?.toLowerCase().includes('divider');
    const matPreset = MATERIALS[wall.material] || MATERIALS.concrete;
    const baseColor = isSelected ? '#ffffff' : (isDivider ? DIVIDER_TINT : matPreset.color);

    // If no holes, just render a simple box
    if (holes.length === 0) {
        return (
            <mesh
                position={transform.position}
                rotation={transform.rotation}
                scale={transform.scale}
                castShadow
                receiveShadow
                onClick={(e) => { e.stopPropagation(); select(wall.id); }}
            >
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial
                    color={baseColor}
                    roughness={matPreset.roughness}
                    metalness={matPreset.metalness}
                    transparent={matPreset.transparent}
                    opacity={matPreset.opacity ?? 1}
                    emissive={isSelected ? '#22c55e' : '#000000'}
                    emissiveIntensity={isSelected ? 0.3 : 0}
                />
            </mesh>
        );
    }

    // ─── CSG Subtraction for holes ──────────────────────────────────────────
    // Create base wall brush
    const baseGeo = new THREE.BoxGeometry(1, 1, 1);
    const baseBrush = new Brush(baseGeo);
    baseBrush.position.set(...transform.position);
    baseBrush.rotation.set(...transform.rotation);
    baseBrush.scale.set(...transform.scale);
    baseBrush.updateMatrixWorld();

    let resultBrush = baseBrush;

    // Subtract each hole
    holes.forEach((hole) => {
        const holeGeo = new THREE.BoxGeometry(1, 1, 1);
        const holeBrush = new Brush(holeGeo);
        
        // Hole transform relative to the wall
        const t = hole.distanceFromStart / transform.length;
        const wx = wall.start[0] + (wall.end[0] - wall.start[0]) * t;
        const wz = wall.start[1] + (wall.end[1] - wall.start[1]) * t;
        
        // Elevation of the hole (doors start at floor, windows are higher up)
        const isWindow = hole.type === 'window';
        const holeElevation = isWindow ? 1.0 : 0; // Windows are 1m off the floor
        const wy = holeElevation + hole.height / 2;
        
        holeBrush.position.set(wx, wy, wz);
        holeBrush.rotation.set(...transform.rotation);
        // Make the hole slightly thicker than the wall to ensure a clean cut
        holeBrush.scale.set(hole.width, hole.height, (wall.thickness ?? 0.2) + 0.1);
        holeBrush.updateMatrixWorld();

        resultBrush = csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
    });

    return (
        <mesh
            geometry={resultBrush.geometry}
            castShadow
            receiveShadow
            onClick={(e) => { e.stopPropagation(); select(wall.id); }}
        >
            <meshStandardMaterial
                color={baseColor}
                roughness={matPreset.roughness}
                metalness={matPreset.metalness}
                transparent={matPreset.transparent}
                opacity={matPreset.opacity ?? 1}
                emissive={isSelected ? '#22c55e' : '#000000'}
                emissiveIntensity={isSelected ? 0.3 : 0}
            />
        </mesh>
    );
}

// ─── Feature Meshes ────────────────────────────────────────────────────────
function FeatureMesh({ item, hostWall }) {
    const select = useEditorStore((s) => s.select);
    const selectedId = useEditorStore((s) => s.selectedId);
    const isSelected = selectedId === item.id;

    if (!hostWall) return null;

    const t = item.distanceFromStart / wallLength(hostWall.start, hostWall.end);
    const wx = hostWall.start[0] + (hostWall.end[0] - hostWall.start[0]) * t;
    const wz = hostWall.start[1] + (hostWall.end[1] - hostWall.start[1]) * t;
    
    const dx = hostWall.end[0] - hostWall.start[0];
    const dz = hostWall.end[1] - hostWall.start[1];
    const angle = Math.atan2(dz, dx);
    const thickness = hostWall.thickness ?? 0.2;

    const isWindow = item.type === 'window';
    const elevation = isWindow ? 1.0 : 0;
    const wy = elevation + item.height / 2;

    return (
        <group 
            position={[wx, wy, wz]} 
            rotation={[0, -angle, 0]}
            onClick={(e) => { e.stopPropagation(); select(item.id); }}
        >
            {/* Frame */}
            <mesh castShadow receiveShadow>
                <boxGeometry args={[item.width, item.height, thickness + 0.02]} />
                <meshStandardMaterial 
                    color={isSelected ? '#ffffff' : '#f8fafc'} 
                    roughness={0.7} 
                    emissive={isSelected ? '#22c55e' : '#000000'}
                    emissiveIntensity={isSelected ? 0.4 : 0}
                />
            </mesh>
            
            {/* Inner cutout for frame */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[item.width - 0.1, item.height - 0.1, thickness + 0.04]} />
                <meshStandardMaterial color="#f1f5f9" />
            </mesh>

            {/* Glass / Panel */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[item.width - 0.1, item.height - 0.1, 0.02]} />
                {isWindow ? (
                    <meshStandardMaterial color="#86efac" roughness={0.1} metalness={0.5} transparent opacity={0.3} />
                ) : (
                    <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
                )}
            </mesh>
        </group>
    );
}


function Floor({ size = 60 }) {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
            <planeGeometry args={[size, size]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.9} metalness={0.05} />
        </mesh>
    );
}


function Scene() {
    const getAllWalls = useEditorStore((s) => s.getAllWalls);
    const getAllDoorsAndWindows = useEditorStore((s) => s.getAllDoorsAndWindows);
    const selectedId = useEditorStore((s) => s.selectedId);
    const deselect = useEditorStore((s) => s.deselect);
    const walls = getAllWalls();
    const doorsAndWindows = getAllDoorsAndWindows();
    const activeLevel = useEditorStore((s) => s.getActiveLevel());
    const rooms = activeLevel?.rooms || [];

    return (
        <>
            {/* Camera — low angle, wide view */}
            <PerspectiveCamera makeDefault position={[14, 9, 14]} fov={45} near={0.1} far={500} />
            <OrbitControls
                makeDefault
                minPolarAngle={0.1}
                maxPolarAngle={Math.PI / 2.05}
                minDistance={3}
                maxDistance={80}
                target={[0, 1, 0]}
                enableDamping
                dampingFactor={0.07}
            />

            {/* Lighting */}
            <ambientLight intensity={0.7} color="#ffffff" />

            {/* Key light — bright, clean */}
            <directionalLight
                position={[20, 30, 15]}
                intensity={1.0}
                color="#ffffff"
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-near={0.1}
                shadow-camera-far={100}
                shadow-camera-left={-30}
                shadow-camera-right={30}
                shadow-camera-top={30}
                shadow-camera-bottom={-30}
                shadow-bias={-0.001}
            />

            {/* Fill light */}
            <directionalLight position={[-15, 12, -10]} intensity={0.5} color="#e2e8f0" />

            {/* Subtle bottom bounce */}
            <hemisphereLight args={['#ffffff', '#f1f5f9', 0.6]} />

            <Suspense fallback={null}>
                <Environment preset="city" background={false} />

                {/* Floor */}
                <Floor />

                {/* Room Zones */}
                <Room3DRenderer rooms={rooms} />

                {/* Walls with Holes */}
                {walls.map((wall) => {
                    const holesForWall = doorsAndWindows.filter(f => f.attachedTo === wall.id);
                    return <WallMesh key={wall.id} wall={wall} isSelected={selectedId === wall.id} holes={holesForWall} />;
                })}

                {/* Doors and Windows (Frames/Panels) */}
                {doorsAndWindows.map((item) => {
                    const hostWall = walls.find(w => w.id === item.attachedTo);
                    return <FeatureMesh key={item.id} item={item} hostWall={hostWall} />;
                })}

                {/* Empty state — just a ring on the floor */}
                {walls.length === 0 && (
                    <group>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
                            <ringGeometry args={[1.5, 1.8, 64]} />
                            <meshStandardMaterial color="#22c55e" roughness={0.1} opacity={0.6} transparent emissive="#22c55e" emissiveIntensity={0.5} />
                        </mesh>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
                            <ringGeometry args={[0.3, 0.5, 64]} />
                            <meshStandardMaterial color="#22c55e" opacity={0.8} transparent emissive="#22c55e" emissiveIntensity={0.5} />
                        </mesh>
                    </group>
                )}

                {/* Grid — subtle, only on floor */}
                <Grid
                    position={[0, 0.001, 0]}
                    args={[80, 80]}
                    cellSize={1}
                    cellThickness={0.4}
                    cellColor="#e2e8f0"
                    sectionSize={5}
                    sectionThickness={0.8}
                    sectionColor="#cbd5e1"
                    fadeDistance={45}
                    fadeStrength={3}
                    infiniteGrid
                />
            </Suspense>

            {/* Invisible wide plane to catch deselect clicks */}
            <mesh
                position={[0, -0.1, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
                onClick={() => deselect()}
            >
                <planeGeometry args={[300, 300]} />
                <meshBasicMaterial />
            </mesh>
        </>
    );
}

export default function Viewport3D() {
    return (
        <div className="viewport-3d">
            <Canvas
                shadows={{ type: THREE.PCFShadowMap }}
                gl={{ antialias: true, toneMappingExposure: 1.1 }}
                onCreated={({ gl }) => {
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                }}
            >
                <Scene />
            </Canvas>

            {/* HUD */}
            <div className="vp3d-hud">
                <span>3D View</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    Drag to orbit · Scroll to zoom · Right-drag to pan
                </span>
            </div>
        </div>
    );
}
