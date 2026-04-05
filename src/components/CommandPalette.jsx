import React, { useEffect, useRef, useState } from 'react';
import {
    MousePointer2,
    RectangleHorizontal,
    Square,
    Home,
    Undo2,
    Redo2,
    Layers,
    Grid3x3,
    Download,
    Plus,
    Search,
    X,
} from 'lucide-react';
import { useEditorStore, useUndoRedo } from '../store/useEditorStore';

const COMMANDS = [
    { id: 'tool-select', label: 'Select Tool', icon: MousePointer2, shortcut: 'V', action: (s) => s.setActiveTool('select') },
    { id: 'tool-wall', label: 'Wall Tool', icon: RectangleHorizontal, shortcut: 'W', action: (s) => s.setActiveTool('wall') },
    { id: 'tool-slab', label: 'Slab Tool', icon: Square, shortcut: 'S', action: (s) => s.setActiveTool('slab') },
    { id: 'tool-roof', label: 'Roof Tool', icon: Home, shortcut: 'R', action: (s) => s.setActiveTool('roof') },
    { id: 'mode-2d', label: 'Switch to 2D Plan', icon: Grid3x3, shortcut: '', action: (s) => s.setViewMode('2d') },
    { id: 'mode-3d', label: 'Switch to 3D View', icon: Layers, shortcut: '', action: (s) => s.setViewMode('3d') },
    { id: 'undo', label: 'Undo', icon: Undo2, shortcut: 'Ctrl+Z', action: null },
    { id: 'redo', label: 'Redo', icon: Redo2, shortcut: 'Ctrl+Y', action: null },
    { id: 'add-level', label: 'Add Level', icon: Plus, shortcut: '', action: null },
    { id: 'export', label: 'Export Scene', icon: Download, shortcut: '', action: null },
];

export default function CommandPalette() {
    const commandOpen = useEditorStore((s) => s.commandOpen);
    const setCommandOpen = useEditorStore((s) => s.setCommandOpen);
    const store = useEditorStore();
    const { undo, redo } = useUndoRedo();

    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef(null);

    const filtered = COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase())
    );

    useEffect(() => {
        if (commandOpen) {
            setQuery('');
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [commandOpen]);

    useEffect(() => {
        setActiveIdx(0);
    }, [query]);

    if (!commandOpen) return null;

    const runCommand = (cmd) => {
        if (cmd.id === 'undo') undo();
        else if (cmd.id === 'redo') redo();
        else if (cmd.action) cmd.action(store);
        setCommandOpen(false);
    };

    const handleKey = (e) => {
        if (e.key === 'Escape') { setCommandOpen(false); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && filtered[activeIdx]) { runCommand(filtered[activeIdx]); }
    };

    return (
        <div className="palette-backdrop" onClick={() => setCommandOpen(false)}>
            <div className="palette-panel" onClick={(e) => e.stopPropagation()}>
                {/* Search */}
                <div className="palette-search">
                    <Search size={15} color="var(--text-muted)" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Search commands…"
                        className="palette-input"
                    />
                    <button className="palette-esc" onClick={() => setCommandOpen(false)}>
                        <X size={13} />
                    </button>
                </div>

                {/* Results */}
                <div className="palette-results">
                    {filtered.length === 0 && (
                        <div className="palette-empty">No commands found</div>
                    )}
                    {filtered.map((cmd, i) => {
                        const Icon = cmd.icon;
                        return (
                            <button
                                key={cmd.id}
                                className={`palette-item ${i === activeIdx ? 'active' : ''}`}
                                onClick={() => runCommand(cmd)}
                                onMouseEnter={() => setActiveIdx(i)}
                            >
                                <Icon size={14} color="var(--primary)" />
                                <span className="palette-item-label">{cmd.label}</span>
                                {cmd.shortcut && (
                                    <kbd className="palette-kbd">{cmd.shortcut}</kbd>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="palette-footer">
                    <span><kbd>↑↓</kbd> Navigate</span>
                    <span><kbd>Enter</kbd> Run</span>
                    <span><kbd>Esc</kbd> Close</span>
                </div>
            </div>
        </div>
    );
}
