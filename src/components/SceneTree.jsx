import React, { useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    Building2,
    Layers,
    MapPin,
    RectangleHorizontal,
    Square,
    Home,
    Plus,
    Trash2,
    PenLine,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

const NODE_ICONS = {
    site: MapPin,
    building: Building2,
    level: Layers,
    wall: RectangleHorizontal,
    slab: Square,
    roof: Home,
    zone: Square,
};

const NODE_COLORS = {
    site: '#a78bfa',
    building: '#60a5fa',
    level: '#34d399',
    wall: '#f8fafc',
    slab: '#fbbf24',
    roof: '#f87171',
};

function TreeNode({ node, depth = 0 }) {
    const [open, setOpen] = useState(true);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(node.name);

    const selectedId = useEditorStore((s) => s.selectedId);
    const select = useEditorStore((s) => s.select);
    const renameNode = useEditorStore((s) => s.renameNode);
    const deleteSelected = useEditorStore((s) => s.deleteSelected);
    const addLevel = useEditorStore((s) => s.addLevel);

    const isSelected = selectedId === node.id;
    const Icon = NODE_ICONS[node.type] || Square;
    const color = NODE_COLORS[node.type] || 'var(--text-secondary)';
    const children = node.children || [];
    const elements = node.elements || [];
    const allKids = [...children, ...elements];
    const hasKids = allKids.length > 0;

    const handleRename = () => {
        if (draft.trim()) renameNode(node.id, draft.trim());
        setEditing(false);
    };

    return (
        <div>
            <div
                className={`tree-row ${isSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => select(node.id)}
                onDoubleClick={() => { setEditing(true); setDraft(node.name); }}
            >
                {/* Expand toggle */}
                <span
                    className="tree-chevron"
                    onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                    style={{ opacity: hasKids ? 1 : 0, pointerEvents: hasKids ? 'auto' : 'none' }}
                >
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>

                {/* Icon */}
                <Icon size={13} color={color} style={{ flexShrink: 0 }} />

                {/* Label */}
                {editing ? (
                    <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
                        className="tree-input"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="tree-label">{node.name}</span>
                )}

                {/* Actions (shown on hover via CSS) */}
                <div className="tree-actions">
                    {node.type === 'building' && (
                        <button
                            className="tree-action-btn"
                            title="Add Level"
                            onClick={(e) => { e.stopPropagation(); addLevel(node.id); }}
                        >
                            <Plus size={11} />
                        </button>
                    )}
                    {node.type !== 'site' && (
                        <button
                            className="tree-action-btn"
                            title="Rename"
                            onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(node.name); }}
                        >
                            <PenLine size={11} />
                        </button>
                    )}
                    {node.type !== 'site' && node.type !== 'building' && (
                        <button
                            className="tree-action-btn danger"
                            title="Delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                select(node.id);
                                deleteSelected();
                            }}
                        >
                            <Trash2 size={11} />
                        </button>
                    )}
                </div>
            </div>

            {/* Children */}
            {open && allKids.map((kid) => (
                <TreeNode key={kid.id} node={kid} depth={depth + 1} />
            ))}
        </div>
    );
}

export default function SceneTree() {
    const sites = useEditorStore((s) => s.sites);

    return (
        <aside className="scene-tree">
            <div className="panel-header">
                <span className="panel-title">Scene</span>
            </div>
            <div className="tree-body">
                {sites.map((site) => (
                    <TreeNode key={site.id} node={site} />
                ))}
            </div>
        </aside>
    );
}
