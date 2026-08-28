import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SessionProvider } from './auth/SessionProvider';

createRoot(document.getElementById('root')!).render(<React.StrictMode><SessionProvider><App /></SessionProvider></React.StrictMode>);
