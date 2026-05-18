import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
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
    3.0, 0
  );
  if (!transform) return null;
  return (
    <mesh
      position={transform.position}
      rotation={transform.rotation}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[transform.scale[0], transform.scale[1], transform.scale[2]]} />
      <meshStandardMaterial
        color="#f1f5f9"
        roughness={0.7}
        metalness={0.15}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

// ─── Floor ─────────────────────────────────────────────────────────────────────
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#f8fafc" roughness={1.0} metalness={0.0} />
    </mesh>
  );
}

// ─── Scene Setup — re-centers camera every time layout changes ────────────────
function SceneSetup({ rooms, controlsRef }) {
  const { camera } = useThree();
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (!rooms.length) return;
    if (rooms.length === prevLengthRef.current) return;
    prevLengthRef.current = rooms.length;

    const xs = rooms.flatMap(r => [r.x ?? 0, (r.x ?? 0) + (r.width  ?? 4)]);
    const zs = rooms.flatMap(r => [r.y ?? 0, (r.y ?? 0) + (r.height ?? 4)]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;

    // Calculate good zoom distance based on layout size
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanZ = Math.max(...zs) - Math.min(...zs);
    const span  = Math.max(spanX, spanZ, 8);
    const dist  = span * 1.4;

    if (controlsRef.current) {
      controlsRef.current.target.set(cx, 0, cz);
      camera.position.set(cx + dist, dist * 0.78, cz + dist);
      controlsRef.current.update();
    }
  }, [rooms.length, camera, controlsRef]);

  return null;
}

// ─── Scene ─────────────────────────────────────────────────────────────────────
function Scene() {
  const getAllWalls = useEditorStore(s => s.getAllWalls);
  const activeLevel = useEditorStore(s => s.getActiveLevel());
  const walls  = getAllWalls() || [];
  const rooms  = activeLevel?.rooms || [];
  const controlsRef = useRef();

  return (
    <>
      {/* Re-center camera on every new layout */}
      <SceneSetup rooms={rooms} controlsRef={controlsRef} />

      {/* Orbit controls — dollhouse perspective limits */}
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.3}
        minDistance={3}
        maxDistance={180}
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.4}
      />

      {/* Lighting */}
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[-10, 12, -10]} intensity={0.35} />
      <directionalLight position={[10, 8, -10]}  intensity={0.25} />

      <Suspense fallback={null}>
        {/* Rooms */}
        <Room3DRenderer rooms={rooms} />

        {/* Manual walls */}
        {walls.map(wall => <WallMesh key={wall.id} wall={wall} />)}

        {/* Ground plane */}
        <Floor />

        {/* Grid */}
        <Grid
          position={[0, 0, 0]}
          args={[80, 80]}
          cellSize={1}
          cellThickness={0.4}
          cellColor="#e2e8f0"
          sectionSize={5}
          sectionThickness={0.8}
          sectionColor="#cbd5e1"
          infiniteGrid
        />

        {/* Empty state indicator */}
        {walls.length === 0 && rooms.length === 0 && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[1.5, 1.8, 64]} />
            <meshStandardMaterial
              color="#22c55e"
              opacity={0.7}
              transparent
              emissive="#22c55e"
              emissiveIntensity={0.5}
            />
          </mesh>
        )}
      </Suspense>
    </>
  );
}

// ─── Main Viewport ─────────────────────────────────────────────────────────────
export default function Viewport3D() {
  return (
    <div
      className="viewport-3d"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <Canvas
        shadows
        camera={{ position: [22, 18, 22], fov: 45 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <Scene />
      </Canvas>

      {/* HUD */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: 'rgba(255, 255, 255, 0.92)',
          color: '#0f172a',
          border: '1px solid #e2e8f0',
          padding: '6px 14px',
          borderRadius: 10,
          fontSize: 11,
          pointerEvents: 'none',
          display: 'flex',
          gap: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <span style={{ fontWeight: 600 }}>3D View</span>
        <span style={{ color: '#94a3b8' }}>Drag · Scroll · Right-drag</span>
      </div>
    </div>
  );
}
