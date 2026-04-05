import React from 'react';
import {
    Settings2,
    RectangleHorizontal,
    Layers,
    Home,
    MapPin,
    Building2,
    Square,
    DoorOpen,
    AppWindow,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

const ICON_MAP = {
    site: MapPin,
    building: Building2,
    level: Layers,
    wall: RectangleHorizontal,
    slab: Square,
    roof: Home,
    door: DoorOpen,
    window: AppWindow,
};

function Field({ label, value, onChange, type = 'text', step }) {
    return (
        <div className="prop-field">
            <label className="prop-label">{label}</label>
            <input
                className="prop-input"
                type={type}
                value={value ?? ''}
                step={step}
                onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
            />
        </div>
    );
}

function WallProperties({ node }) {
    const updateElement = useEditorStore((s) => s.updateElement);
    const up = (props) => updateElement(node.id, props);

    return (
        <>
            <Field label="Name" value={node.name} onChange={(v) => up({ name: v })} />
            <div className="prop-divider" />
            <Field label="Thickness (m)" value={node.thickness ?? 0.2} type="number" step={0.05} onChange={(v) => up({ thickness: v })} />
            <Field label="Height (m)" value={node.height ?? 3.0} type="number" step={0.1} onChange={(v) => up({ height: v })} />
            <div className="prop-divider" />
            <div className="prop-field">
                <label className="prop-label">Material</label>
                <select
                    className="prop-input"
                    value={node.material ?? 'concrete'}
                    onChange={(e) => up({ material: e.target.value })}
                >
                    <option value="concrete">Concrete</option>
                    <option value="brick">Brick</option>
                    <option value="glass">Glass</option>
                    <option value="wood">Wood</option>
                    <option value="metal">Metal</option>
                </select>
            </div>
            <div className="prop-divider" />
            <div className="prop-row">
                <span className="prop-label">Start</span>
                <span className="prop-value">
                    [{(node.start?.[0] ?? 0).toFixed(2)}, {(node.start?.[1] ?? 0).toFixed(2)}]
                </span>
            </div>
            <div className="prop-row">
                <span className="prop-label">End</span>
                <span className="prop-value">
                    [{(node.end?.[0] ?? 0).toFixed(2)}, {(node.end?.[1] ?? 0).toFixed(2)}]
                </span>
            </div>
        </>
    );
}

function LevelProperties({ node }) {
    const updateElement = useEditorStore((s) => s.updateElement);
    const up = (props) => updateElement(node.id, props);

    return (
        <>
            <Field label="Name" value={node.name} onChange={(v) => up({ name: v })} />
            <div className="prop-divider" />
            <Field label="Elevation (m)" value={node.elevation ?? 0} type="number" step={0.1} onChange={(v) => up({ elevation: v })} />
            <Field label="Height (m)" value={node.height ?? 3.0} type="number" step={0.1} onChange={(v) => up({ height: v })} />
        </>
    );
}

function GenericProperties({ node }) {
    const updateElement = useEditorStore((s) => s.updateElement);
    return (
        <Field label="Name" value={node.name} onChange={(v) => updateElement(node.id, { name: v })} />
    );
}

function FeatureProperties({ node }) {
    const updateElement = useEditorStore((s) => s.updateElement);
    const up = (props) => updateElement(node.id, props);

    return (
        <>
            <Field label="Name" value={node.name} onChange={(v) => up({ name: v })} />
            <div className="prop-divider" />
            <Field label="Width (m)" value={node.width ?? 0.9} type="number" step={0.1} onChange={(v) => up({ width: v })} />
            <Field label="Height (m)" value={node.height ?? 2.1} type="number" step={0.1} onChange={(v) => up({ height: v })} />
            <div className="prop-divider" />
            <Field label="Offset (m)" value={node.distanceFromStart ?? 0} type="number" step={0.1} onChange={(v) => up({ distanceFromStart: v })} />
        </>
    );
}

export default function PropertiesPanel() {
    const selectedNode = useEditorStore((s) => s.getSelectedNode());

    return (
        <aside className="properties-panel">
            <div className="panel-header">
                <Settings2 size={13} color="var(--text-muted)" />
                <span className="panel-title">Properties</span>
            </div>

            {!selectedNode ? (
                <div className="prop-empty">
                    <Settings2 size={24} color="var(--text-muted)" style={{ opacity: 0.4 }} />
                    <p>Select an element to view its properties</p>
                </div>
            ) : (
                <div className="prop-body">
                    {/* Node type badge */}
                    <div className="prop-type-badge">
                        {React.createElement(ICON_MAP[selectedNode.type] || Square, { size: 12 })}
                        <span>{selectedNode.type.charAt(0).toUpperCase() + selectedNode.type.slice(1)}</span>
                    </div>

                    {selectedNode.type === 'wall' && <WallProperties node={selectedNode} />}
                    {selectedNode.type === 'level' && <LevelProperties node={selectedNode} />}
                    {(selectedNode.type === 'door' || selectedNode.type === 'window') && <FeatureProperties node={selectedNode} />}
                    {(selectedNode.type === 'site' || selectedNode.type === 'building') && <GenericProperties node={selectedNode} />}
                    {(selectedNode.type === 'slab' || selectedNode.type === 'roof' || selectedNode.type === 'zone') && <GenericProperties node={selectedNode} />}
                </div>
            )}
        </aside>
    );
}
