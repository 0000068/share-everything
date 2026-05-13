function isExpired(expiresAt, now = Date.now()) {
  return Number.isFinite(expiresAt) && now >= expiresAt;
}

function createTtlSlot({ onExpire } = {}) {
  let entry = null;

  function clear() {
    entry = null;
  }

  function expireIfNeeded(now = Date.now()) {
    if (!entry || !isExpired(entry.expiresAt, now)) {
      return false;
    }

    clear();
    if (typeof onExpire === "function") {
      onExpire();
    }
    return true;
  }

  return {
    get() {
      if (expireIfNeeded()) {
        return null;
      }
      return entry?.value || null;
    },
    set(value, expiresAt) {
      const safeExpiresAt = Number(expiresAt);
      if (!Number.isFinite(safeExpiresAt) || safeExpiresAt <= Date.now()) {
        clear();
        return null;
      }
      entry = { value, expiresAt: safeExpiresAt };
      return value;
    },
    clear,
    sweep: expireIfNeeded,
  };
}

function createLruTtlCache({ maxEntries = Number.POSITIVE_INFINITY } = {}) {
  const entries = new Map();
  const safeMaxEntries = Math.max(0, Math.trunc(Number(maxEntries) || 0));

  function pruneOverflow() {
    while (entries.size > safeMaxEntries) {
      const oldestKey = entries.keys().next().value;
      if (!oldestKey) break;
      entries.delete(oldestKey);
    }
  }

  return {
    get(key, { clone } = {}) {
      const entry = entries.get(key);
      if (!entry) return null;

      if (isExpired(entry.expiresAt)) {
        entries.delete(key);
        return null;
      }

      entries.delete(key);
      entries.set(key, entry);
      return typeof clone === "function" ? clone(entry.value) : entry.value;
    },
    set(key, value, expiresAt) {
      const safeExpiresAt = Number(expiresAt);
      if (!Number.isFinite(safeExpiresAt) || safeExpiresAt <= Date.now() || safeMaxEntries <= 0) {
        entries.delete(key);
        return;
      }

      if (entries.has(key)) {
        entries.delete(key);
      }

      entries.set(key, {
        value,
        expiresAt: safeExpiresAt,
      });
      pruneOverflow();
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    sweep(now = Date.now()) {
      for (const [key, entry] of entries) {
        if (isExpired(entry.expiresAt, now)) {
          entries.delete(key);
        }
      }
    },
  };
}

function createSingleFlight() {
  let pending = null;

  return {
    get() {
      return pending;
    },
    run(loader) {
      if (pending) {
        return pending;
      }

      pending = Promise.resolve()
        .then(loader)
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}

function createPendingRequestMap() {
  const pendingRequests = new Map();

  return {
    get(key) {
      return pendingRequests.get(key) || null;
    },
    run(key, loader) {
      const existing = pendingRequests.get(key);
      if (existing) {
        return existing;
      }

      const pending = Promise.resolve()
        .then(loader)
        .finally(() => {
          if (pendingRequests.get(key) === pending) {
            pendingRequests.delete(key);
          }
        });

      pendingRequests.set(key, pending);
      return pending;
    },
  };
}

module.exports = {
  createLruTtlCache,
  createPendingRequestMap,
  createSingleFlight,
  createTtlSlot,
  isExpired,
};
