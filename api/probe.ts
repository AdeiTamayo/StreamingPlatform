import { handleProbeQuery } from '../src/api/providerProbeCore';

type ProbeRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ProbeResponse = {
  status: (code: number) => ProbeResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: ProbeRequest, res: ProbeResponse) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const result = await handleProbeQuery(req.query ?? {});
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.status(200).json(result);
}
