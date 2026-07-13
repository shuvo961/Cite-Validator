import { fetchJson } from "./http.js";

export async function searchGoogleBooks(parsed) {
  if (!parsed.isbn && parsed.typeGuess !== "book" && !parsed.publisher) return [];
  const query = parsed.isbn ? `isbn:${parsed.isbn}` : [parsed.title, parsed.authors?.[0], parsed.publisher].filter(Boolean).join(" ");
  if (!query) return [];
  const params = new URLSearchParams({ q: query, maxResults: "5" });
  const response = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`);
  return (response.data?.items || []).map(mapBook);
}

function mapBook(item) {
  const info = item.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const isbn = identifiers.find((id) => id.type?.includes("ISBN_13"))?.identifier ||
    identifiers.find((id) => id.type?.includes("ISBN"))?.identifier || "";
  return {
    source: "google-books-search",
    sourceName: "Google Books",
    sourceReliability: 0.78,
    type: "book",
    title: info.title || "",
    authors: info.authors || [],
    year: info.publishedDate?.slice(0, 4) || "",
    container: "",
    publisher: info.publisher || "",
    volume: "",
    issue: "",
    pages: info.pageCount ? String(info.pageCount) : "",
    articleNumber: "",
    doi: "",
    isbn,
    url: info.infoLink || "",
    raw: item
  };
}
