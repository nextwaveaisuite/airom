import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  const [form,  setForm]  = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy,  setBusy]  = useState(false)

  function onChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

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
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.mark}>✦</div>
          <h1 style={styles.h1}>Welcome back</h1>
          <p style={styles.sub}>Sign in to your Airom account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email address</label>
            <input name="email" type="email" value={form.email} onChange={onChange} placeholder="jane@example.com" autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={onChange} placeholder="Your password" />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn btn-primary btn-full" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? <span className="spinner"/> : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          Don't have an account? <Link to="/signup">Sign up free</Link>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page:  { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card:  { width: '100%', maxWidth: 400, background: '#fff', border: '1px solid #e8e6df', borderRadius: 14, padding: 32 },
  logo:  { textAlign: 'center', marginBottom: 24 },
  mark:  { width: 48, height: 48, borderRadius: '50%', background: '#1D9E75', color: '#fff', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  h1:    { fontSize: 20, fontWeight: 600, marginBottom: 4 },
  sub:   { fontSize: 13, color: '#888' },
  footer:{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 20 }
}
