import { fetchText } from "./http.js";

export async function searchArxiv(parsed) {
  const results = [];
  if (parsed.arxiv) {
    const byId = await fetchText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(parsed.arxiv)}`, { accept: "application/atom+xml" });
    results.push(...parseArxivFeed(byId.text));
  }

  if (parsed.title) {
    const params = new URLSearchParams({
      search_query: `ti:"${parsed.title}"`,
      start: "0",
      max_results: "5"
    });
    const searched = await fetchText(`https://export.arxiv.org/api/query?${params}`, { accept: "application/atom+xml" });
    results.push(...parseArxivFeed(searched.text));
  }
  return results;
}

function tag(entry, name) {
  const match = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1].replace(/\s+/g, " ").trim()) : "";
}

function parseArxivFeed(xml) {
  if (!xml) return [];
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  return entries.map((entry) => ({
    source: "arxiv-search",
    sourceName: "arXiv",
    sourceReliability: 0.88,
    type: "preprint",
    title: tag(entry, "title"),
    authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)].map((m) => decodeXml(m[1].trim())),
    year: tag(entry, "published").slice(0, 4),
    container: "arXiv",
    publisher: "arXiv",
    volume: "",
    issue: "",
    pages: "",
    articleNumber: "",
    doi: tag(entry, "arxiv:doi"),
    arxiv: tag(entry, "id").split("/abs/")[1] || "",
    url: tag(entry, "id"),
    raw: { xml: entry }
  }));
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
