import { fetchJson } from "./http.js";

export async function searchPubMed(parsed) {
  const queryParts = [];
  if (parsed.pmid) queryParts.push(`${parsed.pmid}[uid]`);
  if (parsed.title) queryParts.push(`"${parsed.title}"[Title]`);
  if (parsed.authors?.[0]) queryParts.push(`${parsed.authors[0]}[Author]`);
  if (parsed.year) queryParts.push(`${parsed.year}[Date - Publication]`);
  if (!queryParts.length) return [];

  const searchParams = new URLSearchParams({
    db: "pubmed",
    retmode: "json",
    retmax: "5",
    term: queryParts.join(" ")
  });
  if (process.env.NCBI_API_KEY) searchParams.set("api_key", process.env.NCBI_API_KEY);
  const search = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`);
  const ids = search.data?.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const summaryParams = new URLSearchParams({ db: "pubmed", retmode: "json", id: ids.join(",") });
  if (process.env.NCBI_API_KEY) summaryParams.set("api_key", process.env.NCBI_API_KEY);
  const summary = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`);
  return ids.map((id) => mapPubMed(summary.data?.result?.[id], id)).filter(Boolean);
}

function mapPubMed(item, id) {
  if (!item) return null;
  const articleIds = item.articleids || [];
  const findId = (type) => articleIds.find((entry) => entry.idtype === type)?.value || "";
  return {
    source: "pubmed-search",
    sourceName: "PubMed",
    sourceReliability: 0.94,
    type: "article",
    title: item.title || "",
    authors: (item.authors || []).map((author) => author.name).filter(Boolean),
    year: item.pubdate?.match(/\b(18|19|20)\d{2}\b/)?.[0] || "",
    container: item.fulljournalname || item.source || "",
    publisher: "",
    volume: item.volume || "",
    issue: item.issue || "",
    pages: item.pages || "",
    articleNumber: "",
    doi: findId("doi"),
    isbn: "",
    issn: item.issn || "",
    pmid: id,
    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    raw: item
  };
}
