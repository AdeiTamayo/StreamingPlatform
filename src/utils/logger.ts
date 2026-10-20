const DEBUG_KEY = 'player_debug';
const ERROR_KEY = 'app_errors';
const MAX_ENTRIES = 50;
const MAX_MESSAGE_LENGTH = 2000;

// Logs live in localStorage and are readable by anyone with the device. Keep
// diagnostic value while stripping credential-shaped values and addresses.
const REDACTIONS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]'],
  [/((?:api[_-]?key|password|token|secret|authorization)\s*[=:]\s*)[^\s&,'"]+/gi, '$1[redacted]'],
];

export function redact(value: unknown): string {
  let text = typeof value === 'string' ? value : String(value);
  for (const [pattern, replacement] of REDACTIONS) {
    text = text.replace(pattern, replacement);
  }
  return text.length > MAX_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_MESSAGE_LENGTH)}...`
    : text;
}

export function logDebug(msg: string) {
  try {
    const prev = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
    prev.push({ ts: Date.now(), msg: redact(msg) });
    if (prev.length > MAX_ENTRIES) prev.splice(0, prev.length - MAX_ENTRIES);
    localStorage.setItem(DEBUG_KEY, JSON.stringify(prev));
  } catch {}
}

export function logError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  try {
    const prev = JSON.parse(localStorage.getItem(ERROR_KEY) || '[]');
    const entry = {
      ts: Date.now(),
      context: redact(context),
      message: redact(message),
      stack: stack ? redact(stack) : undefined,
    };
    prev.push(entry);
    if (prev.length > MAX_ENTRIES) prev.splice(0, prev.length - MAX_ENTRIES);
    localStorage.setItem(ERROR_KEY, JSON.stringify(prev));
  } catch {}
  console.error(`[${redact(context)}]`, redact(message));
}
