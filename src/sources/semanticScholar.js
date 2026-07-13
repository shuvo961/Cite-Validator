import { fetchJson } from "./http.js";

export async function searchSemanticScholar(parsed) {
  const headers = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const fields = "title,authors,year,venue,publicationVenue,journal,externalIds,url,publicationTypes";
  const results = [];

  if (parsed.doi || parsed.arxiv || parsed.pmid) {
    const id = parsed.doi ? `DOI:${parsed.doi}` : parsed.arxiv ? `ARXIV:${parsed.arxiv}` : `PMID:${parsed.pmid}`;
    const byId = await fetchJson(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=${fields}`, { headers });
    if (byId.ok && byId.data?.paperId) results.push(mapSemanticScholar(byId.data, "semantic-scholar-id"));
  }

  if (parsed.title) {
    const params = new URLSearchParams({ query: parsed.title, limit: "5", fields });
    const searched = await fetchJson(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`, { headers });
    for (const item of searched.data?.data || []) results.push(mapSemanticScholar(item, "semantic-scholar-search"));
  }
  return results.filter(Boolean);
}

function mapSemanticScholar(item, source) {
  return {
    source,
    sourceName: "Semantic Scholar",
    sourceReliability: 0.86,
    type: item.publicationTypes?.[0] || "",
    title: item.title || "",
    authors: (item.authors || []).map((author) => author.name).filter(Boolean),
    year: item.year ? String(item.year) : "",
    container: item.journal?.name || item.publicationVenue?.name || item.venue || "",
    publisher: "",
    volume: item.journal?.volume || "",
    issue: item.journal?.issue || "",
    pages: item.journal?.pages || "",
    articleNumber: "",
    doi: item.externalIds?.DOI || "",
    isbn: "",
    issn: "",
    pmid: item.externalIds?.PubMed || "",
    arxiv: item.externalIds?.ArXiv || "",
    url: item.url || "",
    raw: item
  };
}
