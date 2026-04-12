import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { calcCreditCost, LOW_CREDIT_THRESHOLD } from '../lib/plans'

const SUGGESTIONS = [
  'What can you do?',
  'Write me a short poem',
  'Explain machine learning simply',
  'Help me debug some code'
]

export default function Chat() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const [messages, setMessages]   = useState([])
  const [input,    setInput]       = useState('')
  const [loading,  setLoading]     = useState(false)
  const [credits,  setCredits]     = useState(profile?.credits ?? 0)
  const [menuOpen, setMenuOpen]    = useState(false)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const historyRef = useRef([]) // keeps message history for API calls

  // Sync credits from profile
  useEffect(() => {
    if (profile) setCredits(profile.credits)
  }, [profile])

  // Welcome message
  useEffect(() => {
    const plan = profile?.plan || 'free'
    addAIMessage(
      `Hey ${profile?.full_name?.split(' ')[0] || 'there'}! I'm **Airom** — your sharp AI assistant. ` +
      `You're on the **${plan.charAt(0).toUpperCase() + plan.slice(1)}** plan with **${profile?.credits ?? 0} credits**. What can I do for you?`
    )
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addAIMessage(text) {
    setMessages(m => [...m, { role: 'ai', text, id: Date.now() }])
  }

  async function send(text) {
    if (!text.trim() || loading) return
    if (credits <= 0) {
      addAIMessage("You've run out of credits! Please top up to keep chatting.")
      navigate('/plans')
      return
    }

    const userMsg = { role: 'user', text: text.trim(), id: Date.now() }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)

    historyRef.current.push({ role: 'user', content: text.trim() })

    try {
      const res  = await fetch('/.netlify/functions/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: historyRef.current, userId: user.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'API error')

      const reply = data.reply
      historyRef.current.push({ role: 'assistant', content: reply })

      // Deduct credits in DB
      const cost = calcCreditCost(reply)
      await supabase.rpc('deduct_credits', { user_id: user.id, amount: cost })
      setCredits(c => Math.max(0, c - cost))

      // Log usage
      await supabase.from('transactions').insert({
        user_id:      user.id,
        type:         'usage',
        credits_delta: -cost,
        description:  'AI message'
      })

      addAIMessage(reply)
    } catch (err) {
      addAIMessage('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div style={styles.shell}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <div style={styles.logoRow}>
          <div style={styles.mark}>✦</div>
          <span style={styles.brand}>Airom</span>
        </div>

        <button
          style={{ ...styles.creditBadge, background: credits <= LOW_CREDIT_THRESHOLD ? '#FAEEDA' : '#E1F5EE', color: credits <= LOW_CREDIT_THRESHOLD ? '#633806' : '#085041' }}
          onClick={() => setMenuOpen(o => !o)}
        >
          {credits} credits
        </button>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div style={styles.menu}>
          <Link to="/plans" style={styles.menuItem} onClick={() => setMenuOpen(false)}>
            💳 Upgrade / top up
          </Link>
          <button style={styles.menuItem} onClick={handleSignOut}>
            ↩ Sign out
          </button>
        </div>
      )}

      {/* Low credit banner */}
      {credits <= LOW_CREDIT_THRESHOLD && credits > 0 && (
        <div style={styles.lowBanner}>
          Running low on credits. <Link to="/plans">Top up now →</Link>
        </div>
      )}

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map(m => (
          <div key={m.id} style={{ ...styles.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && <div style={styles.aiAvatar}>✦</div>}
            <div style={m.role === 'ai' ? styles.aiBubble : styles.userBubble}>
              <MessageText text={m.text} />
            </div>
            {m.role === 'user' && (
              <div style={styles.userAvatar}>{profile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
            <div style={styles.aiAvatar}>✦</div>
            <div style={styles.aiBubble}>
              <span style={styles.typingDot}/>
              <span style={{ ...styles.typingDot, animationDelay: '0.2s' }}/>
              <span style={{ ...styles.typingDot, animationDelay: '0.4s' }}/>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Suggestions (only before first user message) */}
      {messages.filter(m => m.role === 'user').length === 0 && !loading && (
        <div style={styles.chips}>
          {SUGGESTIONS.map(s => (
            <button key={s} style={styles.chip} onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={styles.inputRow}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); e.target.style.height = '40px'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
          onKeyDown={onKeyDown}
          placeholder="Message Airom…"
          rows={1}
          style={styles.textarea}
          disabled={loading || credits <= 0}
        />
        <button
          style={styles.sendBtn}
          disabled={loading || !input.trim() || credits <= 0}
          onClick={() => send(input)}
        >
          ➤
        </button>
      </div>
    </div>
  )
}

// Renders bold and code from markdown-lite
function MessageText({ text }) {
  const html = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre style="background:#f4f3ef;border-radius:6px;padding:10px;margin:6px 0;font-size:12px;overflow-x:auto;font-family:monospace">${c.trim()}</pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:#f4f3ef;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')

  return <span dangerouslySetInnerHTML={{ __html: html }}/>
}

const styles = {
  shell:     { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#fff' },
  topbar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eee', background: '#fafaf8' },
  logoRow:   { display: 'flex', alignItems: 'center', gap: 8 },
  mark:      { width: 30, height: 30, borderRadius: '50%', background: '#1D9E75', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 },
  brand:     { fontWeight: 600, fontSize: 15 },
  creditBadge: { border: 'none', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  menu:      { background: '#fff', border: '1px solid #eee', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '6px', position: 'absolute', top: 56, right: 16, zIndex: 10, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 2 },
  menuItem:  { display: 'block', padding: '9px 12px', fontSize: 14, color: '#333', background: 'none', border: 'none', textAlign: 'left', borderRadius: 7, cursor: 'pointer', textDecoration: 'none' },
  lowBanner: { background: '#FAEEDA', borderBottom: '1px solid #FAC775', padding: '8px 16px', fontSize: 13, color: '#633806' },
  messages:  { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 },
  msgRow:    { display: 'flex', gap: 8, alignItems: 'flex-start' },
  aiAvatar:  { width: 28, height: 28, borderRadius: '50%', background: '#1D9E75', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 },
  userAvatar:{ width: 28, height: 28, borderRadius: '50%', background: '#E1F5EE', color: '#085041', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  aiBubble:  { maxWidth: '78%', background: '#f4f3ef', border: '1px solid #eee', borderRadius: '14px 14px 14px 4px', padding: '9px 13px', fontSize: 14, lineHeight: 1.6 },
  userBubble:{ maxWidth: '78%', background: '#1D9E75', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '9px 13px', fontSize: 14, lineHeight: 1.6 },
  typingDot: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#999', margin: '0 2px', animation: 'bounce 1.2s infinite' },
  chips:     { display: 'flex', gap: 8, padding: '0 16px 10px', flexWrap: 'wrap' },
  chip:      { fontSize: 12, padding: '5px 12px', borderRadius: 20, border: '1px solid #e0dfd8', background: '#f7f7f5', color: '#555', cursor: 'pointer' },
  inputRow:  { display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid #eee', background: '#fafaf8' },
  textarea:  { flex: 1, height: 40, resize: 'none', padding: '9px 13px', borderRadius: 10, border: '1px solid #d4d2c8', fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit' },
  sendBtn:   { width: 40, height: 40, borderRadius: '50%', background: '#1D9E75', color: '#fff', border: 'none', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
}
