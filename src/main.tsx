import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// nova verzija se sama uzme pri sljedećem otvaranju; podaci korisnika su u IndexedDB i ne diraju se
try {
  registerSW({ immediate: true });
} catch (e) {
  console.warn('Service worker unavailable', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
