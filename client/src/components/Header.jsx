import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import './header.css'

export default function Header() {
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="site-header">
      <div className="site-brand">
        <Link to="/upload" className="brand-link">File Manager</Link>
      </div>

      <nav className="site-nav">
        <Link to="/upload" className="nav-link">Upload</Link>
        <Link to="/todos" className="nav-link">Todos</Link>
        {!isAuthenticated ? (
          <>
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/signup" className="nav-link">Sign up</Link>
          </>
        ) : (
          <button className="nav-logout" onClick={handleLogout}>Logout</button>
        )}
      </nav>
    </header>
  )
}
