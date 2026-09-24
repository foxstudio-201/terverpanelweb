import { createRoot } from 'react-dom/client'
// Install HTTP/WS shim FIRST (side-effect on import) before any component
// evaluates `window.electronAPI` at module top-level.
import './lib/webApi.js'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <App />
)
