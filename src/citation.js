export function formatCitation(record, style = "apa") {
  if (!record) return "";
  const s = style.toLowerCase();
  if (s === "ieee") return formatIeee(record);
  if (s === "vancouver") return formatVancouver(record);
  if (s === "mla") return formatMla(record);
  if (s === "chicago") return formatChicago(record);
  return formatApa(record);
}

export function toBibtex(records = []) {
  return records.map((record, index) => bibtexEntry(record, index)).join("\n\n");
}

export function allStyles(record) {
  return {
    apa: formatCitation(record, "apa"),
    ieee: formatCitation(record, "ieee"),
    mla: formatCitation(record, "mla"),
    chicago: formatCitation(record, "chicago"),
    vancouver: formatCitation(record, "vancouver")
  };
}

function formatApa(r) {
  const authors = apaAuthors(r.authors);
  const year = r.year ? `(${r.year}).` : "(n.d.).";
  const title = sentenceCase(r.title);
  const container = r.container ? ` ${titleCase(r.container)}` : "";
  const details = volumeIssuePages(r);
  const doi = r.doi ? ` https://doi.org/${r.doi}` : r.url ? ` ${r.url}` : "";
  if (r.type === "book") return compact(`${authors} ${year} ${italic(title)}. ${r.publisher || ""}.${doi}`);
  return compact(`${authors} ${year} ${title}.${container}${details}.${doi}`);
}

function formatIeee(r) {
  const authors = ieeeAuthors(r.authors);
  const title = r.title ? `"${r.title},"` : "";
  const container = r.container ? `${r.container},` : "";
  const details = [r.volume && `vol. ${r.volume}`, r.issue && `no. ${r.issue}`, r.pages && `pp. ${r.pages}`, r.year].filter(Boolean).join(", ");
  const doi = r.doi ? ` doi: ${r.doi}.` : "";
  return compact(`${authors}, ${title} ${container} ${details}.${doi}`);
}

function formatVancouver(r) {
  const authors = vancouverAuthors(r.authors);
  const details = [r.year, r.volume, r.issue && `(${r.issue})`, r.pages && `:${r.pages}`].filter(Boolean).join("");
  const doi = r.doi ? ` doi: ${r.doi}.` : "";
  return compact(`${authors}. ${r.title}. ${r.container}. ${details}.${doi}`);
}

function formatMla(r) {
  const authors = r.authors?.length ? `${r.authors[0]}.` : "";
  const title = r.title ? `"${r.title}."` : "";
  const container = r.container ? `${italic(titleCase(r.container))},` : "";
  const details = [r.volume && `vol. ${r.volume}`, r.issue && `no. ${r.issue}`, r.year, r.pages && `pp. ${r.pages}`].filter(Boolean).join(", ");
  const doi = r.doi ? ` https://doi.org/${r.doi}` : "";
  return compact(`${authors} ${title} ${container} ${details}.${doi}`);
}

function formatChicago(r) {
  const authors = r.authors?.length ? `${r.authors.join(", ")}.` : "";
  const title = r.title ? `"${r.title}."` : "";
  const container = r.container ? `${italic(titleCase(r.container))}` : "";
  const details = [r.volume, r.issue && `, no. ${r.issue}`, r.year && `(${r.year})`, r.pages && `: ${r.pages}`].filter(Boolean).join("");
  const doi = r.doi ? ` https://doi.org/${r.doi}.` : "";
  return compact(`${authors} ${title} ${container} ${details}.${doi}`);
}

function apaAuthors(authors = []) {
  if (!authors.length) return "";
  return authors.slice(0, 20).map((author) => {
    if (author.includes(",")) {
      const [last, first = ""] = author.split(",");
      return `${last.trim()}, ${initials(first)}`.trim();
    }
    const parts = author.trim().split(/\s+/);
    const last = parts.pop();
    return `${last}, ${initials(parts.join(" "))}`.trim();
  }).join(", ");
}

function ieeeAuthors(authors = []) {
  if (!authors.length) return "";
  if (authors.length > 6) return `${authors[0]} et al.`;
  return authors.join(", ");
}

function vancouverAuthors(authors = []) {
  if (!authors.length) return "";
  return authors.slice(0, 6).map((author) => author.replace(",", "")).join(", ") + (authors.length > 6 ? " et al" : "");
}

function initials(value = "") {
  return value.split(/\s+/).filter(Boolean).map((part) => `${part[0].toUpperCase()}.`).join(" ");
}

function volumeIssuePages(r) {
  const volume = r.volume ? `, ${r.volume}` : "";
  const issue = r.issue ? `(${r.issue})` : "";
  const pages = r.pages ? `, ${r.pages}` : r.articleNumber ? `, Article ${r.articleNumber}` : "";
  return volume || issue || pages ? `${volume}${issue}${pages}` : "";
}

function sentenceCase(value = "") {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleCase(value = "") {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function italic(value) {
  return value;
}

function compact(value) {
  return value.replace(/\s+/g, " ").replace(/\s+\./g, ".").replace(/\.\./g, ".").trim();
}

function bibtexEntry(record, index) {
  const key = bibtexKey(record, index);
  const type = record.type === "book" ? "book" : record.type?.includes("conference") ? "inproceedings" : "article";
  const fields = {
    title: record.title,
    author: record.authors?.join(" and "),
    year: record.year,
    journal: type === "article" ? record.container : "",
    booktitle: type === "inproceedings" ? record.container : "",
    publisher: record.publisher,
    volume: record.volume,
    number: record.issue,
    pages: record.pages,
    doi: record.doi,
    url: record.url,
    isbn: record.isbn,
    issn: record.issn
  };
  const body = Object.entries(fields)
    .filter(([, value]) => value)
    .map(([name, value]) => `  ${name} = {${escapeBibtex(value)}}`)
    .join(",\n");
  return `@${type}{${key},\n${body}\n}`;
}

function bibtexKey(record, index) {
  const firstAuthor = record.authors?.[0]?.split(",")[0]?.split(/\s+/).pop() || "citation";
  const year = record.year || "nd";
  const titleWord = record.title?.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).find((word) => word.length > 3) || index + 1;
  return `${firstAuthor}${year}${titleWord}`.replace(/[^A-Za-z0-9_-]/g, "");
}

function escapeBibtex(value) {
  return String(value).replace(/[{}]/g, "");
}
