export function renderSavedCollection(
  items,
  list,
  collection,
  { components, selectedWatchlistOfferId, getOffer, money, t, formatDate, escapeHtml, escapeAttr },
) {
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
      ? `<div class="part-visual"><img class="part-image" src="${escapeAttr(part.image)}" alt="${escapeAttr(part.name)}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('image-missing');this.remove()"></div>`
      : '<div class="part-visual image-missing"></div>';
    const buttons = collection === "watchlist"
      ? `<button class="mini-button experimental-offer-button" data-list-act="search-offers" data-id="${escapeAttr(part.id)}">${escapeHtml(t("⌕ Find offers"))}</button><button class="mini-button" data-list-act="add-offer" data-id="${escapeAttr(part.id)}">${escapeHtml(t("＋ Store"))}</button><button class="mini-button" data-list-act="add" data-id="${escapeAttr(part.id)}">${escapeHtml(t("Add to build"))}</button>${components.length ? `<button class="mini-button" data-list-act="replace" data-id="${escapeAttr(part.id)}">${escapeHtml(t("Replace…"))}</button>` : ""}<button class="icon-button" title="${escapeAttr(t("Edit"))}" data-list-act="edit" data-id="${escapeAttr(part.id)}">✎</button><button class="icon-button" title="${escapeAttr(t("Move to trash"))}" data-list-act="trash" data-id="${escapeAttr(part.id)}">×</button>`
      : `<button class="mini-button" data-list-act="restore" data-id="${escapeAttr(part.id)}">${escapeHtml(t("Restore"))}</button><button class="mini-button danger-text" data-list-act="purge" data-id="${escapeAttr(part.id)}">${escapeHtml(t("Delete permanently"))}</button>`;
    const removed = collection === "trash" && part.deletedAt
      ? ` · ${escapeHtml(t("Deleted {date}", { date: formatDate(part.deletedAt) }))}`
      : "";
    row.innerHTML = `<div class="component-top">${visual}<div class="part-title"><strong>${escapeHtml(part.name)}${collection === "watchlist" ? `<em class="watchlist-tag">${escapeHtml(t("Considering"))}</em>` : ""}</strong><span>${escapeHtml(t(part.category))}${removed}</span></div><div class="component-actions">${buttons}</div></div>`;
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
          : escapeHtml(item.store || t("Unknown source"));
        const removeButton = part.offers.length > 1
          ? `<button data-list-act="remove-offer" data-id="${escapeAttr(part.id)}" data-offer="${escapeAttr(item.id)}" title="${escapeAttr(t("Remove offer"))}">×</button>`
          : "";
        const recordLabel = t(item.history.length === 1 ? "price record" : "price records");
        line.innerHTML = `<div><span class="offer-name"><span class="offer-origin ${item.source === "experimental-web-search" ? "offer-origin-search" : "offer-origin-manual"}">${escapeHtml(t(item.source === "experimental-web-search" ? "From search" : "Manual"))}</span>${name}<span class="condition">${escapeHtml(t(item.condition || "New"))}</span></span><span class="offer-meta">${item.history.length} ${escapeHtml(recordLabel)}${bestOffer ? ` · ${escapeHtml(t("Best price"))}` : ""}</span></div><div class="offer-price ${bestOffer ? "best" : ""}">${item.price == null ? "undefined" : money(item.price)}</div><div class="offer-controls"><button data-list-act="log" data-id="${escapeAttr(part.id)}" data-offer="${escapeAttr(item.id)}">${escapeHtml(t("Log price"))}</button>${removeButton}</div>`;
        offerList.append(line);
      });
      row.append(offerList);
    } else {
      const bestLabel = offer ? `${money(offer.price)} · ${offer.store || t("Unknown source")}` : t("No price saved");
      row.querySelector(".part-title span").textContent += ` · ${bestLabel}`;
    }
    list.append(row);
  }
}
