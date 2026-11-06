export function renderSavedCollection(
  items,
  list,
  collection,
  { components, selectedWatchlistOfferId, getOffer, money, escapeHtml, escapeAttr },
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
