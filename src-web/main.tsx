import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';
// Tailwind utilities, compiled at build time (replaces the Play CDN <script>
// that used to live in index.html — see tailwind.config.js).
import './tailwind.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Không tìm thấy #root trong index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
