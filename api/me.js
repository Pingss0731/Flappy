import { kv } from '@vercel/kv';

const LB_KEY = 'flappy_ryuku:lb2';
const NAME_HASH = 'flappy_ryuku:names2';
const NAME_KEY_PREFIX = 'flappy_ryuku:name2:';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const id = String(req.query.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const [rank0, score, nameHash, nameKey] = await Promise.all([
      kv.zrevrank(LB_KEY, id),
      kv.zscore(LB_KEY, id),
      kv.hget(NAME_HASH, id).catch(() => null),
      kv.get(`${NAME_KEY_PREFIX}${id}`).catch(() => null),
    ]);

    const name = nameHash ?? nameKey;

    const rank = (rank0 === null || rank0 === undefined) ? null : Number(rank0) + 1;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      id,
      name: name ? String(name).slice(0, 24) : null,
      rank,
      score: score === null || score === undefined ? null : Number(score),
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
