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
      return entry ? entry.value : null;
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
      const oldestKey = entries.keys().next();
      if (oldestKey.done) break;
      entries.delete(oldestKey.value);
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

function readRetryAfterMs(error, now = Date.now()) {
  const rawValue = Array.isArray(error?.retryAfter) ? error.retryAfter[0] : error?.retryAfter;
  const normalized = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!normalized) return 0;

  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1_000) : 0;
  }

  const retryAt = Date.parse(normalized);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : 0;
}

function createSingleFlight({
  errorCooldownMs = 0,
  maxErrorCooldownMs = 300_000,
} = {}) {
  let pending = null;
  let cooledError = null;
  let cooledErrorExpiresAt = 0;
  const safeErrorCooldownMs = Math.max(0, Math.trunc(Number(errorCooldownMs) || 0));
  const safeMaxErrorCooldownMs = Math.max(
    safeErrorCooldownMs,
    Math.trunc(Number(maxErrorCooldownMs) || 0),
  );

  function clearExpiredCooledError(now = Date.now()) {
    if (!cooledError || now < cooledErrorExpiresAt) {
      return;
    }

    cooledError = null;
    cooledErrorExpiresAt = 0;
  }

  function createSingleFlightAbortError(message = "Request aborted") {
    const error = new Error(message);
    error.name = "AbortError";
    error.code = "single_flight_request_aborted";
    return error;
  }

  function shouldCoolError(error) {
    return error?.name !== "AbortError"
      && error?.code !== "request_subscribers_disconnected";
  }

  function createPendingEntry(loader, { cancellable }) {
    const controller = new AbortController();
    const entry = {
      controller,
      hasNonCancellableConsumer: !cancellable,
      promise: null,
      subscribers: 0,
    };

    entry.promise = Promise.resolve()
      .then(() => loader({ signal: controller.signal }))
      .then((value) => {
        if (pending === entry && !entry.controller.signal.aborted) {
          cooledError = null;
          cooledErrorExpiresAt = 0;
        }
        return value;
      }, (error) => {
        const retryAfterMs = readRetryAfterMs(error);
        const nextErrorCooldownMs = Math.min(
          safeMaxErrorCooldownMs,
          Math.max(safeErrorCooldownMs, retryAfterMs),
        );
        if (
          pending === entry
          && !entry.controller.signal.aborted
          && shouldCoolError(error)
          && nextErrorCooldownMs > 0
        ) {
          cooledError = error;
          cooledErrorExpiresAt = Date.now() + nextErrorCooldownMs;
        }
        throw error;
      })
      .finally(() => {
        if (pending === entry) pending = null;
      });
    pending = entry;
    return entry;
  }

  function releaseSubscriber(entry) {
    entry.subscribers = Math.max(0, entry.subscribers - 1);
    if (
      entry.subscribers === 0
      && !entry.hasNonCancellableConsumer
      && pending === entry
      && !entry.controller.signal.aborted
    ) {
      const error = createSingleFlightAbortError("All single-flight subscribers disconnected");
      error.code = "request_subscribers_disconnected";
      entry.controller.abort(error);
    }
  }

  function consumePendingEntry(entry, signal) {
    entry.subscribers += 1;
    const release = () => releaseSubscriber(entry);

    if (!signal) return entry.promise.finally(release);
    if (signal.aborted) {
      release();
      entry.promise.catch(() => {});
      return Promise.reject(signal.reason || createSingleFlightAbortError());
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener?.("abort", onAbort);
        release();
        callback(value);
      };
      const onAbort = () => finish(
        reject,
        signal.reason || createSingleFlightAbortError(),
      );

      signal.addEventListener?.("abort", onAbort, { once: true });
      entry.promise.then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
    });
  }

  return {
    get() {
      return pending?.promise || null;
    },
    run(loader, { signal } = {}) {
      if (signal?.aborted) {
        return Promise.reject(signal.reason || createSingleFlightAbortError());
      }

      clearExpiredCooledError();
      if (cooledError) {
        return Promise.reject(cooledError);
      }

      if (
        pending?.controller.signal.aborted
        && !pending.hasNonCancellableConsumer
      ) {
        pending = null;
      }

      const entry = pending || createPendingEntry(loader, {
        cancellable: Boolean(signal),
      });
      if (!signal) entry.hasNonCancellableConsumer = true;
      return consumePendingEntry(entry, signal);
    },
  };
}

function createKeyedSingleFlight({ maxEntries = 24, ...options } = {}) {
  const flights = new Map();
  const capacity = Math.max(1, Math.trunc(Number(maxEntries) || 24));
  return {
    run(key, loader, { signal } = {}) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      let flight = flights.get(key);
      if (!flight) {
        // Retain active jobs: evicting one would permit duplicate upstream work.
        // Idle entries only hold bounded error-cooldown state, in LRU order.
        for (const [idleKey, candidate] of flights) {
          if (flights.size < capacity) break;
          if (!candidate.get()) flights.delete(idleKey);
        }
        if (flights.size >= capacity) {
          return Promise.reject(Object.assign(new Error("Too many concurrent content queries"), {
            status: 503, code: "single_flight_busy", retryAfter: "1",
          }));
        }
        flight = createSingleFlight(options);
      }
      flights.delete(key);
      flights.set(key, flight);
      return flight.run(loader, { signal });
    },
  };
}

function createPendingRequestMap() {
  const pendingRequests = new Map();

  function createPendingAbortError(message = "Request aborted") {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }

  function createPendingEntry(key, loader, { cancellable = false } = {}) {
    const controller = cancellable ? new AbortController() : null;
    const entry = {
      controller,
      hasNonCancellableConsumer: !cancellable,
      promise: null,
      subscribers: 0,
    };
    entry.promise = Promise.resolve()
      .then(() => loader({ signal: controller?.signal }))
      .finally(() => {
        if (pendingRequests.get(key) === entry) {
          pendingRequests.delete(key);
        }
      });
    pendingRequests.set(key, entry);
    return entry;
  }

  return {
    get(key) {
      return pendingRequests.get(key)?.promise || null;
    },
    run(key, loader) {
      const existing = pendingRequests.get(key);
      if (existing) {
        existing.hasNonCancellableConsumer = true;
        return existing.promise;
      }
      return createPendingEntry(key, loader).promise;
    },
    subscribe(key, loader, { signal } = {}) {
      let entry = pendingRequests.get(key);
      if (
        entry?.controller?.signal.aborted
        && !entry.hasNonCancellableConsumer
      ) {
        pendingRequests.delete(key);
        entry = null;
      }
      if (!entry) {
        entry = createPendingEntry(key, loader, { cancellable: true });
      }
      entry.subscribers += 1;

      const release = () => {
        entry.subscribers = Math.max(0, entry.subscribers - 1);
        if (
          entry.subscribers === 0
          && !entry.hasNonCancellableConsumer
          && pendingRequests.get(key) === entry
          && entry.controller
          && !entry.controller.signal.aborted
        ) {
          const error = new Error("All request subscribers disconnected");
          error.name = "AbortError";
          error.code = "request_subscribers_disconnected";
          entry.controller.abort(error);
        }
      };

      if (!signal) return entry.promise.finally(release);
      if (signal.aborted) {
        release();
        // The caller receives its own abort reason, but the just-created
        // shared loader may reject asynchronously after observing the shared
        // cancellation. Keep that rejection observed even with no waiters.
        entry.promise.catch(() => {});
        return Promise.reject(signal.reason || createPendingAbortError());
      }

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener?.("abort", onAbort);
          release();
          callback(value);
        };
        const onAbort = () => finish(reject, signal.reason || createPendingAbortError());
        signal.addEventListener?.("abort", onAbort, { once: true });
        entry.promise.then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error),
        );
      });
    },
  };
}

module.exports = {
  createKeyedSingleFlight,
  createLruTtlCache,
  createPendingRequestMap,
  createSingleFlight,
  createTtlSlot,
  isExpired,
  readRetryAfterMs,
};
