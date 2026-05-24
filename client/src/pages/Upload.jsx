import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import '../upload.css'

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3000` : 'http://localhost:3000');

export default function Upload() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { authFetch, logout } = useAuth()

  useEffect(() => {
    fetchFiles()
  }, [])

  const fetchFiles = async () => {
    try {
      const response = await authFetch(`${API_BASE}/files`)
      if (!response.ok) {
        throw new Error('Failed to fetch files')
      }
      const data = await response.json()
      setFiles(Array.isArray(data) ? data : data.files ?? [])
      setStatus('')
    } catch (error) {
      setStatus('Unable to load uploaded files.')
    }
  }

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files?.[0] ?? null)
    setStatus('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!selectedFile) {
      setStatus('Please choose a file first.')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    setLoading(true)
    setStatus('Uploading...')

    try {
      const response = await authFetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 401) {
          await logout()
          navigate('/login')
          return
        }
        const errorBody = await response.text()
        throw new Error(errorBody || 'Upload failed')
      }

      const data = await response.json().catch(() => ({}))
      setStatus(data.message ?? 'Upload successful!')
      setSelectedFile(null)
      event.target.reset()
      await fetchFiles()
    } catch (error) {
      setStatus('Upload failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="upload-page">
      <div className="upload-header">
        <h1>Upload a File</h1>
        <button className="logout-btn" onClick={async () => { await logout(); navigate('/login') }}>
          Logout
        </button>
      </div>

      <section className="upload-panel">
        <p>Select a file and submit it to your Node.js backend.</p>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label htmlFor="fileInput" className="file-label">
            {selectedFile ? selectedFile.name : 'Choose file'}
            <input
              id="fileInput"
              type="file"
              onChange={handleFileChange}
            />
          </label>

          <button type="submit" className="upload-button" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload File'}
          </button>
        </form>

        {status && <div className="status-message">{status}</div>}
      </section>

      <section className="files-list">
        <h2>Uploaded Files</h2>
        {files.length === 0 ? (
          <p className="empty-state">No uploaded files yet.</p>
        ) : (
          <ul>
            {files.map((file, index) => {
              const name = file.filename ?? file.name ?? file
              return (
                <li key={`${name}-${index}`} className="file-item">
                  <div className="file-meta">
                    <span>{name}</span>
                    {file.size != null && <small>{formatSize(file.size)}</small>}
                  </div>
                  <div className="file-actions">
                    {file.url && (
                      <a href={file.url} target="_blank" rel="noreferrer">
                        View
                      </a>
                    )}
                    {file.downloadUrl && (
                      <a href={file.downloadUrl} download>
                        Download
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}

function formatSize(bytes) {
  if (typeof bytes !== 'number') return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
