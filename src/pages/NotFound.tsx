import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../i18n/usePageTitle';

export default function NotFound() {
  const { t } = useTranslation();
  usePageTitle(t('notFound.title'));

  return (
    <div className="page">
      <div className="empty-state">
        <h3>{t('notFound.title')}</h3>
        <p>{t('notFound.description')}</p>
        <Link to="/" className="empty-state-action">{t('notFound.goHome')}</Link>
      </div>
    </div>
  );
}
