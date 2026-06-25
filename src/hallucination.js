export function classifyReference({ parsed, bestMatch, matchScore, fieldComparisons, candidates }) {
  const hardMismatches = fieldComparisons.filter((field) => field.severity === "mismatch");
  const titleMismatch = hardMismatches.some((field) => field.field === "title");
  const doiMismatch = hardMismatches.some((field) => field.field === "doi");
  const authorMismatch = hardMismatches.some((field) => field.field === "authors");
  const yearMismatch = hardMismatches.some((field) => field.field === "year");
  const missingCore = ["title", "authors", "year"].filter((field) => !parsed[field] || (Array.isArray(parsed[field]) && !parsed[field].length));
  const hasStrongIdentifier = Boolean(parsed.doi || parsed.pmid || parsed.arxiv || parsed.isbn);

  let risk = 0.25;
  if (!candidates.length) risk += hasStrongIdentifier ? 0.35 : 0.5;
  risk += hardMismatches.length * 0.1;
  risk += missingCore.length * 0.08;
  if (doiMismatch) risk += 0.28;
  if (titleMismatch && authorMismatch) risk += 0.22;
  if (titleMismatch && parsed.container) risk += 0.12;
  if (yearMismatch) risk += 0.08;
  if (bestMatch?.sourceReliability) risk -= bestMatch.sourceReliability * 0.18;
  risk -= matchScore * 0.42;
  risk = clamp(risk);

  let status = "Unverifiable";
  if (!candidates.length) {
    status = hasStrongIdentifier ? "Suspicious" : "Unverifiable";
  } else if (matchScore >= 0.86 && hardMismatches.length === 0) {
    status = "Verified";
  } else if (matchScore >= 0.68 && hardMismatches.length <= 2 && !doiMismatch) {
    status = "Partially verified";
  } else if (doiMismatch || (titleMismatch && authorMismatch) || matchScore < 0.38) {
    status = "Likely hallucinated/fabricated";
  } else {
    status = "Suspicious";
  }

  const hallucinationRiskLevel = risk >= 0.72
    ? "High"
    : risk >= 0.48
      ? "Medium"
      : risk >= 0.25
        ? "Low"
        : "Very low";

  const recommendedAction = status === "Verified"
    ? "use"
    : status === "Partially verified"
      ? "correct"
      : status === "Likely hallucinated/fabricated"
        ? "remove"
        : "manually verify";

  return {
    status,
    hallucinationRiskLevel,
    hallucinationRiskScore: round(risk),
    confidenceScore: round(matchScore),
    recommendedAction,
    explanation: explain(status, hardMismatches, candidates.length, hasStrongIdentifier)
  };
}

function explain(status, hardMismatches, candidateCount, hasStrongIdentifier) {
  if (status === "Verified") return "The reference closely matches authoritative metadata.";
  if (!candidateCount) {
    return hasStrongIdentifier
      ? "No trusted source confirmed the supplied identifier or bibliographic record."
      : "No trusted source confirmed this reference; it may be incomplete, obscure, or fabricated.";
  }
  if (hardMismatches.length) {
    return `Trusted metadata was found, but ${hardMismatches.length} field(s) disagree.`;
  }
  return "Trusted metadata was found, but the evidence is incomplete or below the verification threshold.";
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
