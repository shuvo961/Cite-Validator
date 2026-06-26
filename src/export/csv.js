export function toCsv(results) {
  const headers = [
    "index",
    "status",
    "hallucinationRiskLevel",
    "hallucinationRiskScore",
    "confidenceScore",
    "detectedCitationStyle",
    "briefSummary",
    "recommendedAction",
    "originalReference",
    "correctedReference",
    "matchedSource",
    "sourceUrl",
    "mismatches"
  ];
  const rows = results.map((result) => [
    result.index,
    result.status,
    result.hallucinationRiskLevel,
    result.hallucinationRiskScore,
    result.confidenceScore,
    result.detectedCitationStyle || "",
    result.briefSummary || "",
    result.recommendedAction,
    result.originalReference,
    result.correctedReference,
    result.matchedSource?.sourceName || "",
    result.matchedSource?.url || "",
    result.mismatches.join(" | ")
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}
