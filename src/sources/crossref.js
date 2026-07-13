import { fetchJson } from "./http.js";

export async function searchCrossref(parsed) {
  const results = [];
  if (parsed.doi) {
    const byDoi = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(parsed.doi)}`);
    if (byDoi.ok && byDoi.data?.message) results.push(mapCrossrefWork(byDoi.data.message, "crossref-doi"));
  }

  const bibliographic = [parsed.title, parsed.container, parsed.authors?.[0], parsed.year].filter(Boolean).join(" ");
  if (bibliographic) {
    const params = new URLSearchParams({
      "query.bibliographic": bibliographic,
      rows: "5",
      select: "DOI,title,author,container-title,published-print,published-online,published,publisher,volume,issue,page,article-number,ISSN,ISBN,type,URL"
    });
    const searched = await fetchJson(`https://api.crossref.org/works?${params}`);
    for (const item of searched.data?.message?.items || []) {
      results.push(mapCrossrefWork(item, "crossref-search"));
    }
  }
  return results.filter(Boolean);
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function dateYear(work) {
  const date = work["published-print"] || work["published-online"] || work.published || work.issued;
  return date?.["date-parts"]?.[0]?.[0] ? String(date["date-parts"][0][0]) : "";
}

function mapCrossrefWork(work, source) {
  return {
    source,
    sourceName: "Crossref",
    sourceReliability: 0.96,
    type: work.type || "",
    title: first(work.title) || "",
    authors: (work.author || []).map((author) => [author.family, author.given].filter(Boolean).join(", ")),
    year: dateYear(work),
    container: first(work["container-title"]) || "",
    publisher: work.publisher || "",
    volume: work.volume || "",
    issue: work.issue || "",
    pages: work.page || "",
    articleNumber: work["article-number"] || "",
    doi: work.DOI || "",
    isbn: first(work.ISBN) || "",
    issn: first(work.ISSN) || "",
    url: work.URL || (work.DOI ? `https://doi.org/${work.DOI}` : ""),
    raw: work
  };
}
