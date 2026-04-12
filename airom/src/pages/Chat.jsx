import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { calcCreditCost, LOW_CREDIT_THRESHOLD } from '../lib/plans'

const SUGGESTIONS = ['What can you do?', 'Write me a Python script', 'Explain quantum computing', 'Help me debug code']

export default function Chat() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [messages,       setMessages]       = useState([])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [credits,        setCredits]        = useState(profile?.credits ?? 0)
  const [menuOpen,       setMenuOpen]       = useState(false)
  const [sidebarOpen,    setSidebarOpen]    = useState(true)
  const [conversations,  setConversations]  = useState([])
  const [activeConvId,   setActiveConvId]   = useState(null)
  const [loadingConvs,   setLoadingConvs]   = useState(true)
  const [error,          setError]          = useState('')

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const historyRef = useRef([])

  useEffect(() => { if (profile) setCredits(profile.credits) }, [profile])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { loadConversations() }, [])

  // ── Load conversation list ───────────────────────────────────────────────
  async function loadConversations() {
    setLoadingConvs(true)
    const { data } = await supabase
      .from('conversations')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(40)
    setConversations(data || [])
    setLoadingConvs(false)
  }

  // ── Load messages for a conversation ────────────────────────────────────
  async function loadConversation(conv) {
    setActiveConvId(conv.id)
    setError('')
    historyRef.current = []
    const { data } = await supabase
      .from('messages')
      .select('role, content, credits_used, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
    const msgs = (data || []).map(m => ({ role: m.role === 'assistant' ? 'ai' : 'user', text: m.content, id: m.created_at }))
    setMessages(msgs)
    historyRef.current = (data || []).map(m => ({ role: m.role, content: m.content }))
    setSidebarOpen(false)
  }

  // ── Start new conversation ───────────────────────────────────────────────
  async function newConversation() {
    setActiveConvId(null)
    setMessages([])
    historyRef.current = []
    setError('')
    const plan = profile?.plan || 'free'
    addAIMessage(`Hey ${profile?.full_name?.split(' ')[0] || 'there'}! I'm **Airom** — ready to help. What are we working on?`)
    setSidebarOpen(false)
    inputRef.current?.focus()
  }

  // ── Create conversation in DB ────────────────────────────────────────────
  async function createConversation(firstMessage) {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '…' : '')
    const { data } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title })
      .select()
      .single()
    if (data) {
      setActiveConvId(data.id)
      setConversations(c => [data, ...c])
      return data.id
    }
    return null
  }

  function addAIMessage(text) {
    setMessages(m => [...m, { role: 'ai', text, id: Date.now() + Math.random() }])
  }

  // ── Send message ─────────────────────────────────────────────────────────
  async function send(text) {
    if (!text.trim() || loading) return
    setError('')

    if (credits <= 0) {
      setError('You have no credits left. Please top up to continue.')
      return
    }

    const userText = text.trim()
    setMessages(m => [...m, { role: 'user', text: userText, id: Date.now() }])
    setInput('')
    if (inputRef.current) { inputRef.current.style.height = '40px' }
    setLoading(true)
    historyRef.current.push({ role: 'user', content: userText })

    // Create conversation on first message
    let convId = activeConvId
    if (!convId) convId = await createConversation(userText)

    try {
      const res  = await fetch('/.netlify/functions/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: historyRef.current, userId: user.id, conversationId: convId })
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        historyRef.current.pop()
        setMessages(m => m.slice(0, -1))
        setLoading(false)
        return
      }

      const reply = data.reply
      historyRef.current.push({ role: 'assistant', content: reply })
      setCredits(c => Math.max(0, c - (data.creditCost || 1)))
      addAIMessage(reply)
      loadConversations()
    } catch (err) {
      setError('Network error. Please try again.')
      historyRef.current.pop()
      setMessages(m => m.slice(0, -1))
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  async function deleteConversation(e, convId) {
    e.stopPropagation()
    await supabase.from('conversations').delete().eq('id', convId)
    setConversations(c => c.filter(x => x.id !== convId))
    if (activeConvId === convId) { setActiveConvId(null); setMessages([]); historyRef.current = [] }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  async function handleSignOut() { await signOut(); navigate('/login') }

  const lowCredits = credits <= LOW_CREDIT_THRESHOLD && credits > 0
  const showWelcome = messages.length === 0

  return (
    <div style={s.shell}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div style={{ ...s.sidebar, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', opacity: sidebarOpen ? 1 : 0, pointerEvents: sidebarOpen ? 'all' : 'none' }}>
        <div style={s.sidebarHeader}>
          <div style={s.sidebarLogo}>
            <div style={s.markSm}>✦</div>
            <span style={s.brand}>Airom</span>
          </div>
          <button style={s.iconBtn} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <button style={s.newChatBtn} onClick={newConversation}>
          + New conversation
        </button>

        <div style={s.convList}>
          {loadingConvs
            ? <p style={s.convMeta}>Loading chats…</p>
            : conversations.length === 0
            ? <p style={s.convMeta}>No conversations yet. Start chatting!</p>
            : conversations.map(conv => (
              <div
                key={conv.id}
                style={{ ...s.convItem, background: activeConvId === conv.id ? 'var(--bg-hover)' : 'transparent', borderColor: activeConvId === conv.id ? 'var(--border-bright)' : 'transparent' }}
                onClick={() => loadConversation(conv)}
              >
                <div style={s.convIcon}>💬</div>
                <div style={s.convBody}>
                  <div style={s.convTitle}>{conv.title}</div>
                  <div style={s.convMeta}>{new Date(conv.updated_at).toLocaleDateString()}</div>
                </div>
                <button style={s.deleteBtn} onClick={e => deleteConversation(e, conv.id)}>🗑</button>
              </div>
            ))
          }
        </div>

        <div style={s.sidebarFooter}>
          <div style={s.userRow}>
            <div style={s.userAvatar}>{profile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
            <div>
              <div style={s.userName}>{profile?.full_name || 'User'}</div>
              <div style={s.userPlan}>{profile?.plan || 'free'} plan · {credits} credits</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Link to="/plans" style={s.footerBtn}>⬆ Upgrade</Link>
            <button style={s.footerBtn} onClick={handleSignOut}>↩ Sign out</button>
          </div>
        </div>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && <div style={s.overlay} onClick={() => setSidebarOpen(false)}/>}

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div style={s.main}>

        {/* Top bar */}
        <div style={s.topbar}>
          <div style={s.topLeft}>
            <button style={s.iconBtn} onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar">☰</button>
            <div style={s.markSm}>✦</div>
            <span style={s.brand}>Airom</span>
          </div>
          <div style={s.topRight}>
            {lowCredits && <span style={s.lowPill}>⚡ Low credits</span>}
            <button
              style={{ ...s.creditBadge, background: lowCredits ? 'rgba(251,146,60,0.12)' : 'var(--blue-dim)', color: lowCredits ? '#FB923C' : 'var(--blue-bright)', borderColor: lowCredits ? 'rgba(251,146,60,0.4)' : 'var(--border-bright)' }}
              onClick={() => navigate('/plans')}
            >
              ◈ {credits} credits
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={s.errorBanner}>
            ⚠ {error}
            {error.includes('credits') && <Link to="/plans" style={{ color: '#FB923C', marginLeft: 8 }}>Top up →</Link>}
            <button style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#FB923C', cursor: 'pointer' }} onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* Messages */}
        <div style={s.messages}>
          {showWelcome && !loading && (
            <div style={s.welcome}>
              <div style={s.welcomeMark}>✦</div>
              <h2 style={s.welcomeTitle}>Welcome to Airom</h2>
              <p style={s.welcomeSub}>Your intelligent AI assistant. Ask anything, build anything.</p>
              <div style={s.suggestionGrid}>
                {SUGGESTIONS.map(sg => (
                  <button key={sg} style={s.suggestionCard} onClick={() => send(sg)}>{sg}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} style={{ ...s.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'ai' && <div style={s.aiAvatar}>✦</div>}
              <div style={m.role === 'ai' ? s.aiBubble : s.userBubble}>
                <MessageText text={m.text}/>
              </div>
              {m.role === 'user' && <div style={s.userAvatarSm}>{profile?.full_name?.[0]?.toUpperCase() || 'U'}</div>}
            </div>
          ))}

          {loading && (
            <div style={{ ...s.msgRow, justifyContent: 'flex-start' }}>
              <div style={s.aiAvatar}>✦</div>
              <div style={{ ...s.aiBubble, display: 'flex', gap: 5, alignItems: 'center', padding: '12px 16px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block', animation: 'bounce 1.2s infinite' }}/>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block', animation: 'bounce 1.2s infinite 0.2s' }}/>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block', animation: 'bounce 1.2s infinite 0.4s' }}/>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <div style={s.inputWrap}>
          <div style={s.inputRow}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = '40px'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }}
              onKeyDown={onKeyDown}
              placeholder={credits <= 0 ? 'No credits remaining — top up to continue' : 'Message Airom…'}
              rows={1}
              style={{ ...s.textarea, opacity: credits <= 0 ? 0.5 : 1 }}
              disabled={loading || credits <= 0}
            />
            <button
              style={{ ...s.sendBtn, opacity: (!input.trim() || loading || credits <= 0) ? 0.4 : 1 }}
              disabled={loading || !input.trim() || credits <= 0}
              onClick={() => send(input)}
            >➤</button>
          </div>
          <div style={s.inputHint}>Enter to send · Shift+Enter for new line · {credits} credits remaining</div>
        </div>
      </div>
    </div>
  )
}

function MessageText({ text }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre style="background:var(--bg-deep);border:1px solid var(--border);border-radius:8px;padding:12px;margin:8px 0;font-size:12px;overflow-x:auto;font-family:monospace;color:var(--text-primary)">${c.trim()}</pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-deep);border:1px solid var(--border);padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace;color:var(--blue-bright)">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\n/g, '<br>')
  return <span dangerouslySetInnerHTML={{ __html: html }}/>
}

const s = {
  shell:          { display: 'flex', height: '100dvh', background: 'transparent', position: 'relative', zIndex: 1, overflow: 'hidden' },

  // Sidebar
  sidebar:        { width: 280, minWidth: 280, background: 'rgba(7,11,26,0.97)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 30, transition: 'transform 0.25s ease, opacity 0.25s ease', backdropFilter: 'blur(16px)' },
  sidebarHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' },
  sidebarLogo:    { display: 'flex', alignItems: 'center', gap: 8 },
  newChatBtn:     { margin: '10px 12px 6px', padding: '10px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 12px var(--blue-glow)', textAlign: 'center' },
  convList:       { flex: 1, overflowY: 'auto', padding: '6px 8px' },
  convItem:       { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent', marginBottom: 2, transition: 'all 0.15s' },
  convIcon:       { fontSize: 14, flexShrink: 0 },
  convBody:       { flex: 1, minWidth: 0 },
  convTitle:      { fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convMeta:       { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  deleteBtn:      { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.4, padding: 2, flexShrink: 0 },
  sidebarFooter:  { borderTop: '1px solid var(--border)', padding: '12px 14px' },
  userRow:        { display: 'flex', alignItems: 'center', gap: 10 },
  userAvatar:     { width: 34, height: 34, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 },
  userName:       { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  userPlan:       { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  footerBtn:      { flex: 1, padding: '7px', fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block' },
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 25, backdropFilter: 'blur(2px)' },

  // Main
  main:           { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(7,11,26,0.85)', backdropFilter: 'blur(12px)', flexShrink: 0 },
  topLeft:        { display: 'flex', alignItems: 'center', gap: 10 },
  topRight:       { display: 'flex', alignItems: 'center', gap: 8 },
  markSm:         { width: 28, height: 28, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, boxShadow: '0 0 10px var(--blue-glow)', flexShrink: 0 },
  brand:          { fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  lowPill:        { fontSize: 11, background: 'rgba(251,146,60,0.12)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 20, padding: '3px 10px' },
  creditBadge:    { border: '1px solid', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent' },
  iconBtn:        { background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: '4px 6px', borderRadius: 6 },
  errorBanner:    { background: 'rgba(251,146,60,0.08)', borderBottom: '1px solid rgba(251,146,60,0.2)', padding: '10px 16px', fontSize: 13, color: '#FB923C', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },

  // Messages
  messages:       { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  welcome:        { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '40px 20px' },
  welcomeMark:    { width: 64, height: 64, borderRadius: '50%', background: 'var(--blue)', color: '#fff', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 32px var(--blue-glow), 0 0 64px rgba(59,130,246,0.15)' },
  welcomeTitle:   { fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 8 },
  welcomeSub:     { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28 },
  suggestionGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, maxWidth: 480, width: '100%' },
  suggestionCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontFamily: 'inherit' },
  msgRow:         { display: 'flex', gap: 10, alignItems: 'flex-start' },
  aiAvatar:       { width: 30, height: 30, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, boxShadow: '0 0 10px var(--blue-glow)' },
  userAvatarSm:   { width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-hover)', border: '1px solid var(--border-bright)', color: 'var(--blue-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  aiBubble:       { maxWidth: '78%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)' },
  userBubble:     { maxWidth: '78%', background: 'var(--blue)', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', fontSize: 14, lineHeight: 1.65, boxShadow: '0 0 16px var(--blue-glow)' },

  // Input
  inputWrap:      { borderTop: '1px solid var(--border)', background: 'rgba(7,11,26,0.85)', backdropFilter: 'blur(12px)', flexShrink: 0, padding: '12px 14px 8px' },
  inputRow:       { display: 'flex', gap: 8 },
  textarea:       { flex: 1, height: 40, resize: 'none', padding: '9px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit', background: 'var(--bg-input)', color: 'var(--text-primary)' },
  sendBtn:        { width: 40, height: 40, borderRadius: '50%', background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 12px var(--blue-glow)', transition: 'all 0.2s', cursor: 'pointer' },
  inputHint:      { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }
}
