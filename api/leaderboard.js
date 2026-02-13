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
      const first = raw?.[0];
      if (Array.isArray(raw) && raw.length) {
        if (typeof first === 'object' && first !== null) {
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
        .filter((p) => Array.isArray(p) && p[0]);
    }

    // Defensive: remove any malformed entries
    pairs = (pairs || []).filter((p) => Array.isArray(p) && p.length >= 2 && p[0]);

    const out = [];
    const ids = pairs.map((p) => String(p[0]));

    // Name lookup: avoid hmget/mget shape differences by doing per-id reads (still fast enough for top 100)
    const names = await Promise.all(
      ids.map(async (id) => {
        const keyName = await kv.get(`${NAME_KEY_PREFIX}${id}`).catch(() => null);
        if (keyName) return keyName;
        const hashName = await kv.hget(NAME_HASH, id).catch(() => null);
        return hashName;
      })
    );

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const score = Number(pairs[i][1]);
      const nameRaw = names[i];
      const name = nameRaw ? String(nameRaw).slice(0, 24) : 'Anonymous';
      out.push({ id, name, score });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ version: 'lb-2026-02-13a', entries: out });
  } catch (e) {
    console.error('leaderboard error', e);
    res.status(500).json({ error: 'Server error', message: String(e?.message ?? e), version: 'lb-2026-02-13a' });
  }
}
