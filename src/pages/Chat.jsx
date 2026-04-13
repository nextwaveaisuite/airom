import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { LOW_CREDIT_THRESHOLD } from '../lib/plans'

const SUGGESTIONS = ['What can you do?', 'Write me a Python script', 'Explain quantum computing', 'Help me debug code']
const ACCEPTED_FILES = '.pdf,.txt,.md,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.cs,.go,.rs,.html,.css,.json,.csv,.xml,.yaml,.yml,.sh,.sql'
const IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp']
const MAX_FILE_MB = 10

export default function Chat() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [messages,      setMessages]      = useState([])
  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [credits,       setCredits]       = useState(profile?.credits ?? 0)
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConvId,  setActiveConvId]  = useState(null)
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [error,         setError]         = useState('')
  const [attachments,   setAttachments]   = useState([])
  const [dragOver,      setDragOver]      = useState(false)
  const [renamingId,    setRenamingId]    = useState(null)
  const [renameValue,   setRenameValue]   = useState('')
  const [activeSection, setActiveSection] = useState('chats')

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const fileRef    = useRef(null)
  const historyRef = useRef([])

  useEffect(() => { if (profile) setCredits(profile.credits) }, [profile])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { loadConversations() }, [])

  async function loadConversations() {
    setLoadingConvs(true)
    const { data } = await supabase.from('conversations').select('id, title, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(40)
    setConversations(data || [])
    setLoadingConvs(false)
  }

  async function loadConversation(conv) {
    setActiveConvId(conv.id); setError(''); historyRef.current = []
    const { data } = await supabase.from('messages').select('role, content, created_at').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    setMessages((data || []).map(m => ({ role: m.role === 'assistant' ? 'ai' : 'user', text: m.content, id: m.created_at })))
    historyRef.current = (data || []).map(m => ({ role: m.role, content: m.content }))
    setSidebarOpen(false)
  }

  async function newConversation() {
    setActiveConvId(null); setMessages([]); historyRef.current = []; setError(''); setAttachments([])
    addAIMessage(`Hey ${profile?.full_name?.split(' ')[0] || 'there'}! I'm **Airom** — ready to help. What are we working on?`)
    setSidebarOpen(false); inputRef.current?.focus()
  }

  function addAIMessage(text) { setMessages(m => [...m, { role: 'ai', text, id: Date.now() + Math.random() }]) }

  // ── Rename conversation ──────────────────────────────────────────────────
  async function startRename(e, conv) {
    e.stopPropagation()
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  async function saveRename(convId) {
    if (!renameValue.trim()) return setRenamingId(null)
    await supabase.from('conversations').update({ title: renameValue.trim() }).eq('id', convId)
    setConversations(c => c.map(x => x.id === convId ? { ...x, title: renameValue.trim() } : x))
    setRenamingId(null)
  }

  // ── File handling ────────────────────────────────────────────────────────
  async function processFile(file) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setError(`File too large. Max ${MAX_FILE_MB}MB.`); return null }
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e => {
        const base64 = e.target.result.split(',')[1]
        const isImage = IMAGE_TYPES.includes(file.type)
        resolve({ name: file.name, type: isImage ? 'image' : 'document', mediaType: file.type || 'text/plain', data: base64, preview: isImage ? e.target.result : null, size: file.size })
      }
      reader.readAsDataURL(file)
    })
  }

  async function handleFiles(files) {
    const processed = await Promise.all(Array.from(files).slice(0, 5).map(processFile))
    setAttachments(a => [...a, ...processed.filter(Boolean)].slice(0, 5))
  }

  function onDrop(e) { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files) }
  function removeAttachment(idx) { setAttachments(a => a.filter((_, i) => i !== idx)) }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function send(text) {
    if ((!text.trim() && attachments.length === 0) || loading) return
    setError('')
    if (credits <= 0) { setError('No credits left. Please top up to continue.'); return }

    const userText = text.trim()
    const sentAttachments = [...attachments]
    const displayText = sentAttachments.length ? (userText ? userText : '') + sentAttachments.map(a => `\n📎 ${a.name}`).join('') : userText

    setMessages(m => [...m, { role: 'user', text: displayText, id: Date.now(), attachments: sentAttachments.filter(a => a.preview).map(a => a.preview) }])
    setInput(''); setAttachments([])
    if (inputRef.current) inputRef.current.style.height = '40px'
    setLoading(true)
    historyRef.current.push({ role: 'user', content: userText || 'Please analyze the attached file(s).' })

    try {
      const res  = await fetch('/.netlify/functions/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current, userId: user.id, conversationId: activeConvId, attachments: sentAttachments.map(({ name, type, mediaType, data }) => ({ name, type, mediaType, data })) })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); historyRef.current.pop(); setMessages(m => m.slice(0, -1)); setLoading(false); return }
      historyRef.current.push({ role: 'assistant', content: data.reply })
      setCredits(c => Math.max(0, c - (data.creditCost || 1)))
      addAIMessage(data.reply)
      loadConversations()
    } catch { setError('Network error. Please try again.'); historyRef.current.pop(); setMessages(m => m.slice(0, -1)) }
    setLoading(false); inputRef.current?.focus()
  }

  async function deleteConversation(e, convId) {
    e.stopPropagation()
    await supabase.from('conversations').delete().eq('id', convId)
    setConversations(c => c.filter(x => x.id !== convId))
    if (activeConvId === convId) { setActiveConvId(null); setMessages([]); historyRef.current = [] }
  }

  function onKeyDown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }
  async function handleSignOut() { await signOut(); navigate('/login') }

  const lowCredits  = credits <= LOW_CREDIT_THRESHOLD && credits > 0
  const showWelcome = messages.length === 0
  const planLabel   = profile?.plan ? profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1) : 'Free'

  return (
    <div style={s.shell} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>

      {dragOver && (
        <div style={s.dropOverlay}>
          <div style={s.dropBox}>
            <div style={{ fontSize: 48 }}>📎</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--blue-bright)', marginTop: 12 }}>Drop files here</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>PDF, images, code, text files</div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILES + ',image/*'} style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)}/>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div style={{ ...s.sidebar, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', opacity: sidebarOpen ? 1 : 0, pointerEvents: sidebarOpen ? 'all' : 'none' }}>

        {/* Logo */}
        <div style={s.sidebarHeader}>
          <div style={s.sidebarLogo}><div style={s.markSm}>✦</div><span style={s.brand}>Airom</span></div>
          <button style={s.iconBtn} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        {/* New chat */}
        <button style={s.newChatBtn} onClick={newConversation}>+ New conversation</button>

        {/* Nav sections */}
        <div style={s.navSections}>
          <button style={{ ...s.navItem, color: activeSection === 'chats' ? 'var(--blue-bright)' : 'var(--text-secondary)' }} onClick={() => setActiveSection('chats')}>
            💬 Conversations
          </button>
          <button style={{ ...s.navItem, color: activeSection === 'billing' ? 'var(--blue-bright)' : 'var(--text-secondary)' }} onClick={() => { setActiveSection('billing'); navigate('/plans') }}>
            💳 Billing & plans
          </button>
          {profile?.is_admin && (
            <button style={{ ...s.navItem, color: activeSection === 'admin' ? 'var(--blue-bright)' : 'var(--text-secondary)' }} onClick={() => navigate('/admin')}>
              ⚙ Admin console
            </button>
          )}
          <div style={s.navDivider}/>
          <button style={{ ...s.navItem, color: 'var(--text-secondary)' }} onClick={() => window.open('mailto:support@airom.ai')}>
            ❓ Help & support
          </button>
          <button style={{ ...s.navItem, color: 'var(--text-secondary)' }} onClick={() => window.open('https://airom.netlify.app')}>
            📋 Terms & privacy
          </button>
        </div>

        {/* Conversation list */}
        {activeSection === 'chats' && (
          <div style={s.convList}>
            {loadingConvs
              ? <p style={s.convMeta}>Loading…</p>
              : conversations.length === 0
              ? <p style={s.convMeta}>No conversations yet.</p>
              : conversations.map(conv => (
                <div key={conv.id} style={{ ...s.convItem, background: activeConvId === conv.id ? 'var(--bg-hover)' : 'transparent', borderColor: activeConvId === conv.id ? 'var(--border-bright)' : 'transparent' }} onClick={() => loadConversation(conv)}>
                  <div style={s.convIcon}>💬</div>
                  <div style={s.convBody}>
                    {renamingId === conv.id ? (
                      <input
                        style={{ ...s.renameInput }}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => saveRename(conv.id)}
                        onKeyDown={e => { if (e.key === 'Enter') saveRename(conv.id); if (e.key === 'Escape') setRenamingId(null) }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <div style={s.convTitle}>{conv.title}</div>
                    )}
                    <div style={s.convMeta}>{new Date(conv.updated_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button style={s.convActionBtn} onClick={e => startRename(e, conv)} title="Rename">✏</button>
                    <button style={s.convActionBtn} onClick={e => deleteConversation(e, conv.id)} title="Delete">🗑</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* User footer */}
        <div style={s.sidebarFooter}>
          <div style={s.userRow}>
            <div style={s.userAvatar}>{profile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.userName}>{profile?.full_name || 'User'}</div>
              <div style={s.userPlan}>{planLabel} plan · {credits} credits</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Link to="/plans" style={s.footerBtn}>⬆ Upgrade</Link>
            <button style={s.footerBtn} onClick={handleSignOut}>↩ Sign out</button>
          </div>
        </div>
      </div>

      {sidebarOpen && <div style={s.overlay} onClick={() => setSidebarOpen(false)}/>}

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div style={s.main}>
        <div style={s.topbar}>
          <div style={s.topLeft}>
            <button style={s.iconBtn} onClick={() => setSidebarOpen(o => !o)}>☰</button>
            <div style={s.markSm}>✦</div>
            <span style={s.brand}>Airom</span>
          </div>
          <div style={s.topRight}>
            {lowCredits && <span style={s.lowPill}>⚡ Low credits</span>}
            <button style={{ ...s.creditBadge, background: lowCredits ? 'rgba(251,146,60,0.12)' : 'var(--blue-dim)', color: lowCredits ? '#FB923C' : 'var(--blue-bright)', borderColor: lowCredits ? 'rgba(251,146,60,0.4)' : 'var(--border-bright)' }} onClick={() => navigate('/plans')}>
              ◈ {credits} credits
            </button>
          </div>
        </div>

        {error && (
          <div style={s.errorBanner}>
            ⚠ {error}
            {error.includes('credits') && <Link to="/plans" style={{ color: '#FB923C', marginLeft: 8 }}>Top up →</Link>}
            <button style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#FB923C', cursor: 'pointer' }} onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div style={s.messages}>
          {showWelcome && !loading && (
            <div style={s.welcome}>
              <div style={s.welcomeMark}>✦</div>
              <h2 style={s.welcomeTitle}>Welcome to Airom</h2>
              <p style={s.welcomeSub}>Ask anything, upload files, build anything.</p>
              <div style={s.suggestionGrid}>
                {SUGGESTIONS.map(sg => <button key={sg} style={s.suggestionCard} onClick={() => send(sg)}>{sg}</button>)}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 20 }}>💡 Drag & drop files anywhere or click 📎 below</p>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} style={{ ...s.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'ai' && <div style={s.aiAvatar}>✦</div>}
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.attachments?.map((src, i) => <img key={i} src={src} alt="attachment" style={{ maxWidth: 240, maxHeight: 180, borderRadius: 10, border: '1px solid var(--border)', objectFit: 'cover' }}/>)}
                <div style={m.role === 'ai' ? s.aiBubble : s.userBubble}>
                  <MessageText text={m.text}/>
                </div>
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

        {attachments.length > 0 && (
          <div style={s.attachmentRow}>
            {attachments.map((att, i) => (
              <div key={i} style={s.attachmentChip}>
                {att.preview ? <img src={att.preview} alt={att.name} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }}/> : <span style={{ fontSize: 18 }}>{att.mediaType === 'application/pdf' ? '📄' : '📎'}</span>}
                <span style={{ fontSize: 12, color: 'var(--text-primary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginLeft: 'auto' }} onClick={() => removeAttachment(i)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={s.inputWrap}>
          <div style={s.inputRow}>
            <button style={s.attachBtn} onClick={() => fileRef.current?.click()} title="Attach file">📎</button>
            <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = '40px'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }} onKeyDown={onKeyDown} placeholder={credits <= 0 ? 'No credits — top up to continue' : attachments.length > 0 ? 'Add a message or send the file…' : 'Message Airom…'} rows={1} style={{ ...s.textarea, opacity: credits <= 0 ? 0.5 : 1 }} disabled={loading || credits <= 0}/>
            <button style={{ ...s.sendBtn, opacity: ((!input.trim() && attachments.length === 0) || loading || credits <= 0) ? 0.4 : 1 }} disabled={(!input.trim() && attachments.length === 0) || loading || credits <= 0} onClick={() => send(input)}>➤</button>
          </div>
          <div style={s.inputHint}>Enter to send · Shift+Enter for new line · 📎 attach files · drag & drop anywhere · {credits} credits left</div>
        </div>
      </div>
    </div>
  )
}

// ── Message renderer with code zip download ──────────────────────────────────
function MessageText({ text }) {
  const parts = []
  let last = 0
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g
  let match

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // We'll render as a React component to support zip download buttons
  const elements = []
  let rawLast = 0
  const rawCodeRegex = /```(\w*)\n([\s\S]*?)```/g
  let rawMatch
  let keyIdx = 0

  while ((rawMatch = rawCodeRegex.exec(text)) !== null) {
    const before = text.slice(rawLast, rawMatch.index)
    if (before) {
      elements.push(<span key={keyIdx++} dangerouslySetInnerHTML={{ __html: formatInline(before) }}/>)
    }
    const lang = rawMatch[1] || 'code'
    const code = rawMatch[2].trim()
    elements.push(<CodeBlock key={keyIdx++} lang={lang} code={code}/>)
    rawLast = rawMatch.index + rawMatch[0].length
  }

  const remaining = text.slice(rawLast)
  if (remaining) elements.push(<span key={keyIdx++} dangerouslySetInnerHTML={{ __html: formatInline(remaining) }}/>)

  return <span>{elements}</span>
}

function formatInline(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-deep);border:1px solid var(--border);padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace;color:var(--blue-bright)">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\n/g, '<br>')
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadZip() {
    // Determine file extension
    const extMap = { javascript:'js', typescript:'ts', python:'py', java:'java', cpp:'cpp', c:'c', csharp:'cs', go:'go', rust:'rs', html:'html', css:'css', jsx:'jsx', tsx:'tsx', sql:'sql', bash:'sh', shell:'sh', json:'json', yaml:'yml' }
    const ext = extMap[lang.toLowerCase()] || lang || 'txt'
    const filename = `code.${ext}`

    // Create zip using JSZip loaded from CDN via dynamic script
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    script.onload = () => {
      const zip = new window.JSZip()
      zip.file(filename, code)
      zip.generateAsync({ type: 'blob' }).then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `airom-code.zip`
        a.click(); URL.revokeObjectURL(url)
      })
    }
    document.head.appendChild(script)
  }

  return (
    <div style={{ margin: '8px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-deep)', padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lang || 'code'}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={copyCode} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button onClick={downloadZip} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--blue-bright)', cursor: 'pointer', fontFamily: 'inherit' }}>
            ⬇ Download zip
          </button>
        </div>
      </div>
      <pre style={{ background: 'var(--bg-deep)', padding: 12, margin: 0, fontSize: 12, overflowX: 'auto', fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.6 }}>{code}</pre>
    </div>
  )
}

const s = {
  shell:          { display: 'flex', height: '100dvh', background: 'transparent', position: 'relative', zIndex: 1, overflow: 'hidden' },
  dropOverlay:    { position: 'fixed', inset: 0, background: 'rgba(3,5,15,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' },
  dropBox:        { border: '2px dashed var(--blue)', borderRadius: 20, padding: '48px 64px', textAlign: 'center', background: 'var(--blue-dim)' },
  sidebar:        { width: 280, minWidth: 280, background: 'rgba(7,11,26,0.97)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 30, transition: 'transform 0.25s ease, opacity 0.25s ease', backdropFilter: 'blur(16px)' },
  sidebarHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' },
  sidebarLogo:    { display: 'flex', alignItems: 'center', gap: 8 },
  newChatBtn:     { margin: '10px 12px 6px', padding: 10, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 12px var(--blue-glow)', textAlign: 'center' },
  navSections:    { display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)' },
  navItem:        { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, border: 'none', background: 'none', fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s' },
  navDivider:     { height: '1px', background: 'var(--border)', margin: '4px 0' },
  convList:       { flex: 1, overflowY: 'auto', padding: '6px 8px' },
  convItem:       { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent', marginBottom: 2, transition: 'all 0.15s' },
  convIcon:       { fontSize: 13, flexShrink: 0 },
  convBody:       { flex: 1, minWidth: 0 },
  convTitle:      { fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convMeta:       { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  convActionBtn:  { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.45, padding: '2px 4px', flexShrink: 0, color: 'var(--text-secondary)' },
  renameInput:    { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-bright)', borderRadius: 5, padding: '3px 7px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' },
  sidebarFooter:  { borderTop: '1px solid var(--border)', padding: '12px 14px' },
  userRow:        { display: 'flex', alignItems: 'center', gap: 10 },
  userAvatar:     { width: 34, height: 34, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 },
  userName:       { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  userPlan:       { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  footerBtn:      { flex: 1, padding: 7, fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block' },
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 25, backdropFilter: 'blur(2px)' },
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
  aiBubble:       { maxWidth: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)' },
  userBubble:     { maxWidth: '100%', background: 'var(--blue)', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', fontSize: 14, lineHeight: 1.65, boxShadow: '0 0 16px var(--blue-glow)' },
  attachmentRow:  { display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', background: 'rgba(7,11,26,0.7)' },
  attachmentChip: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '5px 8px', maxWidth: 220 },
  inputWrap:      { borderTop: '1px solid var(--border)', background: 'rgba(7,11,26,0.85)', backdropFilter: 'blur(12px)', flexShrink: 0, padding: '12px 14px 8px' },
  inputRow:       { display: 'flex', gap: 8, alignItems: 'flex-end' },
  attachBtn:      { width: 40, height: 40, borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textarea:       { flex: 1, height: 40, resize: 'none', padding: '9px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit', background: 'var(--bg-input)', color: 'var(--text-primary)' },
  sendBtn:        { width: 40, height: 40, borderRadius: '50%', background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 12px var(--blue-glow)', transition: 'all 0.2s', cursor: 'pointer' },
  inputHint:      { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }
}
