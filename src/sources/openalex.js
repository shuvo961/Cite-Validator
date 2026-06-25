import { fetchJson } from "./http.js";

export async function searchOpenAlex(parsed) {
  const results = [];
  if (parsed.doi) {
    const byDoi = await fetchJson(`https://api.openalex.org/works/doi:${encodeURIComponent(parsed.doi)}`);
    if (byDoi.ok && byDoi.data?.id) results.push(mapOpenAlexWork(byDoi.data, "openalex-doi"));
  }

  const query = [parsed.title, parsed.authors?.[0], parsed.year].filter(Boolean).join(" ");
  if (query) {
    const params = new URLSearchParams({ search: query, per_page: "5" });
    const searched = await fetchJson(`https://api.openalex.org/works?${params}`);
    for (const item of searched.data?.results || []) {
      results.push(mapOpenAlexWork(item, "openalex-search"));
    }
  }
  return results.filter(Boolean);
}

function mapOpenAlexWork(work, source) {
  return {
    source,
    sourceName: "OpenAlex",
    sourceReliability: 0.92,
    type: work.type || "",
    title: work.title || work.display_name || "",
    authors: (work.authorships || []).map((a) => a.author?.display_name).filter(Boolean),
    year: work.publication_year ? String(work.publication_year) : "",
    container: work.primary_location?.source?.display_name || work.host_venue?.display_name || "",
    publisher: work.primary_location?.source?.host_organization_name || "",
    volume: work.biblio?.volume || "",
    issue: work.biblio?.issue || "",
    pages: [work.biblio?.first_page, work.biblio?.last_page].filter(Boolean).join("-"),
    articleNumber: "",
    doi: work.doi ? work.doi.replace(/^https:\/\/doi.org\//i, "") : "",
    isbn: "",
    issn: work.primary_location?.source?.issn_l || "",
    url: work.doi || work.id || "",
    raw: work
  };
}
