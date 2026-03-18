import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { makeGlobalCss, type ThemeId } from './ui/styles';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';

// Apply saved theme before first render
const savedTheme = (localStorage.getItem('oneteam-theme') as ThemeId | null) ?? 'mono';
document.documentElement.setAttribute('data-theme', savedTheme);

const styleEl = document.createElement('style');
styleEl.id = 'oneteam-global-css';
styleEl.textContent = makeGlobalCss();
document.head.appendChild(styleEl);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
