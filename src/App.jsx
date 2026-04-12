import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import SignUp  from './pages/SignUp'
import Login   from './pages/Login'
import Verify  from './pages/Verify'
import Plans   from './pages/Plans'
import Chat    from './pages/Chat'
import Admin   from './pages/Admin'
import './styles/global.css'

function Protected({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', color:'#7B8FBF', background:'#03050F' }}>Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"       element={<Navigate to="/signup" replace />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/plans"  element={<Protected><Plans /></Protected>} />
          <Route path="/chat"   element={<Protected><Chat /></Protected>} />
          <Route path="/admin"  element={<Protected><Admin /></Protected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
