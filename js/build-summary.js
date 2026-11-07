import { formatCurrency, t } from "./i18n.js";

export function buildSummary(components, getOffer, collection = "build", query = "") {
  const isWatchlist = collection === "watchlist";
  const keywords = isWatchlist ? query.trim().toLowerCase().split(/\s+/).filter(Boolean) : [];
  const matching = keywords.length ? components.filter((part) => {
    const searchable = `${part.name} ${part.category || ""} ${part.offers.map((offer) => offer.store || "").join(" ")}`.toLowerCase();
    return keywords.every((word) => searchable.includes(word));
  }) : components;
  let total = 0;
  let missingPrices = 0;
  const lines = matching.map((part) => {
    const offer = getOffer(part);
    const price = offer ? Number(offer.price) : NaN;
    const priced = Number.isFinite(price);
    if (priced) total += price;
    else missingPrices++;
    const name = String(part.name).replace(/\s+/g, " ").trim();
    return `${name} — ${priced ? formatCurrency(price) : t("Price unavailable")}`;
  });
  const text = [
    t(isWatchlist ? "Watchlist summary" : "Build summary"),
    "",
    ...(lines.length ? lines : [t(keywords.length && components.length ? "No watchlist components match your search." : isWatchlist ? "Your watchlist is empty." : "Your build is empty.")]),
    "",
    `${t(keywords.length ? "Filtered total" : "Total")}: ${formatCurrency(total)}`,
    ...(missingPrices ? [t("Components without a price are excluded from the total.")] : []),
  ].join("\n");
  return { text, total, count: matching.length };
}
