import React from 'react';
import { Html } from '@react-three/drei';

// ─── Rich room color palette ─────────────────────────────────────────────────
const PALETTE = {
  bedroom:        '#818cf8',
  'master suite': '#6366f1',
  'master bedroom':'#6366f1',
  livingroom:     '#34d399',
  'living room':  '#34d399',
  kitchen:        '#fbbf24',
  bathroom:       '#38bdf8',
  bath:           '#38bdf8',
  dining:         '#f472b6',
  'entry lobby':  '#a78bfa',
  entry:          '#a78bfa',
  outdoor:        '#4ade80',
  balcony:        '#4ade80',
  storage:        '#94a3b8',
  utility:        '#c084fc',
  laundry:        '#c084fc',
  office:         '#2dd4bf',
  garage:         '#6b7280',
  staircase:      '#fb923c',
  pool:           '#0ea5e9',
  gym:            '#fb923c',
  cinema:         '#60a5fa',
  spa:            '#ec4899',
  default:        '#cbd5e1',
};

function getColor(room) {
  const raw = (room.roomType || room.type || room.name || '')
    .toLowerCase().replace(/^space\s*/, '').trim();
  if (PALETTE[raw]) return PALETTE[raw];
  for (const k of Object.keys(PALETTE)) {
    if (raw.includes(k) || k.includes(raw)) return PALETTE[k];
  }
  return PALETTE.default;
}

function getLabel(room) {
  const raw = room.name || room.roomType || room.type || 'Room';
  return raw.replace(/^space\s*/i, '').trim().replace(/\b\w/g, c => c.toUpperCase());
}

const ICONS = {
  bedroom: '🛏', kitchen: '🍳', bathroom: '🚿', bath: '🚿',
  livingroom: '🛋', 'living room': '🛋', dining: '🍽',
  outdoor: '🌿', balcony: '🌿', garage: '🚗', staircase: '🪜',
  office: '💻', storage: '📦', utility: '🧺', gym: '💪',
  spa: '🧖', cinema: '🎬', entry: '🚪', 'entry lobby': '🚪',
};
function getIcon(room) {
  const raw = (room.roomType || room.type || room.name || '')
    .toLowerCase().replace(/^space\s*/, '').trim();
  if (ICONS[raw]) return ICONS[raw];
  for (const k of Object.keys(ICONS)) {
    if (raw.includes(k) || k.includes(raw)) return ICONS[k];
  }
  return '🏠';
}

// ─── Perimeter walls for each room ───────────────────────────────────────────
function RoomWalls({ w, h, color }) {
  const wallH = 1.4;
  const t = 0.13;
  const hy = wallH / 2;
  const mat = <meshStandardMaterial color={color} roughness={0.7} metalness={0.1} />;
  return (
    <group>
      <mesh position={[0, hy, -(h / 2 - t / 2)]} castShadow receiveShadow>
        <boxGeometry args={[w, wallH, t]} />{mat}
      </mesh>
      <mesh position={[0, hy, h / 2 - t / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, wallH, t]} />{mat}
      </mesh>
      <mesh position={[-(w / 2 - t / 2), hy, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, wallH, h]} />{mat}
      </mesh>
      <mesh position={[w / 2 - t / 2, hy, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, wallH, h]} />{mat}
      </mesh>
    </group>
  );
}

// ─── Furniture placeholders ───────────────────────────────────────────────────
function Bed({ w, h }) {
  const bw = Math.min(1.6, w * 0.55);
  const bh = Math.min(2.0, h * 0.6);
  const px = -w / 2 + bw / 2 + 0.25;
  const pz = -h / 2 + bh / 2 + 0.25;
  return (
    <group position={[px, 0, pz]}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[bw, 0.4, bh]} />
        <meshStandardMaterial color="#7c3aed" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.42, -(bh / 2 - 0.22)]}>
        <boxGeometry args={[bw * 0.72, 0.1, 0.38]} />
        <meshStandardMaterial color="#ede9fe" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Sofa({ w, h }) {
  const sw = Math.min(2.6, w * 0.65);
  return (
    <group position={[0, 0, h / 2 - 0.55]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[sw, 0.44, 0.85]} />
        <meshStandardMaterial color="#0f766e" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.58, 0.35]} castShadow>
        <boxGeometry args={[sw, 0.72, 0.14]} />
        <meshStandardMaterial color="#0f766e" roughness={0.72} />
      </mesh>
      {/* Coffee table */}
      <mesh position={[0, 0.2, -0.9]} castShadow>
        <boxGeometry args={[sw * 0.55, 0.06, 0.55]} />
        <meshStandardMaterial color="#92400e" roughness={0.5} />
      </mesh>
    </group>
  );
}

function KitchenCounter({ w, h }) {
  const cw = Math.max(w - 0.35, 1);
  const ch = Math.max(h * 0.55, 1);
  return (
    <>
      <mesh position={[0, 0.46, -(h / 2 - 0.3)]} castShadow>
        <boxGeometry args={[cw, 0.92, 0.56]} />
        <meshStandardMaterial color="#d97706" roughness={0.38} metalness={0.12} />
      </mesh>
      <mesh position={[-(w / 2 - 0.3), 0.46, 0]} castShadow>
        <boxGeometry args={[0.56, 0.92, ch]} />
        <meshStandardMaterial color="#d97706" roughness={0.38} metalness={0.12} />
      </mesh>
    </>
  );
}

function DiningTable({ w, h }) {
  const tw = Math.min(1.6, w * 0.55);
  const th = Math.min(1.0, h * 0.5);
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[tw, 0.06, th]} />
        <meshStandardMaterial color="#92400e" roughness={0.55} />
      </mesh>
      {[-tw / 2 + 0.2, tw / 2 - 0.2].map((x, i) => (
        <mesh key={i} position={[x, 0.2, 0]} castShadow>
          <boxGeometry args={[0.12, 0.4, 0.12]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Toilet({ w, h }) {
  const px = w / 2 - 0.4;
  const pz = h / 2 - 0.4;
  return (
    <group position={[px, 0, pz]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.5, 0.55, 0.68]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.07, -0.28]}>
        <boxGeometry args={[0.38, 0.14, 0.42]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Desk({ w, h }) {
  return (
    <group position={[-w / 2 + 0.75, 0, -h / 2 + 0.4]}>
      <mesh position={[0, 0.38, 0]} castShadow>
        <boxGeometry args={[1.4, 0.05, 0.7]} />
        <meshStandardMaterial color="#475569" roughness={0.45} />
      </mesh>
      {[[-0.6, 0], [0.6, 0]].map(([x], i) => (
        <mesh key={i} position={[x, 0.19, 0]}>
          <boxGeometry args={[0.06, 0.38, 0.06]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[0, 0.72, -0.28]}>
        <boxGeometry args={[0.55, 0.35, 0.04]} />
        <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.4} />
      </mesh>
    </group>
  );
}

function Furniture({ room, w, h }) {
  const raw = (room.roomType || room.type || room.name || '')
    .toLowerCase().replace(/^space\s*/, '').trim();
  if (raw.includes('bedroom') || raw === 'bedroom') return <Bed w={w} h={h} />;
  if (raw.includes('living')) return <Sofa w={w} h={h} />;
  if (raw.includes('kitchen')) return <KitchenCounter w={w} h={h} />;
  if (raw.includes('dining')) return <DiningTable w={w} h={h} />;
  if (raw.includes('bath')) return <Toilet w={w} h={h} />;
  if (raw.includes('office') || raw.includes('study') || raw.includes('desk')) return <Desk w={w} h={h} />;
  return null;
}

// ─── Main room renderer ───────────────────────────────────────────────────────
export function Room3DRenderer({ rooms }) {
  if (!rooms || rooms.length === 0) return null;

  return (
    <group name="rooms-layer">
      {rooms.map((room, i) => {
        const color = getColor(room);
        const label = getLabel(room);
        const icon  = getIcon(room);
        const w = Math.max(room.width ?? 4, 0.8);
        const h = Math.max(room.height ?? 4, 0.8);
        const cx = (room.x ?? 0) + w / 2;
        const cz = (room.y ?? 0) + h / 2;

        return (
          <group key={room.id || `room_${i}`} position={[cx, 0, cz]}>

            {/* Colored floor slab with realistic depth */}
            <mesh receiveShadow castShadow position={[0, -0.05, 0]}>
              <boxGeometry args={[w - 0.04, 0.18, h - 0.04]} />
              <meshStandardMaterial
                color={color}
                roughness={0.6}
                metalness={0.05}
                transparent={false}
              />
            </mesh>

            {/* Floor shading edge ring */}
            <mesh receiveShadow position={[0, 0.005, 0]}>
              <boxGeometry args={[w, 0.01, h]} />
              <meshStandardMaterial color="#0f172a" transparent opacity={0.12} />
            </mesh>

            {/* Perimeter walls */}
            <RoomWalls w={w} h={h} color={color} />

            {/* Furniture */}
            <Furniture room={room} w={w} h={h} />

            {/* HTML label */}
            <Html
              position={[0, 0.85, 0]}
              center
              distanceFactor={14}
              style={{
                color: '#1e293b',
                background: 'rgba(255, 255, 255, 0.98)',
                padding: '6px 12px',
                borderRadius: 16,
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                border: `2px solid ${color}`,
                boxShadow: `0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px ${color}40`,
                pointerEvents: 'none',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: '15px' }}>{icon}</span> {label}
            </Html>
          </group>
        );
      })}
    </group>
  );
}
