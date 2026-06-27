/**
 * Mounts the collaborative editor application in the browser.
 * Enables React Strict Mode and loads global theme/base styles before the
 * App component takes ownership of session and workspace state.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
