function normalize(text) {
  return String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// Damerau-Levenshtein also counts adjacent transposed letters as one typo.
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

export function matchKeyword(text, keyword) {
  const query = normalize(keyword);
  if (!query) return null;
  let best = null;
  for (const token of String(text).matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    const word = normalize(token[0]);
    const index = word.indexOf(query);
    if (index >= 0) {
      // Map normalized offsets back to the original spelling for highlighting.
      const offsets = [];
      let offset = 0;
      for (const character of token[0]) {
        for (const ignored of normalize(character)) offsets.push(offset);
        offset += character.length;
      }
      const start = token.index + offsets[index];
      const end = token.index + (offsets[index + query.length] ?? token[0].length);
      const score = word === query ? 0 : index === 0 ? 1 : 2;
      const range = [start, end];
      if (!best || score < best.score) best = { score, ranges: [range] };
      else if (score === best.score) best.ranges.push(range);
      continue;
    }
    // Short abbreviations may skip up to two letters near the start of a name:
    // "te" also finds "Themight", while literal matches still rank first.
    if (query.length >= 2 && query.length <= 3 && !/\d/.test(query) && !/\d/.test(word) && word.startsWith(query[0])) {
      const ranges = [[token.index, token.index + 1]];
      let cursor = 1;
      for (const letter of query.slice(1)) {
        const next = word.indexOf(letter, cursor);
        if (next < 0 || next - cursor > 2) break;
        ranges.push([token.index + next, token.index + next + 1]);
        cursor = next + 1;
      }
      if (ranges.length === query.length && (!best || best.score > 3)) best = { score: 3, ranges };
    }
    // Short fragments and model numbers do not use edit-distance correction.
    if (query.length < 4 || /\d/.test(query) || /\d/.test(word) || word.length < 4) continue;
    const tolerance = query.length >= 7 ? 2 : 1;
    if (word.length < query.length - tolerance) continue;
    let edits = tolerance + 1;
    for (let length = Math.max(1, query.length - tolerance); length <= Math.min(word.length, query.length + tolerance); length++) {
      edits = Math.min(edits, distance(query, word.slice(0, length)));
    }
    const score = 3 + edits;
    if (edits <= tolerance && (!best || score < best.score)) {
      best = { score, ranges: [[token.index, token.index + token[0].length]] };
    }
  }
  return best;
}

export function searchSummaryParts(parts, query) {
  const keywords = normalize(query).match(/[\p{L}\p{N}]+/gu) || [];
  return parts.map((part) => {
    const name = String(part.name).replace(/\s+/g, " ").trim();
    const context = [part.category, ...part.offers.map((offer) => offer.store)].filter(Boolean).join(" · ");
    const ranges = [], contextRanges = [];
    let score = 0;
    for (const keyword of keywords) {
      const nameMatch = matchKeyword(name, keyword);
      const contextMatch = matchKeyword(context, keyword);
      if (!nameMatch && !contextMatch) return null;
      if (nameMatch && (!contextMatch || nameMatch.score <= contextMatch.score)) {
        score += nameMatch.score;
        ranges.push(...nameMatch.ranges);
      } else {
        score += contextMatch.score;
        contextRanges.push(...contextMatch.ranges);
      }
    }
    return { part, name, score, ranges, context: contextRanges.length ? context : "", contextRanges };
  }).filter(Boolean).sort((a, b) => a.score - b.score);
}

export function appendHighlightedText(element, text, ranges = []) {
  const merged = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  let cursor = 0;
  for (const [start, end] of merged) {
    element.append(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, end);
    element.append(mark);
    cursor = end;
  }
  element.append(document.createTextNode(text.slice(cursor)));
}
