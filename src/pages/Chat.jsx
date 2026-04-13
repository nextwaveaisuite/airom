import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { LOW_CREDIT_THRESHOLD } from '../lib/plans'

const SUGGESTIONS = ['What can you do?', 'Write me a Python script', 'Explain quantum computing', 'Help me debug code']
const ACCEPTED_FILES = '.pdf,.txt,.md,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.cs,.go,.rs,.html,.css,.json,.csv,.xml,.yaml,.yml,.sh,.sql'
const IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp']
const MAX_FILE_MB = 10

const LANGUAGES = [
  'English','Spanish','French','German','Portuguese','Italian','Dutch','Russian',
  'Chinese (Simplified)','Japanese','Korean','Arabic','Hindi','Turkish','Polish','Swedish'
]

const KEYBOARD_SHORTCUTS = [
  { key: 'Enter',        desc: 'Send message' },
  { key: 'Shift+Enter',  desc: 'New line' },
  { key: 'Ctrl+/',       desc: 'Toggle shortcuts' },
  { key: 'Ctrl+K',       desc: 'New conversation' },
  { key: 'Ctrl+B',       desc: 'Toggle sidebar' },
  { key: 'Ctrl+Shift+C', desc: 'Copy last response' },
]

export default function Chat() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [messages,        setMessages]        = useState([])
  const [input,           setInput]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [credits,         setCredits]         = useState(profile?.credits ?? 0)
  const [sidebarOpen,     setSidebarOpen]     = useState(false)
  const [conversations,   setConversations]   = useState([])
  const [activeConvId,    setActiveConvId]    = useState(null)
  const [loadingConvs,    setLoadingConvs]    = useState(true)
  const [error,           setError]           = useState('')
  const [attachments,     setAttachments]     = useState([])
  const [dragOver,        setDragOver]        = useState(false)
  const [renamingId,      setRenamingId]      = useState(null)
  const [renameValue,     setRenameValue]     = useState('')
  const [searchQuery,     setSearchQuery]     = useState('')
  const [showSearch,      setShowSearch]      = useState(false)
  const [showSettings,    setShowSettings]    = useState(false)
  const [showShortcuts,   setShowShortcuts]   = useState(false)
  const [showLanguage,    setShowLanguage]    = useState(false)
  const [showLearnMore,   setShowLearnMore]   = useState(false)
  const [selectedLang,    setSelectedLang]    = useState('English')
  const [bottomExpanded,  setBottomExpanded]  = useState(false)
  const [activeTab,       setActiveTab]       = useState('recents') // recents | projects | artifacts | code

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const fileRef    = useRef(null)
  const historyRef = useRef([])

  useEffect(() => { if (profile) setCredits(profile.credits) }, [profile])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { loadConversations() }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.key === '/') { e.preventDefault(); setShowShortcuts(s => !s) }
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); newConversation() }
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); setSidebarOpen(s => !s) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function loadConversations() {
    setLoadingConvs(true)
    const { data } = await supabase.from('conversations').select('id, title, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(60)
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

  async function startRename(e, conv) {
    e.stopPropagation(); setRenamingId(conv.id); setRenameValue(conv.title)
  }

  async function saveRename(convId) {
    if (!renameValue.trim()) return setRenamingId(null)
    await supabase.from('conversations').update({ title: renameValue.trim() }).eq('id', convId)
    setConversations(c => c.map(x => x.id === convId ? { ...x, title: renameValue.trim() } : x))
    setRenamingId(null)
  }

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

  async function send(text) {
    if ((!text.trim() && attachments.length === 0) || loading) return
    setError('')
    if (credits <= 0) { setError('No credits left. Please top up to continue.'); return }
    const userText = text.trim()
    const sentAttachments = [...attachments]
    const displayText = sentAttachments.length ? (userText || '') + sentAttachments.map(a => `\n📎 ${a.name}`).join('') : userText
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

  const filteredConvs = conversations.filter(c =>
    !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Group conversations by date
  const today     = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const grouped = filteredConvs.reduce((acc, conv) => {
    const d = new Date(conv.updated_at).toDateString()
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(conv.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    if (!acc[label]) acc[label] = []
    acc[label].push(conv)
    return acc
  }, {})

  return (
    <div style={s.shell} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>

      {/* Shortcuts modal */}
      {showShortcuts && (
        <div style={s.modalOverlay} onClick={() => setShowShortcuts(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={s.modalTitle}>Keyboard shortcuts</h3>
              <button style={s.closeBtn} onClick={() => setShowShortcuts(false)}>✕</button>
            </div>
            {KEYBOARD_SHORTCUTS.map(sc => (
              <div key={sc.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:14, color:'var(--text-secondary)' }}>{sc.desc}</span>
                <kbd style={{ background:'var(--bg-hover)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 10px', fontSize:12, color:'var(--text-primary)', fontFamily:'monospace' }}>{sc.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div style={s.modalOverlay} onClick={() => setShowSettings(false)}>
          <div style={{ ...s.modal, maxWidth:500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={s.modalTitle}>Settings</h3>
              <button style={s.closeBtn} onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div style={s.settingRow}>
              <div>
                <div style={s.settingLabel}>Account</div>
                <div style={s.settingDesc}>{profile?.full_name || 'User'}</div>
              </div>
            </div>
            <div style={s.settingRow}>
              <div>
                <div style={s.settingLabel}>Plan</div>
                <div style={s.settingDesc}>{planLabel} — {credits} credits remaining</div>
              </div>
              <button style={s.settingBtn} onClick={() => { setShowSettings(false); navigate('/plans') }}>Upgrade</button>
            </div>
            <div style={s.settingRow}>
              <div>
                <div style={s.settingLabel}>Language</div>
                <div style={s.settingDesc}>{selectedLang}</div>
              </div>
              <button style={s.settingBtn} onClick={() => setShowLanguage(s => !s)}>Change</button>
            </div>
            {showLanguage && (
              <div style={{ background:'var(--bg-deep)', border:'1px solid var(--border)', borderRadius:8, padding:8, marginBottom:12, maxHeight:200, overflowY:'auto' }}>
                {LANGUAGES.map(lang => (
                  <div key={lang} style={{ padding:'8px 12px', borderRadius:6, cursor:'pointer', fontSize:13, color: selectedLang === lang ? 'var(--blue-bright)' : 'var(--text-secondary)', background: selectedLang === lang ? 'var(--blue-dim)' : 'transparent' }}
                    onClick={() => { setSelectedLang(lang); setShowLanguage(false) }}>
                    {lang} {selectedLang === lang ? '✓' : ''}
                  </div>
                ))}
              </div>
            )}
            <div style={s.settingRow}>
              <div>
                <div style={s.settingLabel}>Theme</div>
                <div style={s.settingDesc}>Space dark — electric blue</div>
              </div>
            </div>
            <div style={{ marginTop:8 }}>
              <button style={{ ...s.settingBtn, color:'#F87171', borderColor:'#F87171', width:'100%', justifyContent:'center' }} onClick={handleSignOut}>Sign out</button>
            </div>
          </div>
        </div>
      )}

      {dragOver && (
        <div style={s.dropOverlay}>
          <div style={s.dropBox}>
            <div style={{ fontSize:48 }}>📎</div>
            <div style={{ fontSize:18, fontWeight:600, color:'var(--blue-bright)', marginTop:12 }}>Drop files here</div>
            <div style={{ fontSize:13, color:'var(--text-secondary)', marginTop:4 }}>PDF, images, code, text files</div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILES+',image/*'} style={{ display:'none' }} onChange={e => handleFiles(e.target.files)}/>

      {/* ── SIDEBAR ───────────────────────────────────────────────────────── */}
      <div style={{ ...s.sidebar, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', opacity: sidebarOpen ? 1 : 0, pointerEvents: sidebarOpen ? 'all' : 'none' }}>

        {/* Logo + close */}
        <div style={s.sidebarTop}>
          <div style={s.sidebarLogo}>
            <div style={s.markSm}>✦</div>
            <span style={s.brand}>Airom</span>
          </div>
          <button style={s.iconBtn} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        {/* New chat */}
        <button style={s.newChatBtn} onClick={newConversation}>
          <span style={{ fontSize:16 }}>+</span> New chat
          <kbd style={s.shortcutKey}>Ctrl+K</kbd>
        </button>

        {/* Search */}
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>🔍</span>
          <input
            style={s.searchInput}
            placeholder="Search conversations…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && <button style={s.clearSearch} onClick={() => setSearchQuery('')}>✕</button>}
        </div>

        {/* Tabs */}
        <div style={s.tabRow}>
          {[
            { key:'recents',   label:'Recents'   },
            { key:'projects',  label:'Projects'  },
            { key:'artifacts', label:'Artifacts' },
            { key:'code',      label:'Code'      },
          ].map(tab => (
            <button key={tab.key} style={{ ...s.tab, borderBottom: activeTab===tab.key ? '2px solid var(--blue)' : '2px solid transparent', color: activeTab===tab.key ? 'var(--blue-bright)' : 'var(--text-muted)' }} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={s.convList}>
          {activeTab === 'recents' && (
            loadingConvs ? <p style={s.emptyMsg}>Loading…</p> :
            filteredConvs.length === 0 ? <p style={s.emptyMsg}>{searchQuery ? 'No results found.' : 'No conversations yet.'}</p> :
            Object.entries(grouped).map(([label, convs]) => (
              <div key={label}>
                <div style={s.dateLabel}>{label}</div>
                {convs.map(conv => (
                  <div key={conv.id} style={{ ...s.convItem, background: activeConvId===conv.id ? 'var(--bg-hover)' : 'transparent', borderColor: activeConvId===conv.id ? 'var(--border-bright)' : 'transparent' }} onClick={() => loadConversation(conv)}>
                    <div style={s.convBody}>
                      {renamingId === conv.id ? (
                        <input style={s.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => saveRename(conv.id)} onKeyDown={e => { if(e.key==='Enter') saveRename(conv.id); if(e.key==='Escape') setRenamingId(null) }} onClick={e => e.stopPropagation()} autoFocus/>
                      ) : (
                        <div style={s.convTitle}>{conv.title}</div>
                      )}
                    </div>
                    <div style={s.convActions}>
                      <button style={s.convBtn} onClick={e => startRename(e, conv)} title="Rename">✏</button>
                      <button style={s.convBtn} onClick={e => deleteConversation(e, conv.id)} title="Delete">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          {activeTab === 'projects' && (
            <div style={s.comingSoon}>
              <div style={{ fontSize:32, marginBottom:12 }}>📁</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>Projects</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>Organise conversations into projects. Coming soon.</div>
            </div>
          )}
          {activeTab === 'artifacts' && (
            <div style={s.comingSoon}>
              <div style={{ fontSize:32, marginBottom:12 }}>🎨</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>Artifacts</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>Saved outputs, images and documents. Coming soon.</div>
            </div>
          )}
          {activeTab === 'code' && (
            <div style={s.comingSoon}>
              <div style={{ fontSize:32, marginBottom:12 }}>💻</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>Code</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>Saved code snippets and scripts. Coming soon.</div>
            </div>
          )}
        </div>

        {/* ── Bottom expandable section ─────────────────────────────────── */}
        <div style={s.bottomSection}>

          {/* User row */}
          <div style={s.userRow}>
            <div style={s.userAvatar}>{profile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={s.userName}>{profile?.full_name || 'User'}</div>
              <div style={s.userPlan}>{planLabel} · {credits} credits</div>
            </div>
            <button style={{ ...s.iconBtn, fontSize:12 }} onClick={() => setBottomExpanded(s => !s)}>{bottomExpanded ? '▾' : '▴'}</button>
          </div>

          {/* Expandable menu */}
          {bottomExpanded && (
            <div style={s.bottomMenu}>

              <button style={s.menuRow} onClick={() => { setShowSettings(true); setBottomExpanded(false) }}>
                <span style={s.menuIcon}>⚙</span> Settings
              </button>

              <div>
                <button style={s.menuRow} onClick={() => setShowLanguage(s => !s)}>
                  <span style={s.menuIcon}>🌐</span> Language
                  <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)' }}>{selectedLang} {showLanguage ? '▾' : '▸'}</span>
                </button>
                {showLanguage && (
                  <div style={{ background:'var(--bg-deep)', borderRadius:6, margin:'2px 0 6px', maxHeight:160, overflowY:'auto' }}>
                    {LANGUAGES.map(lang => (
                      <div key={lang} style={{ padding:'7px 14px', fontSize:12, cursor:'pointer', color: selectedLang===lang ? 'var(--blue-bright)' : 'var(--text-secondary)', background: selectedLang===lang ? 'var(--blue-dim)' : 'transparent' }}
                        onClick={() => { setSelectedLang(lang); setShowLanguage(false) }}>
                        {selectedLang===lang ? '✓ ' : ''}{lang}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button style={s.menuRow} onClick={() => window.open('mailto:support@airom.ai')}>
                <span style={s.menuIcon}>❓</span> Get help
              </button>

              <button style={s.menuRow} onClick={() => { navigate('/plans'); setBottomExpanded(false) }}>
                <span style={s.menuIcon}>⬆</span> Upgrade plan
                {profile?.plan === 'free' && <span style={s.newBadge}>Free</span>}
              </button>

              <button style={s.menuRow} onClick={() => window.open('https://apps.apple.com')}>
                <span style={s.menuIcon}>📱</span> Get apps & extensions
              </button>

              <button style={s.menuRow} onClick={() => { navigate('/plans'); setBottomExpanded(false) }}>
                <span style={s.menuIcon}>🎁</span> Gift Airom
              </button>

              <div>
                <button style={s.menuRow} onClick={() => setShowLearnMore(s => !s)}>
                  <span style={s.menuIcon}>📖</span> Learn more
                  <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)' }}>{showLearnMore ? '▾' : '▸'}</span>
                </button>
                {showLearnMore && (
                  <div style={{ paddingLeft:28, display:'flex', flexDirection:'column', gap:1, marginBottom:4 }}>
                    {[
                      { label:'API Console',     url:'https://console.anthropic.com' },
                      { label:'Tutorials',       url:'mailto:support@airom.ai' },
                      { label:'Usage policy',    url:'mailto:support@airom.ai' },
                      { label:'Privacy policy',  url:'mailto:support@airom.ai' },
                    ].map(item => (
                      <button key={item.label} style={{ ...s.menuRow, fontSize:12, padding:'6px 8px' }} onClick={() => window.open(item.url)}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {profile?.is_admin && (
                <button style={{ ...s.menuRow, color:'var(--blue-bright)' }} onClick={() => { navigate('/admin'); setBottomExpanded(false) }}>
                  <span style={s.menuIcon}>🛡</span> Admin console
                </button>
              )}

              <div style={{ height:'1px', background:'var(--border)', margin:'4px 0' }}/>

              <button style={s.menuRow} onClick={() => { setShowShortcuts(true); setBottomExpanded(false) }}>
                <span style={s.menuIcon}>⌨</span> Keyboard shortcuts
                <kbd style={{ ...s.shortcutKey, marginLeft:'auto' }}>Ctrl+/</kbd>
              </button>

              <button style={{ ...s.menuRow, color:'#F87171' }} onClick={handleSignOut}>
                <span style={s.menuIcon}>↩</span> Log out
              </button>

            </div>
          )}
        </div>
      </div>

      {sidebarOpen && <div style={s.overlay} onClick={() => setSidebarOpen(false)}/>}

      {/* ── MAIN ──────────────────────────────────────────────────────────── */}
      <div style={s.main}>
        <div style={s.topbar}>
          <div style={s.topLeft}>
            <button style={s.iconBtn} onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar (Ctrl+B)">☰</button>
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
            {error.includes('credits') && <Link to="/plans" style={{ color:'#FB923C', marginLeft:8 }}>Top up →</Link>}
            <button style={{ marginLeft:'auto', background:'none', border:'none', color:'#FB923C', cursor:'pointer' }} onClick={() => setError('')}>✕</button>
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
              <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:20 }}>💡 Drag & drop files anywhere · click 📎 to attach · Ctrl+/ for shortcuts</p>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} style={{ ...s.msgRow, justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}>
              {m.role==='ai' && <div style={s.aiAvatar}>✦</div>}
              <div style={{ maxWidth:'78%', display:'flex', flexDirection:'column', gap:6, alignItems: m.role==='user' ? 'flex-end' : 'flex-start' }}>
                {m.attachments?.map((src,i) => <img key={i} src={src} alt="attachment" style={{ maxWidth:240, maxHeight:180, borderRadius:10, border:'1px solid var(--border)', objectFit:'cover' }}/>)}
                <div style={m.role==='ai' ? s.aiBubble : s.userBubble}>
                  <MessageText text={m.text}/>
                </div>
              </div>
              {m.role==='user' && <div style={s.userAvatarSm}>{profile?.full_name?.[0]?.toUpperCase()||'U'}</div>}
            </div>
          ))}

          {loading && (
            <div style={{ ...s.msgRow, justifyContent:'flex-start' }}>
              <div style={s.aiAvatar}>✦</div>
              <div style={{ ...s.aiBubble, display:'flex', gap:5, alignItems:'center', padding:'12px 16px' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--blue)', display:'inline-block', animation:'bounce 1.2s infinite' }}/>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--blue)', display:'inline-block', animation:'bounce 1.2s infinite 0.2s' }}/>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--blue)', display:'inline-block', animation:'bounce 1.2s infinite 0.4s' }}/>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {attachments.length > 0 && (
          <div style={s.attachmentRow}>
            {attachments.map((att,i) => (
              <div key={i} style={s.attachmentChip}>
                {att.preview ? <img src={att.preview} alt={att.name} style={{ width:32, height:32, borderRadius:4, objectFit:'cover' }}/> : <span style={{ fontSize:18 }}>{att.mediaType==='application/pdf'?'📄':'📎'}</span>}
                <span style={{ fontSize:12, color:'var(--text-primary)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{att.name}</span>
                <button style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14, marginLeft:'auto' }} onClick={() => removeAttachment(i)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={s.inputWrap}>
          <div style={s.inputRow}>
            <button style={s.attachBtn} onClick={() => fileRef.current?.click()} title="Attach file">📎</button>
            <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height='40px'; e.target.style.height=Math.min(e.target.scrollHeight,140)+'px' }} onKeyDown={onKeyDown} placeholder={credits<=0 ? 'No credits — top up to continue' : 'Message Airom…'} rows={1} style={{ ...s.textarea, opacity:credits<=0?0.5:1 }} disabled={loading||credits<=0}/>
            <button style={{ ...s.sendBtn, opacity:((!input.trim()&&attachments.length===0)||loading||credits<=0)?0.4:1 }} disabled={(!input.trim()&&attachments.length===0)||loading||credits<=0} onClick={() => send(input)}>➤</button>
          </div>
          <div style={s.inputHint}>Enter to send · Shift+Enter for new line · 📎 attach · drag & drop · {credits} credits left</div>
        </div>
      </div>
    </div>
  )
}

function MessageText({ text }) {
  const elements = []
  let rawLast = 0
  const rawCodeRegex = /```(\w*)\n([\s\S]*?)```/g
  let rawMatch, keyIdx = 0
  while ((rawMatch = rawCodeRegex.exec(text)) !== null) {
    const before = text.slice(rawLast, rawMatch.index)
    if (before) elements.push(<span key={keyIdx++} dangerouslySetInnerHTML={{ __html: formatInline(before) }}/>)
    elements.push(<CodeBlock key={keyIdx++} lang={rawMatch[1]||'code'} code={rawMatch[2].trim()}/>)
    rawLast = rawMatch.index + rawMatch[0].length
  }
  const remaining = text.slice(rawLast)
  if (remaining) elements.push(<span key={keyIdx++} dangerouslySetInnerHTML={{ __html: formatInline(remaining) }}/>)
  return <span>{elements}</span>
}

function formatInline(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/`([^`]+)`/g,'<code style="background:var(--bg-deep);border:1px solid var(--border);padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace;color:var(--blue-bright)">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\n/g,'<br>')
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)
  function copyCode() { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  function downloadZip() {
    const extMap = { javascript:'js',typescript:'ts',python:'py',java:'java',cpp:'cpp',c:'c',csharp:'cs',go:'go',rust:'rs',html:'html',css:'css',jsx:'jsx',tsx:'tsx',sql:'sql',bash:'sh',shell:'sh',json:'json',yaml:'yml' }
    const ext = extMap[lang.toLowerCase()] || lang || 'txt'
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    script.onload = () => {
      const zip = new window.JSZip()
      zip.file(`code.${ext}`, code)
      zip.generateAsync({ type:'blob' }).then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'airom-code.zip'; a.click(); URL.revokeObjectURL(url)
      })
    }
    document.head.appendChild(script)
  }
  return (
    <div style={{ margin:'8px 0', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-deep)', padding:'6px 12px', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.05em' }}>{lang}</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={copyCode} style={{ fontSize:11, padding:'3px 10px', borderRadius:5, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'inherit' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button onClick={downloadZip} style={{ fontSize:11, padding:'3px 10px', borderRadius:5, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--blue-bright)', cursor:'pointer', fontFamily:'inherit' }}>
            ⬇ Download zip
          </button>
        </div>
      </div>
      <pre style={{ background:'var(--bg-deep)', padding:12, margin:0, fontSize:12, overflowX:'auto', fontFamily:'monospace', color:'var(--text-primary)', lineHeight:1.6 }}>{code}</pre>
    </div>
  )
}

const s = {
  shell:          { display:'flex', height:'100dvh', background:'transparent', position:'relative', zIndex:1, overflow:'hidden' },
  dropOverlay:    { position:'fixed', inset:0, background:'rgba(3,5,15,0.85)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)' },
  dropBox:        { border:'2px dashed var(--blue)', borderRadius:20, padding:'48px 64px', textAlign:'center', background:'var(--blue-dim)' },
  modalOverlay:   { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' },
  modal:          { background:'var(--bg-card)', border:'1px solid var(--border-bright)', borderRadius:14, padding:28, width:'100%', maxWidth:400, boxShadow:'0 0 48px var(--blue-glow)', maxHeight:'80vh', overflowY:'auto' },
  modalTitle:     { fontSize:18, fontWeight:700, color:'var(--text-primary)' },
  closeBtn:       { background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18, padding:4 },
  settingRow:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--border)' },
  settingLabel:   { fontSize:14, fontWeight:500, color:'var(--text-primary)', marginBottom:2 },
  settingDesc:    { fontSize:12, color:'var(--text-muted)' },
  settingBtn:     { fontSize:12, padding:'5px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--blue-bright)', cursor:'pointer', fontFamily:'inherit' },
  sidebar:        { width:280, minWidth:280, background:'rgba(7,11,26,0.97)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'absolute', left:0, top:0, bottom:0, zIndex:30, transition:'transform 0.25s ease, opacity 0.25s ease', backdropFilter:'blur(16px)' },
  sidebarTop:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 14px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  sidebarLogo:    { display:'flex', alignItems:'center', gap:8 },
  newChatBtn:     { display:'flex', alignItems:'center', gap:8, margin:'10px 12px 6px', padding:'10px 14px', background:'var(--blue)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 0 12px var(--blue-glow)' },
  shortcutKey:    { marginLeft:'auto', fontSize:10, background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:4, padding:'1px 6px', fontFamily:'monospace', color:'rgba(255,255,255,0.7)' },
  searchWrap:     { display:'flex', alignItems:'center', gap:8, margin:'4px 12px 6px', padding:'7px 12px', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:8, flexShrink:0 },
  searchIcon:     { fontSize:13, flexShrink:0 },
  searchInput:    { flex:1, background:'none', border:'none', color:'var(--text-primary)', fontSize:13, outline:'none', fontFamily:'inherit' },
  clearSearch:    { background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:12, padding:0, flexShrink:0 },
  tabRow:         { display:'flex', padding:'0 8px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  tab:            { flex:1, padding:'8px 4px', background:'none', border:'none', fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', fontWeight:500 },
  convList:       { flex:1, overflowY:'auto', padding:'4px 8px' },
  dateLabel:      { fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', padding:'8px 8px 4px' },
  convItem:       { display:'flex', alignItems:'center', gap:6, padding:'7px 8px', borderRadius:7, cursor:'pointer', border:'1px solid transparent', marginBottom:1, transition:'all 0.15s' },
  convBody:       { flex:1, minWidth:0 },
  convTitle:      { fontSize:13, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  convActions:    { display:'flex', gap:2, opacity:0.5 },
  convBtn:        { background:'none', border:'none', cursor:'pointer', fontSize:12, padding:'2px 4px', color:'var(--text-secondary)' },
  renameInput:    { width:'100%', background:'var(--bg-input)', border:'1px solid var(--border-bright)', borderRadius:5, padding:'3px 7px', fontSize:13, color:'var(--text-primary)', fontFamily:'inherit', outline:'none' },
  emptyMsg:       { fontSize:13, color:'var(--text-muted)', padding:'20px 8px', textAlign:'center' },
  comingSoon:     { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px', textAlign:'center' },
  bottomSection:  { borderTop:'1px solid var(--border)', flexShrink:0 },
  userRow:        { display:'flex', alignItems:'center', gap:10, padding:'12px 14px' },
  userAvatar:     { width:32, height:32, borderRadius:'50%', background:'var(--blue)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, flexShrink:0 },
  userName:       { fontSize:13, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  userPlan:       { fontSize:11, color:'var(--text-muted)' },
  bottomMenu:     { padding:'4px 8px 10px', display:'flex', flexDirection:'column', gap:1 },
  menuRow:        { display:'flex', alignItems:'center', gap:8, padding:'8px 8px', borderRadius:7, border:'none', background:'none', fontSize:13, color:'var(--text-secondary)', cursor:'pointer', textAlign:'left', fontFamily:'inherit', width:'100%', transition:'background 0.12s' },
  menuIcon:       { fontSize:15, width:20, textAlign:'center', flexShrink:0 },
  newBadge:       { marginLeft:'auto', fontSize:10, background:'var(--blue-dim)', color:'var(--blue-bright)', border:'1px solid var(--border-bright)', borderRadius:10, padding:'1px 7px' },
  overlay:        { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:25, backdropFilter:'blur(2px)' },
  main:           { flex:1, display:'flex', flexDirection:'column', minWidth:0 },
  topbar:         { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'rgba(7,11,26,0.85)', backdropFilter:'blur(12px)', flexShrink:0 },
  topLeft:        { display:'flex', alignItems:'center', gap:10 },
  topRight:       { display:'flex', alignItems:'center', gap:8 },
  markSm:         { width:28, height:28, borderRadius:'50%', background:'var(--blue)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, boxShadow:'0 0 10px var(--blue-glow)', flexShrink:0 },
  brand:          { fontWeight:700, fontSize:16, color:'var(--text-primary)', letterSpacing:'-0.01em' },
  lowPill:        { fontSize:11, background:'rgba(251,146,60,0.12)', color:'#FB923C', border:'1px solid rgba(251,146,60,0.3)', borderRadius:20, padding:'3px 10px' },
  creditBadge:    { border:'1px solid', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600, cursor:'pointer', background:'transparent' },
  iconBtn:        { background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:16, padding:'4px 6px', borderRadius:6 },
  errorBanner:    { background:'rgba(251,146,60,0.08)', borderBottom:'1px solid rgba(251,146,60,0.2)', padding:'10px 16px', fontSize:13, color:'#FB923C', display:'flex', alignItems:'center', gap:6, flexShrink:0 },
  messages:       { flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 },
  welcome:        { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, textAlign:'center', padding:'40px 20px' },
  welcomeMark:    { width:64, height:64, borderRadius:'50%', background:'var(--blue)', color:'#fff', fontSize:28, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', boxShadow:'0 0 32px var(--blue-glow), 0 0 64px rgba(59,130,246,0.15)' },
  welcomeTitle:   { fontSize:26, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em', marginBottom:8 },
  welcomeSub:     { fontSize:14, color:'var(--text-secondary)', marginBottom:28 },
  suggestionGrid: { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, maxWidth:480, width:'100%' },
  suggestionCard: { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', fontSize:13, color:'var(--text-secondary)', cursor:'pointer', textAlign:'left', transition:'all 0.2s', fontFamily:'inherit' },
  msgRow:         { display:'flex', gap:10, alignItems:'flex-start' },
  aiAvatar:       { width:30, height:30, borderRadius:'50%', background:'var(--blue)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0, boxShadow:'0 0 10px var(--blue-glow)' },
  userAvatarSm:   { width:30, height:30, borderRadius:'50%', background:'var(--bg-hover)', border:'1px solid var(--border-bright)', color:'var(--blue-bright)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 },
  aiBubble:       { maxWidth:'100%', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'16px 16px 16px 4px', padding:'10px 14px', fontSize:14, lineHeight:1.65, color:'var(--text-primary)' },
  userBubble:     { maxWidth:'100%', background:'var(--blue)', color:'#fff', borderRadius:'16px 16px 4px 16px', padding:'10px 14px', fontSize:14, lineHeight:1.65, boxShadow:'0 0 16px var(--blue-glow)' },
  attachmentRow:  { display:'flex', gap:8, padding:'8px 14px', flexWrap:'wrap', borderTop:'1px solid var(--border)', background:'rgba(7,11,26,0.7)' },
  attachmentChip: { display:'flex', alignItems:'center', gap:6, background:'var(--bg-card)', border:'1px solid var(--border-bright)', borderRadius:8, padding:'5px 8px', maxWidth:220 },
  inputWrap:      { borderTop:'1px solid var(--border)', background:'rgba(7,11,26,0.85)', backdropFilter:'blur(12px)', flexShrink:0, padding:'12px 14px 8px' },
  inputRow:       { display:'flex', gap:8, alignItems:'flex-end' },
  attachBtn:      { width:40, height:40, borderRadius:10, background:'var(--bg-hover)', border:'1px solid var(--border)', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  textarea:       { flex:1, height:40, resize:'none', padding:'9px 13px', borderRadius:10, border:'1px solid var(--border)', fontSize:14, lineHeight:1.4, fontFamily:'inherit', background:'var(--bg-input)', color:'var(--text-primary)' },
  sendBtn:        { width:40, height:40, borderRadius:'50%', background:'var(--blue)', color:'#fff', border:'none', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 0 12px var(--blue-glow)', transition:'all 0.2s', cursor:'pointer' },
  inputHint:      { fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:6 }
}
