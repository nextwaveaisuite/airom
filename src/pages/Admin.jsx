import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const PLAN_COLORS = { free: '#7B8FBF', basic: '#60A5FA', pro: '#A78BFA', max: '#F472B6' }
const PLAN_CREDITS = { free: 100, basic: 200, pro: 600, max: 1500 }

export default function Admin() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  const [stats,      setStats]      = useState(null)
  const [users,      setUsers]      = useState([])
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState('overview')
  const [editUser,   setEditUser]   = useState(null)
  const [editCredits,setEditCredits]= useState('')
  const [editPlan,   setEditPlan]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState('')

  // Guard — only admins
  useEffect(() => {
    if (profile && !profile.is_admin) navigate('/chat')
  }, [profile])

  useEffect(() => { if (profile?.is_admin) { loadStats(); loadUsers() } }, [profile])

  async function loadStats() {
    const { data } = await supabase.rpc('get_admin_stats')
    setStats(data)
  }

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, plan, credits, is_admin, created_at')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  async function saveUser() {
    setSaving(true)
    const credits = parseInt(editCredits, 10)
    if (!isNaN(credits)) await supabase.rpc('admin_set_credits', { target_user_id: editUser.id, new_credits: credits })
    if (editPlan) await supabase.rpc('admin_set_plan', { target_user_id: editUser.id, new_plan: editPlan })
    await loadUsers()
    setEditUser(null)
    setSaving(false)
    showToast('User updated successfully')
  }

  async function resetCredits(userId, plan) {
    const credits = PLAN_CREDITS[plan] || 100
    await supabase.rpc('admin_set_credits', { target_user_id: userId, new_credits: credits })
    await loadUsers()
    showToast('Credits reset to plan default')
  }

  async function toggleAdmin(userId, current) {
    await supabase.from('profiles').update({ is_admin: !current }).eq('id', userId)
    await loadUsers()
    showToast('Admin status updated')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const filtered = users.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.id || '').toLowerCase().includes(search.toLowerCase())
  )

  if (!profile?.is_admin) return null

  return (
    <div style={s.shell}>
      {/* Toast */}
      {toast && <div style={s.toast}>{toast}</div>}

      {/* Edit modal */}
      {editUser && (
        <div style={s.modalOverlay} onClick={() => setEditUser(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Edit user</h3>
            <p style={s.modalSub}>{editUser.full_name || editUser.id}</p>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Credits</label>
              <input style={s.input} type="number" value={editCredits} onChange={e => setEditCredits(e.target.value)} placeholder={editUser.credits}/>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>Plan</label>
              <select style={s.input} value={editPlan} onChange={e => setEditPlan(e.target.value)}>
                <option value="">Keep current ({editUser.plan})</option>
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="max">Max</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btnPrimary} onClick={saveUser} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
              <button style={s.btnSecondary} onClick={() => setEditUser(null)}>Cancel</button>
            </div>
          </div>
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
            { key: 'overview', icon: '◈', label: 'Overview' },
            { key: 'users',    icon: '◉', label: 'Users' },
            { key: 'plans',    icon: '◆', label: 'Plans' },
          ].map(tab => (
            <button key={tab.key} style={{ ...s.navItem, background: activeTab === tab.key ? 'var(--blue-dim)' : 'transparent', color: activeTab === tab.key ? 'var(--blue-bright)' : 'var(--text-secondary)', borderColor: activeTab === tab.key ? 'var(--border-bright)' : 'transparent' }} onClick={() => setActiveTab(tab.key)}>
              <span style={{ fontSize: 16 }}>{tab.icon}</span> {tab.label}
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
          <h1 style={s.pageTitle}>{activeTab === 'overview' ? 'Overview' : activeTab === 'users' ? 'User management' : 'Plan breakdown'}</h1>
          <div style={s.adminBadge}>Admin</div>
        </div>

        {/* ── OVERVIEW TAB ───────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div style={s.content}>
            <div style={s.statsGrid}>
              {[
                { label: 'Total users',      value: stats?.total_users      || 0, color: '#60A5FA' },
                { label: 'New today',        value: stats?.new_users_today  || 0, color: '#34D399' },
                { label: 'Messages today',   value: stats?.messages_today   || 0, color: '#A78BFA' },
                { label: 'Credits used today', value: stats?.credits_used_today || 0, color: '#F472B6' },
              ].map(stat => (
                <div key={stat.label} style={s.statCard}>
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
                  const total = stats?.total_users || 1
                  const pct   = Math.round((p.count / total) * 100)
                  return (
                    <div key={p.key} style={s.planCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ ...s.planBadge, background: PLAN_COLORS[p.key] + '22', color: PLAN_COLORS[p.key] }}>{p.label}</span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{p.count}</span>
                      </div>
                      <div style={s.progressBg}>
                        <div style={{ ...s.progressFill, width: pct + '%', background: PLAN_COLORS[p.key] }}/>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{pct}% of users</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>Quick actions</h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button style={s.btnPrimary} onClick={() => setActiveTab('users')}>Manage users →</button>
                <button style={s.btnSecondary} onClick={() => { loadStats(); loadUsers(); showToast('Data refreshed') }}>↺ Refresh data</button>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS TAB ──────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div style={s.content}>
            <div style={s.searchRow}>
              <input style={{ ...s.input, maxWidth: 320 }} placeholder="Search by name or ID…" value={search} onChange={e => setSearch(e.target.value)}/>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{filtered.length} users</span>
            </div>

            {loading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading users…</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Name', 'Plan', 'Credits', 'Joined', 'Actions'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => (
                      <tr key={u.id} style={s.tr}>
                        <td style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ ...s.userAvatar, background: PLAN_COLORS[u.plan] + '33', color: PLAN_COLORS[u.plan] }}>
                              {(u.full_name || 'U')[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{u.full_name || 'Unknown'}</div>
                              {u.is_admin && <div style={{ fontSize: 10, color: '#F472B6' }}>ADMIN</div>}
                            </div>
                          </div>
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.planBadge, background: PLAN_COLORS[u.plan] + '22', color: PLAN_COLORS[u.plan] }}>{u.plan}</span>
                        </td>
                        <td style={s.td}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: u.credits < 20 ? '#F87171' : 'var(--text-primary)' }}>{u.credits}</span>
                        </td>
                        <td style={s.td}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</span>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={s.actionBtn} onClick={() => { setEditUser(u); setEditCredits(u.credits); setEditPlan(u.plan) }}>Edit</button>
                            <button style={s.actionBtn} onClick={() => resetCredits(u.id, u.plan)} title="Reset credits to plan default">Reset cr.</button>
                            {u.id !== user.id && (
                              <button style={{ ...s.actionBtn, color: u.is_admin ? '#F87171' : '#34D399' }} onClick={() => toggleAdmin(u.id, u.is_admin)}>
                                {u.is_admin ? 'Revoke admin' : 'Make admin'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PLANS TAB ──────────────────────────────────────────── */}
        {activeTab === 'plans' && (
          <div style={s.content}>
            <div style={s.section}>
              <h2 style={s.sectionTitle}>Plan overview</h2>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>{['Plan', 'Price', 'Credits', 'Users', 'Est. monthly revenue'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {[
                      { plan: 'Free',  price: 0,  credits: 100,  users: stats?.free_users  || 0 },
                      { plan: 'Basic', price: 9,  credits: 200,  users: stats?.basic_users || 0 },
                      { plan: 'Pro',   price: 20, credits: 600,  users: stats?.pro_users   || 0 },
                      { plan: 'Max',   price: 45, credits: 1500, users: stats?.max_users   || 0 },
                    ].map(r => (
                      <tr key={r.plan} style={s.tr}>
                        <td style={s.td}><span style={{ ...s.planBadge, background: PLAN_COLORS[r.plan.toLowerCase()] + '22', color: PLAN_COLORS[r.plan.toLowerCase()] }}>{r.plan}</span></td>
                        <td style={s.td}>{r.price === 0 ? 'Free' : `$${r.price}/mo`}</td>
                        <td style={s.td}>{r.credits.toLocaleString()}</td>
                        <td style={s.td}>{r.users}</td>
                        <td style={s.td}><span style={{ color: '#34D399', fontWeight: 600 }}>${(r.price * r.users).toLocaleString()}</span></td>
                      </tr>
                    ))}
                    <tr style={{ ...s.tr, borderTop: '2px solid var(--border-bright)' }}>
                      <td style={{ ...s.td, fontWeight: 700, color: 'var(--text-primary)' }} colSpan={4}>Total estimated MRR</td>
                      <td style={{ ...s.td, fontWeight: 700, color: '#34D399', fontSize: 16 }}>
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
                {[{ credits: 50, price: 2.50 }, { credits: 150, price: 6.00 }, { credits: 400, price: 14.00 }].map(t => (
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
  pageTitle:    { fontSize:20, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em' },
  adminBadge:   { fontSize:11, background:'var(--blue-dim)', color:'var(--blue-bright)', border:'1px solid var(--border-bright)', borderRadius:20, padding:'4px 12px', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase' },
  content:      { flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:20 },
  statsGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14 },
  statCard:     { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 16px' },
  statValue:    { fontSize:32, fontWeight:700, lineHeight:1.1, marginBottom:4 },
  statLabel:    { fontSize:13, color:'var(--text-secondary)' },
  section:      { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 },
  sectionTitle: { fontSize:15, fontWeight:600, color:'var(--text-primary)', marginBottom:14 },
  planGrid:     { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 },
  planCard:     { background:'var(--bg-deep)', border:'1px solid var(--border)', borderRadius:10, padding:14 },
  planBadge:    { fontSize:11, borderRadius:20, padding:'3px 10px', fontWeight:600 },
  progressBg:   { height:4, background:'var(--bg-hover)', borderRadius:2, overflow:'hidden' },
  progressFill: { height:'100%', borderRadius:2, transition:'width 0.5s ease' },
  searchRow:    { display:'flex', alignItems:'center', gap:12, marginBottom:4 },
  tableWrap:    { overflowX:'auto', borderRadius:10, border:'1px solid var(--border)' },
  table:        { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:           { textAlign:'left', padding:'10px 14px', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-muted)', background:'var(--bg-deep)', borderBottom:'1px solid var(--border)' },
  tr:           { borderBottom:'1px solid var(--border)', transition:'background 0.1s' },
  td:           { padding:'12px 14px', color:'var(--text-secondary)', verticalAlign:'middle' },
  userAvatar:   { width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 },
  actionBtn:    { fontSize:12, padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'inherit' },
  btnPrimary:   { padding:'9px 18px', background:'var(--blue)', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:500, cursor:'pointer', boxShadow:'0 0 12px var(--blue-glow)', fontFamily:'inherit' },
  btnSecondary: { padding:'9px 18px', background:'transparent', color:'var(--text-secondary)', border:'1px solid var(--border)', borderRadius:8, fontSize:14, cursor:'pointer', fontFamily:'inherit' },
  label:        { display:'block', fontSize:13, fontWeight:500, color:'var(--text-secondary)', marginBottom:5 },
  input:        { width:'100%', padding:'9px 12px', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', fontSize:14, fontFamily:'inherit', outline:'none' },
  modalOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' },
  modal:        { background:'var(--bg-card)', border:'1px solid var(--border-bright)', borderRadius:14, padding:28, width:'100%', maxWidth:380, boxShadow:'0 0 48px var(--blue-glow)' },
  modalTitle:   { fontSize:18, fontWeight:700, color:'var(--text-primary)', marginBottom:4 },
  modalSub:     { fontSize:13, color:'var(--text-muted)', marginBottom:18 },
  toast:        { position:'fixed', bottom:24, right:24, background:'#1D4ED8', color:'#fff', padding:'12px 20px', borderRadius:10, fontSize:14, fontWeight:500, zIndex:100, boxShadow:'0 0 24px var(--blue-glow)' },
}
