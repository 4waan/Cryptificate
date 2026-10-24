import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

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
