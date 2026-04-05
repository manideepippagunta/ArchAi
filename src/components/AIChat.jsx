import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, SendHorizonal, Trash2, Loader2, Bot, User } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import { interpret } from '../systems/AIInterpreter';
import { generateLayout, layoutSummary } from '../services/mlClient';
import Canvas2D from './Canvas2D';
import { X, Layout } from 'lucide-react';

const SUGGESTIONS = [
    'Create a studio apartment',
    'Build a 3-bedroom house with garage',
    'Make an L-shaped 2-bedroom apartment',
    'Design an open plan office 10x8 meters',
    'Create a 4-bedroom house with 2 bathrooms and a balcony',
];

/** Parse **bold** and *italic* markdown in a string into React spans */
function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, i) => {
        const parts = [];
        let remaining = line;
        let key = 0;

        while (remaining.length > 0) {
            const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
            const italicMatch = remaining.match(/\*(.+?)\*/);
            const bulletMatch = remaining.match(/^[•\-]\s/);

            if (bulletMatch) {
                parts.push(<span key={key++} style={{ color: 'var(--primary)', marginRight: '4px' }}>•</span>);
                remaining = remaining.slice(2);
                continue;
            }

            if (boldMatch && (!italicMatch || boldMatch.index <= italicMatch.index)) {
                if (boldMatch.index > 0) {
                    parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
                }
                parts.push(<strong key={key++} style={{ color: 'var(--text-main)', fontWeight: 600 }}>{boldMatch[1]}</strong>);
                remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
            } else if (italicMatch) {
                if (italicMatch.index > 0) {
                    parts.push(<span key={key++}>{remaining.slice(0, italicMatch.index)}</span>);
                }
                parts.push(<em key={key++} style={{ color: 'var(--primary)', fontStyle: 'normal', background: 'var(--primary-dim)', padding: '0 4px', borderRadius: '3px', fontSize: '11px' }}>{italicMatch[1]}</em>);
                remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
            } else {
                parts.push(<span key={key++}>{remaining}</span>);
                remaining = '';
            }
        }

        return (
            <span key={i} style={{ display: 'block', lineHeight: '1.6' }}>
                {parts}
                {i < lines.length - 1 && line === '' && <br />}
            </span>
        );
    });
}

function ChatMessage({ msg }) {
    const isUser = msg.role === 'user';
    return (
        <div className={`chat-msg ${isUser ? 'user' : 'bot'}`}>
            <div className="chat-avatar">
                {isUser
                    ? <User size={12} />
                    : <Bot size={12} />}
            </div>
            <div className="chat-bubble">
                {msg.typing ? (
                    <div className="chat-typing">
                        <span /><span /><span />
                    </div>
                ) : (
                    <div className="chat-text">{renderMarkdown(msg.text)}</div>
                )}
                {msg.wallCount > 0 && (
                    <div className="chat-result-badge">
                        <Sparkles size={10} />
                        {msg.wallCount} wall{msg.wallCount > 1 ? 's' : ''} generated
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AIChat() {
    const [messages, setMessages] = useState([
        {
            id: 0,
            role: 'bot',
            text: "Hi! I'm your architectural AI assistant. Describe what you'd like to build and I'll generate it in the editor.\n\nTry: *\"Create a 3-bedroom house\"* or *\"Build a 6x5 room\"*",
        },
    ]);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [showPreview, setShowPreview] = useState(false);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    const level = useEditorStore((s) => s.getActiveLevel());
    const getActiveLevel = useEditorStore((s) => s.getActiveLevel);
    const loadScene = useEditorStore((s) => s.loadScene);
    const addWalls = useEditorStore((s) => s.addWalls);
    const addRooms = useEditorStore((s) => s.addRooms);
    const clearLevel = useEditorStore((s) => s.clearLevel);
    const setViewMode = useEditorStore((s) => s.setViewMode);
    const updateElement = useEditorStore((s) => s.updateElement);
    const selectedId = useEditorStore((s) => s.selectedId);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const dispatchActions = (actions) => {
        const level = getActiveLevel();
        let wallCount = 0;
        for (const action of actions) {
            if (action.type === 'ADD_WALLS' && level) {
                addWalls(level.id, action.payload);
                wallCount += action.payload.filter(w => w.type === 'wall').length;
            }
            if (action.type === 'ADD_ROOMS' && level) {
                addRooms(level.id, action.payload);
            }
            if (action.type === 'CLEAR_LEVEL' && level) {
                clearLevel(level.id);
            }
            if (action.type === 'SET_MODE') {
                setViewMode(action.payload);
            }
            if (action.type === 'UPDATE_SELECTED' && selectedId) {
                updateElement(selectedId, action.payload);
            }
        }
        return wallCount;
    };

    const sendMessage = async (text) => {
        if (!text.trim() || thinking) return;
        setShowSuggestions(false);

        const userMsg = { id: Date.now(), role: 'user', text: text.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');

        // Typing indicator
        const thinkId = Date.now() + 1;
        setMessages((prev) => [...prev, { id: thinkId, role: 'bot', typing: true }]);
        setThinking(true);

        try {
            const storeState = useEditorStore.getState();

            // ── 1. Try Gemini-powered /generate endpoint ─────────────────────
            const { layout, error } = await generateLayout(text);

            if (error) {
                // API returned a structured error (non-arch prompt, etc.)
                setMessages((prev) => prev.map((m) =>
                    m.id === thinkId ? { ...m, typing: false, text: `⚠️ ${error}` } : m
                ));
                return;
            }

            if (layout) {
                // Load the full scene via loadScene()
                loadScene(layout);
                // Switch to 3D view to reveal the result
                setViewMode('3d');
                const summary = layoutSummary(layout);
                setMessages((prev) => prev.map((m) =>
                    m.id === thinkId
                        ? { ...m, typing: false, text: summary, wallCount: layout.walls?.length ?? 0 }
                        : m
                ));
                return;
            }

            // ── 2. Fallback: local procedural interpreter ────────────────────
            const result = interpret(text, { cursor2D: storeState.cursor2D || [0, 0] });
            let wallCount = 0;
            if (result.walls) {
                const actions = [{ type: 'ADD_WALLS', payload: result.walls }];
                if (result.rooms) actions.push({ type: 'ADD_ROOMS', payload: result.rooms });
                wallCount = dispatchActions(actions);
            } else if (result.actions) {
                wallCount = dispatchActions(result.actions);
            }
            setMessages((prev) => prev.map((m) =>
                m.id === thinkId
                    ? { ...m, typing: false, text: result.message ?? '✅ Layout generated (local engine).', wallCount }
                    : m
            ));
        } catch (err) {
            console.error('[Archai] Generation error:', err);
            setMessages((prev) => prev.map((m) =>
                m.id === thinkId
                    ? { ...m, typing: false, text: '⚠️ **Error:** Could not generate layout. Please try again.' }
                    : m
            ));
        } finally {
            setThinking(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const clearChat = () => {
        setMessages([{
            id: 0,
            role: 'bot',
            text: "Chat cleared! What would you like to build?",
        }]);
        setShowSuggestions(true);
    };

    return (
        <div className="ai-chat">
            {/* Header */}
            <div className="panel-header ai-chat-header">
                <div className="ai-chat-brand">
                    <div className="ai-icon-dot" />
                    <span className="panel-title">AI Assistant</span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                        className={`tree-action-btn ${showPreview ? 'active' : ''}`} 
                        onClick={() => setShowPreview(!showPreview)} 
                        title="Toggle Layout Preview"
                        style={{ color: showPreview ? 'var(--primary)' : 'inherit' }}
                    >
                        <Layout size={12} />
                    </button>
                    <button className="tree-action-btn" onClick={clearChat} title="Clear chat">
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {/* Layout Preview Modal */}
            {showPreview && (
                <div className="ai-layout-preview-overlay">
                    <div className="ai-layout-preview-modal">
                        <div className="preview-header">
                            <h3>Layout Analysis</h3>
                            <button onClick={() => setShowPreview(false)}><X size={14} /></button>
                        </div>
                        <div className="preview-body">
                            <Canvas2D rooms={level?.rooms || []} />
                            <div className="preview-stats">
                                <div className="stat">
                                    <span className="label">Room Count:</span>
                                    <span className="value">{level?.rooms?.length || 0}</span>
                                </div>
                                <div className="stat">
                                    <span className="label">Footprint:</span>
                                    <span className="value">
                                        {level?.rooms?.length > 0 
                                            ? `${Math.max(...level.rooms.map(r => r.x + r.width)).toFixed(1)}m × ${Math.max(...level.rooms.map(r => r.y + r.height)).toFixed(1)}m`
                                            : '0m × 0m'
                                        }
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="chat-messages">
                {messages.map((msg) => (
                    <ChatMessage key={msg.id} msg={msg} />
                ))}

                {/* Suggestion chips */}
                {showSuggestions && !thinking && (
                    <div className="chat-suggestions">
                        <p className="chat-suggestions-label">Try asking:</p>
                        <div className="chat-chips">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    className="chat-chip"
                                    onClick={() => sendMessage(s)}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="chat-input-area">
                <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what to build…"
                    rows={2}
                    disabled={thinking}
                />
                <button
                    className={`chat-send ${thinking ? 'loading' : ''} ${input.trim() ? 'ready' : ''}`}
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || thinking}
                    title="Send (Enter)"
                >
                    {thinking ? <Loader2 size={14} className="spin" /> : <SendHorizonal size={14} />}
                </button>
            </div>
        </div>
    );
}
