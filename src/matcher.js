import {
  authorLastName,
  includesLoose,
  jaccard,
  normalizeAuthorName,
  normalizeContainer,
  normalizeDoi,
  normalizeIsbn,
  normalizeTitle
} from "./normalize.js";

const FIELD_WEIGHTS = {
  title: 0.27,
  authors: 0.18,
  year: 0.11,
  container: 0.11,
  doi: 0.14,
  isbn: 0.08,
  volume: 0.04,
  issue: 0.03,
  pages: 0.04
};

export function selectBestMatch(parsed, candidates) {
  if (!candidates.length) {
    return {
      best: null,
      score: 0,
      fieldComparisons: [],
      mismatches: ["No authoritative metadata record was found."],
      alternatives: []
    };
  }

  const scored = candidates
    .map((candidate) => {
      const fieldComparisons = compareFields(parsed, candidate);
      const score = calculateMatchScore(fieldComparisons, candidate.sourceReliability);
      return { candidate, score, fieldComparisons };
    })
    .sort((a, b) => b.score - a.score);

  const winner = scored[0];
  return {
    best: winner.candidate,
    score: winner.score,
    fieldComparisons: winner.fieldComparisons,
    mismatches: winner.fieldComparisons
      .filter((field) => field.severity === "mismatch")
      .map((field) => `${field.label}: provided "${field.provided || "missing"}", source has "${field.source || "missing"}".`),
    alternatives: scored.slice(1, 4).map(({ candidate, score }) => ({
      sourceName: candidate.sourceName,
      title: candidate.title,
      doi: candidate.doi,
      url: candidate.url,
      score: round(score)
    }))
  };
}

export function compareFields(parsed, record) {
  return [
    compareText("title", "Title", parsed.title, record.title, { highPrecision: true }),
    compareAuthors(parsed.authors || [], record.authors || []),
    compareExact("year", "Publication year", parsed.year, record.year),
    compareContainer(parsed.container, record.container),
    compareIdentifier("doi", "DOI", parsed.doi, record.doi, normalizeDoi),
    compareIdentifier("isbn", "ISBN", parsed.isbn, record.isbn, normalizeIsbn),
    compareExact("volume", "Volume", parsed.volume, record.volume),
    compareExact("issue", "Issue", parsed.issue, record.issue),
    compareText("pages", "Page range / article pages", parsed.pages || parsed.articleNumber, record.pages || record.articleNumber)
  ];
}

export function calculateMatchScore(fields, reliability = 0.8) {
  let score = 0;
  let availableWeight = 0;
  for (const field of fields) {
    const weight = FIELD_WEIGHTS[field.field] || 0.02;
    if (field.severity === "not-provided") continue;
    availableWeight += weight;
    score += weight * field.score;
  }
  if (!availableWeight) return 0;
  return round((score / availableWeight) * reliability);
}

function compareText(field, label, provided = "", source = "", options = {}) {
  if (!provided && !source) return comparison(field, label, provided, source, "not-provided", 0.5, "No value was provided or found.");
  if (!provided) return comparison(field, label, provided, source, "not-provided", 0.45, "The user reference omitted this field.");
  if (!source) return comparison(field, label, provided, source, "source-missing", 0.4, "The matched source does not expose this field.");
  const score = options.highPrecision ? Math.max(jaccard(provided, source), includesLoose(provided, source) ? 0.86 : 0) : jaccard(provided, source);
  if (score >= 0.86) return comparison(field, label, provided, source, "match", score, "Values agree.");
  if (score >= 0.62) return comparison(field, label, provided, source, "partial", score, "Values are similar but not identical.");
  return comparison(field, label, provided, source, "mismatch", score, "Values do not appear to describe the same field.");
}

function compareContainer(provided = "", source = "") {
  if (!provided && !source) return comparison("container", "Journal / conference", provided, source, "not-provided", 0.5, "No journal or conference was provided or found.");
  if (!provided) return comparison("container", "Journal / conference", provided, source, "not-provided", 0.45, "The user reference omitted this field.");
  if (!source) return comparison("container", "Journal / conference", provided, source, "source-missing", 0.4, "The matched source does not expose this field.");
  const score = Math.max(jaccard(normalizeContainer(provided), normalizeContainer(source)), includesLoose(provided, source) ? 0.82 : 0);
  if (score >= 0.8) return comparison("container", "Journal / conference", provided, source, "match", score, "Container names agree.");
  if (score >= 0.55) return comparison("container", "Journal / conference", provided, source, "partial", score, "Container names are similar.");
  return comparison("container", "Journal / conference", provided, source, "mismatch", score, "Container names differ.");
}

function compareAuthors(provided = [], source = []) {
  if (!provided.length && !source.length) {
    return comparison("authors", "Author names and order", "", "", "not-provided", 0.5, "No author names were provided or found.");
  }
  if (!provided.length) {
    return comparison("authors", "Author names and order", "", source.join("; "), "not-provided", 0.45, "The user reference omitted authors.");
  }
  if (!source.length) {
    return comparison("authors", "Author names and order", provided.join("; "), "", "source-missing", 0.4, "The matched source does not expose authors.");
  }

  const max = Math.min(provided.length, source.length, 8);
  let orderedMatches = 0;
  for (let i = 0; i < max; i += 1) {
    const p = normalizeAuthorName(provided[i]);
    const s = normalizeAuthorName(source[i]);
    if (p && s && (p === s || authorLastName(p) === authorLastName(s))) orderedMatches += 1;
  }
  const firstAuthorMatch = authorLastName(provided[0]) && authorLastName(provided[0]) === authorLastName(source[0]);
  const coverage = orderedMatches / Math.max(provided.length, source.length, 1);
  const score = Math.max(coverage, firstAuthorMatch ? 0.66 : 0);

  if (score >= 0.78) return comparison("authors", "Author names and order", provided.join("; "), source.join("; "), "match", score, "Author names and order agree.");
  if (score >= 0.45) return comparison("authors", "Author names and order", provided.join("; "), source.join("; "), "partial", score, "Some authors match, but order or list length differs.");
  return comparison("authors", "Author names and order", provided.join("; "), source.join("; "), "mismatch", score, "Author names do not align with the source metadata.");
}

function compareExact(field, label, provided = "", source = "") {
  const p = String(provided || "").trim();
  const s = String(source || "").trim();
  if (!p && !s) return comparison(field, label, p, s, "not-provided", 0.5, "No value was provided or found.");
  if (!p) return comparison(field, label, p, s, "not-provided", 0.45, "The user reference omitted this field.");
  if (!s) return comparison(field, label, p, s, "source-missing", 0.4, "The matched source does not expose this field.");
  if (p.toLowerCase() === s.toLowerCase()) return comparison(field, label, p, s, "match", 1, "Values agree.");
  return comparison(field, label, p, s, "mismatch", 0, "Values differ.");
}

function compareIdentifier(field, label, provided = "", source = "", normalizer = (x) => String(x || "").toLowerCase()) {
  const p = normalizer(provided);
  const s = normalizer(source);
  if (!p && !s) return comparison(field, label, provided, source, "not-provided", 0.5, "No identifier was provided or found.");
  if (!p) return comparison(field, label, provided, source, "not-provided", 0.45, "The user reference omitted this identifier.");
  if (!s) return comparison(field, label, provided, source, "source-missing", 0.35, "The matched source does not expose this identifier.");
  if (p === s) return comparison(field, label, provided, source, "match", 1, "Identifiers agree.");
  return comparison(field, label, provided, source, "mismatch", 0, "Identifier belongs to a different metadata record or is malformed.");
}

function comparison(field, label, provided, source, severity, score, note) {
  return { field, label, provided: provided || "", source: source || "", severity, score: round(score), note };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
