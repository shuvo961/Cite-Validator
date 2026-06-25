import { fetchJson } from "./http.js";

export async function resolveDoi(parsed) {
  if (!parsed.doi) return [];
  const response = await fetchJson(`https://doi.org/${encodeURIComponent(parsed.doi)}`, {
    headers: { accept: "application/vnd.citationstyles.csl+json" }
  });
  if (!response.ok || !response.data?.title) return [];
  const item = response.data;
  return [{
    source: "doi-csl",
    sourceName: "DOI.org",
    sourceReliability: 0.94,
    type: item.type || "",
    title: item.title || "",
    authors: (item.author || []).map((author) => [author.family, author.given].filter(Boolean).join(", ")),
    year: String(item.issued?.["date-parts"]?.[0]?.[0] || ""),
    container: item["container-title"] || "",
    publisher: item.publisher || "",
    volume: item.volume || "",
    issue: item.issue || "",
    pages: item.page || "",
    articleNumber: item.number || "",
    doi: item.DOI || parsed.doi,
    isbn: item.ISBN || "",
    issn: item.ISSN || "",
    url: item.URL || `https://doi.org/${parsed.doi}`,
    raw: item
  }];
}
