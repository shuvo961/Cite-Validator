import { fetchJson } from "./http.js";

export async function searchOpenLibrary(parsed) {
  if (!parsed.isbn && parsed.typeGuess !== "book") return [];
  const results = [];

  if (parsed.isbn) {
    const byIsbn = await fetchJson(`https://openlibrary.org/isbn/${encodeURIComponent(parsed.isbn)}.json`);
    if (byIsbn.ok && byIsbn.data?.title) results.push(mapOpenLibraryBook(byIsbn.data, "openlibrary-isbn", parsed.isbn));
  }

  const query = [parsed.title, parsed.authors?.[0], parsed.publisher].filter(Boolean).join(" ");
  if (query) {
    const params = new URLSearchParams({ q: query, limit: "5" });
    const searched = await fetchJson(`https://openlibrary.org/search.json?${params}`);
    for (const doc of searched.data?.docs || []) results.push(mapOpenLibrarySearch(doc));
  }

  return results.filter(Boolean);
}

function mapOpenLibraryBook(item, source, isbn) {
  return {
    source,
    sourceName: "Open Library",
    sourceReliability: 0.72,
    type: "book",
    title: item.title || "",
    authors: [],
    year: item.publish_date?.match(/\b(18|19|20)\d{2}\b/)?.[0] || "",
    container: "",
    publisher: item.publishers?.[0] || "",
    volume: "",
    issue: "",
    pages: item.number_of_pages ? String(item.number_of_pages) : "",
    articleNumber: "",
    doi: "",
    isbn,
    url: item.key ? `https://openlibrary.org${item.key}` : "",
    raw: item
  };
}

function mapOpenLibrarySearch(doc) {
  return {
    source: "openlibrary-search",
    sourceName: "Open Library",
    sourceReliability: 0.7,
    type: "book",
    title: doc.title || "",
    authors: doc.author_name || [],
    year: doc.first_publish_year ? String(doc.first_publish_year) : "",
    container: "",
    publisher: doc.publisher?.[0] || "",
    volume: "",
    issue: "",
    pages: "",
    articleNumber: "",
    doi: "",
    isbn: doc.isbn?.[0] || "",
    url: doc.key ? `https://openlibrary.org${doc.key}` : "",
    raw: doc
  };
}
