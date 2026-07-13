export function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizePunctuation(value = "") {
  return String(value)
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-");
}

export function normalizeTitle(value = "") {
  return normalizeWhitespace(normalizePunctuation(value))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(a|an|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeContainer(value = "") {
  return normalizeTitle(value)
    .replace(/\b(journal|proceedings|transactions|conference|international|symposium)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDoi(value = "") {
  const match = String(value).match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match ? match[0].replace(/[.,;)\]]+$/, "").toLowerCase() : "";
}

export function normalizeIsbn(value = "") {
  const match = String(value).match(/(?:97[89][-\s]?)?(?:\d[-\s]?){9,12}[\dXx]/);
  return match ? match[0].replace(/[-\s]/g, "").toUpperCase() : "";
}

export function normalizeIssn(value = "") {
  const match = String(value).match(/\b\d{4}-?\d{3}[\dXx]\b/);
  return match ? match[0].replace(/(.{4})(.{4})/, "$1-$2").toUpperCase() : "";
}

export function normalizeAuthorName(value = "") {
  const cleaned = normalizeWhitespace(normalizePunctuation(value))
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z\s,-]/g, "")
    .trim();
  if (cleaned.includes(",")) {
    const [last, first = ""] = cleaned.split(",").map((part) => part.trim());
    return `${last} ${first}`.trim();
  }
  return cleaned;
}

export function authorLastName(value = "") {
  const normalized = normalizeAuthorName(value);
  if (!normalized) return "";
  return normalized.split(/\s+/)[0];
}

export function tokenSet(value = "") {
  return new Set(normalizeTitle(value).split(/\s+/).filter(Boolean));
}

export function jaccard(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

export function includesLoose(a, b) {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}
