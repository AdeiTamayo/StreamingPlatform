import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  exportData,
  importData,
  getStorageUsage,
  getStats,
  getVideoSource,
  setVideoSource,
  clearAllData,
} from "../api/storage";
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

  const [confirm, setConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabaseFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Settings - StreamFlow";

    getStorageUsage()
      .then((data) => { setUsage(data); setUsageError(false); })
      .catch(() => setUsageError(true));
    setStats(getStats());
    setQueueSize(getQueueSize());
  }, []);
  async function clearCache() {
    await clearTMDBCache();

    try {
      setUsage(await getStorageUsage());
      setUsageError(false);
    } catch {
      setUsageError(true);
    }

    toast?.("TMDB cache cleared");
  }

  async function clearAll() {
    clearAllData();

    await clearTMDBCache();

    setConfirm(false);

    try {
      setUsage(await getStorageUsage());
      setUsageError(false);
    } catch {
      setUsageError(true);
    }
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

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);

        const count = importData(data, "merge");

        try {
          setUsage(await getStorageUsage());
          setUsageError(false);
        } catch {
          setUsageError(true);
        }
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
                  {user?.email?.charAt(0).toUpperCase() ?? "?"}
                </div>

                <div className={styles.accountInfo}>
                  <h4>{user?.email ?? "Not signed in"}</h4>
                  <span>Cloud account</span>
                </div>
              </div>

              <Row label="Status" value={user ? "Connected" : "Offline"} />

              <div className={styles.actions}>
                <button className="watch-toggle danger" onClick={signOut}>
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
            </Card>

            <Card title="Backup">
              <div className={styles.backupGrid}>
                <div>
                  <h4 className={styles.backupTitle}>Local</h4>

                  <div className={styles.actions}>
                    <button className="watch-toggle" onClick={handleExport}>
                      Export
                    </button>

                    <button
                      className="watch-toggle"
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
                    style={{ display: "none" }}
                  />
                </div>

                <div>
                  <h4 className={styles.backupTitle}>Cloud</h4>

                  <div className={styles.actions}>
                    <button
                      className="watch-toggle"
                      onClick={handleSupabaseExport}
                    >
                      Export
                    </button>

                    <button
                      className="watch-toggle"
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
                    style={{ display: "none" }}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN */}

          <div className={styles.column}>
            <Card title="Storage">
              {usageError ? (
                <div className={styles.value}>Storage usage unavailable</div>
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
                          width: `${Math.min(100, usage.total / 250000)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <Row
                    label="Watch History"
                    value={formatBytes(usage.breakdown.watched)}
                  />

                  <Row
                    label="Progress"
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
                    <button className="watch-toggle" onClick={clearCache}>
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
              {!confirm ? (
                <>
                  <p className={styles.dangerText}>
                    Remove every local watch history, progress, cache and watch
                    later list.
                  </p>

                  <button
                    className="watch-toggle danger"
                    onClick={() => setConfirm(true)}
                  >
                    Clear Local Data
                  </button>
                </>
              ) : (
                <div className={styles.confirmBox}>
                  <h4>This action cannot be undone.</h4>

                  <p>All local information will be permanently removed.</p>

                  <div className={styles.actions}>
                    <button className="watch-toggle danger" onClick={clearAll}>
                      Delete Everything
                    </button>

                    <button
                      className="watch-toggle"
                      onClick={() => setConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
