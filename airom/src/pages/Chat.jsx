import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { calcCreditCost, LOW_CREDIT_THRESHOLD } from '../lib/plans'

const SUGGESTIONS = ['What can you do?', 'Write me a Python script', 'Explain quantum computing', 'Help me debug code']

export default function Chat() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [credits,  setCredits]  = useState(profile?.credits ?? 0)
  const [menuOpen, setMenuOpen] = useState(false)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const historyRef = useRef([])

  useEffect(() => { if (profile) setCredits(profile.credits) }, [profile])

  useEffect(() => {
    const plan = profile?.plan || 'free'
    addAIMessage(`Hey ${profile?.full_name?.split(' ')[0] || 'there'}! I'm **Airom** — your intelligent AI assistant. You're on the **${plan.charAt(0).toUpperCase()+plan.slice(1)}** plan with **${profile?.credits ?? 0} credits**. What can I help you build today?`)
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function addAIMessage(text) { setMessages(m => [...m, { role:'ai', text, id:Date.now() }]) }

  async function send(text) {
    if (!text.trim() || loading) return
    if (credits <= 0) { addAIMessage("You've run out of credits! Please top up to keep chatting."); navigate('/plans'); return }
    setMessages(m => [...m, { role:'user', text:text.trim(), id:Date.now() }])
    setInput(''); setLoading(true)
    historyRef.current.push({ role:'user', content:text.trim() })
    try {
      const res  = await fetch('/.netlify/functions/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ messages: historyRef.current, userId: user.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'API error')
      const reply = data.reply
      historyRef.current.push({ role:'assistant', content:reply })
      const cost = calcCreditCost(reply)
      await supabase.rpc('deduct_credits', { user_id: user.id, amount: cost })
      setCredits(c => Math.max(0, c - cost))
      await supabase.from('transactions').insert({ user_id: user.id, type:'usage', credits_delta: -cost, description:'AI message' })
      addAIMessage(reply)
    } catch (err) { addAIMessage('Something went wrong. Please try again.') }
    finally { setLoading(false); inputRef.current?.focus() }
  }

  function onKeyDown(e) { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }
  async function handleSignOut() { await signOut(); navigate('/login') }

  const lowCredits = credits <= LOW_CREDIT_THRESHOLD && credits > 0

  return (
    <div style={s.shell}>
      <div style={s.topbar}>
        <div style={s.logoRow}>
          <div style={s.mark}>✦</div>
          <span style={s.brand}>Airom</span>
          <span style={s.tagline}>AI Assistant</span>
        </div>
        <button style={{...s.creditBadge, background: lowCredits ? 'rgba(251,146,60,0.12)' : 'var(--blue-dim)', color: lowCredits ? '#FB923C' : 'var(--blue-bright)', borderColor: lowCredits ? 'rgba(251,146,60,0.4)' : 'var(--border-bright)'}} onClick={() => setMenuOpen(o=>!o)}>
          ◈ {credits} credits
        </button>
      </div>

      {menuOpen && (
        <div style={s.menu}>
          <Link to="/plans" style={s.menuItem} onClick={() => setMenuOpen(false)}>⬆ Upgrade / top up</Link>
          <button style={s.menuItem} onClick={handleSignOut}>↩ Sign out</button>
        </div>
      )}

      {lowCredits && (
        <div style={s.lowBanner}>
          ⚡ Running low on credits — <Link to="/plans" style={{color:'#FB923C'}}>Top up now →</Link>
        </div>
      )}

      <div style={s.messages}>
        {messages.map(m => (
          <div key={m.id} style={{...s.msgRow, justifyContent: m.role==='user' ? 'flex-end' : 'flex-start'}}>
            {m.role==='ai' && <div style={s.aiAvatar}>✦</div>}
            <div style={m.role==='ai' ? s.aiBubble : s.userBubble}>
              <MessageText text={m.text}/>
            </div>
            {m.role==='user' && <div style={s.userAvatar}>{profile?.full_name?.[0]?.toUpperCase()||'U'}</div>}
          </div>
        ))}
        {loading && (
          <div style={{...s.msgRow, justifyContent:'flex-start'}}>
            <div style={s.aiAvatar}>✦</div>
            <div style={{...s.aiBubble, display:'flex', gap:5, alignItems:'center', padding:'12px 16px'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--blue)',display:'inline-block',animation:'bounce 1.2s infinite'}}/>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--blue)',display:'inline-block',animation:'bounce 1.2s infinite 0.2s'}}/>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--blue)',display:'inline-block',animation:'bounce 1.2s infinite 0.4s'}}/>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {messages.filter(m=>m.role==='user').length===0 && !loading && (
        <div style={s.chips}>
          {SUGGESTIONS.map(sg => <button key={sg} style={s.chip} onClick={() => send(sg)}>{sg}</button>)}
        </div>
      )}

      <div style={s.inputRow}>
        <textarea ref={inputRef} value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='40px';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'}} onKeyDown={onKeyDown} placeholder="Message Airom…" rows={1} style={s.textarea} disabled={loading||credits<=0}/>
        <button style={{...s.sendBtn, opacity: (!input.trim()||loading||credits<=0)?0.4:1}} disabled={loading||!input.trim()||credits<=0} onClick={()=>send(input)}>➤</button>
      </div>
    </div>
  )
}

function MessageText({ text }) {
  const html = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g,(_,l,c)=>`<pre style="background:var(--bg-deep);border:1px solid var(--border);border-radius:8px;padding:12px;margin:8px 0;font-size:12px;overflow-x:auto;font-family:monospace;color:var(--text-primary)">${c.trim()}</pre>`)
    .replace(/`([^`]+)`/g,'<code style="background:var(--bg-deep);border:1px solid var(--border);padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace;color:var(--blue-bright)">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\n/g,'<br>')
  return <span dangerouslySetInnerHTML={{__html:html}}/>
}

const s = {
  shell:      { display:'flex', flexDirection:'column', height:'100dvh', background:'transparent', position:'relative', zIndex:1 },
  topbar:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'rgba(7,11,26,0.85)', backdropFilter:'blur(12px)' },
  logoRow:    { display:'flex', alignItems:'center', gap:10 },
  mark:       { width:32, height:32, borderRadius:'50%', background:'var(--blue)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, boxShadow:'0 0 12px var(--blue-glow)' },
  brand:      { fontWeight:700, fontSize:17, color:'var(--text-primary)', letterSpacing:'-0.01em' },
  tagline:    { fontSize:11, color:'var(--text-muted)', letterSpacing:'0.08em', textTransform:'uppercase' },
  creditBadge:{ border:'1px solid', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600, cursor:'pointer', background:'transparent', letterSpacing:'0.02em' },
  menu:       { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:6, position:'absolute', top:58, right:16, zIndex:20, minWidth:180, display:'flex', flexDirection:'column', gap:2, boxShadow:'0 8px 32px rgba(0,0,0,0.4)' },
  menuItem:   { display:'block', padding:'9px 12px', fontSize:14, color:'var(--text-secondary)', background:'none', border:'none', textAlign:'left', borderRadius:7, cursor:'pointer', textDecoration:'none' },
  lowBanner:  { background:'rgba(251,146,60,0.08)', borderBottom:'1px solid rgba(251,146,60,0.2)', padding:'8px 16px', fontSize:13, color:'#FB923C' },
  messages:   { flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:14 },
  msgRow:     { display:'flex', gap:10, alignItems:'flex-start' },
  aiAvatar:   { width:30, height:30, borderRadius:'50%', background:'var(--blue)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0, boxShadow:'0 0 10px var(--blue-glow)' },
  userAvatar: { width:30, height:30, borderRadius:'50%', background:'var(--bg-hover)', border:'1px solid var(--border-bright)', color:'var(--blue-bright)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 },
  aiBubble:   { maxWidth:'78%', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'16px 16px 16px 4px', padding:'10px 14px', fontSize:14, lineHeight:1.65, color:'var(--text-primary)' },
  userBubble: { maxWidth:'78%', background:'var(--blue)', color:'#fff', borderRadius:'16px 16px 4px 16px', padding:'10px 14px', fontSize:14, lineHeight:1.65, boxShadow:'0 0 16px var(--blue-glow)' },
  chips:      { display:'flex', gap:8, padding:'0 16px 10px', flexWrap:'wrap' },
  chip:       { fontSize:12, padding:'6px 14px', borderRadius:20, border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text-secondary)', cursor:'pointer', transition:'all 0.2s' },
  inputRow:   { display:'flex', gap:8, padding:'12px 14px', borderTop:'1px solid var(--border)', background:'rgba(7,11,26,0.85)', backdropFilter:'blur(12px)' },
  textarea:   { flex:1, height:40, resize:'none', padding:'9px 13px', borderRadius:10, border:'1px solid var(--border)', fontSize:14, lineHeight:1.4, fontFamily:'inherit', background:'var(--bg-input)', color:'var(--text-primary)' },
  sendBtn:    { width:40, height:40, borderRadius:'50%', background:'var(--blue)', color:'#fff', border:'none', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 0 12px var(--blue-glow)', transition:'all 0.2s' }
}
