import { createClient } from '@supabase/supabase-js';
import { handleDeleteAccount, type AdminClient } from '../src/api/deleteAccountCore.js';

// Server-only variables (NOT prefixed VITE_, so they are never bundled into the
// browser): SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service-role key
// bypasses RLS; it must only ever be read in this file.

type HeaderValue = string | string[] | undefined;

type DeleteRequest = {
  method?: string;
  headers: Record<string, HeaderValue>;
};

type DeleteResponse = {
  status: (code: number) => DeleteResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
};

function first(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function deploymentOrigin(headers: DeleteRequest['headers']): string | null {
  const host = first(headers['x-forwarded-host']) ?? first(headers.host);
  if (!host) return null;
  const proto = first(headers['x-forwarded-proto'])?.split(',')[0].trim() || 'https';
  return `${proto}://${host}`;
}

export default async function handler(req: DeleteRequest, res: DeleteResponse) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  res.setHeader('Cache-Control', 'no-store');
  if (!url || !serviceKey) {
    console.error('delete-account: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    res.status(500).json({ error: 'delete_failed' });
    return;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await handleDeleteAccount(
    {
      method: req.method,
      authorization: first(req.headers.authorization),
      origin: first(req.headers.origin),
    },
    {
      admin: admin as unknown as AdminClient,
      deploymentOrigin: deploymentOrigin(req.headers),
      logError: (context, err) => console.error(context, err),
    },
  );

  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.body) {
    res.status(result.status).json(result.body);
  } else {
    res.status(result.status).end();
  }
}
