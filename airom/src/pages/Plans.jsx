import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { PLANS, TOPUPS, CREDIT_COSTS } from '../lib/plans'

export default function Plans() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)

  async function checkout(priceId, mode = 'subscription') {
    if (!priceId) {
      // Free plan — no checkout needed
      await refreshProfile()
      navigate('/chat')
      return
    }
    setBusy(priceId)
    try {
      const res  = await fetch('/.netlify/functions/create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId, mode, userId: user.id, email: user.email })
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (err) {
      alert('Could not start checkout: ' + err.message)
    } finally {
      setBusy(null)
    }
  }

  const currentPlan = profile?.plan || 'free'

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={styles.mark}>✦</div>
          <h1 style={styles.h1}>Choose your plan</h1>
          <p style={styles.sub}>Upgrade, downgrade, or top up any time</p>
        </div>

        {/* Plan cards */}
        <div style={styles.grid}>
          {Object.values(PLANS).map(plan => {
            const isCurrent  = plan.key === currentPlan
            const isFeatured = plan.key === 'pro'
            return (
              <div
                key={plan.key}
                style={{
                  ...styles.card,
                  border: isFeatured ? '2px solid #1D9E75' : '1px solid #e8e6df'
                }}
              >
                {plan.badge && (
                  <div style={styles.badge}>{plan.badge}</div>
                )}
                <div style={styles.planName}>{plan.name}</div>
                <div style={styles.price}>
                  {plan.price === 0 ? 'Free' : `$${plan.price}`}
                  {plan.price > 0 && <span style={styles.perMo}>/mo</span>}
                </div>
                <div style={styles.credits}>{plan.credits.toLocaleString()} credits{plan.price === 0 ? ' to start' : '/mo'}</div>
                <ul style={styles.features}>
                  {plan.features.map(f => (
                    <li key={f} style={styles.feat}>
                      <span style={styles.dot}/>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 'auto', paddingTop: 10 }}
                  disabled={isCurrent || busy === plan.stripePriceId}
                  onClick={() => checkout(plan.stripePriceId, 'subscription')}
                >
                  {isCurrent
                    ? 'Current plan'
                    : busy === plan.stripePriceId
                    ? <span className="spinner" style={{ borderTopColor: '#fff' }}/>
                    : plan.price === 0 ? 'Continue free' : `Get ${plan.name}`}
                </button>
              </div>
            )
          })}
        </div>

        {/* Top-up section */}
        <div style={styles.topupSection}>
          <h2 style={styles.topupTitle}>Top-up packs — add credits any time</h2>
          <p style={styles.topupSub}>Available on any plan. Credits never expire.</p>
          <div style={styles.topupGrid}>
            {TOPUPS.map(t => (
              <div key={t.credits} style={styles.topupCard}>
                <div style={styles.topupCredits}>{t.credits} credits</div>
                <div style={styles.topupPrice}>${t.price.toFixed(2)}</div>
                <button
                  className="btn btn-outline btn-full"
                  style={{ marginTop: 10, fontSize: 13 }}
                  disabled={busy === t.stripePriceId}
                  onClick={() => checkout(t.stripePriceId, 'payment')}
                >
                  {busy === t.stripePriceId
                    ? <span className="spinner" style={{ borderTopColor: '#1D9E75', borderColor: 'rgba(29,158,117,0.3)' }}/>
                    : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#aaa', marginTop: 24 }}>
          <a href="/chat" style={{ color: '#aaa' }}>← Back to chat</a>
        </p>

        {/* Credit cost breakdown */}
        <div style={{ ...styles.topupSection, marginTop: 16 }}>
          <h2 style={styles.topupTitle}>How credits are spent</h2>
          <p style={styles.topupSub}>Credits are deducted per response based on length and complexity.</p>
          <table style={styles.costTable}>
            <thead>
              <tr>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Length</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {CREDIT_COSTS.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fafaf8' : '#fff' }}>
                  <td style={styles.td}>{row.label}</td>
                  <td style={{ ...styles.td, color: '#888' }}>{row.range}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 500, color: '#1D9E75' }}>{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page:         { minHeight: '100dvh', background: '#f7f7f5', padding: '32px 16px' },
  wrap:         { maxWidth: 900, margin: '0 auto' },
  header:       { textAlign: 'center', marginBottom: 32 },
  mark:         { width: 44, height: 44, borderRadius: '50%', background: '#1D9E75', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  h1:           { fontSize: 26, fontWeight: 600, marginBottom: 6 },
  sub:          { color: '#888', fontSize: 14 },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 32 },
  card:         { background: '#fff', borderRadius: 14, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 6 },
  badge:        { fontSize: 11, background: '#E1F5EE', color: '#085041', borderRadius: 20, padding: '3px 10px', alignSelf: 'flex-start', fontWeight: 500 },
  planName:     { fontSize: 15, fontWeight: 600 },
  price:        { fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: '#1a1a18' },
  perMo:        { fontSize: 13, fontWeight: 400, color: '#888' },
  credits:      { fontSize: 13, color: '#1D9E75', fontWeight: 500 },
  features:     { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5, margin: '8px 0' },
  feat:         { fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 7 },
  dot:          { width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', flexShrink: 0 },
  topupSection: { background: '#fff', border: '1px solid #e8e6df', borderRadius: 14, padding: 24 },
  topupTitle:   { fontSize: 16, fontWeight: 600, marginBottom: 4 },
  topupSub:     { fontSize: 13, color: '#888', marginBottom: 16 },
  topupGrid:    { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  topupCard:    { border: '1px solid #e8e6df', borderRadius: 10, padding: '14px 12px', textAlign: 'center' },
  topupCredits: { fontSize: 16, fontWeight: 600 },
  topupPrice:   { fontSize: 13, color: '#1D9E75', fontWeight: 500, marginTop: 2 },
  costTable:    { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 4 },
  th:           { textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', padding: '6px 8px', borderBottom: '1px solid #eee' },
  td:           { padding: '9px 8px', borderBottom: '1px solid #f0efe8', fontSize: 13, color: '#333' }
}
