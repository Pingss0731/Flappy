import { kv } from '@vercel/kv';

const LB_KEY = 'flappy_ryuku:lb2';
const NAME_KEY = 'flappy_ryuku:names2';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));

    // Top scores (desc)
    const raw = await kv.zrange(LB_KEY, 0, limit - 1, { rev: true, withScores: true });
    // raw format: [id, score, id, score, ...]
    const out = [];
    const ids = [];
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(String(raw[i]));
    }

    const names = ids.length ? await kv.hmget(NAME_KEY, ...ids) : [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const score = Number(raw[i * 2 + 1]);
      const name = names[i] ? String(names[i]).slice(0, 24) : 'Anonymous';
      out.push({ id, name, score });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ entries: out });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
