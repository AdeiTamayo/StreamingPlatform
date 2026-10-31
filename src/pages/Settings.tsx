import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_LANGUAGES,
  getLanguage,
  setAppLanguage,
  type AppLanguage,
} from "../i18n";
import { usePageTitle } from "../i18n/usePageTitle";
import {
  exportData,
  importData,
  getStorageUsage,
  getStats,
  getVideoSource,
  setVideoSource,
  getTimezone,
  setTimezone,
  clearAllData,
} from "../api/storage";
import { TIMEZONE_OPTIONS, getSystemTimezone } from "../utils/calendar";
import { clearTMDBCache } from "../api/tmdbCache";
import { getSourceLabel, SOURCE_KEYS } from "../api/vidsrc";
import {
  exportSupabaseData,
  importSupabaseData,
  isSupabaseBackupEmpty,
} from "../api/storageBackup";
import { getQueueSize, getDroppedCount, SYNC_DROPPED_EVENT } from "../utils/offlineQueue";
import { dataMigration } from "../utils/dataMigration";
import { useToast } from "../components/useToast";
import { useAuth } from "../hooks/useAuth";
import AccountCredentials from "../components/AccountCredentials/AccountCredentials";
import CheckIcon from "../components/CheckIcon";
import FilterDropdown from "../components/FilterDropdown";

import type { StorageUsage, Stats } from "../types";

import styles from "./Settings.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// A backup is a small JSON file; anything larger is a mistake or an attempt to
// freeze the tab while JSON.parse runs.
const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <Icon>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </Icon>
  );
}

function CloudIcon() {
  return (
    <Icon>
      <path d="M6.5 19a4.5 4.5 0 0 1-.36-8.99A6.5 6.5 0 0 1 18.7 11.1 4 4 0 0 1 18 19H6.5z" />
    </Icon>
  );
}

function DownloadIcon() {
  return (
    <Icon>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </Icon>
  );
}

function UploadIcon() {
  return (
    <Icon>
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </Icon>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowInfo}>
        <span className={styles.label}>{label}</span>
      </div>

      <div className={styles.rowActions}>
        {value && <span className={styles.value}>{value}</span>}
        {children}
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{title}</div>
    </div>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const toast = useToast();

  const { user, signOut } = useAuth();

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [queueSize, setQueueSize] = useState(getQueueSize());
  const [droppedCount, setDroppedCount] = useState(getDroppedCount());
  const [resyncing, setResyncing] = useState(false);
  const [videoSource, setVideoSourceState] = useState(getVideoSource());
  const [timeZone, setTimeZoneState] = useState(getTimezone());
  const [language, setLanguageState] = useState(getLanguage());
  const systemTimeZone = getSystemTimezone();

  usePageTitle(t("settings.title"));

  const [confirm, setConfirm] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedTimerRef = useRef<number | null>(null);
  const supabaseFileInputRef = useRef<HTMLInputElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  async function loadUsage() {
    try {
      setUsage(await getStorageUsage());
      setUsageError(false);
    } catch {
      setUsageError(true);
    }
  }

  useEffect(() => {
    const refresh = () => setDroppedCount(getDroppedCount());
    window.addEventListener(SYNC_DROPPED_EVENT, refresh);
    return () => window.removeEventListener(SYNC_DROPPED_EVENT, refresh);
  }, []);

  async function retrySync() {
    if (!user || resyncing) return;
    setResyncing(true);
    try {
      const recovered = await dataMigration.resync(user.id);
      setDroppedCount(getDroppedCount());
      setQueueSize(getQueueSize());
      setStats(getStats());
      if (recovered) {
        markSaved();
        toast?.(t("toast.syncRecovered"));
      } else {
        toast?.(t("toast.syncStillFailing"), { kind: "error" });
      }
    } finally {
      setResyncing(false);
    }
  }

  useEffect(() => {
    getStorageUsage()
      .then((data) => {
        setUsage(data);
        setUsageError(false);
      })
      .catch(() => setUsageError(true));
    setStats(getStats());
    setQueueSize(getQueueSize());
  }, []);

  useEffect(() => {
    if (!confirm) {
      if (restoreFocusRef.current) {
        restoreFocusRef.current = false;
        clearTriggerRef.current?.focus();
      }
      return;
    }

    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        restoreFocusRef.current = true;
        setConfirm(false);
        return;
      }
      if (e.key !== "Tab" || !confirmDialogRef.current) return;

      const focusables = Array.from(
        confirmDialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirm]);

  function openConfirm() {
    restoreFocusRef.current = false;
    setConfirm(true);
  }

  function closeConfirm() {
    restoreFocusRef.current = true;
    setConfirm(false);
  }

  function markSaved() {
    setShowSaved(true);
    if (savedTimerRef.current != null)
      window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => {
      setShowSaved(false);
      savedTimerRef.current = null;
    }, 2500);
  }

  useEffect(
    () => () => {
      if (savedTimerRef.current != null)
        window.clearTimeout(savedTimerRef.current);
    },
    [],
  );

  async function clearCache() {
    await clearTMDBCache();

    await loadUsage();

    markSaved();
    toast?.(t("toast.tmdbCacheCleared"));
  }

  async function clearAll() {
    await clearAllData();

    await clearTMDBCache();

    closeConfirm();

    await loadUsage();
    setStats(getStats());
    setQueueSize(getQueueSize());

    markSaved();
    toast?.(t("toast.allDataCleared"));
  }

  function handleExport() {
    const data = exportData();

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = `streamflow-backup-${new Date().toISOString().slice(0, 10)}.json`;

    a.click();

    URL.revokeObjectURL(url);

    toast?.(t("toast.dataExported"));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      toast?.(t("toast.backupTooLarge"), { kind: "error" });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);

        const count = importData(data, "merge");

        await loadUsage();
        setStats(getStats());
        setQueueSize(getQueueSize());

        if (count > 0) {
          markSaved();
          toast?.(t("toast.dataImported"));
        } else toast?.(t("toast.noDataInFile"));
      } catch {
        toast?.(t("toast.invalidBackup"), { kind: "error" });
      }
    };

    reader.readAsText(file);

    e.target.value = "";
  }

  async function handleSupabaseExport() {
    let data;
    try {
      data = await exportSupabaseData();
    } catch {
      toast?.(t("toast.exportFailed"), { kind: "error" });
      return;
    }

    if (!data) {
      toast?.(t("toast.loginToExport"));
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = `streamflow-supabase-backup-${new Date().toISOString().slice(0, 10)}.json`;

    a.click();

    URL.revokeObjectURL(url);

    toast?.(t("toast.supabaseExported"));
  }

  async function handleSupabaseImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      toast?.(t("toast.backupTooLarge"), { kind: "error" });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);

        if (isSupabaseBackupEmpty(data)) {
          toast?.(t("toast.noDataInFile"));
          return;
        }

        const ok = await importSupabaseData(data);

        if (ok) {
          markSaved();
          toast?.(t("toast.supabaseImported"));
        } else toast?.(t("toast.importFailed"), { kind: "error" });
      } catch {
        toast?.(t("toast.invalidBackup"), { kind: "error" });
      }
    };

    reader.readAsText(file);

    e.target.value = "";
  }
  return (
    <div className="page">
      <div className={`panel-heading ${styles.pageHeading}`}>
        <div>
          <p className="eyebrow">{t("settings.eyebrow")}</p>
          <h1>{t("settings.title")}</h1>
          <p className={styles.pageSubtitle}>{t("settings.subtitle")}</p>
        </div>

        {showSaved && (
          <span className={styles.savedStatus} role="status" aria-live="polite">
            <CheckIcon size={15} />
            {t("settings.allSaved")}
          </span>
        )}
      </div>

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card title={t("settings.account")}>
            <div className={styles.account}>
              <div className={styles.avatar}>
                {user?.email?.[0]?.toUpperCase()}
              </div>

              <div className={styles.accountInfo}>
                <h4>{user?.email}</h4>
                <span>{t("settings.cloudAccount")}</span>
              </div>
            </div>

            <Row
              label={t("settings.status")}
              value={
                <span className={styles.status}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  {t("settings.connected")}
                </span>
              }
            />

            <AccountCredentials />

            <div className={styles.actions}>
              <button
                className={styles.pill}
                onClick={signOut}
                title={t("settings.signOut")}
              >
                {t("settings.signOut")}
              </button>
            </div>
          </Card>

          <Card title={t("settings.preferences")}>
            <Row label={t("settings.defaultSource")}>
              <FilterDropdown
                value={videoSource}
                options={SOURCE_KEYS.map((key) => ({
                  value: key,
                  label: getSourceLabel(key),
                }))}
                placeholder={t("settings.selectSource")}
                onSelect={(value: string) => {
                  setVideoSourceState(value);
                  setVideoSource(value);
                  markSaved();
                }}
              />
            </Row>
            <Row label={t("settings.calendarTimezone")}>
              <FilterDropdown
                value={timeZone}
                options={[
                  {
                    value: "",
                    label: t("settings.system", { zone: systemTimeZone }),
                  },
                  ...TIMEZONE_OPTIONS,
                ]}
                placeholder={t("settings.selectTimezone")}
                onSelect={(value: string) => {
                  setTimeZoneState(value);
                  setTimezone(value);
                  markSaved();
                }}
              />
            </Row>
            <Row label={t("settings.language")}>
              <FilterDropdown
                value={language}
                options={APP_LANGUAGES.map((option) => ({
                  value: option.code,
                  label: option.label,
                  icon: option.flag,
                }))}
                placeholder={t("settings.language")}
                onSelect={(value: string) => {
                  const next = value as AppLanguage;
                  setLanguageState(next);
                  setAppLanguage(next);
                  markSaved();
                }}
              />
            </Row>
          </Card>

          <Card title={t("settings.backup")}>
            <div className={styles.backupGrid}>
              <div>
                <h4 className={styles.backupTitle}>
                  <DatabaseIcon />
                  {t("settings.local")}
                </h4>

                <div className={styles.backupActions}>
                  <button className={styles.fileBtn} onClick={handleExport}>
                    <DownloadIcon />
                    {t("settings.export")}
                  </button>

                  <button
                    className={styles.fileBtn}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadIcon />
                    {t("settings.import")}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className={styles.fileInput}
                />
              </div>

              <div>
                <h4 className={styles.backupTitle}>
                  <CloudIcon />
                  {t("settings.cloud")}
                </h4>

                <div className={styles.backupActions}>
                  <button
                    className={styles.fileBtn}
                    onClick={handleSupabaseExport}
                  >
                    <DownloadIcon />
                    {t("settings.export")}
                  </button>

                  <button
                    className={styles.fileBtn}
                    onClick={() => supabaseFileInputRef.current?.click()}
                  >
                    <UploadIcon />
                    {t("settings.import")}
                  </button>
                </div>

                <input
                  ref={supabaseFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleSupabaseImport}
                  className={styles.fileInput}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className={styles.column}>
          <Card
            title={t("settings.storage")}
            action={
              usageError ? (
                <span
                  className={`${styles.healthPill} ${styles.healthPillWarn}`}
                >
                  {t("settings.unavailable")}
                </span>
              ) : usage ? (
                <span className={styles.healthPill}>
                  {t("settings.healthy")}
                </span>
              ) : null
            }
          >
            {usageError ? (
              <div className={styles.storageError}>
                <div className={styles.value}>
                  {t("settings.storageUnavailable")}
                </div>
                <button className={styles.pill} onClick={loadUsage}>
                  {t("settings.retry")}
                </button>
              </div>
            ) : (
              usage && (
                <>
                  <div className={styles.storageHeader}>
                    <div className={styles.storageTotal}>
                      {formatBytes(usage.total)}
                    </div>

                    <div className={styles.storageSubtitle}>
                      {t("settings.localStorageUsed")}
                    </div>

                    <div className={styles.storageBar}>
                      <div
                        className={styles.storageFill}
                        style={{
                          width: `${Math.min(100, (usage.total / (40 * 1024 * 1024)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <Row
                    label={t("settings.watchHistory")}
                    value={formatBytes(usage.breakdown.watched)}
                  />

                  <Row
                    label={t("settings.continueWatching")}
                    value={formatBytes(usage.breakdown.progress)}
                  />

                  <Row
                    label={t("settings.watchLater")}
                    value={formatBytes(
                      usage.breakdown.watchlater + usage.breakdown.epwl,
                    )}
                  />

                  <Row
                    label={t("settings.tmdbCache")}
                    value={formatBytes(usage.breakdown.cache)}
                  >
                    <button className={styles.pill} onClick={clearCache}>
                      {t("settings.clear")}
                    </button>
                  </Row>

                  <Row
                    label={t("settings.offlineQueue")}
                    value={
                      queueSize > 0
                        ? t("settings.pending", { count: queueSize })
                        : t("settings.empty")
                    }
                  />

                  {droppedCount > 0 && (
                    <Row
                      label={t("settings.unsyncedChanges")}
                      value={t("settings.unsyncedCount", { count: droppedCount })}
                    >
                      <button
                        className={styles.pill}
                        onClick={retrySync}
                        disabled={resyncing}
                      >
                        {t("settings.retrySync")}
                      </button>
                    </Row>
                  )}
                </>
              )
            )}
          </Card>

          <Card title={t("settings.statistics")}>
            {stats && (
              <div className={styles.statsGrid}>
                <Stat
                  title={t("settings.movies")}
                  value={stats.moviesWatched}
                />

                <Stat
                  title={t("settings.episodes")}
                  value={stats.episodesWatched}
                />

                <Stat
                  title={t("settings.series")}
                  value={stats.seriesWatched}
                />

                <Stat
                  title={t("settings.watchLaterCount")}
                  value={stats.watchLaterCount}
                />
              </div>
            )}
          </Card>

          <Card title={t("settings.dangerZone")}>
            <p className={styles.dangerText}>{t("settings.dangerText")}</p>

            <button
              ref={clearTriggerRef}
              className={`${styles.pill} ${styles.pillDanger}`}
              onClick={openConfirm}
            >
              <TrashIcon />
              {t("settings.clearLocalData")}
            </button>
          </Card>
        </div>
      </div>

      {confirm && (
        <div
          className={styles.dialogOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConfirm();
          }}
        >
          <div
            ref={confirmDialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-clear-title"
            tabIndex={-1}
          >
            <h4 id="confirm-clear-title">{t("settings.confirmTitle")}</h4>

            <p>{t("settings.confirmBody")}</p>

            <div className={styles.dialogActions}>
              <button
                className={`${styles.pill} ${styles.pillDanger}`}
                onClick={clearAll}
              >
                {t("settings.deleteEverything")}
              </button>

              <button
                ref={cancelBtnRef}
                className={styles.pill}
                onClick={closeConfirm}
              >
                {t("settings.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
