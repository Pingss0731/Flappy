import { kv } from '@vercel/kv';

const LB_KEY = 'flappy_ryuku:lb2';
const NAME_HASH = 'flappy_ryuku:names2';
const NAME_KEY_PREFIX = 'flappy_ryuku:name2:';

function getIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Basic rate limit: max 10 submits / minute / IP
    const ip = getIp(req);
    const rlKey = `flappy_ryuku:rl:${ip}`;
    const n = await kv.incr(rlKey);
    if (n === 1) await kv.expire(rlKey, 60);
    if (n > 10) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    const body = req.body || {};
    const id = String(body.id ?? '').trim();
    const name = String(body.name ?? 'Anonymous').trim().slice(0, 24) || 'Anonymous';
    const score = Number(body.score ?? 0);

    if (!id || id.length > 80) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    // Clamp to reduce obvious cheating
    if (!Number.isFinite(score) || score < 1 || score > 999) {
      res.status(400).json({ error: 'Invalid score' });
      return;
    }

    // Store best score per id. Update name mapping.
    // KV hash helpers differ across runtimes, so we store name in TWO places:
    // 1) Hash (for bulk reads)
    // 2) Per-id key (for reliable lookup)
    try { await kv.hset(NAME_HASH, id, name); } catch {}
    try { await kv.set(`${NAME_KEY_PREFIX}${id}`, name); } catch {}

    const prev = await kv.zscore(LB_KEY, id);
    const prevScore = prev === null || prev === undefined ? null : Number(prev);
    if (prevScore === null || score > prevScore) {
      await kv.zadd(LB_KEY, { score, member: id });
    }

    // Keep only top 2000 entries to cap storage
    const count = await kv.zcard(LB_KEY);
    if (count > 2000) {
      await kv.zremrangebyrank(LB_KEY, 0, count - 2001);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
}
