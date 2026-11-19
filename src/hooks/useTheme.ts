import { useEffect, useState } from 'react';
import type { ThemePreference } from '../types/chat';

function resolveEffectiveDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme(serverPreference?: ThemePreference) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const cached = localStorage.getItem('linkup_theme_pref') as ThemePreference | null;
    return cached === 'light' || cached === 'dark' || cached === 'system' ? cached : 'system';
  });

  useEffect(() => {
    if (serverPreference) {
      setPreference(serverPreference);
      localStorage.setItem('linkup_theme_pref', serverPreference);
    }
  }, [serverPreference]);

  useEffect(() => {
    const apply = () => {
      const isDark = resolveEffectiveDark(preference);
      document.documentElement.classList.toggle('dark', isDark);
    };

    apply();
    localStorage.setItem('linkup_theme_pref', preference);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (preference === 'system') apply();
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [preference]);

  return { preference, setPreference };
}
