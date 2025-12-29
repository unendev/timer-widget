import React from 'react';
import ReactDOM from 'react-dom/client';
import { SessionProvider } from 'next-auth/react';
import App from './App';
import './index.css';
import { API_BASE_URL } from './lib/api';

const basePath = API_BASE_URL ? `${API_BASE_URL}/api/auth` : '/api/auth';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider basePath={basePath}>
      <App />
    </SessionProvider>
  </React.StrictMode>
);
