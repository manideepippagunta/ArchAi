import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from './store/useEditorStore';
import Header from './components/Header';
import SceneTree from './components/SceneTree';
import AIChat from './components/AIChat';
import PropertiesPanel from './components/PropertiesPanel';
import CommandPalette from './components/CommandPalette';
import Viewport2D from './components/Viewport2D';
import Viewport3D from './components/Viewport3D';
import ToolSidebar from './components/ToolSidebar';
import { Bot, Layers, Trash2 } from 'lucide-react';

function LeftPanel() {
  const [tab, setTab] = useState('ai'); // 'scene' | 'ai'
  return (
    <div className="left-panel">
      {/* Tab bar */}
      <div className="left-tab-bar">
        <button
          className={`left-tab ${tab === 'ai' ? 'active' : ''}`}
          onClick={() => setTab('ai')}
          title="AI Assistant"
        >
          <Bot size={13} />
          <span>AI</span>
        </button>
        <button
          className={`left-tab ${tab === 'scene' ? 'active' : ''}`}
          onClick={() => setTab('scene')}
          title="Scene Tree"
        >
          <Layers size={13} />
          <span>Scene</span>
        </button>
      </div>

      {/* Panel content */}
      <div className="left-panel-content">
        {tab === 'ai' ? <AIChat /> : <SceneTree />}
      </div>
    </div>
  );
}

export function EditorApp() {
  const viewMode = useEditorStore((s) => s.viewMode);
  const hydrate = useEditorStore((s) => s.hydrate);
  const initialized = useEditorStore((s) => s.initialized);
  const setCommandOpen = useEditorStore((s) => s.setCommandOpen);

  // Load from IndexedDB on mount — only once
  const hydrateRef = useRef(hydrate);
  hydrateRef.current = hydrate;
  useEffect(() => { hydrateRef.current(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (isInput) return;

      const { setActiveTool, setViewMode } = useEditorStore.getState();

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        useEditorStore.temporal.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        useEditorStore.temporal.getState().redo();
        return;
      }

      // Tool shortcuts (2D only)
      if (e.key === 'v' || e.key === 'V') setActiveTool('select');
      if (e.key === 'm' || e.key === 'M') setActiveTool('move');
      if (e.key === 'w' || e.key === 'W') { setActiveTool('wall'); setViewMode('2d'); }
      if (e.key === 'r' || e.key === 'R') setActiveTool('room');
      if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
        useEditorStore.getState().deleteSelected();
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        useEditorStore.getState().deselect();
        setCommandOpen(false);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCommandOpen]);

  if (!initialized) {
    return (
      <div className="editor-loading">
        <div className="loading-spinner" />
        <p>Loading editor…</p>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <Header />
      <div className="editor-body">
        <ToolSidebar />
        <LeftPanel />
        <main className="editor-main">
          {viewMode === '2d' ? <Viewport2D /> : <Viewport3D />}
        </main>
        <PropertiesPanel />
      </div>
      <CommandPalette />
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Runtime UI crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#fff8f8', height: '100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center'}}>
          <h1 style={{ color: '#d32f2f' }}>UI Crash Detected</h1>
          <p>The application encountered an unexpected runtime error.</p>
          <pre style={{ background: '#eee', padding: '10px', borderRadius: '4px', maxWidth: '80%' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}
          >
            Restart Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <EditorApp />
    </ErrorBoundary>
  );
}
