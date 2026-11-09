import searchConfig from "../assets/search-stores.json" with { type: "json" };
import { t, formatCurrency } from "./i18n.js";

const $ = (id) => document.getElementById(id);
export function offerUrlKey(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    const rules = searchConfig.stores.map(item => [item.domain, item.name, new RegExp(item.productPattern, "i")]);
    for (const [domain, store, pattern] of rules) {
      const match = (host === domain || host.endsWith(`.${domain}`)) && url.pathname.match(pattern);
      if (match) return `${store}:${match[1].toUpperCase()}`;
    }
  } catch {}
  return null;
}

export function createOfferSearch({ addVerifiedOffers, reportClientIssue }) {
  let controller = null;
  let previousFocus = null;
  let generation = 0;
  const modal = $("offerSearchModal");
  const status = $("offerSearchStatus");
  function close() {
    generation++;
    controller?.abort();
    controller = null;
    modal.classList.remove("open");
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  $("closeOfferSearch").addEventListener("click", close);
  $("closeOfferSearchResults").addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    if (event.key === "Tab") {
      const controls = [...modal.querySelectorAll('button:not(:disabled), a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  async function open(part, collection = "build") {
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const currentGeneration = ++generation;
    const requestPart = { id: part.id, name: part.name, category: part.category, collection };
    previousFocus = document.activeElement;
    $("offerSearchName").textContent = part.name;
    $("offerSearchResults").replaceChildren();
    $("offerSearchSources").replaceChildren();
    status.textContent = t("Searching stores and second-hand marketplaces…");
    status.setAttribute("aria-busy", "true");
    modal.classList.add("open");
    $("closeOfferSearch").focus();
    reportClientIssue("info", "Offer search started", part.name);
    const timer = setTimeout(() => activeController.abort("timeout"), 180_000);
    try {
      const response = await fetch("/api/search-offers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPart), signal: activeController.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Offer search HTTP ${response.status}`);
      if (currentGeneration !== generation) return;
      const offers = (Array.isArray(result.offers) ? result.offers : []).filter((offer) => offer && offerUrlKey(offer.url));
      const verified = offers.filter((offer) => offer.verified === true && offer.currency === "EUR" && offer.condition === "New" && Number.isFinite(offer.price) && offer.price > 0);
      const added = offers.length ? await addVerifiedOffers(requestPart, offers) : 0;
      if (currentGeneration !== generation) return;
      status.textContent = added === null ? t("Component changed or save failed. No search offers were added.")
        : t("{count} search offers added. Existing offers unchanged.", { count: added });
      if (!offers.length) status.textContent = t("No search offers found. Existing offers were not changed.");
      for (const offer of offers) {
        const row = document.createElement("article");
        row.className = "offer-search-result";
        const label = document.createElement("strong");
        label.textContent = `${offer.store} · ${Number.isFinite(offer.price) ? formatCurrency(offer.price) : "undefined"}`;
        const link = document.createElement("a");
        link.href = offer.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = offer.title || offer.store;
        const note = document.createElement("small");
        note.textContent = `${t("From search")} | ${t(offer.verified === true ? "Verified" : "Needs verification")} | ${t(offer.condition || "Unknown")}`;
        row.append(label, link, note);
        $("offerSearchResults").append(row);
      }
      for (const source of result.searchSources || []) {
        try {
          if (new URL(source.uri).protocol !== "https:") continue;
          const link = document.createElement("a");
          link.href = source.uri; link.target = "_blank"; link.rel = "noopener noreferrer";
          link.textContent = source.title || t("Search source");
          $("offerSearchSources").append(link);
        } catch {}
      }
      reportClientIssue("info", `Offer search completed: ${offers.length} candidates, ${verified.length} verified, ${added ?? 0} added`, requestPart.name);
    } catch (error) {
      if (currentGeneration !== generation) return;
      const message = activeController.signal.aborted ? t("Offer search timed out. Retry from the component button.")
        : `${t("Offer search failed; existing offers were not changed.")} ${t(error.message || String(error))}`;
      status.textContent = message;
      reportClientIssue("warning", message, "Offer search");
    } finally {
      clearTimeout(timer);
      if (currentGeneration === generation) status.setAttribute("aria-busy", "false");
    }
  }
  return { open };
}
