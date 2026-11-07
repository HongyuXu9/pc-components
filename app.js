import { openActionDialog } from "./js/action-dialog.js";
import {
  bindStoreUrl,
  componentNameKey,
  migrate,
  resolveStoreName,
  syncStoreName,
} from "./js/domain.js";
import {
  initializeActivityLog,
  reportActivity,
  reportClientIssue,
} from "./js/activity-log.js";
import { createImageRecognition } from "./js/image-recognition.js";
import { createPriceChart } from "./js/price-chart.js";
import { renderSavedCollection } from "./js/saved-collections.js";
import { buildSummary } from "./js/build-summary.js";
import {
  formatCurrency,
  formatDate,
  initializeI18n,
  t,
} from "./js/i18n.js";

const $ = (id) => document.getElementById(id);
initializeI18n();
const today = () => new Date().toLocaleDateString("en-CA");
const money = formatCurrency;
let toastTimer;
let selectedHistoryOfferId = null;
let selectedWatchlistOfferId = null;
let components = [];
let watchlist = [];
let trash = [];
let activeCollection = "build";
let activeSidebarView = "overview";
let editingCollection = "components";
let offerCollection = "components";
let dataReady = false;
let saveQueue = Promise.resolve();
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
function save() {
  if (!dataReady) {
    reportActivity("ERROR", "Save blocked: app data is not ready", "Save component");
    notify("Start the local app with run_app.bat before saving");
    return Promise.resolve();
  }
  const snapshot = JSON.stringify({ components, watchlist, trash });
  reportActivity(
    "INFO",
    "Saving component data…",
    `PUT /api/data · build ${components.length}, watchlist ${watchlist.length}, trash ${trash.length}`,
  );
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
      $("storageStatus").textContent = t("Saved to data.json");
      reportActivity("INFO", "Save completed successfully", "data.json");
      return true;
    })
    .catch((error) => {
      const detail = error?.message || String(error);
      $("storageStatus").textContent = `${t("Save failed: {detail}", { detail })} · partly.log`;
      notify(t("Save failed: {detail}", { detail }));
      console.error("[Partly] Save failed:", error);
      reportClientIssue("error", error?.stack || error, "PUT /api/data");
      return false;
    });
  return saveQueue;
}
function notify(message, kind = "info") {
  const toast = $("toast");
  toast.textContent = t(message);
  toast.classList.toggle("warning", kind === "warning");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
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
  imageRecognition.clearScreenshotPreview();
  setComponentEntryMode("single");
  $("ocrStatus").textContent = "";
  $("partId").value = part?.id || "";
  const inWatchlist = collection === "watchlist";
  $("modalTitle").textContent = t(part ? "Edit component" : inWatchlist ? "Add to Watchlist" : "Add a component");
  $("partForm").querySelector('[type="submit"]').textContent = t(part ? "Save component" : inWatchlist ? "Save to Watchlist" : "Save component");
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
  imageRecognition.clearScreenshotPreview();
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
    e.textContent = t("No components match your search.");
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
  const summary = buildSummary(components, getOffer);
  $("buildSummaryText").value = summary.text;
  $("summaryTotal").textContent = money(summary.total);
  $("copyBuildSummary").disabled = !components.length;
  $("totalFoot").textContent = t(
    components.length === 1 ? "Across {count} component" : "Across {count} components",
    { count: components.length },
  );
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
      formatDate(historicalLow.date)
    : selectedProduct?.name || t("Select a component");
  const cats = [...new Set(components.map((p) => p.category))].sort(),
    cur = $("categoryFilter").value;
  $("categoryFilter").innerHTML =
    `<option value="">${escapeHtml(t("All categories"))}</option>` +
    cats.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(t(c))}</option>`).join("");
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
      ? `<div class="part-visual"><img class="part-image" src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('image-missing');this.remove()"></div>`
      : '<div class="part-visual image-missing"></div>';
    const offerCountLabel = t(p.offers.length === 1 ? "store offer" : "store offers");
    top.innerHTML = `${visual}<div class="part-title"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(t(p.category))} · ${p.offers.length} ${escapeHtml(offerCountLabel)}</span></div><div class="component-actions"><button class="mini-button" data-act="add-offer" data-id="${escapeAttr(p.id)}">${escapeHtml(t("＋ Store"))}</button><button class="mini-button" title="${escapeAttr(t("Move to watchlist"))}" data-act="watchlist" data-id="${escapeAttr(p.id)}">☆ ${escapeHtml(t("Watchlist"))}</button><button class="icon-button" title="${escapeAttr(t("Edit"))}" data-act="edit" data-id="${escapeAttr(p.id)}">✎</button><button class="icon-button" title="${escapeAttr(t("Delete"))}" data-act="delete" data-id="${escapeAttr(p.id)}">×</button></div>`;
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
        : escapeHtml(o.store || t("Unknown source"));
      const recordLabel = t(o.history.length === 1 ? "price record" : "price records");
      line.innerHTML = `<div><span class="offer-name">${name}<span class="condition">${escapeHtml(t(o.condition || "New"))}</span></span><span class="offer-meta">${o.history.length} ${escapeHtml(recordLabel)}${bestOffer ? ` · ${escapeHtml(t("Best price"))}` : ""}</span></div><div class="offer-price ${bestOffer ? "best" : ""}">${money(o.price)}</div><div class="offer-controls"><button data-act="log" data-id="${escapeAttr(p.id)}" data-offer="${escapeAttr(o.id)}">${escapeHtml(t("Log price"))}</button><button data-act="remove-offer" data-id="${escapeAttr(p.id)}" data-offer="${escapeAttr(o.id)}" title="${escapeAttr(t("Remove offer"))}">×</button></div>`;
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
  const collectionViewOptions = {
    components,
    selectedWatchlistOfferId,
    getOffer,
    money,
    t,
    formatDate,
    escapeHtml,
    escapeAttr,
  };
  renderSavedCollection(watchlist, $("watchlistList"), "watchlist", collectionViewOptions);
  renderSavedCollection(trash, $("trashList"), "trash", collectionViewOptions);
  $("watchlistEmpty").hidden = watchlist.length > 0;
  $("trashEmpty").hidden = trash.length > 0;
  updateChart();
}
window.addEventListener("partly:languagechange", () => render());
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
const { updateChart, logPrice } = createPriceChart({
  getComponents: () => components,
  getWatchlist: () => watchlist,
  getTrash: () => trash,
  getActiveCollection: () => activeCollection,
  getSelectedOfferId: () =>
    activeCollection === "watchlist"
      ? selectedWatchlistOfferId
      : selectedHistoryOfferId,
  money,
  today,
  openActionDialog,
  save,
  restoreCollectionSnapshot,
  render,
  notify,
});

bindStoreUrl("partUrl", "partStore");
bindStoreUrl("offerUrl", "offerStore");
$("partForm").addEventListener("submit", async (e) => {
  e.preventDefault();
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
      const message = t("“{name}” already exists; component skipped", { name });
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
  notify(id ? "Component updated" : editingCollection === "watchlist" ? "Added to watchlist" : "Component added");
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
        notify("Moved to watchlist");
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
        title: t("Move {name} to the trash?", { name: p.name }),
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
        title: t("Remove {name}?", { name: offer?.store || t("this offer") }),
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
      title: t("Remove {name}?", { name: offer?.store || t("this offer") }),
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
      label: `${item.name} · ${t(item.category)}`,
    }));
    const result = await openActionDialog({
      eyebrow: "REPLACE COMPONENT",
      title: t("Use {name} instead of…", { name: part.name }),
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
    if (await saveCollectionMutation(snapshot)) notify(t("{newName} replaced {oldName}", { newName: part.name, oldName: replaced.name }));
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
    title: t("Delete {name} forever?", { name: part.name }),
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
document.querySelectorAll(".sidebar [data-sidebar-view='overview'], .sidebar [data-sidebar-view='history'], .sidebar [data-sidebar-view='summary']").forEach((item) => {
  item.addEventListener("click", () => {
    activeSidebarView = item.dataset.sidebarView;
    document.querySelectorAll("[data-sidebar-view]").forEach((link) => {
      link.classList.toggle("active", link.dataset.sidebarView === activeSidebarView);
    });
  });
});
let summaryCopyTimer;
$("copyBuildSummary").addEventListener("click", async () => {
  const summary = $("buildSummaryText");
  try {
    await navigator.clipboard.writeText(summary.value);
    const button = $("copyBuildSummary");
    button.classList.add("copied");
    clearTimeout(summaryCopyTimer);
    summaryCopyTimer = setTimeout(() => button.classList.remove("copied"), 1800);
    notify("Build summary copied");
  } catch {
    summary.focus();
    summary.select();
    notify("Select and copy the summary with Ctrl+C");
  }
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
function renderBatchReview(items, detectedStore = "", method = "Local OCR") {
  const rows = $("batchRows");
  rows.replaceChildren();
  $("batchCount").textContent =
    t(items.length === 1 ? "{count} product found" : "{count} products found", { count: items.length });
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
    nameLabel.textContent = t("Product name");
    const nameInput = document.createElement("input");
    nameInput.className = "batch-name";
    nameInput.value = item.name;
    nameLabel.append(nameInput);

    const categoryLabel = document.createElement("label");
    categoryLabel.className = "field";
    categoryLabel.textContent = t("Category");
    const categorySelect = document.createElement("select");
    categorySelect.className = "batch-category";
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = t(category);
      categorySelect.append(option);
    }
    categorySelect.value = item.category;
    categoryLabel.append(categorySelect);

    const priceLabel = document.createElement("label");
    priceLabel.className = "field";
    priceLabel.textContent = t("Price (€)");
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
    remove.setAttribute("aria-label", t("Remove product"));
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      row.remove();
      $("batchCount").textContent = t(rows.children.length === 1 ? "{count} product found" : "{count} products found", { count: rows.children.length });
    });
    row.append(nameLabel, categoryLabel, priceLabel, remove);
    rows.append(row);
  }

  setComponentEntryMode("bulk");
  $("ocrStatus").textContent =
    t("{method}: check the detected products, correct anything needed, then add the whole list.", { method });
}

const imageRecognition = createImageRecognition({
  isAiEnabled: () => $("ocrProvider").value === "gemini",
  onResults: renderBatchReview,
  reportClientIssue,
});

$("removeScreenshot").addEventListener("click", () => {
  imageRecognition.clearScreenshotPreview();
  $("screenshotInput").value = "";
  $("ocrStatus").textContent = "";
  setComponentEntryMode("single");
});

$("screenshotInput").addEventListener("change", async (event) => {
  await imageRecognition.recognizeScreenshot(event.target.files[0]);
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
  imageRecognition.recognizeScreenshot(imageFile);
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
    const message = t(duplicates.length === 1 ? "Skipped {count} duplicate component: {names}" : "Skipped {count} duplicate components: {names}", { count: duplicates.length, names: duplicates.join(", ") });
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
      ? t(duplicates.length === 1 ? "Added {added}; skipped {skipped} duplicate" : "Added {added}; skipped {skipped} duplicates", { added: newProducts.length, skipped: duplicates.length })
      : t(newProducts.length === 1 ? "{count} product added" : "{count} products added", { count: newProducts.length }),
    duplicates.length ? "warning" : "info",
  );
});

async function initialize() {
  initializeActivityLog();
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
    $("storageTitle").textContent = t("Your data stays on this PC");
    $("storageStatus").textContent = t("Saved to data.json");
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
      $("storageStatus").textContent = t("Previous data moved to data.json");
    }
  } catch (error) {
    reportClientIssue("error", error?.stack || error, "Loading /api/data");
    $("storageTitle").textContent = t("Local server is not running");
    $("storageStatus").textContent = t("Start the app with run_app.bat");
    $("emptyState").style.display = "block";
    $("componentList").style.display = "none";
    $("emptyState").querySelector("p").textContent =
      t("Start the local app from run_app.bat to load and save your components.");
    document.querySelectorAll(".primary, .upload-button").forEach((button) => {
      button.disabled = true;
    });
    console.error(error);
  }
}

initialize();
