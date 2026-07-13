import { fetchJson } from "./http.js";

export async function searchDataCite(parsed) {
  const results = [];
  if (parsed.doi) {
    const byDoi = await fetchJson(`https://api.datacite.org/dois/${encodeURIComponent(parsed.doi)}`);
    if (byDoi.ok && byDoi.data?.data) results.push(mapDataCite(byDoi.data.data, "datacite-doi"));
  }

  const query = [parsed.title, parsed.authors?.[0], parsed.year].filter(Boolean).join(" ");
  if (query) {
    const params = new URLSearchParams({ query, "page[size]": "5" });
    const searched = await fetchJson(`https://api.datacite.org/dois?${params}`);
    for (const item of searched.data?.data || []) results.push(mapDataCite(item, "datacite-search"));
  }
  return results.filter(Boolean);
}

function mapDataCite(item, source) {
  const attr = item.attributes || {};
  const creators = attr.creators || [];
  return {
    source,
    sourceName: "DataCite",
    sourceReliability: 0.9,
    type: attr.types?.bibtex || attr.types?.resourceTypeGeneral || "",
    title: attr.titles?.[0]?.title || "",
    authors: creators.map((creator) => creator.name).filter(Boolean),
    year: attr.publicationYear ? String(attr.publicationYear) : "",
    container: attr.container?.title || "",
    publisher: attr.publisher || "",
    volume: attr.container?.volume || "",
    issue: attr.container?.issue || "",
    pages: attr.container?.firstPage && attr.container?.lastPage ? `${attr.container.firstPage}-${attr.container.lastPage}` : "",
    articleNumber: "",
    doi: attr.doi || item.id || "",
    isbn: "",
    issn: "",
    url: attr.url || (attr.doi ? `https://doi.org/${attr.doi}` : ""),
    raw: item
  };
}
