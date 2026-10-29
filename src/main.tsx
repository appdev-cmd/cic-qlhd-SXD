import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AutoTableTooltip } from './components/ui/AutoTableTooltip';
import { Toaster } from './components/ui/Toast';
import { ConfirmHost } from './components/ui/ConfirmDialog';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <AutoTableTooltip />
    <Toaster />
    <ConfirmHost />
  </React.StrictMode>,
);
