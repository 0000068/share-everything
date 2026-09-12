// This classic script must stay independent of the module graph it monitors.
(() => {
  let finished = false;
  let feedback = null;
  const timer = setTimeout(() => show("页面加载较慢，可稍候或重新加载。"), 15_000);

  function show(message) {
    if (finished) return;
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.id = "appBootFeedback";
      feedback.className = "navigation-feedback";
      feedback.setAttribute("role", "alert");
      const text = document.createElement("span");
      text.className = "navigation-feedback-message";
      feedback.appendChild(text);
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "navigation-feedback-action";
      retry.textContent = "重新加载";
      retry.addEventListener("click", () => window.location.reload());
      feedback.appendChild(retry);
      document.body.appendChild(feedback);
    }
    feedback.firstElementChild.textContent = message;
  }

  function fail() {
    if (finished) return;
    clearTimeout(timer);
    document.body.dataset.pageModuleError = document.body.dataset.page || "unknown";
    show("页面资源加载失败，请重新加载。");
  }

  function onResourceError(event) {
    if (event.target?.hasAttribute?.("data-spa-runtime")) fail();
  }

  window.addEventListener("error", onResourceError, true);
  window.AppBoot = Object.freeze({
    fail,
    complete() {
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("error", onResourceError, true);
      feedback?.remove();
      feedback = null;
      delete document.body.dataset.pageModuleError;
    },
  });
})();
