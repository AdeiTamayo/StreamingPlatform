import { handleOmdbQuery } from '../src/api/omdbCore.js';

// Server-only variable (NOT prefixed VITE_, so it is never bundled into the
// browser): OMDB_API_KEY.

type OmdbRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type OmdbResponse = {
  status: (code: number) => OmdbResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function handler(req: OmdbRequest, res: OmdbResponse) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const q = req.query ?? {};
  const result = await handleOmdbQuery(
    { i: first(q.i), t: first(q.t), y: first(q.y), type: first(q.type) },
    {
      apiKey: process.env.OMDB_API_KEY,
      logError: (context, err) => console.error(context, err),
    },
  );

  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  res.status(result.status).json(result.body);
}
