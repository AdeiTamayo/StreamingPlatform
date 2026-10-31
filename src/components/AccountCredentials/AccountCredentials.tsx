import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChangePasswordForm from './ChangePasswordForm';
import ChangeEmailForm from './ChangeEmailForm';
import styles from './AccountCredentials.module.css';

type Section = 'password' | 'email';

/** Two collapsible forms for the Settings Account card. Only one is open at a time. */
export default function AccountCredentials() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Section | null>(null);

  const toggle = (section: Section) => setOpen((cur) => (cur === section ? null : section));
  const close = () => setOpen(null);

  const sections: Array<{ id: Section; label: string; body: React.ReactNode }> = [
    {
      id: 'password',
      label: t('settings.credentials.changePassword'),
      body: <ChangePasswordForm onDone={close} />,
    },
    {
      id: 'email',
      label: t('settings.credentials.changeEmail'),
      body: <ChangeEmailForm onDone={close} />,
    },
  ];

  return (
    <div className={styles.wrap}>
      {sections.map(({ id, label, body }) => {
        const expanded = open === id;
        const panelId = `account-credentials-${id}`;
        return (
          <div key={id} className={styles.section}>
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => toggle(id)}
            >
              <span>{label}</span>
              <span className={styles.chevron} aria-hidden="true">{expanded ? '▴' : '▾'}</span>
            </button>
            {expanded && (
              <div id={panelId} className={styles.panel}>
                {body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
