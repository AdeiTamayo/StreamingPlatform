import { useState, useEffect, useRef, type ReactNode } from "react";
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
import { exportSupabaseData, importSupabaseData, isSupabaseBackupEmpty } from "../api/storageBackup";
import { getQueueSize } from "../utils/offlineQueue";
import { useToast } from "../components/useToast";
import { useAuth } from "../hooks/useAuth";
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

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
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
  const toast = useToast();

  const { user, signOut } = useAuth();

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [queueSize, setQueueSize] = useState(getQueueSize());
  const [videoSource, setVideoSourceState] = useState(getVideoSource());
  const [timeZone, setTimeZoneState] = useState(getTimezone());
  const systemTimeZone = getSystemTimezone();

  const [confirm, setConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    document.title = "Settings - StreamFlow";

    getStorageUsage()
      .then((data) => { setUsage(data); setUsageError(false); })
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
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

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

  async function clearCache() {
    await clearTMDBCache();

    await loadUsage();

    toast?.("TMDB cache cleared");
  }

  async function clearAll() {
    await clearAllData();

    await clearTMDBCache();

    closeConfirm();

    await loadUsage();
    setStats(getStats());
    setQueueSize(getQueueSize());

    toast?.("All data cleared");
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

    toast?.("Data exported");
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      toast?.("Backup file is too large");
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

        if (count > 0) toast?.("Data imported successfully");
        else toast?.("No data found in file");
      } catch {
        toast?.("Invalid backup file");
      }
    };

    reader.readAsText(file);

    e.target.value = "";
  }

  async function handleSupabaseExport() {
    const data = await exportSupabaseData();

    if (!data) {
      toast?.("Log in to export Supabase data");
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

    toast?.("Supabase data exported");
  }

  async function handleSupabaseImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      toast?.("Backup file is too large");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);

        if (isSupabaseBackupEmpty(data)) {
          toast?.("No data found in file");
          return;
        }

        const ok = await importSupabaseData(data);

        if (ok) toast?.("Supabase data imported successfully");
        else toast?.("Import failed");
      } catch {
        toast?.("Invalid backup file");
      }
    };

    reader.readAsText(file);

    e.target.value = "";
  }
  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Settings</h2>

        <div className={styles.grid}>
          {/* LEFT COLUMN */}

          <div className={styles.column}>
            <Card title="Account">
              <div className={styles.account}>
                <div className={styles.avatar}>
                  {user?.email?.[0]?.toUpperCase()}
                </div>

                <div className={styles.accountInfo}>
                  <h4>{user?.email}</h4>
                  <span>Cloud account</span>
                </div>
              </div>

              <Row label="Status" value="Connected" />

              <div className={styles.actions}>
                <button
                  className={styles.pill}
                  onClick={signOut}
                  title="Sign out"
                >
                  Sign Out
                </button>
              </div>
            </Card>

            <Card title="Preferences">
              <Row label="Default Video Source">
                <FilterDropdown
                  value={videoSource}
                  options={SOURCE_KEYS.map((key) => ({
                    value: key,
                    label: getSourceLabel(key),
                  }))}
                  placeholder="Select source"
                  onSelect={(value: string) => {
                    setVideoSourceState(value);
                    setVideoSource(value);
                  }}
                />
              </Row>
              <Row label="Calendar Timezone">
                <FilterDropdown
                  value={timeZone}
                  options={[
                    { value: "", label: `System (${systemTimeZone})` },
                    ...TIMEZONE_OPTIONS,
                  ]}
                  placeholder="Select timezone"
                  onSelect={(value: string) => {
                    setTimeZoneState(value);
                    setTimezone(value);
                  }}
                />
              </Row>
            </Card>

            <Card title="Backup">
              <div className={styles.backupGrid}>
                <div>
                  <h4 className={styles.backupTitle}>Local</h4>

                  <div className={styles.actions}>
                    <button className={styles.pill} onClick={handleExport}>
                      Export
                    </button>

                    <button
                      className={styles.pill}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Import
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
                  <h4 className={styles.backupTitle}>Cloud</h4>

                  <div className={styles.actions}>
                    <button
                      className={styles.pill}
                      onClick={handleSupabaseExport}
                    >
                      Export
                    </button>

                    <button
                      className={styles.pill}
                      onClick={() => supabaseFileInputRef.current?.click()}
                    >
                      Import
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

          {/* RIGHT COLUMN */}

          <div className={styles.column}>
            <Card title="Storage">
              {usageError ? (
                <div className={styles.storageError}>
                  <div className={styles.value}>Storage usage unavailable</div>
                  <button className={styles.pill} onClick={loadUsage}>
                    Retry
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
                      Local storage used
                    </div>

                    <div className={styles.storageBar}>
                      <div
                        className={styles.storageFill}
                        style={{
                          // localStorage quota is ~5MB - show usage against that.
                          width: `${Math.min(100, (usage.total / 5000000) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <Row
                    label="Watch History"
                    value={formatBytes(usage.breakdown.watched)}
                  />

                  <Row
                    label="Continue Watching"
                    value={formatBytes(usage.breakdown.progress)}
                  />

                  <Row
                    label="Watch Later"
                    value={formatBytes(
                      usage.breakdown.watchlater + usage.breakdown.epwl,
                    )}
                  />

                  <Row
                    label="TMDB Cache"
                    value={formatBytes(usage.breakdown.cache)}
                  >
                    <button className={styles.pill} onClick={clearCache}>
                      Clear
                    </button>
                  </Row>

                  <Row
                    label="Offline Queue"
                    value={queueSize > 0 ? `${queueSize} pending` : "Empty"}
                  />
                </>
                )
              )}
            </Card>

            <Card title="Statistics">
              {stats && (
                <>
                  <div className={styles.statsGrid}>
                    <Stat title="Movies" value={stats.moviesWatched} />

                    <Stat title="Episodes" value={stats.episodesWatched} />

                    <Stat title="Series" value={stats.seriesWatched} />

                    <Stat title="Watch Later" value={stats.watchLaterCount} />
                  </div>
                </>
              )}
            </Card>

            <Card title="Danger Zone">
              <p className={styles.dangerText}>
                Remove every local watch history, Continue Watching entry,
                cache and watch later list.
              </p>

              <button
                ref={clearTriggerRef}
                className={`${styles.pill} ${styles.pillDanger}`}
                onClick={openConfirm}
              >
                Clear Local Data
              </button>
            </Card>
          </div>
        </div>
      </section>

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
            <h4 id="confirm-clear-title">This action cannot be undone.</h4>

            <p>All local information will be permanently removed.</p>

            <div className={styles.dialogActions}>
              <button
                className={`${styles.pill} ${styles.pillDanger}`}
                onClick={clearAll}
              >
                Delete Everything
              </button>

              <button
                ref={cancelBtnRef}
                className={styles.pill}
                onClick={closeConfirm}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
