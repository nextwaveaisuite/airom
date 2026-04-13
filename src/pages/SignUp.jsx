import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate   = useNavigate()
  const [form,    setForm]    = useState({ fullName: '', email: '', password: '' })
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [busy,    setBusy]    = useState(false)

  function onChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.fullName.trim()) return setError('Please enter your name.')
    if (!form.email.includes('@')) return setError('Please enter a valid email.')
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    const { error } = await signUp({ email: form.email, password: form.password, fullName: form.fullName })
    setBusy(false)
    if (error) return setError(error.message)
    setSuccess(`Verification code sent to ${form.email} from noreply@airom.ai`)
    setTimeout(() => navigate('/verify', { state: { email: form.email } }), 2000)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <div style={s.mark}>✦</div>
          <h1 style={s.h1}>Airom</h1>
          <p style={s.sub}>Create your account — 100 free credits, no card needed</p>
        </div>
        {success && <div className="success-msg">{success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field"><label>Full name</label><input name="fullName" value={form.fullName} onChange={onChange} placeholder="Jane Smith" autoFocus /></div>
          <div className="field"><label>Email address</label><input name="email" type="email" value={form.email} onChange={onChange} placeholder="jane@example.com" /></div>
          <div className="field"><label>Password</label><input name="password" type="password" value={form.password} onChange={onChange} placeholder="Min. 8 characters" /></div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? <span className="spinner"/> : 'Create account'}
          </button>
        </form>
        <p style={s.footer}>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  )
}

const s = {
  page:  { minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', padding:16, position:'relative', zIndex:1 },
  card:  { width:'100%', maxWidth:400, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:14, padding:32, backdropFilter:'blur(10px)' },
  logo:  { textAlign:'center', marginBottom:24 },
  mark:  { width:52, height:52, borderRadius:'50%', background:'var(--blue)', color:'#fff', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', boxShadow:'0 0 24px var(--blue-glow), 0 0 48px rgba(59,130,246,0.2)', animation:'pulse-glow 3s ease-in-out infinite' },
  h1:    { fontSize:26, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em', marginBottom:6 },
  sub:   { fontSize:13, color:'var(--text-secondary)' },
  footer:{ textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:20 }
}
