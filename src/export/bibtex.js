import { toBibtex } from "../citation.js";

export function toBibtexExport(job) {
  const records = job.results.map((result) => result.matchedSource).filter(Boolean);
  if (records.length) return toBibtex(records);
  return job.results.map((result, index) => fallbackEntry(result, index)).join("\n\n");
}

function fallbackEntry(result, index) {
  const parsed = result.parsed || {};
  const key = `citation${index + 1}`;
  const fields = {
    title: parsed.title,
    author: parsed.authors?.join(" and "),
    year: parsed.year,
    journal: parsed.container,
    publisher: parsed.publisher,
    volume: parsed.volume,
    number: parsed.issue,
    pages: parsed.pages,
    doi: parsed.doi,
    isbn: parsed.isbn
  };
  const body = Object.entries(fields)
    .filter(([, value]) => value)
    .map(([name, value]) => `  ${name} = {${String(value).replace(/[{}]/g, "")}}`)
    .join(",\n");
  return `@misc{${key},\n${body}\n}`;
}
