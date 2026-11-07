import { formatCurrency, t } from "./i18n.js";

export function buildSummary(components, getOffer, collection = "build") {
  const isWatchlist = collection === "watchlist";
  let total = 0;
  let missingPrices = 0;
  const lines = components.map((part) => {
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
    ...(lines.length ? lines : [t(isWatchlist ? "Your watchlist is empty." : "Your build is empty.")]),
    "",
    `${t("Total")}: ${formatCurrency(total)}`,
    ...(missingPrices ? [t("Components without a price are excluded from the total.")] : []),
  ].join("\n");
  return { text, total };
}
