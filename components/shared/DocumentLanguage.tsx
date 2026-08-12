'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function languageForPath(pathname: string): 'en' | 'es' | 'el' {
  const segment = pathname.split('/')[1];
  return segment === 'es' || segment === 'el' ? segment : 'en';
}

export default function DocumentLanguage() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.lang = languageForPath(pathname);
  }, [pathname]);

  return null;
}
