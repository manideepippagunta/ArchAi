import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, SendHorizonal, Trash2, Loader2, Bot, User } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import { TEMPLATES, CATEGORIES, detectCategory } from '../data/templates';

const SUGGESTIONS = [
  'Studio Apartment',
  '1 Bedroom House',
  '2 Bedroom House',
  '3 Bedroom House',
  '4 Bedroom House',
  'Duplex House',
  'Villa',
  'Open Office',
];

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`chat-msg ${isUser ? 'user' : 'bot'}`}>
      <div className="chat-avatar">{isUser ? <User size={12} /> : <Bot size={12} />}</div>
      <div className="chat-bubble">
        {msg.typing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="chat-typing"><span /><span /><span /></div>
            <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, letterSpacing: '0.03em' }}>
              ArchAi is thinking…
            </div>
          </div>
        ) : (
          <div className="chat-text" style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>
        )}
        {msg.wallCount > 0 && (
          <div className="chat-result-badge">
            <Sparkles size={10} /> {msg.wallCount} walls · {msg.roomCount} rooms loaded
          </div>
        )}
      </div>
    </div>
  );
}

export default function AIChat() {
  const [messages, setMessages] = useState([{
    id: 0, role: 'bot',
    text: "Hi! Select a house type or type a prompt to instantly load a predefined architectural template.",
  }]);
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState(null); // {id, label, templates[]}
  const bottomRef = useRef(null);

  const loadScene   = useEditorStore(s => s.loadScene);
  const setViewMode = useEditorStore(s => s.setViewMode);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load a template with a 2-second "generating" animation
  const loadTemplate = useCallback((template) => {
    setActiveCategory(null);

    // Step 1 — show typing indicator
    const thinkId = Date.now();
    setMessages(prev => [...prev, {
      id: thinkId, role: 'bot', typing: true,
      text: 'ArchAi is thinking…',
    }]);

    // Step 2 — after 2 s, replace with result and load scene
    setTimeout(() => {
      loadScene(template);
      setViewMode('3d');

      const roomNames = template.rooms.slice(0, 6).map(r => r.name).join(', ');
      const extra = template.rooms.length > 6 ? ` +${template.rooms.length - 6} more` : '';
      setMessages(prev => prev.map(m =>
        m.id === thinkId
          ? {
              ...m,
              typing: false,
              text: `✅ ${template.name}\n${template.description}\n\nRooms: ${roomNames}${extra}`,
              wallCount: template.walls.length,
              roomCount: template.rooms.length,
            }
          : m
      ));
    }, 2000);
  }, [loadScene, setViewMode]);

  const handleCategorySelect = (catId, labelOverride) => {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return;

    const templates = TEMPLATES[catId] || [];
    setActiveCategory({ ...cat, templates });

    const label = labelOverride || cat.label;
    setMessages(prev => [...prev,
      { id: Date.now() - 1, role: 'user', text: label },
      { id: Date.now(), role: 'bot', text: `Here are ${templates.length} predefined ${cat.label} templates. Pick one to load it instantly:` },
    ]);
  };

  const sendMessage = () => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');

    // Try to detect a category
    const catId = detectCategory(msg);
    if (catId) {
      handleCategorySelect(catId, msg);
      return;
    }

    // No match
    setMessages(prev => [...prev,
      { id: Date.now() - 1, role: 'user', text: msg },
      { id: Date.now(), role: 'bot', text: `I couldn't match "${msg}" to a template. Try: Studio Apartment, 1 Bedroom House, 2 Bedroom House, 3 Bedroom House, 4 Bedroom House, Duplex, Villa, or Office.` },
    ]);
  };

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const clearChat = () => {
    setMessages([{ id: 0, role: 'bot', text: "Chat cleared! Select a category below to load a template." }]);
    setActiveCategory(null);
  };

  return (
    <div className="ai-chat">
      {/* Header */}
      <div className="panel-header ai-chat-header">
        <div className="ai-chat-brand">
          <div className="ai-icon-dot" />
          <span className="panel-title">AI Assistant</span>
        </div>
        <button className="tree-action-btn" onClick={clearChat} title="Clear chat"><Trash2 size={12} /></button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}

        {/* Category chips — show when no active category */}
        {!activeCategory && (
          <div className="chat-suggestions">
            <p className="chat-suggestions-label">Select a house type:</p>
            <div className="chat-chips">
              {SUGGESTIONS.map(s => (
                <button key={s} className="chat-chip"
                  onClick={() => handleCategorySelect(detectCategory(s) || 'studio', s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Variant chips — show after category selected */}
        {activeCategory && (
          <div className="chat-suggestions">
            <p className="chat-suggestions-label">{activeCategory.label} — choose a style:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeCategory.templates.map((t, i) => (
                <button key={i} className="chat-chip"
                  style={{ textAlign: 'left', padding: '8px 12px', lineHeight: 1.4 }}
                  onClick={() => loadTemplate(t, `${activeCategory.label} — ${t.name}`)}>
                  <strong style={{ display: 'block', fontSize: 12 }}>
                    {i + 1}. {t.name}
                  </strong>
                  <span style={{ fontSize: 11, opacity: 0.75 }}>{t.description}</span>
                </button>
              ))}
              <button className="chat-chip" style={{ opacity: 0.6, fontSize: 11 }}
                onClick={() => setActiveCategory(null)}>
                ← Back to categories
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Describe your dream home…"
          rows={2}
        />
        <button
          className={`chat-send ${input.trim() ? 'ready' : ''}`}
          onClick={sendMessage}
          disabled={!input.trim()}
          title="Send (Enter)"
        >
          <SendHorizonal size={14} />
        </button>
      </div>
    </div>
  );
}