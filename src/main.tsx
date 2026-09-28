import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AutoTableTooltip } from './components/ui/AutoTableTooltip';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <AutoTableTooltip />
  </React.StrictMode>
);
