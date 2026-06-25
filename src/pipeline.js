import crypto from "node:crypto";
import { splitReferences, parseReference } from "./parser.js";
import { searchTrustedSources } from "./sources/index.js";
import { selectBestMatch } from "./matcher.js";
import { classifyReference } from "./hallucination.js";
import { formatCitation } from "./citation.js";

export async function validateReferences({ referencesText, style = "apa" }) {
  const references = splitReferences(referencesText).slice(0, 80);
  const results = [];
  const duplicateMap = new Map();
  const requestedStyle = String(style || "auto").toLowerCase();
  const aiAssist = {
    enabled: true,
    mode: "built-in-local-reference-ai",
    detectedReferences: references.length,
    note: "Built-in local AI cleaned PDF/OCR artifacts, broken DOI URLs, page-number runs, compact author-year boundaries, and pasted-together references before validation. No external AI service is used."
  };

  for (let index = 0; index < references.length; index += 1) {
    const originalReference = references[index];
    const parsed = parseReference(originalReference);
    const detectedCitationStyle = parsed.styleGuess || "APA";
    const outputStyle = requestedStyle === "auto" ? detectedCitationStyle.toLowerCase() : requestedStyle;
    const duplicateKey = (parsed.doi || parsed.title || originalReference).toLowerCase();
    const duplicateOf = duplicateMap.get(duplicateKey);
    if (!duplicateOf) duplicateMap.set(duplicateKey, index + 1);

    const { records, sourceEvidence } = await searchTrustedSources(parsed);
    const match = selectBestMatch(parsed, records);
    const classification = classifyReference({
      parsed,
      bestMatch: match.best,
      matchScore: match.score,
      fieldComparisons: match.fieldComparisons,
      candidates: records
    });

    const mismatches = [...match.mismatches];
    if (duplicateOf) mismatches.push(`Duplicate reference: appears to duplicate reference #${duplicateOf}.`);

    const result = {
      id: crypto.randomUUID(),
      index: index + 1,
      originalReference,
      parsed,
      status: duplicateOf && classification.status === "Verified" ? "Partially verified" : classification.status,
      hallucinationRiskLevel: classification.hallucinationRiskLevel,
      hallucinationRiskScore: classification.hallucinationRiskScore,
      confidenceScore: classification.confidenceScore,
      detectedCitationStyle,
      outputStyle,
      correctedReference: match.best ? formatCitation(match.best, outputStyle) : "",
      briefSummary: makeBriefSummary(classification, match, duplicateOf),
      summaryOutput: makeSummaryOutput(classification, match, parsed, duplicateOf),
      matchedSource: match.best ? compactSource(match.best) : null,
      fieldComparisons: match.fieldComparisons,
      mismatches,
      evidence: {
        explanation: classification.explanation,
        searchedSources: sourceEvidence,
        candidateCount: records.length,
        alternatives: match.alternatives,
        duplicateOf: duplicateOf || null
      },
      recommendedAction: duplicateOf ? "correct" : classification.recommendedAction
    };
    results.push(result);
  }

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    inputText: referencesText,
    style: requestedStyle,
    summary: summarize(results),
    aiAssist,
    results
  };
}

function makeBriefSummary(classification, match, duplicateOf) {
  if (duplicateOf) return `Duplicate of reference #${duplicateOf}; review and correct before use.`;
  if (classification.status === "Verified") return `Verified with ${Math.round(classification.confidenceScore * 100)}% confidence.`;
  if (classification.status === "Partially verified") return `Partially verified; ${match.mismatches.length || 1} field(s) need review.`;
  if (classification.status === "Likely hallucinated/fabricated") return "High concern: trusted metadata conflicts with or does not support this citation.";
  return "Uncertain result; manually verify before using this citation.";
}

function makeSummaryOutput(classification, match, parsed, duplicateOf) {
  const source = match.best?.sourceName ? `Best source: ${match.best.sourceName}.` : "No authoritative source matched.";
  const style = parsed.styleGuess ? `Detected style: ${parsed.styleGuess}.` : "Detected style: uncertain.";
  const mismatchText = match.mismatches.length ? `Issues: ${match.mismatches.slice(0, 3).join(" ")}` : "No hard mismatches found.";
  const duplicateText = duplicateOf ? ` Duplicate of reference #${duplicateOf}.` : "";
  return `${classification.status}. ${style} ${source} ${mismatchText}${duplicateText}`;
}

function compactSource(record) {
  return {
    sourceName: record.sourceName,
    source: record.source,
    title: record.title,
    authors: record.authors,
    year: record.year,
    container: record.container,
    publisher: record.publisher,
    volume: record.volume,
    issue: record.issue,
    pages: record.pages,
    articleNumber: record.articleNumber,
    doi: record.doi,
    isbn: record.isbn,
    issn: record.issn,
    pmid: record.pmid,
    arxiv: record.arxiv,
    url: record.url,
    sourceReliability: record.sourceReliability
  };
}

function summarize(results) {
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  return {
    total: results.length,
    counts,
    averageConfidence: round(avg(results.map((r) => r.confidenceScore))),
    averageHallucinationRisk: round(avg(results.map((r) => r.hallucinationRiskScore)))
  };
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
