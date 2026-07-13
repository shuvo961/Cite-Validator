import { searchCrossref } from "./crossref.js";
import { searchOpenAlex } from "./openalex.js";
import { searchPubMed } from "./pubmed.js";
import { searchArxiv } from "./arxiv.js";
import { searchGoogleBooks } from "./googleBooks.js";
import { searchSemanticScholar } from "./semanticScholar.js";
import { resolveDoi } from "./doi.js";
import { searchDataCite } from "./datacite.js";
import { searchOpenLibrary } from "./openLibrary.js";
import { searchEuropePmc } from "./europePmc.js";

export async function searchTrustedSources(parsed) {
  const adapters = [
    resolveDoi,
    searchCrossref,
    searchOpenAlex,
    searchPubMed,
    searchEuropePmc,
    searchArxiv,
    searchGoogleBooks,
    searchOpenLibrary,
    searchDataCite,
    searchSemanticScholar
  ];

  const settled = await Promise.allSettled(adapters.map((adapter) => adapter(parsed)));
  const evidence = [];
  const records = [];

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const adapterName = adapters[index].name;
    if (result.status === "fulfilled") {
      records.push(...result.value);
      evidence.push({ source: adapterName, ok: true, count: result.value.length });
    } else {
      evidence.push({ source: adapterName, ok: false, error: result.reason?.message || String(result.reason) });
    }
  }

  const deduped = dedupeRecords(records);
  return { records: deduped, sourceEvidence: evidence };
}

function dedupeRecords(records) {
  const seen = new Set();
  const deduped = [];
  for (const record of records) {
    const key = [record.doi?.toLowerCase(), record.title?.toLowerCase(), record.sourceName].filter(Boolean).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }
  return deduped;
}
