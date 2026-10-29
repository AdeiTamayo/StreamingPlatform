import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const BRAND = 'StreamFlow';

/**
 * Keeps document.title in sync with the current page and language. Pages pass
 * an already-translated label; the brand suffix is never translated.
 */
export function usePageTitle(title?: string): void {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.title = title ? `${title} - ${BRAND}` : BRAND;
  }, [title, i18n.language]);
}
