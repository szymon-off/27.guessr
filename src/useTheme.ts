import { useEffect, useState } from 'react';
import { readJson, writeJson } from './storage/store';

export type ThemeName = 'night' | 'light' | 'abyss';

const THEME_COLORS: Record<ThemeName, string> = {
  night: '#070b14',
  light: '#f4f7fb',
  abyss: '#03060d',
};

/**
 * Persists the chosen palette and mirrors it onto <html data-theme> plus the
 * browser chrome colour. First-time visitors follow their OS preference.
 */
export function useTheme(): [ThemeName, (theme: ThemeName) => void] {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const stored = readJson<ThemeName | null>('theme', null);
    if (stored) return stored;
    const prefersLight =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'night';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme]);
    writeJson('theme', theme);
  }, [theme]);

  return [theme, setTheme];
}
