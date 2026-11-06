const $ = (id) => document.getElementById(id);

export function reportClientIssue(level, message, context = "") {
  const safeMessage = String(message?.message || message || "Unknown error");
  showActivity(level.toUpperCase(), safeMessage, context);
  return fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, message: safeMessage, context }),
  }).then((response) => {
    if (!response.ok) throw new Error(`Log endpoint returned ${response.status}`);
    $("logConnection").textContent = "Connected · partly.log";
  }).catch((error) => {
    $("logConnection").textContent = "Server log unavailable";
    console.error("[Partly] Could not write partly.log", error);
  });
}
export function showActivity(level, message, context = "") {
  const list = $("activityLog");
  if (!list) return;
  if (list.querySelector(".log-empty")) list.replaceChildren();
  const normalizedLevel = String(level || "INFO").toUpperCase();
  const now = new Date();
  const item = document.createElement("li");
  item.className = `activity-entry activity-entry-${normalizedLevel.toLowerCase()}`;

  const timestamp = document.createElement("time");
  timestamp.className = "activity-time";
  timestamp.dateTime = now.toISOString();
  timestamp.textContent = now.toLocaleTimeString();

  const badge = document.createElement("span");
  badge.className = `activity-level activity-level-${normalizedLevel.toLowerCase()}`;
  badge.textContent = normalizedLevel;

  const details = document.createElement("span");
  details.className = "activity-details";
  const description = document.createElement("span");
  description.className = "activity-message";
  description.textContent = String(message || "");
  details.append(description);
  if (context) {
    const note = document.createElement("span");
    note.className = "activity-context";
    note.textContent = String(context);
    details.append(note);
  }
  item.append(timestamp, badge, details);

  const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
  list.append(item);
  while (list.children.length > 40) list.firstElementChild.remove();
  if (wasAtBottom) list.scrollTop = list.scrollHeight;
}
export function reportActivity(level, message, context = "") {
  reportClientIssue(level, message, context);
}

  function setupActivityLogWindow() {
    const panel = $("activityLogWindow");
    const reopen = $("reopenActivityLog");
    const stateKey = "partly_activity_log_window";
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(stateKey) || "{}"); } catch {}
    const normalSize = {
      width: Number.isFinite(saved.width) ? Math.max(320, saved.width) : 500,
      height: Number.isFinite(saved.height) ? Math.max(180, saved.height) : 320,
    };
    const maximize = $("maximizeActivityLog");
    const setMaximized = (maximized) => {
      panel.classList.toggle("maximized", maximized);
      maximize.textContent = maximized ? "❐" : "⛶";
      maximize.title = maximized ? "Restore size" : "Maximize";
      maximize.setAttribute("aria-label", maximized ? "Restore activity log size" : "Maximize activity log");
      panel.style.right = maximized ? "10px" : "16px";
      panel.style.bottom = maximized ? "10px" : "16px";
      panel.style.width = maximized ? "calc(100vw - 20px)" : `${normalSize.width}px`;
      panel.style.height = maximized ? "calc(100vh - 20px)" : `${normalSize.height}px`;
    };
    const persist = () => {
      if (panel.hidden) return;
      const rect = panel.getBoundingClientRect();
      if (!panel.classList.contains("maximized")) {
        normalSize.width = Math.round(rect.width);
        normalSize.height = Math.round(rect.height);
      }
      try {
        localStorage.setItem(stateKey, JSON.stringify({
          width: normalSize.width,
          height: normalSize.height,
          maximized: panel.classList.contains("maximized"),
          hidden: false,
        }));
      } catch {}
    };
    panel.style.left = "auto";
    panel.style.top = "auto";
    setMaximized(Boolean(saved.maximized));
    // Start with the small launcher button every time; the user opens the panel on demand.
    panel.hidden = true;
    reopen.hidden = false;
    maximize.addEventListener("click", () => {
      setMaximized(!panel.classList.contains("maximized"));
      persist();
    });
    $("hideActivityLog").addEventListener("click", () => {
      persist();
      panel.hidden = true;
      reopen.hidden = false;
      try {
        const current = JSON.parse(localStorage.getItem(stateKey) || "{}");
        localStorage.setItem(stateKey, JSON.stringify({ ...current, hidden: true }));
      } catch {}
    });
    reopen.addEventListener("click", () => {
      panel.hidden = false;
      reopen.hidden = true;
      persist();
    });
    const resizeEdges = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    for (const edges of resizeEdges) {
      const handle = document.createElement("div");
      handle.className = `activity-log-resize activity-log-resize-${edges}`;
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event) => {
        if (panel.classList.contains("maximized")) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const start = panel.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const west = edges.includes("w");
        const east = edges.includes("e");
        const north = edges.includes("n");
        const south = edges.includes("s");
        const move = (pointerEvent) => {
          const dx = pointerEvent.clientX - startX;
          const dy = pointerEvent.clientY - startY;
          const minWidth = Math.min(320, window.innerWidth - 24);
          const minHeight = Math.min(180, window.innerHeight - 24);
          const width = Math.max(minWidth, Math.min(window.innerWidth - 20, start.width + (west ? -dx : east ? dx : 0)));
          const height = Math.max(minHeight, Math.min(window.innerHeight - 20, start.height + (north ? -dy : south ? dy : 0)));
          panel.style.width = `${width}px`;
          panel.style.height = `${height}px`;
          if (east) panel.style.right = `${Math.max(10, window.innerWidth - start.left - width)}px`;
          if (south) panel.style.bottom = `${Math.max(10, window.innerHeight - start.top - height)}px`;
        };
        const finish = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", finish);
          handle.removeEventListener("pointercancel", finish);
          persist();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
      });
      panel.append(handle);
    }
    new ResizeObserver(persist).observe(panel);
    window.addEventListener("resize", () => {
      if (panel.classList.contains("maximized")) setMaximized(true);
      persist();
    });
  }

export function initializeActivityLog() {
  setupActivityLogWindow();
  const sendAppHeartbeat = () => {
    fetch("/api/heartbeat", { method: "POST", cache: "no-store" }).catch(() => {});
  };
  sendAppHeartbeat();
  window.setInterval(sendAppHeartbeat, 5000);
  window.addEventListener("pagehide", () => {
    navigator.sendBeacon("/api/close", "");
  });
  window.addEventListener("error", (event) => {
    reportClientIssue(
      "error",
      event.error?.stack || event.message,
      "window error",
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientIssue(
      "error",
      event.reason?.stack || event.reason,
      "unhandled rejection",
    );
  });
}
