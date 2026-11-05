const $ = (id) => document.getElementById(id);
const today = () => new Date().toLocaleDateString("en-CA");
const money = (n) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
let chart = null,
  toastTimer;
let selectedHistoryOfferId = null;
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
          store: p.store || "Unknown store",
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
let dataReady = false;
let saveQueue = Promise.resolve();
function save() {
  if (!dataReady) {
    notify("Start the local app with run_app.bat before saving");
    return Promise.resolve();
  }
  const snapshot = JSON.stringify(components);
  saveQueue = saveQueue
    .then(async () => {
      const response = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: snapshot,
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      return response.json();
    })
    .then(() => {
      $("storageStatus").textContent = "Saved to data.json";
      return true;
    })
    .catch((error) => {
      $("storageStatus").textContent =
        "Could not save — check the local server";
      notify("Could not save changes to data.json");
      console.error(error);
      return false;
    });
  return saveQueue;
}
function notify(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}
function openModal(part) {
  $("partForm").reset();
  $("bulkReview").hidden = true;
  $("singleFields").hidden = false;
  $("ocrStatus").textContent = "";
  $("partId").value = part?.id || "";
  $("modalTitle").textContent = part ? "Edit component" : "Add a component";
  $("partName").value = part?.name || "";
  $("partCategory").value = part?.category || "CPU";
  $("partImageUrl").value = part?.image || "";
  $("partStore").value = part?.offers?.[0]?.store || "";
  $("partPrice").value = part?.offers?.[0]?.price ?? "";
  $("partCondition").value = part?.offers?.[0]?.condition || "New";
  $("partUrl").value = part?.offers?.[0]?.url || "";
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
  const total = components.reduce(
    (s, p) => s + Number(getOffer(p)?.price || 0),
    0,
  );
  const stores = new Set(
    offers.map((x) => x.o.store.trim().toLowerCase()).filter(Boolean),
  );
  const entries = offers.reduce((s, x) => s + x.o.history.length, 0);
  const best = offers.reduce(
    (a, x) => (!a || Number(x.o.price) < Number(a.o.price) ? x : a),
    null,
  );
  $("grandTotal").textContent = money(total);
  $("totalFoot").textContent =
    `Across ${components.length} component${components.length === 1 ? "" : "s"}`;
  $("offerCount").textContent = offers.length;
  $("historyCount").textContent = entries;
  $("statParts").textContent = components.length;
  $("partsCount").textContent = components.length;
  $("navCount").textContent = components.length;
  $("statStores").textContent = stores.size;
  $("statBest").textContent = best ? money(best.o.price) : "—";
  $("bestName").textContent = best ? best.p.name : "Add your first offer";
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
    top.innerHTML = `${visual}<div class="part-title"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.category)} · ${p.offers.length} offer${p.offers.length === 1 ? "" : "s"}</span></div><div class="component-actions"><button class="mini-button" data-act="add-offer" data-id="${escapeAttr(p.id)}">＋ Store</button><button class="icon-button" title="Edit" data-act="edit" data-id="${escapeAttr(p.id)}">✎</button><button class="icon-button" title="Delete" data-act="delete" data-id="${escapeAttr(p.id)}">×</button></div>`;
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
  updateChart();
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
function updateChart() {
  const selected = selectedHistoryOfferId;
  const target = components
    .flatMap((p) => p.offers.map((o) => ({ p, o })))
    .find((x) => String(x.o.id) === String(selected));
  $("chartEmpty").style.display =
    target && target.o.history.length ? "none" : "grid";
  $("chartLabel").textContent = target
    ? `${target.p.name} · ${target.o.store} · ${target.o.condition}`
    : "Click a product or store offer to view its price trend";
  if (!window.Chart) return;
  const canvas = $("priceChart");
  if (chart) {
    chart.destroy();
    chart = null;
  }
  if (!target || !target.o.history.length) return;
  const entries = [...target.o.history].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: entries.map((x) =>
        new Date(`${x.date}T12:00:00`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        }),
      ),
      datasets: [
        {
          data: entries.map((x) => Number(x.price)),
          borderColor: "#83ae4e",
          backgroundColor: "#e8f4db",
          fill: true,
          tension: 0.32,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#83ae4e",
          borderWidth: 2,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => money(c.parsed.y) } },
      },
      scales: {
        y: {
          grid: { color: "#eff2ed" },
          ticks: { font: { size: 9 }, callback: (v) => `€${v}` },
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
function logPrice(partId, offerId) {
  const p = components.find((x) => String(x.id) === String(partId)),
    o = p?.offers.find((x) => String(x.id) === String(offerId));
  if (!o) return;
  const price = prompt(`New price for ${p.name} at ${o.store} (€):`, o.price);
  if (price === null) return;
  const n = Number(price.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    notify("Enter a valid price");
    return;
  }
  const date = prompt("Date (YYYY-MM-DD):", today());
  if (!date) return;
  const old = o.history.find((h) => h.date === date);
  if (old) old.price = n;
  else o.history.push({ date, price: n });
  o.history.sort((a, b) => a.date.localeCompare(b.date));
  if (date === today()) o.price = n;
  save();
  render();
  notify("Price history updated");
}
function addOffer(partId) {
  const p = components.find((x) => String(x.id) === String(partId));
  if (!p) return;
  $("offerForm").reset();
  $("offerPartId").value = p.id;
  $("offerProductName").textContent = p.name;
  $("offerModal").classList.add("open");
}
$("partForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("partName").value.trim(),
    price = Number($("partPrice").value),
    date = today(),
    id = $("partId").value;
  let p = id ? components.find((x) => String(x.id) === String(id)) : null;
  if (p) {
    p.name = name;
    p.category = $("partCategory").value;
    p.image = $("partImageUrl").value.trim();
    let o = p.offers[0];
    if (!o) {
      o = {
        id: Date.now(),
        store: $("partStore").value.trim(),
        condition: $("partCondition").value,
        url: $("partUrl").value.trim(),
        history: [],
      };
      p.offers.push(o);
    }
    o.store = $("partStore").value.trim();
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
          store: $("partStore").value.trim(),
          condition: $("partCondition").value,
          url: $("partUrl").value.trim(),
          price,
          history: [{ date, price }],
        },
      ],
    };
    components.unshift(p);
  }
  save();
  closeModal();
  render();
  notify(id ? "Component updated" : "Component added");
});
$("offerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const p = components.find((x) => String(x.id) === $("offerPartId").value);
  if (!p) return;
  const price = Number($("offerPrice").value);
  p.offers.push({
    id: `o-${Date.now()}`,
    store: $("offerStore").value.trim(),
    condition: $("offerCondition").value,
    url: $("offerUrl").value.trim(),
    price,
    history: [{ date: today(), price }],
  });
  save();
  $("offerModal").classList.remove("open");
  render();
  notify("Store offer added");
});
$("componentList").addEventListener("click", (e) => {
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
    case "log":
      selectedHistoryOfferId = b.dataset.offer;
      logPrice(p.id, b.dataset.offer);
      break;
    case "delete":
      if (confirm(`Delete ${p.name} and its price history?`)) {
        components = components.filter((x) => x !== p);
        save();
        render();
        notify("Component deleted");
      }
      break;
    case "remove-offer":
      if (p.offers.length === 1) {
        notify("A component needs at least one offer");
        return;
      }
      if (confirm("Remove this store offer and its price history?")) {
        p.offers = p.offers.filter((o) => String(o.id) !== b.dataset.offer);
        save();
        render();
        notify("Offer removed");
      }
      break;
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
  const p = components
    .flatMap((p) => p.offers.map((o) => ({ p, o })))
    .find((x) => String(x.o.id) === String(selectedHistoryOfferId));
  if (p) logPrice(p.p.id, p.o.id);
  else notify("Add an offer first");
});
function guessCategory(name) {
  const value = name.toLowerCase();
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
    /\b(add to cart|buy now|in stock|out of stock|delivery|shipping|reviews?|ratings?|subtotal|total|discount|monthly|per month|quantity|sponsored|advertisement)\b/i;
  const pricePattern =
    /\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d{1,4}[.,]\d{2})\b\s*€?/g;
  const lines = (ocrLines || [])
    .map((line, index) => ({
      text: String(line.text || "").trim(),
      y: line.bbox ? (line.bbox.y0 + line.bbox.y1) / 2 : index * 36,
    }))
    .filter((line) => line.text.length > 2);
  const titleCandidates = lines.filter((line) => {
    pricePattern.lastIndex = 0;
    return (
      /[a-z]/i.test(line.text) &&
      !pricePattern.test(line.text) &&
      !ignored.test(line.text) &&
      !/^https?:/i.test(line.text)
    );
  });
  const usedTitles = new Set();
  const products = [];

  for (const line of lines) {
    if (ignored.test(line.text)) continue;
    pricePattern.lastIndex = 0;
    const matches = [...line.text.matchAll(pricePattern)];
    if (!matches.length) continue;
    const prices = matches
      .map((match) => parsePrice(match[1]))
      .filter((price) => Number.isFinite(price) && price > 0 && price < 50000);
    if (!prices.length) continue;

    pricePattern.lastIndex = 0;
    const inlineName = line.text
      .replace(pricePattern, " ")
      .replace(/[€$£]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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

  for (const [index, line] of titleCandidates.entries()) {
    if (usedTitles.has(index)) continue;
    const plausible =
      line.text.length >= 8 &&
      /[a-z]{2,}/i.test(line.text) &&
      (/\d/.test(line.text) || line.text.length >= 18);
    if (plausible)
      products.push({
        name: line.text.slice(0, 140),
        price: "",
        category: guessCategory(line.text),
      });
  }

  const seen = new Set();
  return products.filter((product) => {
    const key = product.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderBatchReview(items, detectedStore = "") {
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
    nameInput.required = true;
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
    priceInput.required = true;
    priceInput.placeholder = "0.00";
    priceInput.value = item.price;
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

  $("singleFields").hidden = true;
  $("bulkReview").hidden = false;
  $("ocrStatus").textContent =
    "Check the detected products, correct anything needed, then add the whole list.";
}

async function recognizeScreenshot(file) {
  if (!file) return;
  $("ocrStatus").textContent = "Reading screenshot and looking for products…";
  try {
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
    renderBatchReview(items, detectedStore);
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
  $("bulkReview").hidden = true;
  $("singleFields").hidden = false;
  $("ocrStatus").textContent = "";
});
$("cancelBatch").addEventListener("click", () => {
  $("bulkReview").hidden = true;
  $("singleFields").hidden = false;
  $("partForm").reset();
  $("ocrStatus").textContent = "";
});
$("addBatchProducts").addEventListener("click", async () => {
  const rows = Array.from($("batchRows").querySelectorAll(".batch-row"));
  if (!rows.length) {
    notify("No products to add");
    return;
  }
  const store = $("batchStore").value.trim();
  if (!store) {
    $("batchStore").focus();
    notify("Enter the store shown in the screenshot");
    return;
  }
  const products = rows.map((row) => ({
    name: row.querySelector(".batch-name").value.trim(),
    category: row.querySelector(".batch-category").value,
    price:
      row.querySelector(".batch-price").value.trim() === ""
        ? NaN
        : Number(row.querySelector(".batch-price").value),
  }));
  if (
    products.some(
      (item) => !item.name || !Number.isFinite(item.price) || item.price < 0,
    )
  ) {
    notify("Review every product name and price first");
    return;
  }
  const date = today();
  const firstId = Date.now();
  components.unshift(
    ...products.map((item, index) => ({
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
  await save();
  render();
  closeModal();
  notify(
    products.length +
      " product" +
      (products.length === 1 ? "" : "s") +
      " added",
  );
});

async function initialize() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error(`Load failed (${response.status})`);
    components = migrate(await response.json());
    let legacy = [];
    try {
      const oldData = localStorage.getItem("pc_components");
      if (oldData) legacy = migrate(JSON.parse(oldData));
    } catch (error) {
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
    if (legacy.length && (await save())) {
      try {
        localStorage.removeItem("pc_components");
      } catch (error) {
        console.warn("Could not clear previous browser data", error);
      }
      $("storageStatus").textContent = "Previous data moved to data.json";
    }
  } catch (error) {
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
