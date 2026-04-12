import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const [form,  setForm]  = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy,  setBusy]  = useState(false)

  function onChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.email.includes('@') || !form.password) return setError('Please fill in all fields.')
    setBusy(true)
    const { error } = await signIn({ email: form.email, password: form.password })
    setBusy(false)
    if (error) return setError('Invalid email or password.')
    navigate('/chat')
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <div style={s.mark}>✦</div>
          <h1 style={s.h1}>Welcome back</h1>
          <p style={s.sub}>Sign in to your Airom account</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field"><label>Email address</label><input name="email" type="email" value={form.email} onChange={onChange} placeholder="jane@example.com" autoFocus /></div>
          <div className="field"><label>Password</label><input name="password" type="password" value={form.password} onChange={onChange} placeholder="Your password" /></div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? <span className="spinner"/> : 'Sign in'}
          </button>
        </form>
        <p style={s.footer}>Don't have an account? <Link to="/signup">Sign up free</Link></p>
      </div>
    </div>
  )
}

const s = {
  page:  { minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', padding:16, position:'relative', zIndex:1 },
  card:  { width:'100%', maxWidth:400, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:14, padding:32 },
  logo:  { textAlign:'center', marginBottom:24 },
  mark:  { width:52, height:52, borderRadius:'50%', background:'var(--blue)', color:'#fff', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', boxShadow:'0 0 24px var(--blue-glow)', animation:'pulse-glow 3s ease-in-out infinite' },
  h1:    { fontSize:22, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em', marginBottom:6 },
  sub:   { fontSize:13, color:'var(--text-secondary)' },
  footer:{ textAlign:'center', fontSize:13, color:'var(--text-muted)', marginTop:20 }
}
