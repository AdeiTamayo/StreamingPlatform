// Must stay the first import: it records the URL hash before supabase-js
// consumes and strips it, so the app can tell what kind of email link opened it.
import './lib/authLink';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './fonts.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');
createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
