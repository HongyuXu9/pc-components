export const BUILD_CATEGORY_ORDER = [
  "CPU", "Cooling", "Motherboard", "RAM", "Storage", "GPU", "Case",
  "Power supply", "Monitor", "Accessories", "Other",
];

export function groupBuildParts(parts, selectedCategory = "") {
  const categoryFor = (part) => BUILD_CATEGORY_ORDER.includes(part.category) ? part.category : "Other";
  const visibleCategories = selectedCategory
    ? [BUILD_CATEGORY_ORDER.includes(selectedCategory) ? selectedCategory : "Other"]
    : BUILD_CATEGORY_ORDER;
  return visibleCategories.map((category) => ({
    category,
    parts: parts.filter((part) => categoryFor(part) === category),
  }));
}
