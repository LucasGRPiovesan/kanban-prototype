import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from '@/app/router/AppRouter';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { createQueryClient } from '@/lib/query/queryClient';
import '@/styles/index.css';

const queryClient = createQueryClient();

/*
 * Screens are separate chunks with hashed names. A tab opened before a deploy still holds
 * the previous index.html, whose chunks no longer exist on the server — navigating would
 * fail to load the next screen. Vite reports that as `vite:preloadError`; reloading once
 * picks up the new build. The timestamp guard keeps a genuinely broken deploy from looping.
 */
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'kanban:chunk-reload-at';
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last > 10_000) {
      window.sessionStorage.setItem(KEY, String(Date.now()));
      event.preventDefault();
      window.location.reload();
    }
  } catch {
    // No session storage: let the error surface instead of risking a reload loop.
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            {/* AuthProvider sits inside the router so guards can redirect on session loss. */}
            <AuthProvider>
              <AppRouter />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
