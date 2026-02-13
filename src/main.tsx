import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Buffer } from 'buffer'

// Polyfills for simple-peer
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer
  window.global = window.global || window
  window.process = window.process || { env: {} } as any
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
