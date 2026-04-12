import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Verify() {
  const { verifyOtp } = useAuth()
  const navigate      = useNavigate()
  const location      = useLocation()
  const email         = location.state?.email || ''

  const [digits, setDigits] = useState(Array(6).fill(''))
  const [error,  setError]  = useState('')
  const [busy,   setBusy]   = useState(false)
  const refs = useRef([])

  function onDigit(e, idx) {
    const val = e.target.value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = val
    setDigits(next)
    if (val && idx < 5) refs.current[idx + 1]?.focus()
    if (idx === 5 && val) submitCode(next.join(''))
  }

  function onKeyDown(e, idx) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus()
    }
  }

  async function submitCode(code) {
    if (code.length < 6) return setError('Please enter all 6 digits.')
    setError('')
    setBusy(true)
    const { error } = await verifyOtp({ email, token: code })
    setBusy(false)
    if (error) {
      setError('Incorrect code. Please check your email and try again.')
      setDigits(Array(6).fill(''))
      refs.current[0]?.focus()
    } else {
      navigate('/plans')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.mark}>✉</div>
          <h1 style={styles.h1}>Check your email</h1>
          <p style={styles.sub}>
            Enter the 6-digit code sent to<br />
            <strong>{email || 'your email'}</strong><br />
            <span style={{ fontSize: 12, color: '#aaa' }}>from noreply@airom.ai</span>
          </p>
        </div>

        <div style={styles.otpRow}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => refs.current[i] = el}
              value={d}
              onChange={e => onDigit(e, i)}
              onKeyDown={e => onKeyDown(e, i)}
              maxLength={1}
              inputMode="numeric"
              style={styles.otpInput}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && <p className="error-msg" style={{ textAlign: 'center' }}>{error}</p>}

        <button
          className="btn btn-primary btn-full"
          disabled={busy || digits.join('').length < 6}
          onClick={() => submitCode(digits.join(''))}
          style={{ marginTop: 16 }}
        >
          {busy ? <span className="spinner"/> : 'Verify & continue'}
        </button>

        <p style={styles.footer}>
          Didn't receive it?{' '}
          <a href="/signup" style={{ color: '#0F6E56' }}>Go back and try again</a>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page:     { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card:     { width: '100%', maxWidth: 400, background: '#fff', border: '1px solid #e8e6df', borderRadius: 14, padding: 32 },
  logo:     { textAlign: 'center', marginBottom: 24 },
  mark:     { width: 48, height: 48, borderRadius: '50%', background: '#E1F5EE', color: '#1D9E75', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  h1:       { fontSize: 20, fontWeight: 600, marginBottom: 8 },
  sub:      { fontSize: 13, color: '#888', lineHeight: 1.7 },
  otpRow:   { display: 'flex', gap: 8, justifyContent: 'center', margin: '20px 0 4px' },
  otpInput: { width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 600, borderRadius: 8, border: '1px solid #d4d2c8', fontFamily: 'monospace' },
  footer:   { textAlign: 'center', fontSize: 13, color: '#888', marginTop: 20 }
}
