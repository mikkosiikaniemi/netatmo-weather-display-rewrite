import * as React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans/index.css'
import App from './App'
import './main.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
