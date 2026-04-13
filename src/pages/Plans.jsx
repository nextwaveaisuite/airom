import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { PLANS, TOPUPS, CREDIT_COSTS } from '../lib/plans'

export default function Plans() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)

  async function checkout(priceId, mode = 'subscription') {
    if (!priceId) { await refreshProfile(); navigate('/chat'); return }
    setBusy(priceId)
    try {
      const res  = await fetch('/.netlify/functions/create-checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ priceId, mode, userId: user.id, email: user.email }) })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (err) { alert('Could not start checkout: ' + err.message) }
    finally { setBusy(null) }
  }

  const currentPlan = profile?.plan || 'free'

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <div style={s.header}>
          <div style={s.mark}>✦</div>
          <h1 style={s.h1}>Choose your plan</h1>
          <p style={s.sub}>Upgrade, downgrade, or top up any time</p>
        </div>

        <div style={s.grid}>
          {Object.values(PLANS).map(plan => {
            const isCurrent  = plan.key === currentPlan
            const isFeatured = plan.key === 'pro'
            return (
              <div key={plan.key} style={{ ...s.card, border: isFeatured ? '1px solid var(--blue)' : '1px solid var(--border)', boxShadow: isFeatured ? '0 0 24px var(--blue-glow)' : 'none' }}>
                {plan.badge && <div style={s.badge}>{plan.badge}</div>}
                <div style={s.planName}>{plan.name}</div>
                <div style={s.price}>{plan.price === 0 ? 'Free' : `$${plan.price}`}{plan.price > 0 && <span style={s.perMo}>/mo</span>}</div>
                <div style={s.credits}>{plan.credits.toLocaleString()} credits{plan.price === 0 ? ' to start' : '/mo'}</div>
                <ul style={s.features}>
                  {plan.features.map(f => <li key={f} style={s.feat}><span style={s.dot}/>{f}</li>)}
                </ul>
                <button className="btn btn-primary btn-full" style={{ marginTop:'auto' }} disabled={isCurrent || busy === plan.stripePriceId} onClick={() => checkout(plan.stripePriceId, 'subscription')}>
                  {isCurrent ? 'Current plan' : busy === plan.stripePriceId ? <span className="spinner"/> : plan.price === 0 ? 'Continue free' : `Get ${plan.name}`}
                </button>
              </div>
            )
          })}
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>Top-up packs</h2>
          <p style={s.sectionSub}>Add credits any time on any plan. Credits never expire.</p>
          <div style={s.topupGrid}>
            {TOPUPS.map(t => (
              <div key={t.credits} style={s.topupCard}>
                <div style={s.topupCredits}>{t.credits} credits</div>
                <div style={s.topupPrice}>${t.price.toFixed(2)}</div>
                <button className="btn btn-outline btn-full" style={{marginTop:10,fontSize:13}} disabled={busy === t.stripePriceId} onClick={() => checkout(t.stripePriceId, 'payment')}>
                  {busy === t.stripePriceId ? <span className="spinner" style={{borderTopColor:'var(--blue)'}}/> : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>How credits are spent</h2>
          <p style={s.sectionSub}>Credits deducted per response based on length and complexity.</p>
          <table style={s.table}>
            <thead><tr><th style={s.th}>Type</th><th style={s.th}>Length</th><th style={{...s.th,textAlign:'right'}}>Cost</th></tr></thead>
            <tbody>
              {CREDIT_COSTS.map((row,i) => (
                <tr key={i} style={{background: i%2===0 ? 'rgba(59,130,246,0.04)' : 'transparent'}}>
                  <td style={s.td}>{row.label}</td>
                  <td style={{...s.td,color:'var(--text-muted)'}}>{row.range}</td>
                  <td style={{...s.td,textAlign:'right',fontWeight:500,color:'var(--blue-bright)'}}>{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{textAlign:'center',fontSize:13,color:'var(--text-muted)',marginTop:24}}><a href="/chat">← Back to chat</a></p>
      </div>
    </div>
  )
}

const s = {
  page:         { minHeight:'100dvh', background:'transparent', padding:'32px 16px', position:'relative', zIndex:1 },
  wrap:         { maxWidth:900, margin:'0 auto' },
  header:       { textAlign:'center', marginBottom:32 },
  mark:         { width:48, height:48, borderRadius:'50%', background:'var(--blue)', color:'#fff', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', boxShadow:'0 0 24px var(--blue-glow)' },
  h1:           { fontSize:28, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em', marginBottom:6 },
  sub:          { color:'var(--text-secondary)', fontSize:14 },
  grid:         { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:24 },
  card:         { background:'var(--bg-card)', borderRadius:14, padding:'20px 18px', display:'flex', flexDirection:'column', gap:6 },
  badge:        { fontSize:11, background:'var(--blue-dim)', color:'var(--blue-bright)', border:'1px solid var(--border-bright)', borderRadius:20, padding:'3px 10px', alignSelf:'flex-start', fontWeight:500 },
  planName:     { fontSize:15, fontWeight:600, color:'var(--text-primary)' },
  price:        { fontSize:30, fontWeight:700, lineHeight:1.2, color:'var(--text-primary)' },
  perMo:        { fontSize:13, fontWeight:400, color:'var(--text-secondary)' },
  credits:      { fontSize:13, color:'var(--blue-bright)', fontWeight:500 },
  features:     { listStyle:'none', display:'flex', flexDirection:'column', gap:5, margin:'8px 0' },
  feat:         { fontSize:13, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:7 },
  dot:          { width:5, height:5, borderRadius:'50%', background:'var(--blue)', flexShrink:0 },
  section:      { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:14, padding:24, marginBottom:16 },
  sectionTitle: { fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:4 },
  sectionSub:   { fontSize:13, color:'var(--text-secondary)', marginBottom:16 },
  topupGrid:    { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 },
  topupCard:    { border:'1px solid var(--border)', borderRadius:10, padding:'14px 12px', textAlign:'center' },
  topupCredits: { fontSize:16, fontWeight:600, color:'var(--text-primary)' },
  topupPrice:   { fontSize:13, color:'var(--blue-bright)', fontWeight:500, marginTop:2 },
  table:        { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:           { textAlign:'left', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-muted)', padding:'6px 8px', borderBottom:'1px solid var(--border)' },
  td:           { padding:'9px 8px', borderBottom:'1px solid rgba(59,130,246,0.08)', fontSize:13, color:'var(--text-primary)' }
}
