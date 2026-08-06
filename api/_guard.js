/* Shared request guards for the two endpoints.

   An honest note about the rate limiter, because the alternative is a
   security control that exists only in the comment describing it: serverless
   invocations do not share memory, so this counter lives per warm instance.
   Against one source hammering one endpoint — the case it is here for, key
   guessing and log flooding — it works, because Vercel routes a burst from
   one client to a small number of warm instances. Against a distributed
   attacker it is close to useless. When there is revenue to protect, replace
   the Map with a shared store; the call sites do not change.

   The point of writing it now is that the endpoints currently have no ceiling
   at all: /api/license is an oracle anyone can query without limit. */

import { timingSafeEqual } from 'node:crypto';

const buckets = new Map();

/* Sliding window per (bucket, client). Returns the number of seconds to wait,
   or 0 when the request may proceed. */
export function rateLimit(req, { limit, windowMs, bucket }) {
  const ip = clientIp(req);
  const key = bucket + '|' + ip;
  const now = Date.now();

  let hits = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return Math.ceil((windowMs - (now - hits[0])) / 1000);
  }
  hits.push(now);
  buckets.set(key, hits);

  // An unbounded Map is itself the memory-exhaustion bug this is meant to
  // prevent, so sweep expired entries whenever it grows past a sane size.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const live = v.filter(t => now - t < windowMs);
      if (live.length) buckets.set(k, live); else buckets.delete(k);
    }
  }
  return 0;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/* Neither endpoint has any use for a large body — the biggest legitimate
   payload is a few hundred bytes. Refusing early keeps a megabyte of JSON
   from being parsed just to be thrown away. */
export function tooLarge(req, maxBytes) {
  const len = Number(req.headers['content-length']);
  if (isFinite(len) && len > maxBytes) return true;
  const b = req.body;
  if (typeof b === 'string' && b.length > maxBytes) return true;
  return false;
}

export function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return {}; } }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

/* String comparison short-circuits on the first differing byte, which leaks
   how much of a guessed key was correct. Over the public internet that signal
   is buried in jitter, but the fix costs nothing and does not depend on the
   network staying noisy. */
export function constantTimeEquals(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) {
    // still compare, so the branch itself does not become the signal
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

/* One place that decides what every endpoint answers, so a new endpoint
   cannot forget the method check or the no-store header. */
export function preflight(req, res, { method = 'POST', maxBytes = 2048, limit, windowMs, bucket }) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== method) {
    res.setHeader('Allow', method);
    res.status(405).json({ error: 'method not allowed' });
    return false;
  }
  if (tooLarge(req, maxBytes)) {
    res.status(413).json({ error: 'payload too large' });
    return false;
  }
  const wait = rateLimit(req, { limit, windowMs, bucket });
  if (wait) {
    res.setHeader('Retry-After', String(wait));
    res.status(429).json({ error: 'too many requests', retryAfter: wait });
    return false;
  }
  return true;
}
