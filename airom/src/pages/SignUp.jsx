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

  function onChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.fullName.trim()) return setError('Please enter your name.')
    if (!form.email.includes('@')) return setError('Please enter a valid email.')
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')

    setBusy(true)
    const { error } = await signUp({
      email:    form.email,
      password: form.password,
      fullName: form.fullName
    })
    setBusy(false)

    if (error) return setError(error.message)

    // Supabase sends the OTP email automatically
    setSuccess(`We've sent a 6-digit code to ${form.email} from noreply@airom.ai`)
    setTimeout(() => navigate('/verify', { state: { email: form.email } }), 2000)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.mark}>✦</div>
          <h1 style={styles.h1}>Create your account</h1>
          <p style={styles.sub}>Get 100 free credits — no card required</p>
        </div>

        {success && <div className="success-msg">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Full name</label>
            <input name="fullName" value={form.fullName} onChange={onChange} placeholder="Jane Smith" autoFocus />
          </div>
          <div className="field">
            <label>Email address</label>
            <input name="email" type="email" value={form.email} onChange={onChange} placeholder="jane@example.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={onChange} placeholder="Min. 8 characters" />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn btn-primary btn-full" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? <span className="spinner"/> : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
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
