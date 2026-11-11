import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import { App } from './App';
import { restoreWorkspace, startPersistence } from './state/actions';
import './styles.css';

// The workspace saved in this browser comes back before the first render.
restoreWorkspace();
startPersistence();

if (__BRAND__.favicon || __BRAND__.mark) {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = __BRAND__.favicon ? 'brand/favicon.svg' : 'brand/mark.svg';
  document.head.appendChild(link);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
