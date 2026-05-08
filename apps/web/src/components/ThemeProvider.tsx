'use client';

/**
 * ThemeProvider Component
 *
 * Reads the theme setting from the settings store and applies a
 * `data-theme` attribute on the <html> element. The InkWell palette
 * supports three explicit themes:
 *   - paper   (default warm cream — no data-theme attribute)
 *   - dark    (data-theme="dark")
 *   - classic (data-theme="classic", Word-blue/white)
 * Legacy values "light" and "system" still resolve to paper / dark.
 */

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/settings-store';

type Resolved = 'paper' | 'dark' | 'classic';

function applyTheme(resolved: Resolved) {
  if (resolved === 'paper') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', resolved);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    if (theme === 'paper' || theme === 'light') {
      applyTheme('paper');
      return;
    }
    if (theme === 'dark') {
      applyTheme('dark');
      return;
    }
    if (theme === 'classic') {
      applyTheme('classic');
      return;
    }

    // System preference → paper or dark
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'paper');

    const handler = (e: MediaQueryListEvent) => {
      applyTheme(e.matches ? 'dark' : 'paper');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return <>{children}</>;
}
