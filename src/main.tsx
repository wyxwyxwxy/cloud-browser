import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initDisplayAdapter } from './lib/display'
import './index.css'

initDisplayAdapter()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
