"use strict";

const { createRequestLifecycle } = require("../../server/request-lifecycle");

let latestResult = Object.freeze({ ready: false });

module.exports = function localServerLifecycleProbe(req, res) {
  if (req.query?.read === "1") {
    return res.status(200).json(latestResult);
  }

  const completionLifecycle = createRequestLifecycle(req, res);
  const disposableLifecycle = createRequestLifecycle(req, res);
  const closeListenersBeforeDispose = res.listenerCount("close");
  disposableLifecycle.dispose();
  const closeListenersAfterDispose = res.listenerCount("close");

  latestResult = Object.freeze({ ready: false });
  res.once("finish", () => {
    globalThis.setImmediate(() => {
      const completionAborted = completionLifecycle.signal.aborted;
      const completionAbortKind = completionLifecycle.abortKind;
      completionLifecycle.dispose();
      latestResult = Object.freeze({
        ready: true,
        completionAborted,
        completionAbortKind,
        disposableAborted: disposableLifecycle.signal.aborted,
        closeListenersBeforeDispose,
        closeListenersAfterDispose,
        closeListenersAfterCompletionDispose: res.listenerCount("close"),
        writableEnded: res.writableEnded,
        finished: res.finished,
      });
    });
  });

  return res.status(200).json({ started: true });
};
