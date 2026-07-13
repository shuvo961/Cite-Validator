export function toRis(job) {
  return job.results.map((result) => {
    const source = result.matchedSource || {};
    const parsed = result.parsed || {};
    const authors = source.authors?.length ? source.authors : parsed.authors || [];
    const title = source.title || parsed.title || result.originalReference;
    const year = source.year || parsed.year || "";
    const container = source.container || parsed.container || "";
    const doi = source.doi || parsed.doi || "";
    const pages = source.pages || parsed.pages || "";
    const type = parsed.typeGuess === "book" ? "BOOK" : parsed.typeGuess === "conference-paper" ? "CONF" : "JOUR";

    return [
      `TY  - ${type}`,
      ...authors.map((author) => `AU  - ${clean(author)}`),
      title && `TI  - ${clean(title)}`,
      year && `PY  - ${clean(year)}`,
      container && `JO  - ${clean(container)}`,
      doi && `DO  - ${clean(doi)}`,
      pages && `SP  - ${clean(String(pages).split("-")[0])}`,
      pages && String(pages).includes("-") && `EP  - ${clean(String(pages).split("-").slice(1).join("-"))}`,
      result.correctedReference && `N1  - Corrected: ${clean(result.correctedReference)}`,
      `ER  -`
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
