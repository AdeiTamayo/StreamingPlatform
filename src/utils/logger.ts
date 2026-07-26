const DEBUG_KEY = 'player_debug';
const ERROR_KEY = 'app_errors';
const MAX_ENTRIES = 50;

export function logDebug(msg: string) {
  try {
    const prev = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
    prev.push({ ts: Date.now(), msg });
    if (prev.length > MAX_ENTRIES) prev.splice(0, prev.length - MAX_ENTRIES);
    localStorage.setItem(DEBUG_KEY, JSON.stringify(prev));
  } catch {}
}

export function logError(context: string, error: unknown) {
  try {
    const prev = JSON.parse(localStorage.getItem(ERROR_KEY) || '[]');
    const entry = {
      ts: Date.now(),
      context,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    prev.push(entry);
    if (prev.length > MAX_ENTRIES) prev.splice(0, prev.length - MAX_ENTRIES);
    localStorage.setItem(ERROR_KEY, JSON.stringify(prev));
  } catch {}
  console.error(`[${context}]`, error);
}

export function getErrorLog() {
  try {
    return JSON.parse(localStorage.getItem(ERROR_KEY) || '[]');
  } catch {
    return [];
  }
}
