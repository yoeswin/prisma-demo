import { useState, useEffect } from 'react'
import { useAuth } from '../AuthContext'
import './todos.css'

export default function Todos() {
  const [todos, setTodos] = useState([])
  const [newTask, setNewTask] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const { authFetch } = useAuth()

  const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3000` : 'http://localhost:3000');

  useEffect(() => {
    fetchTodos()
  }, [])

  const fetchTodos = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await authFetch(`${API_BASE}/api/todos`)
      if (response.ok) {
        const data = await response.json()
        setTodos(data)
      } else {
        setError('Unable to load todos')
      }
    } catch (err) {
      setError('Failed to fetch todos')
    } finally {
      setLoading(false)
    }
  }

  const handleAddTodo = async (e) => {
    e.preventDefault()
    if (!newTask.trim()) return

    try {
      const response = await authFetch(`${API_BASE}/api/todos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTask }),
      })

      if (response.ok) {
        const addedTodo = await response.json()
        setTodos([addedTodo, ...todos])
        setNewTask('')
      } else {
        setError('Could not add task')
      }
    } catch (err) {
      setError('Failed to add todo')
    }
  }

  const handleToggleComplete = async (id, currentStatus) => {
    try {
      const response = await authFetch(`${API_BASE}/api/todos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !currentStatus }),
      })

      if (response.ok) {
        const updatedTodo = await response.json()
        setTodos(todos.map(todo => (todo.id === id ? updatedTodo : todo)))
      } else {
        setError('Could not update task')
      }
    } catch (err) {
      setError('Failed to update todo')
    }
  }

  const handleDelete = async (id) => {
    try {
      const response = await authFetch(`${API_BASE}/api/todos/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setTodos(todos.filter(todo => todo.id !== id))
      } else {
        setError('Could not delete task')
      }
    } catch (err) {
      setError('Failed to delete todo')
    }
  }

  const completedCount = todos.filter(todo => todo.completed).length

  return (
    <main className="todos-page">
      <section className="todos-panel">
        <div className="todos-header">
          <div>
            <p className="todos-label">Task manager</p>
            <h1>My Todo List</h1>
          </div>
          <div className="todos-summary">
            <span>{todos.length} tasks</span>
            <span>{completedCount} completed</span>
          </div>
        </div>

        <form className="todos-form" onSubmit={handleAddTodo}>
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="New todo"
          />
          <button type="submit" className="todos-add-button" disabled={!newTask.trim()}>
            Add Task
          </button>
        </form>

        {error && <div className="todos-error">{error}</div>}

        {loading ? (
          <div className="todos-empty">Loading tasks...</div>
        ) : todos.length === 0 ? (
          <div className="todos-empty">No tasks yet. Add your first todo.</div>
        ) : (
          <ul className="todos-list">
            {todos.map(todo => (
              <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                <label className="todo-checkbox">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => handleToggleComplete(todo.id, todo.completed)}
                  />
                  <span>{todo.title}</span>
                </label>
                <button className="todo-remove" type="button" onClick={() => handleDelete(todo.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
