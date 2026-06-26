import { normalizeDoi, normalizeIsbn, normalizeIssn, normalizePunctuation, normalizeWhitespace } from "./normalize.js";

const KNOWN_STYLES = {
  apa: "APA",
  ieee: "IEEE",
  mla: "MLA",
  chicago: "Chicago",
  vancouver: "Vancouver"
};

export function splitReferences(input) {
  const normalized = prepareBibliographyText(input);
  if (!normalized) return [];

  const numbered = splitNumberedBibliography(normalized);
  if (numbered.length > 1) return numbered;

  const doiBounded = splitByDoiBoundaries(normalized);
  if (doiBounded.length > 1) return doiBounded;

  const doiDelimited = splitDoiDelimitedBibliography(normalized);
  if (doiDelimited.length > 1) return doiDelimited;

  const authorYear = splitByAuthorYearBoundaries(normalized);
  if (authorYear.length > 1) return authorYear;

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (blocks.length > 1) return blocks;

  return normalized
    .split(/\n(?=(?:\[\d+\]|\d+\.|\w[\w'.-]+,\s+[A-Z]))/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function prepareBibliographyText(input) {
  return normalizeBrokenDoiText(removeNumericRuns(normalizePunctuation(input).replace(/\r\n/g, "\n"))).trim();
}

function removeNumericLineRuns(text) {
  const lines = text.split("\n");
  const removeIndexes = new Set();
  let runStart = -1;

  for (let index = 0; index <= lines.length; index += 1) {
    const isNumericLine = index < lines.length && /^\s*\d{1,6}\s*$/.test(lines[index]);
    if (isNumericLine && runStart === -1) runStart = index;
    if ((!isNumericLine || index === lines.length) && runStart !== -1) {
      const runEnd = index - 1;
      const runLength = runEnd - runStart + 1;
      if (runLength >= 3) {
        for (let i = runStart; i <= runEnd; i += 1) removeIndexes.add(i);
      }
      runStart = -1;
    }
  }

  return lines.filter((_, index) => !removeIndexes.has(index)).join("\n");
}

function removeNumericRuns(text) {
  return removeNumericLineRuns(text)
    .replace(/(?:^|\s)(?:\d{2,6}\s+){8,}\d{2,6}(?=\s|$)/g, " ");
}

function normalizeBrokenDoiText(text) {
  return text
    .replace(/https:\s*\/\s*\/\s*doi\s*\.?\s*org\s*\/\s*/gi, "https://doi.org/")
    .replace(/http:\s*\/\s*\/\s*doi\s*\.?\s*org\s*\/\s*/gi, "http://doi.org/")
    .replace(/doi\s*\.?\s*org\s*\/\s*/gi, "doi.org/")
    .replace(/https?:\s*\/\s*\/\s*/gi, (match) => match.toLowerCase().startsWith("http:") ? "http://" : "https://")
    .replace(/\b(10\.\d{4,9}\/)\s+/gi, "$1");
}

function splitByDoiBoundaries(text) {
  const flattened = normalizeWhitespace(text);
  const doiPattern = /(?:https?:\/\/doi\.org\/|doi\.org\/)?10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi;
  const matches = [...flattened.matchAll(doiPattern)];
  if (matches.length <= 1) return [];

  const refs = [];
  let start = 0;
  for (const match of matches) {
    const end = match.index + match[0].length;
    const ref = normalizeReferenceForSplit(flattened.slice(start, end));
    if (hasBibliographicSignal(ref)) refs.push(ref);
    start = end;
    while (/[.\s,;]/.test(flattened[start] || "")) start += 1;
  }

  const tail = normalizeReferenceForSplit(flattened.slice(start));
  if (hasBibliographicSignal(tail)) refs.push(tail);
  return refs;
}

function splitByAuthorYearBoundaries(text) {
  const flattened = normalizeWhitespace(text);
  const starts = findAuthorYearStarts(flattened);
  if (starts.length <= 1) return [];

  const refs = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : flattened.length;
    const ref = normalizeReferenceForSplit(flattened.slice(start, end));
    if (hasBibliographicSignal(ref) || ref.length > 80) refs.push(ref);
  }
  return refs.length > 1 ? refs : [];
}

function findAuthorYearStarts(text) {
  const starts = new Set([0]);
  const pattern = /(?:^|[\s.;])([A-Z][\p{L}\p{M}`'~.-]{1,32}(?:\s*,?\s*[A-Z][\p{L}\p{M}`'~.-]{0,32}){0,8}\s*,?\s*(?:et\s*al|etal)?\s*\((?:18|19|20)\d{2}\)|[A-Z][\p{L}\p{M}`'~.-]{1,32}(?:[A-Z][\p{L}\p{M}`'~.-]{1,32}|,\s*[A-Z][\p{L}\p{M}`'~.-]{1,32}){0,8}\s*,?\s*(?:et\s*al|etal)?\s*\((?:18|19|20)\d{2}\))/giu;
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[0].length - match[1].length;
    if (start > 0) starts.add(start);
  }
  return [...starts].sort((a, b) => a - b);
}

function splitDoiDelimitedBibliography(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const refs = [];
  let current = [];

  for (const line of lines) {
    if (current.length && hasDoiLikeText(current.join(" ")) && looksLikeAuthorYearStart(line)) {
      refs.push(normalizeReferenceForSplit(current.join(" ")));
      current = [];
    }
    current.push(line);
  }

  if (current.length) refs.push(normalizeReferenceForSplit(current.join(" ")));
  return refs.filter((ref) => hasBibliographicSignal(ref));
}

function hasDoiLikeText(value) {
  return /\b10\.\d{4,9}\//i.test(value) || /doi\s*\.?\s*org/i.test(value);
}

function looksLikeAuthorYearStart(line) {
  const head = line.slice(0, 220);
  return /^[A-Z][\p{L}\p{M}~`'., -]{1,120}(?:\(|,?\s*etal|,?\s*et\s*al|[A-Z]\()\s*(?:18|19|20)\d{2}\)?/iu.test(head) ||
    /^[A-Z][\p{L}\p{M}~`'., -]{1,180}\((?:18|19|20)\d{2}\)/iu.test(head);
}

function hasBibliographicSignal(ref) {
  return /\b(18|19|20)\d{2}\b/.test(ref) && (hasDoiLikeText(ref) || /\b(journal|chem|science|methods|materials|transactions|springer|wiley|elsevier|proceedings)\b/i.test(ref));
}

function normalizeReferenceForSplit(value) {
  return normalizeWhitespace(value)
    .replace(/https:\s*\/\/\s*/gi, "https://")
    .replace(/https:\s+\/\//gi, "https://")
    .replace(/doi\.\s*org/gi, "doi.org")
    .replace(/\b(10\.\d{4,9}\/)\s+/gi, "$1");
}

function splitNumberedBibliography(text) {
  const boundary = /(^|\n)\s*(?:\[\d+\]|\d{1,3}\.?)\s*(?=[A-Z][\p{L}.'-]*(?:\s|,|\.))/gu;
  const matches = [...text.matchAll(boundary)];
  if (matches.length <= 1) return [];

  return matches.map((match, index) => {
    const start = match.index + (match[1] ? match[1].length : 0);
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return normalizeWhitespace(text.slice(start, end));
  }).filter(Boolean);
}

export function parseReference(reference) {
  const text = normalizeWhitespace(normalizeBrokenDoiText(normalizePunctuation(reference)));
  const doi = normalizeDoi(text);
  const isbn = extractIsbn(text);
  const issn = extractIssn(text);
  const arxiv = extractArxiv(text);
  const pmid = extractPmid(text);
  const year = extractYear(text);
  const authors = extractAuthors(text);
  const title = extractTitle(text, authors, year);
  const container = extractContainer(text, title);
  const volume = matchFirst(text, /\b(?:vol\.?|volume)\s*([A-Za-z0-9.-]+)/i) || matchFirst(text, /\b(\d{1,4})\s*\(\s*\d{1,4}\s*\)/);
  const issue = matchFirst(text, /\b(?:no\.?|issue)\s*([A-Za-z0-9.-]+)/i) || matchFirst(text, /\b\d{1,4}\s*\(\s*(\d{1,4})\s*\)/);
  const pages = matchFirst(text, /\b(?:pp\.?|pages?)\s*([A-Za-z]?\d{1,6}\s*-\s*[A-Za-z]?\d{1,6})/i) || matchFirst(text, /[:,]\s*([A-Za-z]?\d{1,6}\s*-\s*[A-Za-z]?\d{1,6})\b/);
  const articleNumber = matchFirst(text, /\b(?:article|art\.?|e-location-id)\s*[:#]?\s*([A-Za-z]?\d{3,})/i);
  const publisher = extractPublisher(text);
  const styleGuess = guessStyle(text);

  return {
    raw: text,
    authors,
    title,
    year,
    container,
    publisher,
    volume,
    issue,
    pages,
    articleNumber,
    doi,
    isbn,
    issn,
    pmid,
    arxiv,
    styleGuess,
    typeGuess: guessType(text, { isbn, arxiv, pmid, container })
  };
}

function matchFirst(text, pattern) {
  const match = text.match(pattern);
  return match ? normalizeWhitespace(match[1]) : "";
}

function extractYear(text) {
  const match = text.match(/\b(18|19|20)\d{2}[a-z]?\b/);
  return match ? match[0].slice(0, 4) : "";
}

function extractAuthors(text) {
  const beforeYear = text.split(/\b(?:18|19|20)\d{2}[a-z]?\b/)[0] || text.slice(0, 160);
  const cleaned = beforeYear
    .replace(/^\s*(?:\[\d+\]|\d+\.?)\s*/, "")
    .replace(/\bet al\.?/i, "")
    .replace(/\s+and\s+/gi, "; ")
    .replace(/\s*&\s*/g, "; ");

  const candidates = cleaned
    .split(/\s*;\s*|\s*,\s+(?=[A-Z][A-Za-z'-]+,\s*[A-Z])|\s+(?=[A-Z][A-Za-z'-]+,\s*[A-Z]\.)/)
    .map((part) => part.replace(/[()]/g, "").trim())
    .filter((part) => /[A-Za-z]/.test(part));

  const authors = [];
  for (const candidate of candidates) {
    const short = candidate.replace(/\.$/, "");
    if (short.length > 80) continue;
    if (/\b(journal|conference|press|university|proceedings)\b/i.test(short)) continue;
    authors.push(short);
  }
  return authors.slice(0, 20);
}

function extractTitle(text, authors, year) {
  const quoted = text.match(/"([^"]{8,220})"/);
  if (quoted) return normalizeWhitespace(quoted[1]);

  const afterYear = year ? text.slice(text.indexOf(year) + year.length) : text;
  const segments = afterYear
    .replace(/^\)?[.,:\s]+/, "")
    .split(/\.\s+|"\s*,/)
    .map((part) => normalizeWhitespace(part.replace(/^["']|["']$/g, "")))
    .filter((part) => part.length > 8);

  const title = segments.find((part) => !looksLikeContainer(part) && !/^(doi|isbn|issn|pmid|arxiv)\b/i.test(part));
  if (title) return title.replace(/[.,;:]$/, "");

  const authorPrefix = authors.length ? authors[0] : "";
  const withoutAuthors = authorPrefix ? text.replace(authorPrefix, "") : text;
  return normalizeWhitespace(withoutAuthors.split(".").find((part) => part.length > 12) || "");
}

function extractContainer(text, title) {
  const lowerTitle = title.toLowerCase();
  const titleIndex = lowerTitle ? text.toLowerCase().indexOf(lowerTitle) : -1;
  const afterTitle = titleIndex >= 0 ? text.slice(titleIndex + title.length) : text;
  const candidates = afterTitle
    .split(/\.\s+|,\s+/)
    .map((part) => normalizeWhitespace(part.replace(/^[,.:;]\s*/, "")))
    .filter((part) => part.length >= 3 && part.length <= 140);

  const container = candidates.find((part) => looksLikeContainer(part));
  return container ? container.replace(/[.,;:]$/, "") : "";
}

function extractPublisher(text) {
  const match = text.match(/\b([A-Z][A-Za-z&.\s-]{2,80}(?:Press|Publisher|Publishers|Publishing|University Press|Books|Verlag))\b/);
  return match ? normalizeWhitespace(match[1]) : "";
}

function extractPmid(text) {
  return matchFirst(text, /\bPMID\s*:?\s*(\d{6,10})\b/i);
}

function extractIsbn(text) {
  const match = text.match(/\bISBN(?:-1[03])?\s*:?\s*((?:97[89][-\s]?)?(?:\d[-\s]?){9,12}[\dXx])\b/i);
  return match ? normalizeIsbn(match[1]) : "";
}

function extractIssn(text) {
  const match = text.match(/\bISSN\s*:?\s*(\d{4}-?\d{3}[\dXx])\b/i);
  return match ? normalizeIssn(match[1]) : "";
}

function extractArxiv(text) {
  return matchFirst(text, /\barXiv\s*:?\s*([a-z.-]+\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?\b/i);
}

function looksLikeContainer(value) {
  return /\b(journal|proceedings|conference|transactions|letters|review|annals|science|nature|lancet|jama|ieee|acm|press|publisher|university|arxiv)\b/i.test(value);
}

function guessStyle(text) {
  if (/^\s*\[\d+\]/.test(text)) return "IEEE";
  if (/\(\d{4}[a-z]?\)/.test(text)) return "APA";
  if (/\bdoi:/i.test(text)) return "APA";
  if (/\bPMID:/i.test(text)) return "Vancouver";
  return KNOWN_STYLES.apa;
}

function guessType(text, parsed) {
  if (parsed.arxiv) return "preprint";
  if (parsed.pmid) return "article";
  if (parsed.isbn) return "book";
  if (/\b(thesis|dissertation)\b/i.test(text)) return "thesis";
  if (/\b(report|technical report|white paper)\b/i.test(text)) return "report";
  if (/\b(proceedings|conference|symposium)\b/i.test(text)) return "conference-paper";
  return parsed.container ? "article" : "unknown";
}
