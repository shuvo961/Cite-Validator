import { fetchJson } from "./http.js";

export async function searchEuropePmc(parsed) {
  const parts = [];
  if (parsed.pmid) parts.push(`EXT_ID:${parsed.pmid}`);
  if (parsed.doi) parts.push(`DOI:"${parsed.doi}"`);
  if (parsed.title) parts.push(`TITLE:"${parsed.title}"`);
  if (parsed.authors?.[0]) parts.push(`AUTH:"${parsed.authors[0]}"`);
  if (!parts.length) return [];

  const params = new URLSearchParams({
    query: parts.join(" "),
    format: "json",
    pageSize: "5",
    resultType: "core"
  });
  const response = await fetchJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`);
  return (response.data?.resultList?.result || []).map(mapEuropePmc);
}

function mapEuropePmc(item) {
  return {
    source: "europepmc-search",
    sourceName: "Europe PMC",
    sourceReliability: 0.88,
    type: "article",
    title: item.title || "",
    authors: item.authorString ? item.authorString.split(/\s*,\s*/).filter(Boolean) : [],
    year: item.pubYear || "",
    container: item.journalTitle || "",
    publisher: "",
    volume: item.journalVolume || "",
    issue: item.issue || "",
    pages: item.pageInfo || "",
    articleNumber: "",
    doi: item.doi || "",
    isbn: "",
    issn: item.journalIssn || "",
    pmid: item.pmid || "",
    url: item.doi ? `https://doi.org/${item.doi}` : item.pmid ? `https://europepmc.org/article/MED/${item.pmid}` : "",
    raw: item
  };
}
