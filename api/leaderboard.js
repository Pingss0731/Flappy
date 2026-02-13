import { kv } from '@vercel/kv';

const LB_KEY = 'flappy_Ryku:lb2';
const NAME_HASH = 'flappy_Ryku:names2';
const NAME_KEY_PREFIX = 'flappy_Ryku:name2:';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));

    // Top scores (desc)
    let pairs = [];

    // Primary: zrange with scores
    try {
      const raw = await kv.zrange(LB_KEY, 0, limit - 1, { rev: true, withScores: true });

      // Different KV backends can return different shapes when withScores=true.
      // Support both:
      // 1) flat array: [member, score, member, score, ...]
      // 2) object array: [{ member, score }, ...]
      if (Array.isArray(raw) && raw.length) {
        if (typeof raw[0] === 'object' && raw[0] !== null) {
          for (const r of raw) {
            const id = String(r.member ?? r.value ?? r.id ?? '');
            const score = Number(r.score ?? r.s ?? 0);
            if (id) pairs.push([id, score]);
          }
        } else {
          for (let i = 0; i < raw.length; i += 2) {
            const id = String(raw[i] ?? '');
            const score = Number(raw[i + 1] ?? 0);
            if (id) pairs.push([id, score]);
          }
        }
      }
    } catch {
      // Fallback: zrange ids only, then zscore each id
      const idsOnly = await kv.zrange(LB_KEY, 0, limit - 1, { rev: true });
      const ids = Array.isArray(idsOnly) ? idsOnly.map((x) => String(x)) : [];
      const scores = await Promise.all(ids.map((id) => kv.zscore(LB_KEY, id).catch(() => null)));
      pairs = ids
        .map((id, i) => [id, Number(scores[i] ?? 0)])
        .filter(([id]) => !!id);
    }

    const out = [];
    const ids = pairs.map(([id]) => id);

    // Try hash bulk read first; if it fails or returns nulls, fall back to per-id keys.
    let names = [];
    try {
      names = ids.length ? await kv.hmget(NAME_HASH, ...ids) : [];
    } catch {
      names = [];
    }

    // Fallback mget
    let fallback = [];
    try {
      const keys = ids.map((id) => `${NAME_KEY_PREFIX}${id}`);
      fallback = keys.length ? await kv.mget(...keys) : [];
    } catch {
      fallback = [];
    }

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const score = Number(pairs[i][1]);
      const nameRaw = (names[i] ?? fallback[i]);
      const name = nameRaw ? String(nameRaw).slice(0, 24) : 'Anonymous';
      out.push({ id, name, score });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ entries: out });
  } catch (e) {
    console.error('leaderboard error', e);
    res.status(500).json({ error: 'Server error', message: String(e?.message ?? e) });
  }
}
