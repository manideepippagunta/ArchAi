import React from 'react';
import { 
  MousePointer2, 
  Move, 
  Square, 
  Wall, 
  Trash2,
  PlusSquare
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

const TOOLS = [
  { id: 'select', label: 'Select', icon: MousePointer2, shortcut: 'V' },
  { id: 'move',   label: 'Move',   icon: Move,           shortcut: 'M' },
  { id: 'wall',   label: 'Wall',   icon: Wall,           shortcut: 'W' },
  { id: 'room',   label: 'Room',   icon: PlusSquare,     shortcut: 'R' },
  { id: 'delete', label: 'Delete', icon: Trash2,         shortcut: 'Del' },
];

export default function ToolSidebar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const viewMode = useEditorStore((s) => s.viewMode);

  if (viewMode !== '2d') return null;

  return (
    <div className="tool-sidebar">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            className={`tool-sidebar-btn ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
          >
            <Icon size={18} />
            <span className="tool-tooltip">{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}
