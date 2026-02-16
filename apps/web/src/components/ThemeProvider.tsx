'use client';

/**
 * ThemeProvider Component
 *
 * Reads the theme setting from the settings store and applies
 * a `data-theme` attribute on the <html> element. When set to
 * "system", listens for OS-level preference changes via matchMedia.
 */

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/settings-store';

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    if (theme === 'light' || theme === 'dark') {
      applyTheme(theme);
      return;
    }

    // System preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'light');

    const handler = (e: MediaQueryListEvent) => {
      applyTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return <>{children}</>;
}
