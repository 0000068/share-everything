function createAbortError(message = "Request aborted", code = "request_aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = code;
  return error;
}

function createRequestLifecycle(req, res, {
  timeoutMs = 0,
  timeoutMessage = "Request timed out",
} = {}) {
  const controller = new AbortController();
  let abortKind = "";

  function abort(kind, error) {
    if (controller.signal.aborted) return;
    abortKind = kind;
    controller.abort(error);
  }

  const onRequestAborted = () => abort(
    "client",
    createAbortError("Client disconnected", "client_disconnected"),
  );
  const onResponseClose = () => {
    if (res?.writableEnded || res?.finished) return;
    onRequestAborted();
  };

  req?.once?.("aborted", onRequestAborted);
  res?.once?.("close", onResponseClose);

  const safeTimeoutMs = Math.max(0, Math.trunc(Number(timeoutMs) || 0));
  const deadlineAt = safeTimeoutMs > 0 ? Date.now() + safeTimeoutMs : 0;
  const timeoutId = safeTimeoutMs > 0
    ? setTimeout(() => abort(
      "timeout",
      createAbortError(timeoutMessage, "request_timeout"),
    ), safeTimeoutMs)
    : null;

  // This timer is the final completion guarantee for upstream work that does
  // not keep its own event-loop handle alive (for example, a stalled DNS
  // adapter). Keep it referenced until dispose() so the request cannot vanish
  // with its handler promise still pending.

  return {
    deadlineAt,
    signal: controller.signal,
    get abortKind() {
      return abortKind;
    },
    dispose() {
      if (timeoutId) clearTimeout(timeoutId);
      req?.removeListener?.("aborted", onRequestAborted);
      res?.removeListener?.("close", onResponseClose);
    },
  };
}

function waitForPromiseWithSignal(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) {
    Promise.resolve(promise).catch(() => {});
    return Promise.reject(signal.reason || createAbortError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener?.("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(
      reject,
      signal.reason || createAbortError(),
    );

    signal.addEventListener?.("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

module.exports = {
  createAbortError,
  createRequestLifecycle,
  waitForPromiseWithSignal,
};
