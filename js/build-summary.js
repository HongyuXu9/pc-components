import { formatCurrency, t } from "./i18n.js";
import { searchSummaryParts } from "./summary-search.js";
import { groupBuildParts } from "./build-sections.js";

export function buildSummary(components, getOffer, collection = "build", query = "") {
  const isWatchlist = collection === "watchlist";
  const keywords = query.match(/[\p{L}\p{N}]+/gu) || [];
  const matching = searchSummaryParts(components, keywords.length ? query : "");
  let total = 0;
  let missingPrices = 0;
  const lines = matching.map((match) => {
    const { part, name } = match;
    const offer = getOffer(part);
    const price = offer ? Number(offer.price) : NaN;
    const priced = Number.isFinite(price);
    if (priced) total += price;
    else missingPrices++;
    return { ...match, text: `${name} — ${priced ? formatCurrency(price) : t("Price unavailable")}` };
  });
  const emptyMessage = keywords.length && components.length
    ? isWatchlist ? "No watchlist components match your search." : "No build components match your search."
    : isWatchlist ? "Your watchlist is empty." : "Your build is empty.";
  const displayLines = [
    { text: t(isWatchlist ? "Watchlist summary" : "Build summary") },
    { text: "" },
  ];
  if (!lines.length) displayLines.push({ text: t(emptyMessage) });
  if (isWatchlist) {
    displayLines.push(...lines, { text: "" });
  } else {
    const byPart = new Map(lines.map((line) => [line.part, line]));
    for (const group of groupBuildParts(lines.map((line) => line.part))) {
      displayLines.push(
        { text: `${t(group.category)}:`, kind: "category" },
        ...group.parts.map((part) => byPart.get(part)),
        { text: "" },
      );
    }
  }
  displayLines.push({ text: `${t(keywords.length ? "Filtered total" : "Total")}: ${formatCurrency(total)}` });
  if (missingPrices) displayLines.push({ text: t("Components without a price are excluded from the total.") });
  const text = displayLines.map((line) => line.text).join("\n");
  return { text, total, count: matching.length, lines, displayLines };
}
