const $ = (id) => document.getElementById(id);

export function storeNameFromUrl(rawUrl) {
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
export function componentNameKey(name) {
  return String(name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

export function syncStoreName(urlId, storeId) {
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

export function bindStoreUrl(urlId, storeId) {
  const url = $(urlId);
  const store = $(storeId);
  store.addEventListener("input", () => {
    store.dataset.userEdited =
      store.value.trim() !== (store.dataset.autoStore || "") ? "true" : "false";
  });
  url.addEventListener("input", () => syncStoreName(urlId, storeId));
  url.addEventListener("change", () => syncStoreName(urlId, storeId));
}

export function resolveStoreName(store, url) {
  const current = String(store || "").trim();
  if (current && current.toLowerCase() !== "unknown store") return current;
  return storeNameFromUrl(String(url || "")) || "Unknown source";
}

export function migrate(data) {
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

export function guessCategory(name) {
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

export function parsePrice(raw) {
  const value = raw.replace(/\s/g, "");
  const decimalAt = Math.max(value.lastIndexOf(","), value.lastIndexOf("."));
  const whole = value.slice(0, decimalAt).replace(/[^\d]/g, "");
  const cents = value.slice(decimalAt + 1).replace(/[^\d]/g, "");
  return cents.length === 2 ? Number(whole + "." + cents) : NaN;
}

export function extractProducts(ocrLines) {
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
