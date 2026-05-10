import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

declare global {
  interface Window {
    __hayashiLog?: (msg: string) => void;
  }
}

window.addEventListener('error', (e) => {
  console.error('[Hayashi] Global error:', e.error);
  if (window.__hayashiLog) window.__hayashiLog('ERROR: ' + (e.error?.message ?? String(e.error)));
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Hayashi] Unhandled rejection:', e.reason);
  if (window.__hayashiLog) window.__hayashiLog('REJECT: ' + (e.reason?.message ?? String(e.reason)));
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[Hayashi] #root element not found');
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
