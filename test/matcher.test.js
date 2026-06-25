import test from "node:test";
import assert from "node:assert/strict";
import { selectBestMatch } from "../src/matcher.js";
import { classifyReference } from "../src/hallucination.js";

test("selects a strong DOI/title match as verified", () => {
  const parsed = {
    title: "Array programming with NumPy",
    authors: ["Harris, C. R."],
    year: "2020",
    container: "Nature",
    doi: "10.1038/s41586-020-2649-2"
  };
  const candidates = [{
    sourceName: "Crossref",
    sourceReliability: 0.96,
    title: "Array programming with NumPy",
    authors: ["Harris, Charles R."],
    year: "2020",
    container: "Nature",
    doi: "10.1038/s41586-020-2649-2"
  }];
  const match = selectBestMatch(parsed, candidates);
  const classification = classifyReference({
    parsed,
    bestMatch: match.best,
    matchScore: match.score,
    fieldComparisons: match.fieldComparisons,
    candidates
  });
  assert.equal(classification.status, "Verified");
});

test("flags DOI-title-author mismatch as likely fabricated", () => {
  const parsed = {
    title: "Quantum blockchain learning for citation truth",
    authors: ["Smith, J."],
    year: "2021",
    container: "Nature",
    doi: "10.1038/s41586-020-2649-2"
  };
  const candidates = [{
    sourceName: "Crossref",
    sourceReliability: 0.96,
    title: "Array programming with NumPy",
    authors: ["Harris, Charles R."],
    year: "2020",
    container: "Nature",
    doi: "10.1038/s41586-020-2649-2"
  }];
  const match = selectBestMatch(parsed, candidates);
  const classification = classifyReference({
    parsed,
    bestMatch: match.best,
    matchScore: match.score,
    fieldComparisons: match.fieldComparisons,
    candidates
  });
  assert.equal(classification.status, "Likely hallucinated/fabricated");
});
