const $ = (id) => document.getElementById(id);
const today = () => new Date().toLocaleDateString("en-CA");
const money = (n) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
let chart = null,
  toastTimer;
let selectedHistoryOfferId = null;
let selectedWatchlistOfferId = null;
function storeNameFromUrl(rawUrl) {
  if (!rawUrl.trim()) return "";
  let hostname;
  try {
    const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl)
      ? rawUrl
      : "https://" + rawUrl;
    hostname = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }

  const known = [
    [/(^|\.)amazon\./, "Amazon"],
    [/(^|\.)aliexpress\./, "AliExpress"],
    [/(^|\.)pccomponentes\./, "PcComponentes"],
    [/(^|\.)ebay\./, "eBay"],
    [/(^|\.)(mediamarkt|mediaworld)\./, "MediaMarkt"],
    [/(^|\.)unieuro\./, "Unieuro"],
    [/(^|\.)euronics\./, "Euronics"],
    [/(^|\.)eprice\./, "ePrice"],
    [/(^|\.)ldlc\./, "LDLC"],
    [/(^|\.)newegg\./, "Newegg"],
    [/(^|\.)bestbuy\./, "Best Buy"],
    [/(^|\.)coolblue\./, "Coolblue"],
    [/(^|\.)proshop\./, "Proshop"],
    [/(^|\.)caseking\./, "Caseking"],
    [/(^|\.)alternate\./, "Alternate"],
    [/(^|\.)mindfactory\./, "Mindfactory"],
    [/(^|\.)galaxus\./, "Galaxus"],
    [/(^|\.)globaldata\./, "Globaldata"],
    [/(^|\.)fnac\./, "Fnac"],
    [/(^|\.)cdiscount\./, "Cdiscount"],
    [/(^|\.)overclockers\./, "Overclockers"],
    [/(^|\.)scan\./, "Scan"],
    [/(^|\.)walmart\./, "Walmart"],
  ];
  const match = known.find(([pattern]) => pattern.test(hostname));
  if (match) return match[1];

  const labels = hostname.split(".");
  const compoundSuffixes = [
    "co.uk",
    "com.au",
    "com.br",
    "co.jp",
    "com.cn",
    "co.in",
    "com.mx",
    "co.nz",
    "co.za",
  ];
  const suffixLength = compoundSuffixes.some((suffix) =>
    hostname.endsWith("." + suffix),
  )
    ? 2
    : 1;
  const label = labels[Math.max(0, labels.length - suffixLength - 1)];
  return label
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
function componentNameKey(name) {
  return String(name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

function syncStoreName(urlId, storeId) {
  const store = $(storeId);
  const inferred = storeNameFromUrl($(urlId).value);
  if (!inferred) return;
  const manuallyEdited =
    store.dataset.userEdited === "true" &&
    store.value.trim() !== "" &&
    store.value.trim() !== (store.dataset.autoStore || "");
  if (manuallyEdited) return;
  store.value = inferred;
  store.dataset.autoStore = inferred;
  store.dataset.userEdited = "false";
}

function bindStoreUrl(urlId, storeId) {
  const url = $(urlId);
  const store = $(storeId);
  store.addEventListener("input", () => {
    store.dataset.userEdited =
      store.value.trim() !== (store.dataset.autoStore || "") ? "true" : "false";
  });
  url.addEventListener("input", () => syncStoreName(urlId, storeId));
  url.addEventListener("change", () => syncStoreName(urlId, storeId));
}

function resolveStoreName(store, url) {
  const current = String(store || "").trim();
  if (current && current.toLowerCase() !== "unknown store") return current;
  return storeNameFromUrl(String(url || "")) || "Unknown source";
}

function migrate(data) {
  const categories = {
    "Scheda Video (GPU)": "GPU",
    "Scheda Madre": "Motherboard",
    "SSD/Storage": "Storage",
    Alimentatore: "Power supply",
    Dissipatore: "Cooling",
    Accessori: "Accessories",
    Altro: "Other",
  };
  return (Array.isArray(data) ? data : []).map((p, i) => {
    if (Array.isArray(p.offers))
      return {
        ...p,
        category: categories[p.category] || p.category,
        offers: p.offers.map((o, j) => ({
          ...o,
          id: o.id || `${p.id}-${j}`,
          store: resolveStoreName(o.store, o.url),
          condition: o.condition || "New",
          history: Array.isArray(o.history) ? o.history : [],
        })),
      };
    return {
      ...p,
      category: categories[p.category] || p.category,
      id: p.id || Date.now() + i,
      offers: [
        {
          id: `${p.id || i}-legacy`,
          store: resolveStoreName(p.store, p.url),
          price: Number(p.currentPrice) || 0,
          condition: "New",
          url: "",
          history: p.history || [],
        },
      ],
    };
  });
}
let components = [];
let watchlist = [];
let trash = [];
let activeCollection = "build";
let activeSidebarView = "overview";
let editingCollection = "components";
let offerCollection = "components";
let dataReady = false;
let saveQueue = Promise.resolve();
function reportClientIssue(level, message, context = "") {
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
function showActivity(level, message, context = "") {
  const list = $("activityLog");
  if (!list) return;
  if (list.querySelector(".log-empty")) list.replaceChildren();
  const item = document.createElement("li");
  item.className = level === "ERROR" ? "log-error" : "";
  item.textContent = `${new Date().toLocaleTimeString()} · ${level} · ${message}${context ? ` · ${context}` : ""}`;
  list.prepend(item);
  while (list.children.length > 40) list.lastElementChild.remove();
}
function reportActivity(level, message, context = "") {
  reportClientIssue(level, message, context);
}
function restoreCollectionSnapshot(snapshot) {
  const previous = JSON.parse(snapshot);
  components = migrate(previous.components);
  watchlist = migrate(previous.watchlist);
  trash = migrate(previous.trash);
}
async function saveCollectionMutation(snapshot) {
  if (!(await save())) {
    restoreCollectionSnapshot(snapshot);
    render();
    return false;
  }
  render();
  return true;
}
function moveToTrash(part, source) {
  part.deletedFrom = source;
  part.deletedAt = new Date().toISOString();
  trash.unshift(part);
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
setupActivityLogWindow();
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

function save() {
  if (!dataReady) {
    reportActivity("ERROR", "Save blocked: app data is not ready", "Save component");
    notify("Start the local app with run_app.bat before saving");
    return Promise.resolve();
  }
  const snapshot = JSON.stringify({ components, watchlist, trash });
  reportActivity("INFO", "Saving component data…", "PUT /api/data");
  saveQueue = saveQueue
    .then(async () => {
      const response = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: snapshot,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Save failed (${response.status})`);
      return result;
    })
    .then(() => {
      $("storageStatus").textContent = "Saved to data.json";
      reportActivity("INFO", "Save completed successfully", "data.json");
      return true;
    })
    .catch((error) => {
      const detail = error?.message || String(error);
      $("storageStatus").textContent =
        "Save failed: " + detail + " · partly.log";
      notify("Save failed: " + detail);
      console.error("[Partly] Save failed:", error);
      reportClientIssue("error", error?.stack || error, "PUT /api/data");
      return false;
    });
  return saveQueue;
}
function notify(message, kind = "info") {
  const t = $("toast");
  t.textContent = message;
  t.classList.toggle("warning", kind === "warning");
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}
function openActionDialog({ eyebrow, title, subtitle = "", confirmLabel = "Confirm", danger = false, deleteLabel = "", closeOnBackdrop = true, closeOnEscape = true, fields = [] }) {
  const modal = $("actionModal");
  const form = $("actionForm");
  const fieldList = $("actionFields");
  const confirmButton = $("confirmAction");
  const deleteButton = $("deleteAction");
  $("actionEyebrow").textContent = eyebrow;
  $("actionModalTitle").textContent = title;
  $("actionSubtitle").textContent = subtitle;
  confirmButton.textContent = confirmLabel;
  confirmButton.classList.toggle("danger", danger);
  deleteButton.hidden = !deleteLabel;
  deleteButton.textContent = deleteLabel || "Delete";
  modal.classList.toggle("price-edit", Boolean(deleteLabel));
  fieldList.classList.toggle("price-history-fields", eyebrow === "PRICE HISTORY");
  fieldList.replaceChildren();
  for (const field of fields) {
    const label = document.createElement("label");
    label.className = field.wide === false ? "field" : "field wide";
    label.htmlFor = `action-${field.name}`;
    label.textContent = field.label;
    const input = field.options ? document.createElement("select") : document.createElement("input");
    input.id = `action-${field.name}`;
    input.name = field.name;
    if (field.options) {
      for (const optionData of field.options) {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        input.append(option);
      }
    } else {
      input.type = field.type || "text";
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.inputMode) input.inputMode = field.inputMode;
      if (field.placeholder) input.placeholder = field.placeholder;
    }
    input.value = field.value ?? "";
    input.required = field.required !== false;
    label.append(input);
    fieldList.append(label);
  }
  modal.classList.add("open");
  const firstInput = fieldList.querySelector("input");
  setTimeout(() => (firstInput || confirmButton).focus(), 20);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      modal.classList.remove("open");
      modal.classList.remove("price-edit");
      fieldList.classList.remove("price-history-fields");
      form.onsubmit = null;
      $("cancelAction").onclick = null;
      $("closeActionModal").onclick = null;
      deleteButton.onclick = null;
      modal.onclick = null;
      document.removeEventListener("keydown", onKeyDown);
      resolve(value);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && closeOnEscape) finish(null);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      finish(deleteLabel ? { action: "save", values } : fields.length ? values : true);
    };
    $("cancelAction").onclick = () => finish(null);
    $("closeActionModal").onclick = () => finish(null);
    deleteButton.onclick = () => finish({ action: "delete" });
    modal.onclick = (event) => { if (closeOnBackdrop && event.target === modal) finish(null); };
    document.addEventListener("keydown", onKeyDown);
  });
}
function setComponentEntryMode(mode) {
  const bulk = mode === "bulk";
  $("bulkReview").hidden = !bulk;
  $("singleFields").hidden = bulk;
  $("singleFields").querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = bulk;
  });
  $("bulkReview").querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = !bulk;
  });
}
function openModal(part, collection = "components") {
  editingCollection = collection;
  $("partForm").reset();
  setComponentEntryMode("single");
  $("ocrStatus").textContent = "";
  $("partId").value = part?.id || "";
  const inWatchlist = collection === "watchlist";
  $("modalTitle").textContent = part ? "Edit component" : inWatchlist ? "Add to Da valutare" : "Add a component";
  $("partForm").querySelector('[type="submit"]').textContent = part ? "Save component" : inWatchlist ? "Save to Da valutare" : "Save component";
  $("partName").value = part?.name || "";
  $("partCategory").value = part?.category || "CPU";
  $("partImageUrl").value = part?.image || "";
  $("partStore").value = part?.offers?.[0]?.store || "";
  $("partPrice").value = part?.offers?.[0]?.price ?? "";
  $("partCondition").value = part?.offers?.[0]?.condition || "New";
  $("partUrl").value = part?.offers?.[0]?.url || "";
  $("partStore").dataset.autoStore = $("partStore").value;
  $("partStore").dataset.userEdited = "false";
  syncStoreName("partUrl", "partStore");
  $("ocrStatus").textContent = "";
  $("modal").classList.add("open");
  setTimeout(() => $("partName").focus(), 30);
}
function closeModal() {
  $("modal").classList.remove("open");
}
function getOffer(part) {
  return part.offers.reduce(
    (best, o) => (!best || Number(o.price) < Number(best.price) ? o : best),
    null,
  );
}
function render() {
  const query = $("search").value.trim().toLowerCase(),
    category = $("categoryFilter").value;
  const list = $("componentList");
  list.replaceChildren();
  let filtered = components.filter(
    (p) =>
      (!query || `${p.name} ${p.category}`.toLowerCase().includes(query)) &&
      (!category || p.category === category),
  );
  $("emptyState").style.display = components.length ? "none" : "block";
  list.style.display = components.length ? "block" : "none";
  if (components.length && !filtered.length) {
    const e = document.createElement("div");
    e.className = "no-results";
    e.textContent = "No components match your search.";
    list.append(e);
  }
  const offers = [];
  components.forEach((p) => p.offers.forEach((o) => offers.push({ p, o })));
  if (
    !offers.some((item) => String(item.o.id) === String(selectedHistoryOfferId))
  ) {
    selectedHistoryOfferId = offers[0]?.o.id ?? null;
  }
  const watchlistOffers = watchlist.flatMap((part) =>
    part.offers.map((offer) => ({ part, offer })),
  );
  if (!watchlistOffers.some((item) => String(item.offer.id) === String(selectedWatchlistOfferId))) {
    selectedWatchlistOfferId = watchlistOffers[0]?.offer.id ?? null;
  }
  const total = components.reduce(
    (s, p) => s + Number(getOffer(p)?.price || 0),
    0,
  );
  const stores = new Set(
    offers.map((x) => x.o.store.trim().toLowerCase()).filter(Boolean),
  );
  const entries = offers.reduce((s, x) => s + x.o.history.length, 0);
  const selectedProduct =
    offers.find((item) => String(item.o.id) === String(selectedHistoryOfferId))
      ?.p || null;
  const historicalPrices = selectedProduct
    ? selectedProduct.offers.flatMap((offer) =>
        offer.history.map((entry) => ({
          ...entry,
          store: offer.store,
        })),
      )
    : [];
  const historicalLow = historicalPrices.reduce(
    (low, entry) =>
      !low || Number(entry.price) < Number(low.price) ? entry : low,
    null,
  );
  $("grandTotal").textContent = money(total);
  $("totalFoot").textContent =
    `Across ${components.length} component${components.length === 1 ? "" : "s"}`;
  $("offerCount").textContent = offers.length;
  $("historyCount").textContent = entries;
  $("statParts").textContent = components.length;
  $("partsCount").textContent = components.length;
  $("buildTabCount").textContent = components.length;
  $("watchlistCount").textContent = watchlist.length;
  $("trashCount").textContent = trash.length;
  $("navCount").textContent = components.length;
  $("sidebarWatchCount").textContent = watchlist.length;
  $("sidebarTrashCount").textContent = trash.length;
  $("statStores").textContent = stores.size;
  $("statBest").textContent = historicalLow ? money(historicalLow.price) : "—";
  $("bestName").textContent = historicalLow
    ? selectedProduct.name +
      " · " +
      historicalLow.store +
      " · " +
      new Date(historicalLow.date + "T12:00:00").toLocaleDateString("en-GB")
    : selectedProduct?.name || "Select a component";
  const cats = [...new Set(components.map((p) => p.category))].sort(),
    cur = $("categoryFilter").value;
  $("categoryFilter").innerHTML =
    '<option value="">All categories</option>' +
    cats.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
  $("categoryFilter").value = cats.includes(cur) ? cur : "";
  for (const p of filtered) {
    const row = document.createElement("article");
    row.className = "component";
    row.classList.toggle(
      "is-selected",
      p.offers.some(
        (offer) => String(offer.id) === String(selectedHistoryOfferId),
      ),
    );
    row.dataset.partId = p.id;
    row.dataset.defaultOfferId = getOffer(p)?.id ?? "";
    const top = document.createElement("div");
    top.className = "component-top";
    const visual = p.image
      ? `<div class="part-visual"><img class="part-image" src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}" onerror="this.parentElement.classList.add('image-missing');this.remove()"></div>`
      : '<div class="part-visual image-missing"></div>';
    top.innerHTML = `${visual}<div class="part-title"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.category)} · ${p.offers.length} offer${p.offers.length === 1 ? "" : "s"}</span></div><div class="component-actions"><button class="mini-button" data-act="add-offer" data-id="${escapeAttr(p.id)}">＋ Store</button><button class="mini-button" title="Move to Da valutare" data-act="watchlist" data-id="${escapeAttr(p.id)}">☆ Da valutare</button><button class="icon-button" title="Edit" data-act="edit" data-id="${escapeAttr(p.id)}">✎</button><button class="icon-button" title="Delete" data-act="delete" data-id="${escapeAttr(p.id)}">×</button></div>`;
    row.append(top);
    const offerList = document.createElement("div");
    offerList.className = "offer-list";
    p.offers.forEach((o) => {
      const bestOffer = getOffer(p) === o;
      const line = document.createElement("div");
      line.className = "offer-row";
      line.dataset.viewOffer = o.id;
      line.classList.toggle(
        "is-selected",
        String(o.id) === String(selectedHistoryOfferId),
      );
      const name = o.url
        ? `<a href="${escapeAttr(o.url)}" target="_blank" rel="noopener">${escapeHtml(o.store)} ↗</a>`
        : escapeHtml(o.store);
      line.innerHTML = `<div><span class="offer-name">${name}<span class="condition">${escapeHtml(o.condition || "New")}</span></span><span class="offer-meta">${o.history.length} price record${o.history.length === 1 ? "" : "s"}${bestOffer ? " · Best price" : ""}</span></div><div class="offer-price ${bestOffer ? "best" : ""}">${money(o.price)}</div><div class="offer-controls"><button data-act="log" data-id="${escapeAttr(p.id)}" data-offer="${escapeAttr(o.id)}">Log price</button><button data-act="remove-offer" data-id="${escapeAttr(p.id)}" data-offer="${escapeAttr(o.id)}" title="Remove offer">×</button></div>`;
      offerList.append(line);
    });
    row.append(offerList);
    list.append(row);
  }
  $("buildCollection").hidden = activeCollection !== "build";
  $("watchlistCollection").hidden = activeCollection !== "watchlist";
  $("trashCollection").hidden = activeCollection !== "trash";
  $("parts").querySelector(".tools").hidden = activeCollection !== "build";
  $("logPriceBtn").hidden = activeCollection === "trash";
  document.querySelectorAll(".collection-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.collection === activeCollection);
    tab.setAttribute("aria-selected", String(tab.dataset.collection === activeCollection));
  });
  document.querySelectorAll("[data-sidebar-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.sidebarView === activeSidebarView);
  });
  renderSavedCollection(watchlist, $("watchlistList"), "watchlist");
  renderSavedCollection(trash, $("trashList"), "trash");
  $("watchlistEmpty").hidden = watchlist.length > 0;
  $("trashEmpty").hidden = trash.length > 0;
  updateChart();
}
function renderSavedCollection(items, list, collection) {
  list.replaceChildren();
  for (const part of items) {
    const row = document.createElement("article");
    row.className = `component saved-component ${collection === "watchlist" ? "watchlist-component" : "trash-component"}`;
    row.classList.toggle(
      "is-selected",
      collection === "watchlist" && part.offers.some((offer) => String(offer.id) === String(selectedWatchlistOfferId)),
    );
    const offer = getOffer(part);
    const visual = part.image
      ? `<div class="part-visual"><img class="part-image" src="${escapeAttr(part.image)}" alt="${escapeAttr(part.name)}" onerror="this.parentElement.classList.add('image-missing');this.remove()"></div>`
      : '<div class="part-visual image-missing"></div>';
    const buttons = collection === "watchlist"
      ? `<button class="mini-button" data-list-act="add-offer" data-id="${escapeAttr(part.id)}">＋ Store</button><button class="mini-button" data-list-act="add" data-id="${escapeAttr(part.id)}">Add to build</button>${components.length ? `<button class="mini-button" data-list-act="replace" data-id="${escapeAttr(part.id)}">Replace…</button>` : ""}<button class="icon-button" title="Edit" data-list-act="edit" data-id="${escapeAttr(part.id)}">✎</button><button class="icon-button" title="Move to trash" data-list-act="trash" data-id="${escapeAttr(part.id)}">×</button>`
      : `<button class="mini-button" data-list-act="restore" data-id="${escapeAttr(part.id)}">Restore</button><button class="mini-button danger-text" data-list-act="purge" data-id="${escapeAttr(part.id)}">Delete permanently</button>`;
    const removed = collection === "trash" && part.deletedAt
      ? ` · Deleted ${escapeHtml(new Date(part.deletedAt).toLocaleDateString())}`
      : "";
    row.innerHTML = `<div class="component-top">${visual}<div class="part-title"><strong>${escapeHtml(part.name)}${collection === "watchlist" ? '<em class="watchlist-tag">Considering</em>' : ""}</strong><span>${escapeHtml(part.category)}${removed}</span></div><div class="component-actions">${buttons}</div></div>`;
    row.dataset.id = part.id;
    row.dataset.defaultOfferId = offer?.id ?? "";
    if (collection === "watchlist") {
      const offerList = document.createElement("div");
      offerList.className = "offer-list saved-offer-list";
      part.offers.forEach((item) => {
        const bestOffer = item === offer;
        const line = document.createElement("div");
        line.className = "offer-row";
        line.dataset.viewOffer = item.id;
        line.classList.toggle("is-selected", String(item.id) === String(selectedWatchlistOfferId));
        const name = item.url
          ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.store)} ↗</a>`
          : escapeHtml(item.store || "Unknown source");
        const removeButton = part.offers.length > 1
          ? `<button data-list-act="remove-offer" data-id="${escapeAttr(part.id)}" data-offer="${escapeAttr(item.id)}" title="Remove offer">×</button>`
          : "";
        line.innerHTML = `<div><span class="offer-name">${name}<span class="condition">${escapeHtml(item.condition || "New")}</span></span><span class="offer-meta">${item.history.length} price record${item.history.length === 1 ? "" : "s"}${bestOffer ? " · Best price" : ""}</span></div><div class="offer-price ${bestOffer ? "best" : ""}">${money(item.price)}</div><div class="offer-controls"><button data-list-act="log" data-id="${escapeAttr(part.id)}" data-offer="${escapeAttr(item.id)}">Log price</button>${removeButton}</div>`;
        offerList.append(line);
      });
      row.append(offerList);
    } else {
      const bestLabel = offer ? `${money(offer.price)} · ${offer.store || "Unknown source"}` : "No price saved";
      row.querySelector(".part-title span").textContent += ` · ${bestLabel}`;
    }
    list.append(row);
  }
}
function escapeHtml(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function escapeAttr(s = "") {
  return escapeHtml(s);
}
function storeColor(store) {
  const key = String(store || "")
    .trim()
    .toLowerCase();
  const known = {
    amazon: "#3B82F6",
    aliexpress: "#EF4444",
    mediamarkt: "#22C55E",
    mediaworld: "#22C55E",
    pccomponentes: "#8B5CF6",
    ebay: "#F59E0B",
    unieuro: "#06B6D4",
    euronics: "#EC4899",
    eprice: "#14B8A6",
    ldlc: "#F97316",
  };
  if (known[key]) return known[key];
  const palette = [
    "#3B82F6",
    "#EF4444",
    "#22C55E",
    "#8B5CF6",
    "#F59E0B",
    "#06B6D4",
    "#EC4899",
    "#14B8A6",
    "#F97316",
    "#6366F1",
    "#84CC16",
    "#D946EF",
  ];
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function updateChart() {
  const chartParts = activeCollection === "watchlist"
    ? watchlist
    : activeCollection === "trash"
      ? []
      : components;
  const chartOfferId = activeCollection === "watchlist"
    ? selectedWatchlistOfferId
    : selectedHistoryOfferId;
  const selected = chartParts
    .flatMap((part) => part.offers.map((offer) => ({ part, offer })))
    .find((item) => String(item.offer.id) === String(chartOfferId));
  const product = selected?.part || null;
  const offers = product?.offers || [];
  const hasHistory = offers.some((offer) => offer.history.length > 0);

  $("chartEmpty").style.display = hasHistory ? "none" : "grid";
  $("chartLabel").textContent = product
    ? product.name +
      " · " +
      offers.length +
      " store offer" +
      (offers.length === 1 ? "" : "s")
    : activeCollection === "watchlist"
      ? "Click an item in Da valutare to view its price trend"
      : activeCollection === "trash"
        ? "Items in the trash are not included in price tracking"
        : "Click a component to compare all its store offers";
  if (!window.Chart) return;

  if (chart) {
    chart.destroy();
    chart = null;
  }
  if (!product || !hasHistory) return;

  const dates = [
    ...new Set(
      offers.flatMap((offer) => offer.history.map((entry) => entry.date)),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const labels = dates.map((date) =>
    new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    }),
  );
  const datasets = offers.map((offer) => {
    const color = storeColor(offer.store);
    return {
      label: offer.store + " · " + (offer.condition || "New"),
      data: dates.map(
        (date) =>
          offer.history.find((entry) => entry.date === date)?.price ?? null,
      ),
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,
      fill: false,
      tension: 0.25,
      spanGaps: true,
      pointRadius: 4,
      pointHoverRadius: 8,
      pointHitRadius: 12,
      borderWidth: 2,
    };
  });

  chart = new Chart($("priceChart"), {
    type: "line",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      onClick: (event, _activeElements, instance) => {
        const points = instance.getElementsAtEventForMode(
          event,
          "nearest",
          { intersect: true },
          true,
        );
        const point = points[0];
        if (!point) return;
        const offer = offers[point.datasetIndex];
        const date = dates[point.index];
        if (offer?.history.some((entry) => entry.date === date)) {
          logPrice(product.id, offer.id, date);
        }
      },
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: 14,
            font: { size: 10 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context) =>
              context.dataset.label + ": " + money(context.parsed.y),
          },
        },
      },
      scales: {
        y: {
          grid: { color: "#eff2ed" },
          ticks: { font: { size: 9 }, callback: (value) => "€" + value },
          border: { display: false },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 } },
          border: { display: false },
        },
      },
    },
  });
}
async function logPrice(partId, offerId, entryDate = null) {
  const source = activeCollection === "watchlist" ? watchlist : components;
  const p = source.find((x) => String(x.id) === String(partId));
  const o = p?.offers.find((x) => String(x.id) === String(offerId));
  if (!o) return;
  const initialDate = entryDate || today();
  const existingEntry = o.history.find((entry) => entry.date === initialDate);
  const result = await openActionDialog({
    eyebrow: "PRICE HISTORY",
    title: existingEntry ? "Edit price point" : "Log a price",
    subtitle: `${p.name} · ${o.store}${existingEntry ? ` · ${new Date(existingEntry.date + "T12:00:00").toLocaleDateString()}` : ""}`,
    confirmLabel: existingEntry ? "Save changes" : "Save price",
    deleteLabel: existingEntry ? "Delete point" : "",
    closeOnBackdrop: false,
    closeOnEscape: false,
    fields: [
      { name: "price", label: "Price (€)", type: "number", value: existingEntry?.price ?? o.price, min: "0", step: "0.01", inputMode: "decimal", wide: false },
      { name: "date", label: "Date", type: "date", value: initialDate, wide: false },
    ],
  });
  if (!result) return;
  const snapshot = JSON.stringify({ components, watchlist, trash });
  if (result.action === "delete" && existingEntry) {
    o.history = o.history.filter((entry) => entry !== existingEntry);
    if (!(await save())) {
      restoreCollectionSnapshot(snapshot);
      render();
      return;
    }
    render();
    notify("Price point deleted");
    return;
  }
  const values = result.action === "save" ? result.values : result;
  const n = Number(values.price);
  const date = values.date;
  if (!Number.isFinite(n) || n < 0 || !date) return;
  if (existingEntry) o.history = o.history.filter((entry) => entry !== existingEntry);
  const sameDate = o.history.find((entry) => entry.date === date);
  if (sameDate) sameDate.price = n;
  else o.history.push({ date, price: n });
  o.history.sort((a, b) => a.date.localeCompare(b.date));
  if (date === today()) o.price = n;
  if (!(await save())) {
    restoreCollectionSnapshot(snapshot);
    render();
    return;
  }
  render();
  notify(existingEntry ? "Price point updated" : "Price history updated");
}
function addOffer(partId, collection = "components") {
  offerCollection = collection;
  const source = collection === "watchlist" ? watchlist : components;
  const p = source.find((x) => String(x.id) === String(partId));
  if (!p) return;
  $("offerForm").reset();
  $("offerStore").dataset.autoStore = "";
  $("offerStore").dataset.userEdited = "false";
  $("offerPartId").value = p.id;
  $("offerProductName").textContent = p.name;
  $("offerModal").classList.add("open");
}
bindStoreUrl("partUrl", "partStore");
bindStoreUrl("offerUrl", "offerStore");
$("partForm").querySelector('[type="submit"]').addEventListener("click", () => {
  reportActivity("INFO", "Save component button clicked", "Form submission starting");
});
$("partForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  reportActivity("INFO", "Save component clicked", "Component form");
  const submitButton = e.submitter || $("partForm").querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
  const original = JSON.stringify({ components, watchlist, trash });
  const target = editingCollection === "watchlist" ? watchlist : components;
  const name = $("partName").value.trim(),
    price = Number($("partPrice").value),
    date = today(),
    id = $("partId").value;
  if (componentNameKey(name)) {
    const duplicate = [...components, ...watchlist].find(
      (part) => String(part.id) !== String(id) && componentNameKey(part.name) === componentNameKey(name),
    );
    if (duplicate) {
      const message = `“${name}” already exists; component skipped`;
      reportClientIssue("warning", message, "Duplicate component");
      notify(message, "warning");
      return;
    }
  }
  let p = id ? target.find((x) => String(x.id) === String(id)) : null;
  if (p) {
    p.name = name;
    p.category = $("partCategory").value;
    p.image = $("partImageUrl").value.trim();
    let o = p.offers[0];
    if (!o) {
      o = {
        id: Date.now(),
        store: resolveStoreName($("partStore").value, $("partUrl").value),
        condition: $("partCondition").value,
        url: $("partUrl").value.trim(),
        history: [],
      };
      p.offers.push(o);
    }
    o.store = resolveStoreName($("partStore").value, $("partUrl").value);
    o.condition = $("partCondition").value;
    o.url = $("partUrl").value.trim();
    o.price = price;
    const old = o.history.find((h) => h.date === date);
    if (old) old.price = price;
    else o.history.push({ date, price });
  } else {
    p = {
      id: Date.now(),
      name,
      category: $("partCategory").value,
      image: $("partImageUrl").value.trim(),
      offers: [
        {
          id: `o-${Date.now()}`,
          store: resolveStoreName($("partStore").value, $("partUrl").value),
          condition: $("partCondition").value,
          url: $("partUrl").value.trim(),
          price,
          history: [{ date, price }],
        },
      ],
    };
    target.unshift(p);
  }
  const saved = await save();
  if (!saved) {
    const previous = JSON.parse(original);
    components = migrate(previous.components);
    watchlist = migrate(previous.watchlist);
    trash = migrate(previous.trash);
    render();
    return;
  }
  closeModal();
  if (editingCollection === "components" && !id) activeCollection = "build";
  render();
  notify(id ? "Component updated" : editingCollection === "watchlist" ? "Added to Da valutare" : "Component added");
  } catch (error) {
    reportClientIssue("error", error?.stack || error, "Save component form");
    notify("Could not save component: " + (error?.message || error));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});
$("addWatchlist").addEventListener("click", () => openModal(null, "watchlist"));
$("offerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const source = offerCollection === "watchlist" ? watchlist : components;
  const p = source.find((x) => String(x.id) === $("offerPartId").value);
  if (!p) return;
  const snapshot = JSON.stringify({ components, watchlist, trash });
  const price = Number($("offerPrice").value);
  p.offers.push({
    id: `o-${Date.now()}`,
    store: resolveStoreName($("offerStore").value, $("offerUrl").value),
    condition: $("offerCondition").value,
    url: $("offerUrl").value.trim(),
    price,
    history: [{ date: today(), price }],
  });
  if (await saveCollectionMutation(snapshot)) {
    $("offerModal").classList.remove("open");
    notify("Store offer added");
  }
});
$("componentList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) {
    if (e.target.closest("a")) return;
    const offerRow = e.target.closest("[data-view-offer]");
    if (offerRow) {
      selectedHistoryOfferId = offerRow.dataset.viewOffer;
    } else {
      const component = e.target.closest(".component");
      if (!component) return;
      selectedHistoryOfferId = component.dataset.defaultOfferId;
    }
    render();
    return;
  }
  const p = components.find((x) => String(x.id) === b.dataset.id);
  switch (b.dataset.act) {
    case "edit":
      openModal(p);
      break;
    case "add-offer":
      addOffer(p.id);
      break;
    case "watchlist": {
      const snapshot = JSON.stringify({ components, watchlist, trash });
      components = components.filter((item) => item !== p);
      watchlist.unshift(p);
      if (await saveCollectionMutation(snapshot)) {
        notify("Moved to Da valutare");
      }
      break;
    }
    case "log":
      selectedHistoryOfferId = b.dataset.offer;
      logPrice(p.id, b.dataset.offer);
      break;
    case "delete":
      if (await openActionDialog({
        eyebrow: "MOVE TO TRASH",
        title: `Move ${p.name} to the trash?`,
        subtitle: "Its offers and price history stay saved. You can restore or permanently delete it from the trash.",
        confirmLabel: "Move to trash",
        danger: true,
      })) {
        const snapshot = JSON.stringify({ components, watchlist, trash });
        components = components.filter((x) => x !== p);
        moveToTrash(p, "components");
        if (await saveCollectionMutation(snapshot)) notify("Component moved to trash");
      }
      break;
    case "remove-offer":
      if (p.offers.length === 1) {
        notify("A component needs at least one offer");
        return;
      }
      const offer = p.offers.find((item) => String(item.id) === b.dataset.offer);
      if (await openActionDialog({
        eyebrow: "REMOVE STORE OFFER",
        title: `Remove ${offer?.store || "this offer"}?`,
        subtitle: "This also removes the price history for this store offer.",
        confirmLabel: "Remove offer",
        danger: true,
      })) {
        p.offers = p.offers.filter((o) => String(o.id) !== b.dataset.offer);
        save();
        render();
        notify("Offer removed");
      }
      break;
  }
});
$("watchlistList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-list-act]");
  if (!button) {
    if (event.target.closest("a")) return;
    const offerRow = event.target.closest("[data-view-offer]");
    if (offerRow) {
      selectedWatchlistOfferId = offerRow.dataset.viewOffer;
      render();
      return;
    }
    const row = event.target.closest(".saved-component");
    if (row && row.dataset.defaultOfferId) {
      selectedWatchlistOfferId = row.dataset.defaultOfferId;
      render();
    }
    return;
  }
  const part = watchlist.find((item) => String(item.id) === button.dataset.id);
  if (!part) return;
  const action = button.dataset.listAct;
  if (action === "add-offer") {
    addOffer(part.id, "watchlist");
    return;
  }
  if (action === "log") {
    selectedWatchlistOfferId = button.dataset.offer;
    logPrice(part.id, button.dataset.offer);
    return;
  }
  if (action === "remove-offer") {
    if (part.offers.length <= 1) {
      notify("A component needs at least one offer");
      return;
    }
    const offer = part.offers.find((item) => String(item.id) === button.dataset.offer);
    if (!(await openActionDialog({
      eyebrow: "REMOVE STORE OFFER",
      title: `Remove ${offer?.store || "this offer"}?`,
      subtitle: "This also removes its price history from the graph.",
      confirmLabel: "Remove offer",
      danger: true,
    }))) return;
    const snapshot = JSON.stringify({ components, watchlist, trash });
    part.offers = part.offers.filter((item) => String(item.id) !== button.dataset.offer);
    if (await saveCollectionMutation(snapshot)) notify("Offer removed");
    return;
  }
  if (action === "edit") {
    openModal(part, "watchlist");
    return;
  }
  if (action === "add") {
    if (components.some((item) => componentNameKey(item.name) === componentNameKey(part.name))) {
      notify("This component is already in the build", "warning");
      return;
    }
    const snapshot = JSON.stringify({ components, watchlist, trash });
    watchlist = watchlist.filter((item) => item !== part);
    components.unshift(part);
    if (await saveCollectionMutation(snapshot)) notify("Added to your build");
    return;
  }
  if (action === "trash") {
    const snapshot = JSON.stringify({ components, watchlist, trash });
    watchlist = watchlist.filter((item) => item !== part);
    moveToTrash(part, "watchlist");
    if (await saveCollectionMutation(snapshot)) notify("Moved to trash");
    return;
  }
  if (action === "replace") {
    const options = components.map((item) => ({
      value: String(item.id),
      label: `${item.name} · ${item.category}`,
    }));
    const result = await openActionDialog({
      eyebrow: "REPLACE COMPONENT",
      title: `Use ${part.name} instead of…`,
      subtitle: "The selected component moves to the trash. You can restore it later.",
      confirmLabel: "Replace component",
      fields: [{ name: "replacementId", label: "Current build component", options, value: String(components.find((item) => item.category === part.category)?.id || components[0]?.id || "") }],
    });
    if (!result?.replacementId) return;
    const replaced = components.find((item) => String(item.id) === result.replacementId);
    if (!replaced) return;
    const snapshot = JSON.stringify({ components, watchlist, trash });
    components = components.filter((item) => item !== replaced);
    moveToTrash(replaced, "components");
    watchlist = watchlist.filter((item) => item !== part);
    components.unshift(part);
    if (await saveCollectionMutation(snapshot)) notify(`${part.name} replaced ${replaced.name}`);
  }
});
$("trashList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-list-act]");
  if (!button) return;
  const part = trash.find((item) => String(item.id) === button.dataset.id);
  if (!part) return;
  if (button.dataset.listAct === "restore") {
    const target = part.deletedFrom === "watchlist" ? watchlist : components;
    const exists = [...components, ...watchlist].some((item) => componentNameKey(item.name) === componentNameKey(part.name));
    if (exists) {
      notify("A component with this name is already saved", "warning");
      return;
    }
    const snapshot = JSON.stringify({ components, watchlist, trash });
    trash = trash.filter((item) => item !== part);
    delete part.deletedAt;
    delete part.deletedFrom;
    target.unshift(part);
    if (await saveCollectionMutation(snapshot)) notify("Component restored");
    return;
  }
  if (button.dataset.listAct === "purge" && await openActionDialog({
    eyebrow: "PERMANENTLY DELETE",
    title: `Delete ${part.name} forever?`,
    subtitle: "This permanently removes its offers and price history.",
    confirmLabel: "Delete permanently",
    danger: true,
  })) {
    const snapshot = JSON.stringify({ components, watchlist, trash });
    trash = trash.filter((item) => item !== part);
    if (await saveCollectionMutation(snapshot)) notify("Permanently deleted");
  }
});
document.querySelectorAll(".collection-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeCollection = tab.dataset.collection;
    activeSidebarView = activeCollection;
    render();
  });
});
document.querySelectorAll(".sidebar [data-collection]").forEach((item) => {
  item.addEventListener("click", () => {
    activeCollection = item.dataset.collection;
    activeSidebarView = item.dataset.sidebarView;
    render();
    $("parts").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
document.querySelectorAll(".sidebar [data-sidebar-view='overview'], .sidebar [data-sidebar-view='history']").forEach((item) => {
  item.addEventListener("click", () => {
    activeSidebarView = item.dataset.sidebarView;
    document.querySelectorAll("[data-sidebar-view]").forEach((link) => {
      link.classList.toggle("active", link.dataset.sidebarView === activeSidebarView);
    });
  });
});
["openAdd", "emptyAdd"].forEach((id) =>
  $(id).addEventListener("click", () => openModal()),
);
$("closeModal").onclick = $("cancelModal").onclick = closeModal;
$("closeOfferModal").onclick = $("cancelOffer").onclick = () =>
  $("offerModal").classList.remove("open");
$("modal").addEventListener("click", (e) => {
  if (e.target === $("modal")) closeModal();
});
$("offerModal").addEventListener("click", (e) => {
  if (e.target === $("offerModal")) $("offerModal").classList.remove("open");
});
$("search").addEventListener("input", render);
$("categoryFilter").addEventListener("change", render);
$("logPriceBtn").addEventListener("click", () => {
  const priceList = activeCollection === "watchlist" ? watchlist : components;
  const selectedOfferId = activeCollection === "watchlist"
    ? selectedWatchlistOfferId
    : selectedHistoryOfferId;
  const p = priceList
    .flatMap((p) => p.offers.map((o) => ({ p, o })))
    .find((x) => String(x.o.id) === String(selectedOfferId));
  if (p) logPrice(p.p.id, p.o.id);
  else notify("Add an offer first");
});
function guessCategory(name) {
  const value = name.toLowerCase();
  if (/\b(cavo|cable|displayport|adapter|adattatore|hdmi lead)\b/.test(value))
    return "Accessories";
  if (/\b(cpu|processor|ryzen|intel core|core i[3579])\b/.test(value))
    return "CPU";
  if (/\b(gpu|graphics|geforce|rtx|gtx|radeon)\b/.test(value)) return "GPU";
  if (/\b(ram|memory|ddr[345])\b/.test(value)) return "RAM";
  if (
    /\b(motherboard|mainboard|b[5678]\d{2}[a-z0-9-]*|x[67]\d{2}[a-z0-9-]*|z[67]\d{2}[a-z0-9-]*)\b/.test(
      value,
    )
  )
    return "Motherboard";
  if (/\b(ssd|nvme|m\.2|hard drive|hdd)\b/.test(value)) return "Storage";
  if (/\b(power supply|psu|80\+ gold|80\+ bronze)\b/.test(value))
    return "Power supply";
  if (/\b(case|chassis|tower)\b/.test(value)) return "Case";
  if (/\b(cooler|cooling|liquid freezer|aio|radiator)\b/.test(value))
    return "Cooling";
  if (/\b(monitor|display|screen)\b/.test(value)) return "Monitor";
  return "Other";
}

function parsePrice(raw) {
  const value = raw.replace(/\s/g, "");
  const decimalAt = Math.max(value.lastIndexOf(","), value.lastIndexOf("."));
  const whole = value.slice(0, decimalAt).replace(/[^\d]/g, "");
  const cents = value.slice(decimalAt + 1).replace(/[^\d]/g, "");
  return cents.length === 2 ? Number(whole + "." + cents) : NaN;
}

function extractProducts(ocrLines) {
  const ignored =
    /\b(add to cart|buy now|in stock|out of stock|delivery|shipping|reviews?|ratings?|subtotal|total|discount|monthly|per month|quantity|sponsored|advertisement|disponibilit[aà]|spedizione|gratuita|regala|ulteriori informazioni|acquista articoli|salva per dopo|condividi|rimuovi|item length|numeric|centimetri|risparmia|ogni\s+\d+|eligible)\b/i;
  const pricePattern =
    /\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d{1,4}[.,]\d{2})\b\s*€?/g;
  const productSignal =
    /\b(cpu|processor|ryzen|geforce|rtx|gtx|radeon|intel core|core i[3579]|ddr[345]|ram|ssd|nvme|m\.2|motherboard|mainboard|power supply|psu|80\+|monitor|display|screen|displayport|hdmi|usb|cavo|cable|adattatore|adapter|keyboard|mouse|case|chassis|cooler|cooling|fan|noctua|corsair|ugreen|logitech|samsung|kingston| crucial|seasonic|be quiet|western digital|wd black|asus|msi|gigabyte|asrock|nzxt|lian li|fractal)\b/i;
  const cleanProductName = (text) =>
    text
      .split(/\s*\|\s*/)[0]
      .replace(/\b(disponibilit[aà]|spedizione|gratuita|regala|ulteriori informazioni|acquista articoli|salva per dopo|condividi|rimuovi|item length|numeric|centimetri|risparmia|ogni\s+\d+|add to cart|buy now|in stock)\b[\s\S]*$/i, "")
      .replace(/[.…]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const normalizeSuperscriptPrice = (text) =>
    text.replace(/(\d{1,4})\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]{2})\s*€/g, (_, whole, cents) => {
      const digits = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
      return `${whole}.${[...cents].map((digit) => digits[digit]).join("")}€`;
    });
  const lines = (ocrLines || [])
    .map((line, index) => ({
      text: normalizeSuperscriptPrice(String(line.text || "").trim()),
      y: line.bbox ? (line.bbox.y0 + line.bbox.y1) / 2 : index * 36,
    }))
    .filter((line) => line.text.length > 2);
  const titleCandidates = lines.filter((line) => {
    pricePattern.lastIndex = 0;
    return (
      productSignal.test(line.text) &&
      line.text.length >= 9 &&
      !pricePattern.test(line.text) &&
      !/^https?:/i.test(line.text)
    );
  });
  const usedTitles = new Set();
  const products = [];

  for (const line of lines) {
    if (ignored.test(line.text) && !productSignal.test(line.text)) continue;
    pricePattern.lastIndex = 0;
    const matches = [...line.text.matchAll(pricePattern)];
    if (!matches.length) continue;
    const prices = matches
      .map((match) => parsePrice(match[1]))
      .filter((price) => Number.isFinite(price) && price > 0 && price < 50000);
    if (!prices.length) continue;

    pricePattern.lastIndex = 0;
    const inlineName = cleanProductName(line.text
      .replace(pricePattern, " ")
      .replace(/[€$£]/g, " ")
      .replace(/\s+/g, " ")
      .trim());
    pricePattern.lastIndex = 0;
    let name =
      /[a-z]{2,}/i.test(inlineName) && !ignored.test(inlineName)
        ? inlineName
        : "";
    if (!name) {
      const nearest = titleCandidates
        .map((candidate, index) => ({
          candidate,
          index,
          distance: Math.abs(candidate.y - line.y),
        }))
        .filter(
          ({ index, distance }) => !usedTitles.has(index) && distance <= 150,
        )
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest) {
        name = nearest.candidate.text;
        usedTitles.add(nearest.index);
      }
    }
    if (name)
      products.push({
        name: name.slice(0, 140),
        price: Math.min(...prices),
        category: guessCategory(name),
      });
  }

  const titleGroups = [];
  titleCandidates.forEach((line, index) => {
    const previous = titleGroups.at(-1);
    if (previous && line.y - previous.lastY <= 42) {
      previous.parts.push({ line, index });
      previous.lastY = line.y;
    } else {
      titleGroups.push({ parts: [{ line, index }], lastY: line.y });
    }
  });
  for (const group of titleGroups) {
    if (group.parts.some(({ index }) => usedTitles.has(index))) continue;
    const combined = group.parts.map(({ line }) => line.text).join(" ");
    const name = cleanProductName(combined);
    if (name.length >= 9) {
      products.push({
        name: name.slice(0, 140),
        price: "",
        category: guessCategory(name),
      });
    }
  }

  const seen = new Set();
  return products.filter((product) => {
    const key = product.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderBatchReview(items, detectedStore = "", method = "Local OCR") {
  const rows = $("batchRows");
  rows.replaceChildren();
  $("batchCount").textContent =
    items.length + " product" + (items.length === 1 ? "" : "s") + " found";
  $("batchStore").value = detectedStore;
  $("batchCondition").value = "New";
  const categories = [
    "CPU",
    "GPU",
    "RAM",
    "Motherboard",
    "Storage",
    "Power supply",
    "Case",
    "Cooling",
    "Monitor",
    "Accessories",
    "Other",
  ];

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "batch-row";
    const nameLabel = document.createElement("label");
    nameLabel.className = "field";
    nameLabel.textContent = "Product name";
    const nameInput = document.createElement("input");
    nameInput.className = "batch-name";
    nameInput.value = item.name;
    nameLabel.append(nameInput);

    const categoryLabel = document.createElement("label");
    categoryLabel.className = "field";
    categoryLabel.textContent = "Category";
    const categorySelect = document.createElement("select");
    categorySelect.className = "batch-category";
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.append(option);
    }
    categorySelect.value = item.category;
    categoryLabel.append(categorySelect);

    const priceLabel = document.createElement("label");
    priceLabel.className = "field";
    priceLabel.textContent = "Price (€)";
    const priceInput = document.createElement("input");
    priceInput.className = "batch-price";
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.placeholder = "0.00";
    priceInput.value = String(item.price ?? "").replace(/[^\d.,]/g, "").replace(",", ".");
    priceLabel.append(priceInput);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button batch-remove";
    remove.setAttribute("aria-label", "Remove product");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      row.remove();
      $("batchCount").textContent = rows.children.length + " products found";
    });
    row.append(nameLabel, categoryLabel, priceLabel, remove);
    rows.append(row);
  }

  setComponentEntryMode("bulk");
  $("ocrStatus").textContent =
    `${method}: check the detected products, correct anything needed, then add the whole list.`;
}

async function extractScreenshotWithGemini(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read screenshot"));
    reader.readAsDataURL(file);
  });
  const response = await fetch("/api/extract-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mimeType: file.type, data: dataUrl }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Gemini request failed (${response.status})`);
  const items = Array.isArray(result.items) ? result.items : [];
  return {
    store: String(result.store || ""),
    items: items
      .filter((item) => item && String(item.name || "").trim())
      .map((item) => ({
        name: String(item.name).trim().slice(0, 140),
        price: String(item.price ?? "").trim(),
        category: ["CPU", "GPU", "RAM", "Motherboard", "Storage", "Power supply", "Case", "Cooling", "Monitor", "Accessories", "Other"].includes(item.category)
          ? item.category
          : guessCategory(String(item.name)),
      })),
  };
}

async function recognizeScreenshot(file) {
  if (!file) return;
  $("ocrStatus").textContent = "Reading screenshot and looking for products…";
  let localMethod = "Local OCR";
  try {
    if ($("useAiRecognition").checked) {
      $("ocrStatus").textContent = "Sending screenshot to Gemini for product recognition…";
      try {
        const aiResult = await extractScreenshotWithGemini(file);
        if (aiResult.items.length) {
          renderBatchReview(aiResult.items, aiResult.store, "Gemini AI");
          return;
        }
        throw new Error("Gemini did not find any products");
      } catch (error) {
        localMethod = "Local OCR · Gemini unavailable; check its API key or connection";
        reportClientIssue("warning", error?.message || error, "Gemini image extraction; using local OCR");
      }
    }
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
    }
    const result = await Tesseract.recognize(file, "eng");
    const lines =
      result.data.lines ||
      (result.data.text || "").split(/\n/).map((text) => ({ text }));
    const items = extractProducts(lines);
    if (!items.length) {
      $("ocrStatus").textContent =
        "No products detected. Try a clearer screenshot or enter one manually.";
      return;
    }
    const allText = result.data.text || "";
    const stores = [
      "Amazon",
      "MediaMarkt",
      "PcComponentes",
      "AliExpress",
      "eBay",
      "Newegg",
      "Best Buy",
    ];
    const detectedStore =
      stores.find((store) =>
        allText.toLowerCase().includes(store.toLowerCase()),
      ) || "";
    renderBatchReview(items, detectedStore, localMethod);
  } catch (error) {
    $("ocrStatus").textContent =
      "Screenshot reading failed. Check your connection, or enter the products manually.";
    console.error(error);
  }
}

$("screenshotInput").addEventListener("change", async (event) => {
  await recognizeScreenshot(event.target.files[0]);
  event.target.value = "";
});

document.addEventListener("paste", (event) => {
  const imageItem = Array.from(event.clipboardData?.items || []).find((item) =>
    item.type.startsWith("image/"),
  );
  const imageFile = imageItem?.getAsFile();
  if (!imageFile) return;
  event.preventDefault();
  if ($("offerModal").classList.contains("open"))
    $("offerModal").classList.remove("open");
  if (!$("modal").classList.contains("open")) openModal();
  recognizeScreenshot(imageFile);
});

$("backFromBatch").addEventListener("click", () => {
  setComponentEntryMode("single");
  $("ocrStatus").textContent = "";
});
$("cancelBatch").addEventListener("click", () => {
  setComponentEntryMode("single");
  $("partForm").reset();
  $("ocrStatus").textContent = "";
});
$("addBatchProducts").addEventListener("click", async () => {
  const rows = Array.from($("batchRows").querySelectorAll(".batch-row"));
  if (!rows.length) {
    notify("No products to add");
    return;
  }
  const store = resolveStoreName($("batchStore").value, "");
  const products = rows.map((row) => ({
    name: row.querySelector(".batch-name").value.trim(),
    category: row.querySelector(".batch-category").value,
    price: Number(row.querySelector(".batch-price").value) || 0,
  }));
  const knownNames = new Set(
    [...components, ...watchlist].map((part) => componentNameKey(part.name)).filter(Boolean),
  );
  const newProducts = [];
  const duplicates = [];
  for (const product of products) {
    const key = componentNameKey(product.name);
    if (key && knownNames.has(key)) duplicates.push(product.name);
    else {
      newProducts.push(product);
      if (key) knownNames.add(key);
    }
  }
  if (duplicates.length) {
    const message = `Skipped ${duplicates.length} duplicate component${duplicates.length === 1 ? "" : "s"}: ${duplicates.join(", ")}`;
    reportClientIssue("warning", message, "Duplicate components");
    notify(message, "warning");
  }
  if (!newProducts.length) return;
  const date = today();
  const firstId = Date.now();
  const target = editingCollection === "watchlist" ? watchlist : components;
  target.unshift(
    ...newProducts.map((item, index) => ({
      id: firstId + index,
      name: item.name,
      category: item.category,
      image: "",
      offers: [
        {
          id: "o-" + (firstId + index),
          store,
          price: item.price,
          condition: $("batchCondition").value,
          url: "",
          history: [{ date, price: item.price }],
        },
      ],
    })),
  );
  const saved = await save();
  if (!saved) {
    target.splice(0, newProducts.length);
    render();
    return;
  }
  activeCollection = editingCollection === "watchlist" ? "watchlist" : "build";
  render();
  closeModal();
  notify(
    duplicates.length
      ? `Added ${newProducts.length}; skipped ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"}`
      : newProducts.length +
      " product" +
      (newProducts.length === 1 ? "" : "s") +
      " added",
    duplicates.length ? "warning" : "info",
  );
});

async function initialize() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error(`Load failed (${response.status})`);
    const savedData = await response.json();
    if (Array.isArray(savedData)) {
      components = migrate(savedData);
      watchlist = [];
      trash = [];
    } else {
      components = migrate(savedData.components || []);
      watchlist = migrate(savedData.watchlist || []);
      trash = migrate(savedData.trash || []);
    }
    let legacy = [];
    try {
      const oldData = localStorage.getItem("pc_components");
      if (oldData) legacy = migrate(JSON.parse(oldData));
    } catch (error) {
      reportClientIssue("error", error?.stack || error, "Reading previous browser data");
      console.warn("Could not read previous browser data", error);
    }
    if (legacy.length) {
      for (const oldPart of legacy) {
        const index = components.findIndex(
          (part) => String(part.id) === String(oldPart.id),
        );
        if (index < 0) components.push(oldPart);
        else {
          if (!oldPart.image) oldPart.image = components[index].image;
          components[index] = oldPart;
        }
      }
    }
    dataReady = true;
    $("storageTitle").textContent = "Your data stays on this PC";
    $("storageStatus").textContent = "Saved to data.json";
    render();
    try {
      const statusResponse = await fetch("/api/status", { cache: "no-store" });
      if (!statusResponse.ok) throw new Error(`Status unavailable (${statusResponse.status})`);
      const status = await statusResponse.json();
      reportActivity(
        "INFO",
        "Partly app started",
        `Server ${status.host}:${status.port} · PID ${status.pid}`,
      );
    } catch (error) {
      reportClientIssue("warning", error?.message || error, "Reading server startup status");
    }
    if (legacy.length && (await save())) {
      try {
        localStorage.removeItem("pc_components");
      } catch (error) {
        reportClientIssue("error", error?.stack || error, "Clearing previous browser data");
        console.warn("Could not clear previous browser data", error);
      }
      $("storageStatus").textContent = "Previous data moved to data.json";
    }
  } catch (error) {
    reportClientIssue("error", error?.stack || error, "Loading /api/data");
    $("storageTitle").textContent = "Local server is not running";
    $("storageStatus").textContent = "Start the app with run_app.bat";
    $("emptyState").style.display = "block";
    $("componentList").style.display = "none";
    $("emptyState").querySelector("p").textContent =
      "Start the local app from run_app.bat to load and save your components.";
    document.querySelectorAll(".primary, .upload-button").forEach((button) => {
      button.disabled = true;
    });
    console.error(error);
  }
}

initialize();
