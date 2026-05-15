import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('fb-dark-mode') === 'true';
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.dataset.dark = 'true';
    } else {
      delete document.documentElement.dataset.dark;
    }
    localStorage.setItem('fb-dark-mode', String(dark));
  }, [dark]);

  return [dark, setDark] as const;
}
