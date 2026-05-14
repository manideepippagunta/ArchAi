import React from 'react';
import {
    Box,
    Sparkles,
    Layers,
    Square,
    Undo2,
    Redo2,
    MousePointer2,
    Move,
    Pencil,
    Grid3x3,
    Download,
    Command,
    FilePlus,
    Upload,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import { useUndoRedo } from '../store/useEditorStore';

const TOOLS_2D = [
    { id: 'select', label: 'Select', icon: MousePointer2, shortcut: 'V' },
    { id: 'move',   label: 'Move',   icon: Move,           shortcut: 'M' },
    { id: 'wall',   label: 'Wall',   icon: Pencil,         shortcut: 'W' },
    { id: 'room',   label: 'Room',   icon: Square,         shortcut: 'R' },
];

export default function Header() {
    const viewMode = useEditorStore((s) => s.viewMode);
    const activeTool = useEditorStore((s) => s.activeTool);
    const setViewMode = useEditorStore((s) => s.setViewMode);
    const setActiveTool = useEditorStore((s) => s.setActiveTool);
    const setCommandOpen = useEditorStore((s) => s.setCommandOpen);
    const clearLevel = useEditorStore((s) => s.clearLevel);
    const getActiveLevel = useEditorStore((s) => s.getActiveLevel);
    const { undo, redo, canUndo, canRedo } = useUndoRedo();

    const handleNewProject = () => {
        const level = getActiveLevel();
        if (level) clearLevel(level.id);
    };

    const handleExport = () => {
        const { sites } = useEditorStore.getState();
        const blob = new Blob([JSON.stringify(sites, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `archai-layout-${Date.now()}.json`;
        a.click();
    };

    return (
        <header className="editor-header">
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="brand-icon">
                    <Box size={18} color="white" />
                </div>
                <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.3px', color: 'var(--text-main)' }}>
                        Archai
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '-1px' }}>
                        Architectural Editor
                    </div>
                </div>
            </div>

            {/* Mode toggle */}
            <div className="mode-toggle">
                <button
                    className={`mode-btn ${viewMode === '2d' ? 'active' : ''}`}
                    onClick={() => setViewMode('2d')}
                    title="2D Floorplan"
                >
                    <Grid3x3 size={14} />
                    <span>2D Plan</span>
                </button>
                <button
                    className={`mode-btn ${viewMode === '3d' ? 'active' : ''}`}
                    onClick={() => setViewMode('3d')}
                    title="3D Viewport"
                >
                    <Layers size={14} />
                    <span>3D View</span>
                </button>
            </div>

            {/* Tools (only in 2D) */}
            {viewMode === '2d' && (
                <div className="tool-strip">
                    {TOOLS_2D.map((t) => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                className={`tool-btn ${activeTool === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTool(t.id)}
                                title={`${t.label} (${t.shortcut})`}
                            >
                                <Icon size={14} />
                                <span>{t.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Right actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                <button
                    className="icon-btn"
                    onClick={undo}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                >
                    <Undo2 size={15} />
                </button>
                <button
                    className="icon-btn"
                    onClick={redo}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Y)"
                >
                    <Redo2 size={15} />
                </button>

                <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />

                <button
                    className="icon-btn"
                    onClick={() => setCommandOpen(true)}
                    title="Command Palette (Ctrl+K)"
                >
                    <Command size={15} />
                </button>

                <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />

                <button
                    className="pill-btn"
                    onClick={handleNewProject}
                    title="Clear canvas and start a new project"
                >
                    <FilePlus size={13} />
                    New
                </button>

                <button className="pill-btn" onClick={handleExport}>
                    <Download size={13} />
                    Export
                </button>

                <button className="pill-btn" onClick={() => document.getElementById('import-input').click()}>
                    <Upload size={13} />
                    Import
                </button>
                <input 
                    id="import-input" 
                    type="file" 
                    accept=".json" 
                    style={{ display: 'none' }} 
                    onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (re) => {
                                try {
                                    const json = JSON.parse(re.target.result);
                                    useEditorStore.setState({ sites: json });
                                } catch (err) {
                                    alert('Failed to parse JSON');
                                }
                            };
                            reader.readAsText(file);
                        }
                    }}
                />

                <div className="badge-pill">
                    <Sparkles size={11} />
                    AI-Powered
                </div>
            </div>
        </header>
    );
}
