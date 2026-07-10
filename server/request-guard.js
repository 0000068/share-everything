function normalizePositiveInteger(value, fallback) {
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function readPositiveIntegerEnv(key, fallback) {
  return normalizePositiveInteger(process.env[key], fallback);
}

function readFirstHeaderValue(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return typeof rawValue === "string" ? rawValue.split(",")[0].trim() : "";
}

function readClientKey(req) {
  const headers = req?.headers || {};
  const address = [
    headers["x-vercel-forwarded-for"],
    headers["x-forwarded-for"],
    headers["x-real-ip"],
  ].map(readFirstHeaderValue).find(Boolean);

  return address ? address.slice(0, 128) : "unknown";
}

function createFixedWindowRateLimiter({
  limit,
  windowMs = 60_000,
  maxEntries = 2_048,
} = {}) {
  const safeLimit = normalizePositiveInteger(limit, 1);
  const safeWindowMs = normalizePositiveInteger(windowMs, 60_000);
  const safeMaxEntries = normalizePositiveInteger(maxEntries, 2_048);
  const entries = new Map();

  function sweepExpired(now) {
    for (const [key, entry] of entries) {
      if (entry.resetAt > now) continue;
      entries.delete(key);
    }
  }

  function ensureCapacity(now) {
    if (entries.size < safeMaxEntries) return;
    sweepExpired(now);
    while (entries.size >= safeMaxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  function consume(key, now = Date.now()) {
    const normalizedKey = String(key || "unknown").slice(0, 128);
    const existing = entries.get(normalizedKey);
    if (!existing || existing.resetAt <= now) {
      ensureCapacity(now);
      entries.set(normalizedKey, {
        count: 1,
        resetAt: now + safeWindowMs,
      });
      return {
        allowed: true,
        remaining: safeLimit - 1,
        retryAfterSeconds: 0,
      };
    }

    entries.delete(normalizedKey);
    entries.set(normalizedKey, existing);
    if (existing.count >= safeLimit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: safeLimit - existing.count,
      retryAfterSeconds: 0,
    };
  }

  return Object.freeze({
    consume,
    get size() {
      return entries.size;
    },
  });
}

function createConcurrencyGate(maxConcurrent) {
  const safeMaxConcurrent = normalizePositiveInteger(maxConcurrent, 1);
  let activeCount = 0;

  function tryAcquire() {
    if (activeCount >= safeMaxConcurrent) return null;
    activeCount += 1;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      activeCount = Math.max(0, activeCount - 1);
    };
  }

  return Object.freeze({
    tryAcquire,
    get activeCount() {
      return activeCount;
    },
    maxConcurrent: safeMaxConcurrent,
  });
}

module.exports = {
  createConcurrencyGate,
  createFixedWindowRateLimiter,
  normalizePositiveInteger,
  readClientKey,
  readPositiveIntegerEnv,
};
