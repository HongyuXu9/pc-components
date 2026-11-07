import { formatDate, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);

export function createPriceChart({
  getComponents,
  getWatchlist,
  getTrash,
  getActiveCollection,
  getSelectedOfferId,
  money,
  today,
  openActionDialog,
  save,
  restoreCollectionSnapshot,
  render,
  notify,
}) {
  let chart = null;
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
    const activeCollection = getActiveCollection();
    const chartParts = activeCollection === "watchlist"
      ? getWatchlist()
      : activeCollection === "trash"
        ? []
        : getComponents();
    const chartOfferId = getSelectedOfferId();
    const selected = chartParts
      .flatMap((part) => part.offers.map((offer) => ({ part, offer })))
      .find((item) => String(item.offer.id) === String(chartOfferId));
    const product = selected?.part || null;
    const offers = product?.offers || [];
    const hasHistory = offers.some((offer) => offer.history.length > 0);

    $("chartEmpty").style.display = hasHistory ? "none" : "grid";
    $("chartLabel").textContent = product
      ? `${product.name} · ${offers.length} ${t(offers.length === 1 ? "store offer" : "store offers")}`
      : t(activeCollection === "watchlist"
        ? "Click an item in the watchlist to view its price trend"
        : activeCollection === "trash"
          ? "Items in the trash are not included in price tracking"
          : "Click a component to compare all its store offers");
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
      formatDate(date, {
        day: "numeric",
        month: "short",
        year: "2-digit",
      }),
    );
    const datasets = offers.map((offer) => {
      const color = storeColor(offer.store);
      return {
        label: offer.store + " · " + t(offer.condition || "New"),
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

    chart = new window.Chart($("priceChart"), {
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
    const source = getActiveCollection() === "watchlist" ? getWatchlist() : getComponents();
    const p = source.find((x) => String(x.id) === String(partId));
    const o = p?.offers.find((x) => String(x.id) === String(offerId));
    if (!o) return;
    const initialDate = entryDate || today();
    const existingEntry = o.history.find((entry) => entry.date === initialDate);
    const result = await openActionDialog({
      eyebrow: "PRICE HISTORY",
      title: t(existingEntry ? "Edit price point" : "Log a price"),
      subtitle: `${p.name} · ${o.store}${existingEntry ? ` · ${formatDate(existingEntry.date)}` : ""}`,
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
    const snapshot = JSON.stringify({ components: getComponents(), watchlist: getWatchlist(), trash: getTrash() });
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

return { updateChart, logPrice };
}
