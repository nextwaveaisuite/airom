import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const PLAN_COLORS  = { free: '#7B8FBF', basic: '#60A5FA', pro: '#A78BFA', max: '#F472B6' }
const PLAN_CREDITS = { free: 100, basic: 200, pro: 600, max: 1500 }
const PLANS        = ['free', 'basic', 'pro', 'max']

export default function Admin() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  const [stats,       setStats]       = useState(null)
  const [users,       setUsers]       = useState([])
  const [search,      setSearch]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('overview')
  const [toast,       setToast]       = useState('')
  const [toastType,   setToastType]   = useState('success')
  const [editingUser, setEditingUser] = useState(null) // inline edit state per user

  useEffect(() => { if (profile && !profile.is_admin) navigate('/chat') }, [profile])
  useEffect(() => { if (profile?.is_admin) { loadStats(); loadUsers() } }, [profile])

  async function loadStats() {
    const { data } = await supabase.rpc('get_admin_stats')
    setStats(data)
  }

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, plan, credits, is_admin, created_at')
      .order('created_at', { ascending: false })
    if (error) console.error('Load users error:', error)
    setUsers(data || [])
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast(msg); setToastType(type)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Update plan ────────────────────────────────────────────────────────
  async function updatePlan(userId, newPlan) {
    const credits = PLAN_CREDITS[newPlan]
    const { error } = await supabase
      .from('profiles')
      .update({ plan: newPlan, credits })
      .eq('id', userId)
    if (error) { showToast('Failed to update plan: ' + error.message, 'error'); return }
    setUsers(u => u.map(x => x.id === userId ? { ...x, plan: newPlan, credits } : x))
    showToast(`Plan updated to ${newPlan} with ${credits} credits`)
    setEditingUser(null)
    loadStats()
  }

  // ── Update credits ─────────────────────────────────────────────────────
  async function updateCredits(userId, newCredits) {
    const val = parseInt(newCredits, 10)
    if (isNaN(val) || val < 0) { showToast('Invalid credit amount', 'error'); return }
    const { error } = await supabase
      .from('profiles')
      .update({ credits: val })
      .eq('id', userId)
    if (error) { showToast('Failed to update credits: ' + error.message, 'error'); return }
    setUsers(u => u.map(x => x.id === userId ? { ...x, credits: val } : x))
    showToast(`Credits updated to ${val}`)
    setEditingUser(null)
  }

  // ── Toggle admin ───────────────────────────────────────────────────────
  async function toggleAdmin(userId, current) {
    const { error } = await supabase.from('profiles').update({ is_admin: !current }).eq('id', userId)
    if (error) { showToast('Failed: ' + error.message, 'error'); return }
    setUsers(u => u.map(x => x.id === userId ? { ...x, is_admin: !current } : x))
    showToast(!current ? 'Admin access granted' : 'Admin access removed')
  }

  // ── Delete user ────────────────────────────────────────────────────────
  async function deleteUser(userId, name) {
    if (!window.confirm(`Are you sure you want to permanently delete ${name || 'this user'}? This cannot be undone.`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', userId)
    if (error) { showToast('Failed to delete: ' + error.message, 'error'); return }
    setUsers(u => u.filter(x => x.id !== userId))
    showToast('User deleted successfully')
    loadStats()
  }

  // ── Reset credits to plan default ─────────────────────────────────────
  async function resetCredits(userId, plan) {
    const credits = PLAN_CREDITS[plan] || 100
    await updateCredits(userId, credits)
  }

  const filtered = users.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.plan || '').toLowerCase().includes(search.toLowerCase())
  )

  if (!profile?.is_admin) return null

  return (
    <div style={s.shell}>

      {/* Toast */}
      {toast && (
        <div style={{ ...s.toast, background: toastType === 'error' ? '#DC2626' : '#1D4ED8' }}>
          {toastType === 'error' ? '⚠ ' : '✓ '}{toast}
        </div>
      )}

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.mark}>✦</div>
          <div>
            <div style={s.brand}>Airom</div>
            <div style={s.adminTag}>Admin Console</div>
          </div>
        </div>
        <nav style={s.nav}>
          {[
            { key: 'overview', icon: '◈', label: 'Overview'        },
            { key: 'users',    icon: '◉', label: 'Users'           },
            { key: 'plans',    icon: '◆', label: 'Plans & revenue' },
          ].map(tab => (
            <button key={tab.key} style={{ ...s.navItem, background: activeTab === tab.key ? 'var(--blue-dim)' : 'transparent', color: activeTab === tab.key ? 'var(--blue-bright)' : 'var(--text-secondary)', borderColor: activeTab === tab.key ? 'var(--border-bright)' : 'transparent' }} onClick={() => setActiveTab(tab.key)}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>
        <div style={s.sidebarFooter}>
          <Link to="/chat" style={s.backBtn}>← Back to chat</Link>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div style={s.topbar}>
          <div>
            <h1 style={s.pageTitle}>{activeTab === 'overview' ? 'Overview' : activeTab === 'users' ? 'User management' : 'Plans & revenue'}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {activeTab === 'users' ? `${filtered.length} of ${users.length} users` : `Last refreshed just now`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.refreshBtn} onClick={() => { loadStats(); loadUsers(); showToast('Refreshed') }}>↺ Refresh</button>
            <div style={s.adminBadge}>Admin</div>
          </div>
        </div>

        {/* ── OVERVIEW ────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div style={s.content}>
            <div style={s.statsGrid}>
              {[
                { label: 'Total users',        value: stats?.total_users        || 0, color: '#60A5FA', icon: '◉' },
                { label: 'New today',          value: stats?.new_users_today    || 0, color: '#34D399', icon: '✦' },
                { label: 'Messages today',     value: stats?.messages_today     || 0, color: '#A78BFA', icon: '💬' },
                { label: 'Credits used today', value: stats?.credits_used_today || 0, color: '#F472B6', icon: '◈' },
              ].map(stat => (
                <div key={stat.label} style={s.statCard}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{stat.icon}</div>
                  <div style={{ ...s.statValue, color: stat.color }}>{stat.value.toLocaleString()}</div>
                  <div style={s.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>Plan distribution</h2>
              <div style={s.planGrid}>
                {[
                  { key: 'free',  label: 'Free',  count: stats?.free_users  || 0 },
                  { key: 'basic', label: 'Basic', count: stats?.basic_users || 0 },
                  { key: 'pro',   label: 'Pro',   count: stats?.pro_users   || 0 },
                  { key: 'max',   label: 'Max',   count: stats?.max_users   || 0 },
                ].map(p => {
                  const pct = Math.round((p.count / Math.max(stats?.total_users || 1, 1)) * 100)
                  return (
                    <div key={p.key} style={s.planCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ ...s.planBadge, background: PLAN_COLORS[p.key] + '22', color: PLAN_COLORS[p.key] }}>{p.label}</span>
                        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{p.count}</span>
                      </div>
                      <div style={s.progressBg}><div style={{ ...s.progressFill, width: pct + '%', background: PLAN_COLORS[p.key] }}/></div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{pct}% of users</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── USERS ───────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div style={s.content}>
            <div style={s.searchRow}>
              <input style={s.searchInput} placeholder="Search by name or plan…" value={search} onChange={e => setSearch(e.target.value)}/>
              <button style={s.refreshBtn} onClick={() => { loadUsers(); showToast('Users refreshed') }}>↺ Refresh</button>
            </div>

            {loading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: 20 }}>Loading users…</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>User</th>
                      <th style={s.th}>Plan</th>
                      <th style={s.th}>Credits</th>
                      <th style={s.th}>Joined</th>
                      <th style={s.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => {
                      const isEditing = editingUser === u.id
                      return (
                        <tr key={u.id} style={{ ...s.tr, background: isEditing ? 'rgba(59,130,246,0.05)' : 'transparent' }}>

                          {/* Name */}
                          <td style={s.td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 34, height: 34, borderRadius: '50%', background: PLAN_COLORS[u.plan] + '33', color: PLAN_COLORS[u.plan], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                                {(u.full_name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name || 'Unknown user'}</div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                  {u.is_admin && <span style={{ fontSize: 10, background: 'rgba(244,114,182,0.15)', color: '#F472B6', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>ADMIN</span>}
                                  {u.id === user.id && <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.15)', color: '#60A5FA', borderRadius: 4, padding: '1px 6px' }}>You</span>}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Plan */}
                          <td style={s.td}>
                            {isEditing ? (
                              <select
                                defaultValue={u.plan}
                                onChange={e => updatePlan(u.id, e.target.value)}
                                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-bright)', borderRadius: 6, color: 'var(--text-primary)', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
                              >
                                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} — {PLAN_CREDITS[p]} credits</option>)}
                              </select>
                            ) : (
                              <span style={{ ...s.planBadge, background: PLAN_COLORS[u.plan] + '22', color: PLAN_COLORS[u.plan] }}>{u.plan}</span>
                            )}
                          </td>

                          {/* Credits */}
                          <td style={s.td}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  type="number"
                                  defaultValue={u.credits}
                                  min="0"
                                  max="99999"
                                  id={`credits-${u.id}`}
                                  style={{ width: 80, background: 'var(--bg-input)', border: '1px solid var(--border-bright)', borderRadius: 6, color: 'var(--text-primary)', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' }}
                                />
                                <button style={{ ...s.actionBtn, color: '#34D399', borderColor: '#34D399' }} onClick={() => updateCredits(u.id, document.getElementById(`credits-${u.id}`).value)}>Save</button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 15, fontWeight: 700, color: u.credits < 20 ? '#F87171' : u.credits < 50 ? '#FB923C' : '#34D399' }}>{u.credits.toLocaleString()}</span>
                            )}
                          </td>

                          {/* Joined */}
                          <td style={s.td}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</span>
                          </td>

                          {/* Actions */}
                          <td style={s.td}>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <button
                                style={{ ...s.actionBtn, color: isEditing ? '#34D399' : 'var(--blue-bright)', borderColor: isEditing ? '#34D399' : 'var(--border-bright)' }}
                                onClick={() => setEditingUser(isEditing ? null : u.id)}
                              >
                                {isEditing ? '✓ Done' : '✏ Edit'}
                              </button>
                              <button
                                style={s.actionBtn}
                                onClick={() => resetCredits(u.id, u.plan)}
                                title="Reset credits to plan default"
                              >
                                ↺ Reset
                              </button>
                              {u.id !== user.id && (
                                <>
                                  <button
                                    style={{ ...s.actionBtn, color: u.is_admin ? '#FB923C' : '#A78BFA', borderColor: u.is_admin ? '#FB923C' : '#A78BFA' }}
                                    onClick={() => toggleAdmin(u.id, u.is_admin)}
                                  >
                                    {u.is_admin ? '⬇ Revoke admin' : '⬆ Make admin'}
                                  </button>
                                  <button
                                    style={{ ...s.actionBtn, color: '#F87171', borderColor: '#F87171' }}
                                    onClick={() => deleteUser(u.id, u.full_name)}
                                  >
                                    🗑 Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PLANS ───────────────────────────────────────────────────── */}
        {activeTab === 'plans' && (
          <div style={s.content}>
            <div style={s.section}>
              <h2 style={s.sectionTitle}>Plan breakdown & estimated revenue</h2>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>{['Plan','Price','Credits','Users','Est. MRR'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {[
                      { plan:'Free',  key:'free',  price:0,  credits:100,  users: stats?.free_users  || 0 },
                      { plan:'Basic', key:'basic', price:9,  credits:200,  users: stats?.basic_users || 0 },
                      { plan:'Pro',   key:'pro',   price:20, credits:600,  users: stats?.pro_users   || 0 },
                      { plan:'Max',   key:'max',   price:45, credits:1500, users: stats?.max_users   || 0 },
                    ].map(r => (
                      <tr key={r.plan} style={s.tr}>
                        <td style={s.td}><span style={{ ...s.planBadge, background: PLAN_COLORS[r.key]+'22', color: PLAN_COLORS[r.key] }}>{r.plan}</span></td>
                        <td style={s.td}>{r.price === 0 ? 'Free' : `$${r.price}/mo`}</td>
                        <td style={s.td}>{r.credits.toLocaleString()}</td>
                        <td style={s.td}><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.users}</span></td>
                        <td style={s.td}><span style={{ color: '#34D399', fontWeight: 700 }}>${(r.price * r.users).toLocaleString()}</span></td>
                      </tr>
                    ))}
                    <tr style={{ ...s.tr, borderTop: '2px solid var(--border-bright)' }}>
                      <td style={{ ...s.td, fontWeight: 700, color: 'var(--text-primary)' }} colSpan={4}>Total estimated MRR</td>
                      <td style={{ ...s.td, fontWeight: 700, color: '#34D399', fontSize: 18 }}>
                        ${((stats?.basic_users||0)*9 + (stats?.pro_users||0)*20 + (stats?.max_users||0)*45).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>Top-up packs</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[{credits:50,price:2.50},{credits:150,price:6.00},{credits:400,price:14.00}].map(t => (
                  <div key={t.credits} style={s.planCard}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{t.credits} credits</div>
                    <div style={{ fontSize: 14, color: '#60A5FA', marginTop: 4 }}>${t.price.toFixed(2)} one-time</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  shell:        { display:'flex', height:'100dvh', background:'transparent', position:'relative', zIndex:1, overflow:'hidden' },
  sidebar:      { width:220, minWidth:220, background:'rgba(7,11,26,0.97)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', backdropFilter:'blur(16px)', flexShrink:0 },
  sidebarLogo:  { display:'flex', alignItems:'center', gap:10, padding:'18px 16px 14px', borderBottom:'1px solid var(--border)' },
  mark:         { width:32, height:32, borderRadius:'50%', background:'var(--blue)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, boxShadow:'0 0 12px var(--blue-glow)', flexShrink:0 },
  brand:        { fontSize:16, fontWeight:700, color:'var(--text-primary)', lineHeight:1.2 },
  adminTag:     { fontSize:10, color:'var(--blue-bright)', letterSpacing:'0.08em', textTransform:'uppercase' },
  nav:          { flex:1, padding:'10px 8px', display:'flex', flexDirection:'column', gap:4 },
  navItem:      { display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:'1px solid', fontSize:14, cursor:'pointer', textAlign:'left', transition:'all 0.15s', fontFamily:'inherit' },
  sidebarFooter:{ padding:'12px 14px', borderTop:'1px solid var(--border)' },
  backBtn:      { display:'block', fontSize:13, color:'var(--text-muted)', textDecoration:'none' },
  main:         { flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' },
  topbar:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:'1px solid var(--border)', background:'rgba(7,11,26,0.85)', backdropFilter:'blur(12px)', flexShrink:0 },
  pageTitle:    { fontSize:22, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em' },
  adminBadge:   { fontSize:11, background:'var(--blue-dim)', color:'var(--blue-bright)', border:'1px solid var(--border-bright)', borderRadius:20, padding:'4px 12px', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase' },
  refreshBtn:   { fontSize:13, padding:'6px 14px', background:'var(--bg-hover)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-secondary)', cursor:'pointer', fontFamily:'inherit' },
  content:      { flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:20 },
  statsGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14 },
  statCard:     { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 16px' },
  statValue:    { fontSize:32, fontWeight:700, lineHeight:1.1, marginBottom:4 },
  statLabel:    { fontSize:13, color:'var(--text-secondary)' },
  section:      { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 },
  sectionTitle: { fontSize:15, fontWeight:600, color:'var(--text-primary)', marginBottom:14 },
  planGrid:     { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 },
  planCard:     { background:'var(--bg-deep)', border:'1px solid var(--border)', borderRadius:10, padding:14 },
  planBadge:    { fontSize:12, borderRadius:20, padding:'3px 10px', fontWeight:600 },
  progressBg:   { height:4, background:'var(--bg-hover)', borderRadius:2, overflow:'hidden' },
  progressFill: { height:'100%', borderRadius:2, transition:'width 0.5s ease' },
  searchRow:    { display:'flex', alignItems:'center', gap:10 },
  searchInput:  { flex:1, maxWidth:320, padding:'8px 12px', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', fontSize:14, fontFamily:'inherit', outline:'none' },
  tableWrap:    { overflowX:'auto', borderRadius:10, border:'1px solid var(--border)' },
  table:        { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:           { textAlign:'left', padding:'10px 14px', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-muted)', background:'var(--bg-deep)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' },
  tr:           { borderBottom:'1px solid var(--border)', transition:'background 0.1s' },
  td:           { padding:'12px 14px', color:'var(--text-secondary)', verticalAlign:'middle' },
  actionBtn:    { fontSize:11, padding:'4px 9px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' },
  toast:        { position:'fixed', bottom:24, right:24, color:'#fff', padding:'12px 20px', borderRadius:10, fontSize:14, fontWeight:500, zIndex:100, boxShadow:'0 4px 24px rgba(0,0,0,0.4)' },
}
